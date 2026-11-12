import { useSyncExternalStore } from 'react';
import { stepInQueue } from '../../lib/music';

// 챕터 음악 재생기 — 화면 전체가 오디오 하나를 같이 쓴다(한 번에 한 곡).
// 상태(어느 곡 · 재생 중 · 재생 방식 …)와 재생 위치를 따로 알린다. 위치는 자주 바뀌므로
// 지금 곡의 파형과 아래 재생 막대만 받아 다시 그린다(usePlayerTime).

/** 한 곡만 = 끝나면 멈춤, 반복 = 그 곡을 계속(게임 배경음처럼 이음새 확인), 이어 듣기 = 끝나면 다음 곡. */
export type PlayMode = 'once' | 'loop' | 'continue';

export interface MusicTrack {
  id: string;
  path: string;
  title: string;
  artist: string;     // 올린 사람
  album: string;      // 칸 이름 (챕터 2 · 바위 지형)
  duration: number | null;
}

export interface PlayerState {
  currentId: string | null;
  playing: boolean;
  loading: boolean;   // 주소를 받거나 버퍼링하는 중
  duration: number;   // 지금 곡 길이 (모르면 0)
  mode: PlayMode;
  volume: number;     // 0~1
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
  /** 지금 목록의 곡들. 곡 id 로 틀고, 앞뒤 곡도 여기서 찾는다. */
  setTracks: (tracks: ReadonlyMap<string, MusicTrack>) => void;
  play: (id: string, options?: { at?: number; queue?: string[] }) => void;
  toggle: (id: string, queue?: string[]) => void;
  pause: () => void;
  resume: () => void;
  seek: (sec: number) => void;
  /** 파형을 누른 자리(0~1)로. 다른 곡이면 그 곡을 그 자리부터 튼다. */
  seekTo: (id: string, ratio: number, queue?: string[]) => void;
  next: () => void;
  prev: () => void;
  stop: () => void;
  setMode: (mode: PlayMode) => void;
  setVolume: (volume: number) => void;
}

const MODE_KEY = 'snowmen-studio:music:mode';
const VOLUME_KEY = 'snowmen-studio:music:volume';
const PLAY_MODES: readonly PlayMode[] = ['once', 'loop', 'continue'];
/** 재생 위치를 알리는 최소 간격(초) — 파형 막대 하나보다 훨씬 촘촘하다. */
const TIME_STEP = 0.05;

function readMode(): PlayMode {
  try {
    const raw = localStorage.getItem(MODE_KEY) as PlayMode | null;
    return raw && PLAY_MODES.includes(raw) ? raw : 'once';
  } catch { return 'once'; }
}

function readVolume(): number {
  try {
    const v = parseFloat(localStorage.getItem(VOLUME_KEY) ?? '');
    return Number.isFinite(v) && v >= 0 && v <= 1 ? v : 1;
  } catch { return 1; }
}

function remember(key: string, value: string): void {
  try { localStorage.setItem(key, value); }
  catch { /* 기억하지 못해도 이번 재생은 그대로 */ }
}

