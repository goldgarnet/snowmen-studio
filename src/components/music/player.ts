import { useSyncExternalStore } from 'react';
import {
  currentOf, emptyQueue, enqueue as enqueueItem, makeQueue, nextRepeat, PLAYBACK_RATES, removeAt as removeQueueAt,
  stepPosition, withShuffle, type Queue, type RepeatMode,
} from '../../lib/music';

// 음악 재생기 — 사이트 전체가 오디오 하나를 같이 쓴다(App 의 MusicProvider 가 한 번 만든다).
// 다른 탭으로 옮겨도 계속 나온다. 상태(대기열 · 재생 중 · 반복 …)와 재생 위치를 따로 알린다:
// 위치는 자주 바뀌므로 우측 하단 플레이어의 막대만 받아 다시 그린다(usePlayerTime).

export interface MusicTrack {
  id: string;
  path: string;
  title: string;
  artist: string;          // 올린 사람
  album: string;           // 칸 이름 (챕터 2 · 바위 지형 / 공통)
  chapterKey: string;      // 곡이 있는 칸 (찾아가기)
  duration: number | null;
  peaks: number[] | null;
}

export interface PlayerState {
  queue: Queue<MusicTrack>;
  current: MusicTrack | null;
  source: string | null;   // 어디서 튼 목록인가 (모든 곡 · 챕터 1 · 설원 · 플레이리스트 이름)
  playing: boolean;
  loading: boolean;        // 주소를 받거나 버퍼링하는 중
  duration: number;        // 지금 곡 길이 (모르면 0)
  repeat: RepeatMode;
  shuffle: boolean;
  rate: number;
  volume: number;          // 0~1
  muted: boolean;
  error: string | null;
}

export interface PlayerUrls {
  /** 바로 쓸 수 있는 듣기 주소. 있으면 누른 그 순간에 재생을 시작한다(브라우저 자동 재생 제한). */
  cachedUrl: (path: string) => string | null;
  /** 새로 받은 듣기 주소 */
  freshUrl: (path: string) => Promise<string>;
}

export interface MusicPlayer {
  getState: () => PlayerState;
  subscribe: (callback: () => void) => () => void;
  getTime: () => number;
  subscribeTime: (callback: () => void) => () => void;
  /** 화면에 붙인다(이벤트 · 미디어 키). 떼면 멈춘다. */
  attach: () => () => void;
  /** 목록을 대기열로 삼아 startId 곡부터 튼다. */
  playList: (tracks: MusicTrack[], startId: string, options?: { source?: string; shuffle?: boolean; at?: number }) => void;
  /** 목록의 곡 단추: 지금 곡이면 재생 · 멈춤, 아니면 그 목록으로 튼다. */
  toggleTrack: (tracks: MusicTrack[], id: string, source: string) => void;
  toggle: () => void;
  pause: () => void;
  resume: () => void;
  /** 정지 — 멈추고 처음으로. 대기열은 남는다. */
  stop: () => void;
  /** 닫기 — 대기열을 비우고 플레이어를 숨긴다. */
  close: () => void;
  next: () => void;
  prev: () => void;
  /** 재생 순서의 그 자리 곡으로 */
  jump: (position: number) => void;
  seek: (sec: number) => void;
  seekRatio: (ratio: number) => void;
  setRepeat: (mode: RepeatMode) => void;
  cycleRepeat: () => void;
  setShuffle: (on: boolean) => void;
  setRate: (rate: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  /** '다음에 재생'(지금 곡 바로 뒤) · '대기열에 추가'(맨 뒤) */
  enqueue: (track: MusicTrack, where: 'next' | 'end') => void;
  /** 대기열에서 빼기 (재생 순서의 자리). 지금 곡은 빼지 않는다. */
  removeAt: (position: number) => void;
  /** 곡 정보가 바뀌었거나 지워졌을 때 대기열을 맞춘다. */
  syncTracks: (tracks: ReadonlyMap<string, MusicTrack>) => void;
}

const PREF = 'snowmen-studio:music:';
/** 재생 위치를 알리는 최소 간격(초). */
const TIME_STEP = 0.05;

function readPref<T>(key: string, parse: (raw: string) => T | undefined, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREF + key);
    if (raw == null) return fallback;
    const value = parse(raw);
    return value === undefined ? fallback : value;
  } catch { return fallback; }
}