export function createMusicPlayer(source: PlayerUrls): MusicPlayer {
  const audio = new Audio();
  audio.preload = 'auto';

  let state: PlayerState = {
    currentId: null, playing: false, loading: false, duration: 0, mode: readMode(), volume: readVolume(), error: null,
  };
  audio.loop = state.mode === 'loop';
  audio.volume = state.volume;

  const listeners = new Set<() => void>();
  const timeListeners = new Set<() => void>();
  let time = 0;
  let tracks: ReadonlyMap<string, MusicTrack> = new Map();
  let current: MusicTrack | null = null;
  let queue: string[] = [];
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

  function start(url: string, at: number) {
    pendingSeek = at > 0 ? at : null;
    audio.src = url;
    // 길이를 읽기 전에 정한 위치는 브라우저가 시작 위치로 쓴다. loadedmetadata 에서 한 번 더 맞춘다.
    if (pendingSeek != null) { try { audio.currentTime = pendingSeek; } catch { /* 메타데이터 뒤에 맞춘다 */ } }
    begin();
  }

  function play(id: string, options: { at?: number; queue?: string[] } = {}) {
    const track = tracks.get(id);
    if (!track) return;
    if (options.queue) queue = options.queue;
    const at = Math.max(0, options.at ?? 0);
    if (current?.id === id && hasSource() && !state.error) {
      if (options.at != null) seek(at);
      if (audio.paused) begin();
      return;
    }
    token += 1;
    const mine = token;
    current = track;
    retried = false;
    setTime(at, true);
    set({ currentId: id, playing: false, loading: true, duration: track.duration ?? 0, error: null });
    const url = source.cachedUrl(track.path);
    if (url) { start(url, at); return; }
    audio.pause();
    source.freshUrl(track.path)
      .then((fresh) => { if (mine === token) start(fresh, at); })
      .catch(() => { if (mine === token) fail('듣기 주소를 받지 못했어요. 잠시 뒤 다시 눌러 주세요.'); });
  }

  function toggle(id: string, nextQueue?: string[]) {
    if (current?.id === id && hasSource() && !state.error) {
      if (nextQueue) queue = nextQueue;
      if (audio.paused) begin(); else audio.pause();
      return;
    }
    if (current?.id === id) current = null;   // 오류가 난 곡을 다시 누르면 처음부터 다시
    play(id, { queue: nextQueue });
  }

  function seek(sec: number) {
    if (!current) return;
    const duration = state.duration || (Number.isFinite(audio.duration) ? audio.duration : 0);
    const to = Math.max(0, duration > 0 ? Math.min(sec, duration) : sec);
    if (hasSource() && audio.readyState > 0) {
      try { audio.currentTime = to; } catch { /* 아직 못 옮기면 아래 위치만 */ }
    } else {
      pendingSeek = to;
    }
    setTime(to, true);
  }

  function seekTo(id: string, ratio: number, nextQueue?: string[]) {
    const r = Math.min(1, Math.max(0, ratio));
    if (current?.id === id && hasSource() && !state.error && state.duration > 0) {
      if (nextQueue) queue = nextQueue;
      seek(r * state.duration);
      if (audio.paused) begin();
      return;
    }
    const duration = tracks.get(id)?.duration ?? 0;
    play(id, { at: duration > 0 ? r * duration : 0, queue: nextQueue });
  }

  function next() {
    const id = stepInQueue(queue, current?.id ?? null, 1);
    if (id) play(id);
  }

  function prev() {
    if (time > 3) { seek(0); return; }
    const id = stepInQueue(queue, current?.id ?? null, -1);
    if (id) play(id); else seek(0);
  }

  function stop() {
    token += 1;
    current = null;
    pendingSeek = null;
    audio.pause();
    if (hasSource()) { audio.removeAttribute('src'); audio.load(); }
    setTime(0, true);
    set({ currentId: null, playing: false, loading: false, duration: 0, error: null });
  }

  function syncMediaSession() {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    const session = navigator.mediaSession;
    try {
      if (current && state.currentId) {
        if (sessionTrack !== current.id && typeof MediaMetadata !== 'undefined') {
          sessionTrack = current.id;
          session.metadata = new MediaMetadata({ title: current.title, artist: current.artist, album: current.album });
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
      if (Number.isFinite(audio.duration) && audio.duration > 0) set({ duration: audio.duration });
    }],
    ['durationchange', () => { if (Number.isFinite(audio.duration) && audio.duration > 0) set({ duration: audio.duration }); }],
    ['timeupdate', () => setTime(audio.currentTime)],
    ['seeked', () => setTime(audio.currentTime, true)],
    ['ended', () => {
      set({ playing: false });
      if (state.mode === 'continue') {
        const id = stepInQueue(queue, current?.id ?? null, 1);
        if (id) { play(id); return; }
      }
      setTime(audio.duration || time, true);
    }],
    ['error', () => {
      if (!current || !hasSource()) return;
      const failed = current;
      const at = audio.currentTime || time;
      const mine = token;
      if (retried) { fail(); return; }
      // 서명한 주소가 낡았을 수 있다 — 새 주소로 한 번만 다시 받는다.
      retried = true;
      set({ loading: true });
      source.freshUrl(failed.path)
        .then((url) => { if (mine === token) start(url, at); })
        .catch(() => { if (mine === token) fail(); });
    }],
  ];

  const sessionActions: [MediaSessionAction, MediaSessionActionHandler][] = [
    ['play', () => resume()],
    ['pause', () => audio.pause()],
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
      stop();
      for (const [name, handler] of events) audio.removeEventListener(name, handler);
      setSessionActions(false);
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
    };
  }

  function resume() {
    if (current && hasSource() && !state.error) begin();
    else if (current) { const id = current.id; current = null; play(id, { at: time }); }
  }

  return {
    getState: () => state,
    subscribe: (callback) => { listeners.add(callback); return () => { listeners.delete(callback); }; },
    getTime: () => time,
    subscribeTime: (callback) => { timeListeners.add(callback); return () => { timeListeners.delete(callback); }; },
    attach,
    setTracks: (next) => {
      tracks = next;
      // 듣는 곡의 제목 · 칸이 바뀌었으면 미디어 키 표시도 따라간다.
      const updated = current ? next.get(current.id) : undefined;
      if (current && updated && updated !== current) {
        current = { ...updated };
        sessionTrack = null;
        syncMediaSession();
      }
    },
    play,
    toggle,
    pause: () => audio.pause(),
    resume,
    seek,
    seekTo,
    next,
    prev,
    stop,
    setMode: (mode) => {
      audio.loop = mode === 'loop';
      remember(MODE_KEY, mode);
      set({ mode });
    },
    setVolume: (volume) => {
      const v = Math.min(1, Math.max(0, volume));
      audio.volume = v;
      remember(VOLUME_KEY, String(v));
      set({ volume: v });
    },
  };
}

export function usePlayerState(player: MusicPlayer): PlayerState {
  return useSyncExternalStore(player.subscribe, player.getState, player.getState);
}

const noSubscribe = () => () => {};
const zero = () => 0;

/** 재생 위치(초). active 가 아니면 구독하지 않는다 — 지금 곡이 아닌 줄은 다시 그리지 않는다. */
export function usePlayerTime(player: MusicPlayer, active = true): number {
  return useSyncExternalStore(active ? player.subscribeTime : noSubscribe, active ? player.getTime : zero, zero);
}