function writePref(key: string, value: string): void {
  try { localStorage.setItem(PREF + key, value); }
  catch { /* 기억하지 못해도 이번 재생은 그대로 */ }
}

const parseNumber = (min: number, max: number) => (raw: string) => {
  const v = parseFloat(raw);
  return Number.isFinite(v) && v >= min && v <= max ? v : undefined;
};

export function createMusicPlayer(urls: PlayerUrls): MusicPlayer {
  const audio = new Audio();
  audio.preload = 'auto';

  let state: PlayerState = {
    queue: emptyQueue(),
    current: null,
    source: null,
    playing: false,
    loading: false,
    duration: 0,
    repeat: readPref<RepeatMode>('repeat', (raw) => (['off', 'all', 'one'].includes(raw) ? (raw as RepeatMode) : undefined), 'off'),
    shuffle: readPref('shuffle', (raw) => raw === '1', false),
    rate: readPref('rate', (raw) => { const v = parseFloat(raw); return PLAYBACK_RATES.includes(v) ? v : undefined; }, 1),
    volume: readPref('volume', parseNumber(0, 1), 1),
    muted: readPref('muted', (raw) => raw === '1', false),
    error: null,
  };
  audio.loop = state.repeat === 'one';
  audio.volume = state.volume;
  audio.muted = state.muted;
  audio.defaultPlaybackRate = state.rate;
  audio.playbackRate = state.rate;

  const listeners = new Set<() => void>();
  const timeListeners = new Set<() => void>();
  let time = 0;
  let token = 0;              // 곡을 바꿀 때마다 +1 — 늦게 온 주소 응답을 버린다
  let retried = false;        // 주소가 낡아 실패하면 새 주소로 한 번만 다시
  let pendingSeek: number | null = null;
  let raf = 0;
  let attachedCount = 0;
  let sessionTrack: string | null = null;

  const set = (patch: Partial<PlayerState>) => {
    const next = { ...state, ...patch };
    if ((Object.keys(patch) as (keyof PlayerState)[]).every((k) => next[k] === state[k])) return;
    state = next;
    for (const callback of [...listeners]) callback();
    syncMediaSession();
  };

  const setQueue = (queue: Queue<MusicTrack>, patch: Partial<PlayerState> = {}) =>
    set({ queue, current: currentOf(queue), ...patch });

  const setTime = (t: number, force = false) => {
    if (!force && Math.abs(t - time) < TIME_STEP) return;
    time = t;
    for (const callback of [...timeListeners]) callback();
  };

  const tick = () => {
    raf = 0;
    if (audio.paused) return;
    setTime(audio.currentTime);
    raf = requestAnimationFrame(tick);
  };
  const startTicking = () => { if (!raf) raf = requestAnimationFrame(tick); };

  const hasSource = () => Boolean(audio.getAttribute('src'));

  function fail(message = '이 파일은 재생할 수 없어요.') {
    set({ playing: false, loading: false, error: message });
  }

  function begin() {
    const promise = audio.play();
    promise?.catch((e: unknown) => {
      const name = (e as { name?: string } | null)?.name;
      if (name === 'AbortError') return;   // 다른 곡으로 바꾸는 중
      // 브라우저가 막았거나(NotAllowedError) 아직 못 읽은 경우 — 다시 누르면 된다. 파일 오류는 error 이벤트가 맡는다.
      set({ playing: false, loading: false });
    });
  }

  function start(url: string, at: number, autoplay: boolean) {
    pendingSeek = at > 0 ? at : null;
    audio.src = url;
    audio.playbackRate = state.rate;
    // 길이를 읽기 전에 정한 위치는 브라우저가 시작 위치로 쓴다. loadedmetadata 에서 한 번 더 맞춘다.
    if (pendingSeek != null) { try { audio.currentTime = pendingSeek; } catch { /* 메타데이터 뒤에 맞춘다 */ } }
    if (autoplay) begin();
  }

  /** 대기열의 지금 곡을 불러온다. */
  function load(autoplay = true, at = 0) {
    const track = currentOf(state.queue);
    token += 1;
    const mine = token;
    retried = false;
    setTime(at, true);
    if (!track) {
      audio.pause();
      if (hasSource()) { audio.removeAttribute('src'); audio.load(); }
      set({ current: null, playing: false, loading: false, duration: 0, error: null });
      return;
    }
    set({ current: track, playing: false, loading: autoplay, duration: track.duration ?? 0, error: null });
    const url = urls.cachedUrl(track.path);
    if (url) { start(url, at, autoplay); return; }
    audio.pause();
    urls.freshUrl(track.path)
      .then((fresh) => { if (mine === token) start(fresh, at, autoplay); })
      .catch(() => { if (mine === token) fail('듣기 주소를 받지 못했어요. 잠시 뒤 다시 눌러 주세요.'); });
  }

  function playList(tracks: MusicTrack[], startId: string, options: { source?: string; shuffle?: boolean; at?: number } = {}) {
    const index = tracks.findIndex((t) => t.id === startId);
    if (index < 0) return;
    const shuffle = options.shuffle ?? state.shuffle;
    if (options.shuffle != null && options.shuffle !== state.shuffle) writePref('shuffle', options.shuffle ? '1' : '0');
    setQueue(makeQueue(tracks, index, shuffle), { source: options.source ?? null, shuffle });
    load(true, options.at ?? 0);
  }

  function isCurrentReady(id?: string) {
    return state.current != null && (id == null || state.current.id === id) && hasSource() && !state.error;
  }

  function toggle() {
    if (!state.current) return;
    if (!isCurrentReady()) { load(true, time); return; }
    if (audio.paused) begin(); else audio.pause();
  }

  function toggleTrack(tracks: MusicTrack[], id: string, source: string) {
    if (isCurrentReady(id)) { toggle(); return; }
    playList(tracks, id, { source });
  }

  function resume() {
    if (!state.current) return;
    if (isCurrentReady()) begin(); else load(true, time);
  }

  function stop() {
    audio.pause();
    if (hasSource() && audio.readyState > 0) { try { audio.currentTime = 0; } catch { /* 다음 재생 때 처음부터 */ } }
    pendingSeek = null;
    setTime(0, true);
    set({ playing: false, loading: false });
  }

  function close() {
    token += 1;
    pendingSeek = null;
    audio.pause();
    if (hasSource()) { audio.removeAttribute('src'); audio.load(); }
    setTime(0, true);
    set({ queue: emptyQueue(), current: null, source: null, playing: false, loading: false, duration: 0, error: null });
  }

  /** 다음 · 이전 단추는 '한 곡 반복'이어도 옆 곡으로 가고, 끝에서는 반복을 켰을 때만 돈다. */
  const manualRepeat = (): RepeatMode => (state.repeat === 'off' ? 'off' : 'all');

  function next() {
    const position = stepPosition(state.queue, 1, manualRepeat());
    if (position == null) return;
    setQueue({ ...state.queue, position });
    load(true);
  }

  function prev() {
    if (time > 3) { seek(0); return; }
    const position = stepPosition(state.queue, -1, manualRepeat());
    if (position == null) { seek(0); return; }
    setQueue({ ...state.queue, position });
    load(true);
  }

  function jump(position: number) {
    if (position < 0 || position >= state.queue.order.length) return;
    setQueue({ ...state.queue, position });
    load(true);
  }

  function seek(sec: number) {
    if (!state.current) return;
    const duration = state.duration || (Number.isFinite(audio.duration) ? audio.duration : 0);
    const to = Math.max(0, duration > 0 ? Math.min(sec, duration) : sec);
    if (hasSource() && audio.readyState > 0) {
      try { audio.currentTime = to; } catch { /* 아직 못 옮기면 아래 위치만 */ }
    } else {
      pendingSeek = to;
    }
    setTime(to, true);
  }

  function seekRatio(ratio: number) {
    const r = Math.min(1, Math.max(0, ratio));
    if (state.duration > 0) seek(r * state.duration);
  }

  function syncMediaSession() {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    const session = navigator.mediaSession;
    try {
      const track = state.current;
      if (track) {
        if (sessionTrack !== `${track.id}|${track.title}` && typeof MediaMetadata !== 'undefined') {
          sessionTrack = `${track.id}|${track.title}`;
          session.metadata = new MediaMetadata({ title: track.title, artist: track.artist, album: track.album });
        }
        session.playbackState = state.playing ? 'playing' : 'paused';
      } else if (sessionTrack) {
        sessionTrack = null;
        session.metadata = null;
        session.playbackState = 'none';
      }
    } catch { /* 미디어 키 표시는 편의 기능 */ }
  }

  const events: [keyof HTMLMediaElementEventMap, () => void][] = [
    ['play', () => { set({ playing: true, error: null }); startTicking(); }],
    ['playing', () => { set({ playing: true, loading: false, error: null }); startTicking(); }],
    ['pause', () => { set({ playing: false }); setTime(audio.currentTime, true); }],
    ['waiting', () => set({ loading: true })],
    ['canplay', () => set({ loading: false })],
    ['loadedmetadata', () => {
      if (pendingSeek != null) {
        try { audio.currentTime = pendingSeek; } catch { /* 그대로 처음부터 */ }
        pendingSeek = null;
      }
      audio.playbackRate = state.rate;
      if (Number.isFinite(audio.duration) && audio.duration > 0) set({ duration: audio.duration });
    }],
    ['durationchange', () => { if (Number.isFinite(audio.duration) && audio.duration > 0) set({ duration: audio.duration }); }],
    ['timeupdate', () => setTime(audio.currentTime)],
    ['seeked', () => setTime(audio.currentTime, true)],
    ['ended', () => {
      // '한 곡 반복'은 오디오가 스스로 되감는다(loop). 여기는 다음 곡으로 넘어가거나 멈춘다.
      const position = stepPosition(state.queue, 1, state.repeat);
      if (position != null) { setQueue({ ...state.queue, position }); load(true); return; }
      stop();
    }],
    ['error', () => {
      const track = state.current;
      if (!track || !hasSource()) return;
      const at = audio.currentTime || time;
      const mine = token;
      if (retried) { fail(); return; }
      // 서명한 주소가 낡았을 수 있다 — 새 주소로 한 번만 다시 받는다.
      retried = true;
      set({ loading: true });
      urls.freshUrl(track.path)
        .then((url) => { if (mine === token) start(url, at, true); })
        .catch(() => { if (mine === token) fail(); });
    }],
  ];

  const sessionActions: [MediaSessionAction, MediaSessionActionHandler][] = [
    ['play', () => resume()],
    ['pause', () => audio.pause()],
    ['stop', () => stop()],
    ['previoustrack', () => prev()],
    ['nexttrack', () => next()],
    ['seekto', (details) => { if (details.seekTime != null) seek(details.seekTime); }],
  ];

  function setSessionActions(on: boolean) {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    for (const [action, handler] of sessionActions) {
      try { navigator.mediaSession.setActionHandler(action, on ? handler : null); }
      catch { /* 모르는 동작은 건너뛴다 */ }
    }
  }

  function attach() {
    attachedCount += 1;
    if (attachedCount === 1) {
      for (const [name, handler] of events) audio.addEventListener(name, handler);
      setSessionActions(true);
    }
    let detached = false;
    return () => {
      if (detached) return;
      detached = true;
      attachedCount -= 1;
      if (attachedCount > 0) return;
      close();
      for (const [name, handler] of events) audio.removeEventListener(name, handler);
      setSessionActions(false);
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
    };
  }

  return {
    getState: () => state,
    subscribe: (callback) => { listeners.add(callback); return () => { listeners.delete(callback); }; },
    getTime: () => time,
    subscribeTime: (callback) => { timeListeners.add(callback); return () => { timeListeners.delete(callback); }; },
    attach,
    playList,
    toggleTrack,
    toggle,
    pause: () => audio.pause(),
    resume,
    stop,
    close,
    next,
    prev,
    jump,
    seek,
    seekRatio,
    setRepeat: (mode) => {
      audio.loop = mode === 'one';
      writePref('repeat', mode);
      set({ repeat: mode });
    },
    cycleRepeat: () => {
      const mode = nextRepeat(state.repeat);
      audio.loop = mode === 'one';
      writePref('repeat', mode);
      set({ repeat: mode });
    },
    setShuffle: (on) => {
      writePref('shuffle', on ? '1' : '0');
      setQueue(withShuffle(state.queue, on), { shuffle: on });
    },
    setRate: (rate) => {
      if (!PLAYBACK_RATES.includes(rate)) return;
      audio.defaultPlaybackRate = rate;
      audio.playbackRate = rate;
      writePref('rate', String(rate));
      set({ rate });
    },
    setVolume: (volume) => {
      const v = Math.min(1, Math.max(0, volume));
      audio.volume = v;
      if (v > 0 && audio.muted) { audio.muted = false; writePref('muted', '0'); }
      writePref('volume', String(v));
      set({ volume: v, muted: audio.muted });
    },
    toggleMute: () => {
      audio.muted = !audio.muted;
      writePref('muted', audio.muted ? '1' : '0');
      set({ muted: audio.muted });
    },
    enqueue: (track, where) => {
      if (!state.current) { playList([track], track.id); return; }
      setQueue(enqueueItem(state.queue, track, where));
    },
    removeAt: (position) => {
      if (position === state.queue.position) return;
      setQueue(removeQueueAt(state.queue, position));
    },
    syncTracks: (tracks) => {
      const q = state.queue;
      if (q.items.length === 0) return;
      // 지워진 곡은 대기열에서 뺀다(지금 곡이면 멈추고 다음 곡을 준비한다).
      let queue = q;
      let currentRemoved = false;
      for (let pos = queue.order.length - 1; pos >= 0; pos--) {
        const item = queue.items[queue.order[pos]];
        if (tracks.has(item.id)) continue;
        if (pos === queue.position) currentRemoved = true;
        queue = removeQueueAt(queue, pos);
      }
      const items = queue.items.map((item) => tracks.get(item.id) ?? item);
      const changed = currentRemoved || queue !== q || items.some((item, i) => item !== queue.items[i]);
      if (!changed) return;
      queue = { ...queue, items };
      if (currentRemoved) {
        setQueue(queue);
        load(false);
        if (!currentOf(queue)) close();
        return;
      }
      setQueue(queue);
    },
  };
}

export function usePlayerState(player: MusicPlayer): PlayerState {
  return useSyncExternalStore(player.subscribe, player.getState, player.getState);
}

const noSubscribe = () => () => {};
const zero = () => 0;

/** 재생 위치(초). active 가 아니면 구독하지 않는다. */
export function usePlayerTime(player: MusicPlayer, active = true): number {
  return useSyncExternalStore(active ? player.subscribeTime : noSubscribe, active ? player.getTime : zero, zero);
}
