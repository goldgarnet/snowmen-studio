// 음악 탭 — 화면과 재생기가 쓰는 순수 계산.
// (api 모듈은 type 으로만 불러온다 — test/music 이 Node 에서 이 파일을 그대로 돌린다.)
import type { MusicSample } from '../api/music';

// ---------------------------------------------------------------- 주소

/** 챕터 밖의 곡(타이틀 · 엔딩 등)을 모은 칸의 주소 값. DB 에서는 chapter_id 가 비어 있다. */
export const COMMON_KEY = 'common';

/** 곡이 속한 칸: 챕터 id, 챕터가 없으면 COMMON_KEY. */
export const chapterKeyOf = (sample: Pick<MusicSample, 'chapter_id'>): string => sample.chapter_id ?? COMMON_KEY;

/** 음악 탭에서 보는 것: 모든 곡 · 한 챕터(또는 공통) · 내 플레이리스트 하나. */
export type MusicView =
  | { kind: 'all' }
  | { kind: 'chapter'; key: string }
  | { kind: 'playlist'; id: string };

/** '/music' = 모든 곡, '/music?ch=<챕터 id | common>', '/music?pl=<플레이리스트 id>' */
export function musicUrl(view: MusicView): string {
  if (view.kind === 'chapter') return `/music?${new URLSearchParams({ ch: view.key })}`;
  if (view.kind === 'playlist') return `/music?${new URLSearchParams({ pl: view.id })}`;
  return '/music';
}

export const chapterMusicUrl = (chapterKey: string) => musicUrl({ kind: 'chapter', key: chapterKey });

export function parseMusicView(url: string): MusicView {
  const i = url.indexOf('?');
  const params = new URLSearchParams(i < 0 ? '' : url.slice(i + 1).split('#')[0]);
  const pl = params.get('pl');
  if (pl) return { kind: 'playlist', id: pl };
  const ch = params.get('ch');
  if (ch) return { kind: 'chapter', key: ch };
  return { kind: 'all' };
}

export const sameView = (a: MusicView, b: MusicView): boolean => musicUrl(a) === musicUrl(b);

// ---------------------------------------------------------------- 순서

type Ordered = Pick<MusicSample, 'id' | 'created_at'>;

export const byUploadOrder = (a: Ordered, b: Ordered): number =>
  a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);

/**
 * 모든 곡 목록의 순서: 챕터 번호 순(공통은 맨 뒤), 같은 챕터 안은 올린 순서.
 * chapterRank 는 챕터 id → 순번(챕터 구성의 번호 순). 모르는 챕터는 공통 앞에 둔다.
 */
export function libraryOrder<T extends Ordered & Pick<MusicSample, 'chapter_id'>>(
  samples: readonly T[], chapterRank: ReadonlyMap<string, number>,
): T[] {
  const rank = (s: T) => (s.chapter_id == null ? Number.MAX_SAFE_INTEGER : chapterRank.get(s.chapter_id) ?? Number.MAX_SAFE_INTEGER - 1);
  return [...samples].sort((a, b) => rank(a) - rank(b) || byUploadOrder(a, b));
}

/** 플레이리스트 안 순서를 옮긴다(끌어 놓기 · 위로 · 아래로). 새 배열을 돌려준다. */
export function moveInList<T>(list: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= list.length) return [...list];
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, item);
  return next;
}

// ---------------------------------------------------------------- 재생 대기열

/** 반복 안 함 → 플레이리스트(목록) 반복 → 한 곡 반복 */
export type RepeatMode = 'off' | 'all' | 'one';
export const REPEAT_CYCLE: readonly RepeatMode[] = ['off', 'all', 'one'];
export const nextRepeat = (mode: RepeatMode): RepeatMode =>
  REPEAT_CYCLE[(REPEAT_CYCLE.indexOf(mode) + 1) % REPEAT_CYCLE.length];

/** 배속 */
export const PLAYBACK_RATES: readonly number[] = [0.5, 0.75, 1, 1.25, 1.5, 2];
export const rateLabel = (rate: number): string => `${rate}×`;

/**
 * 재생 대기열. items 는 처음 넣은 순서 그대로이고, order 는 재생 순서(섞기면 섞인 순서)로
 * items 의 자리 번호를 담는다. position 은 order 안의 지금 자리(-1 = 없음).
 */
export interface Queue<T> {
  items: T[];
  order: number[];
  position: number;
}

export const emptyQueue = <T>(): Queue<T> => ({ items: [], order: [], position: -1 });

/** 섞은 순서 — first 를 맨 앞에 두고 나머지를 고르게 섞는다(Fisher–Yates). */
export function shuffledOrder(length: number, first: number, random: () => number = Math.random): number[] {
  const rest = Array.from({ length }, (_, i) => i).filter((i) => i !== first);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return first >= 0 && first < length ? [first, ...rest] : rest;
}

export function makeQueue<T>(items: readonly T[], start: number, shuffle: boolean, random: () => number = Math.random): Queue<T> {
  if (items.length === 0) return emptyQueue();
  const first = Math.min(Math.max(0, start), items.length - 1);
  const order = shuffle ? shuffledOrder(items.length, first, random) : items.map((_, i) => i);
  return { items: [...items], order, position: order.indexOf(first) };
}

export const currentOf = <T>(q: Queue<T>): T | null =>
  q.position >= 0 && q.position < q.order.length ? q.items[q.order[q.position]] ?? null : null;

/**
 * 다음(1) · 이전(-1) 자리. 끝에서 '반복 안 함'이면 null, '목록 반복'이면 처음(또는 끝)으로 돈다.
 * '한 곡 반복'이어도 다음 · 이전 단추는 옆 곡으로 간다(곡이 끝났을 때만 같은 곡을 다시 튼다).
 */
export function stepPosition(q: Queue<unknown>, dir: 1 | -1, repeat: RepeatMode): number | null {
  const n = q.order.length;
  if (n === 0) return null;
  const next = q.position + dir;
  if (next >= 0 && next < n) return next;
  return repeat === 'off' ? null : (next + n) % n;
}

/** 섞기를 켜고 끈다. 지금 곡은 그대로 두고 나머지 순서만 바꾼다. */
export function withShuffle<T>(q: Queue<T>, on: boolean, random: () => number = Math.random): Queue<T> {
  if (q.items.length === 0) return q;
  const cur = q.position >= 0 ? q.order[q.position] : 0;
  if (on) return { ...q, order: shuffledOrder(q.items.length, cur, random), position: 0 };
  const order = q.items.map((_, i) => i);
  return { ...q, order, position: q.position >= 0 ? cur : -1 };
}

/** 재생 순서의 at 자리 곡을 뺀다. 지금 곡보다 앞이면 지금 자리를 하나 당긴다. */
export function removeAt<T>(q: Queue<T>, at: number): Queue<T> {
  if (at < 0 || at >= q.order.length) return q;
  const removedItem = q.order[at];
  const items = q.items.filter((_, i) => i !== removedItem);
  const order = q.order.filter((_, i) => i !== at).map((i) => (i > removedItem ? i - 1 : i));
  let position = q.position;
  if (at < q.position) position -= 1;
  else if (at === q.position) position = Math.min(q.position, order.length - 1);
  return { items, order, position: order.length === 0 ? -1 : position };
}

/** 대기열에 넣는다 — '다음에 재생'은 지금 곡 바로 뒤, '대기열에 추가'는 맨 뒤. */
export function enqueue<T>(q: Queue<T>, item: T, where: 'next' | 'end'): Queue<T> {
  const index = q.items.length;
  const items = [...q.items, item];
  const order = [...q.order];
  const at = where === 'next' && q.position >= 0 ? q.position + 1 : order.length;
  order.splice(at, 0, index);
  return { items, order, position: q.position >= 0 ? q.position : 0 };
}

// ---------------------------------------------------------------- 표시

/** 0:07, 3:42, 1:02:03. 모르는 값은 --:-- */
export function formatTime(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return '--:--';
  const total = Math.floor(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/** 목록 전체 길이 — '12분', '1시간 5분'. 길이를 모르는 곡은 빼고 센다. */
export function formatTotal(seconds: readonly (number | null | undefined)[]): string {
  const total = seconds.reduce<number>((sum, s) => sum + (s != null && Number.isFinite(s) && s > 0 ? s : 0), 0);
  const minutes = Math.round(total / 60);
  if (minutes < 60) return `${minutes}분`;
  return `${Math.floor(minutes / 60)}시간 ${minutes % 60}분`;
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes === 0) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  const mb = bytes / (1024 * 1024);
  return mb >= 10 ? `${Math.round(mb)} MB` : `${mb.toFixed(1)} MB`;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

// ---------------------------------------------------------------- 올리기

/** 한 파일 최대 크기. supabase/migrations/2026-11-12_chapter_music.sql 의 버킷 제한과 같다. */
export const MAX_MUSIC_BYTES = 20 * 1024 * 1024;

const AUDIO_TYPES: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  flac: 'audio/flac',
  weba: 'audio/webm',
};

const extOf = (name: string): string => {
  const m = name.trim().toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : '';
};

/**
 * 저장소에 적을 파일 형식. 확장자를 먼저 본다 — 브라우저 · OS 에 따라 mp3 의 형식이 비거나
 * 'audio/mp3' 처럼 와서, 그대로 올리면 저장소가 오디오가 아니라고 거절할 수 있다. 오디오가 아니면 null.
 */
export function audioType(name: string, type: string): string | null {
  const byExt = AUDIO_TYPES[extOf(name)];
  if (byExt) return byExt;
  return /^audio\/[\w.+-]+$/i.test(type) ? type.toLowerCase() : null;
}

/** 올릴 수 없는 파일이면 그 까닭. */
export function fileProblem(file: { name: string; size: number; type: string }): string | null {
  if (!audioType(file.name, file.type)) return '음악 파일(mp3 등)만 올릴 수 있어요.';
  if (file.size === 0) return '빈 파일이에요.';
  if (file.size > MAX_MUSIC_BYTES) {
    return `${formatBytes(MAX_MUSIC_BYTES)}까지 올릴 수 있어요 (이 파일은 ${formatBytes(file.size)}). mp3로 바꿔 올려 주세요.`;
  }
  return null;
}

/** 곡 제목 기본값 — 파일 이름에서 확장자를 뺀다. */
export function titleFromFileName(name: string): string {
  const base = name.trim().replace(/\.[a-z0-9]{1,5}$/i, '').replace(/\s+/g, ' ').trim();
  return (base || name.trim()).slice(0, 120);
}

/** 저장소 경로는 영문 · 숫자만 된다. 원래 이름은 file_name 칸에 따로 둔다. */
export function safeStorageName(name: string): string {
  const ext = extOf(name);
  const stem = name.trim().replace(/\.[a-z0-9]{1,5}$/i, '').replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_+/g, '_');
  const safeStem = stem.replace(/^[._]+|[._]+$/g, '').slice(0, 60) || 'track';
  return ext ? `${safeStem}.${ext}` : safeStem;
}

// ---------------------------------------------------------------- 파형

/** 저장해 두는 파형 막대 수. 폭에 맞춰 늘여 그린다. */
export const PEAK_BARS = 160;

/**
 * 파형 막대 높이(0~1). 구간마다 RMS 를 재고 가장 큰 구간을 1로 맞춘다 — 조용한 도입과 큰 후렴이 구분된다.
 * channels 는 채널마다 샘플 배열(AudioBuffer.getChannelData). 소리가 없으면 0 으로 채운다.
 */
export function computePeaks(channels: readonly ArrayLike<number>[], bars = PEAK_BARS): number[] | null {
  const length = channels.reduce((max, ch) => Math.max(max, ch.length), 0);
  if (channels.length === 0 || length === 0 || bars < 1) return null;
  const n = Math.min(Math.floor(bars), length);
  const rms: number[] = [];
  for (let b = 0; b < n; b++) {
    const start = Math.floor((b * length) / n);
    const end = Math.max(start + 1, Math.floor(((b + 1) * length) / n));
    let sum = 0;
    let count = 0;
    for (const ch of channels) {
      const stop = Math.min(end, ch.length);
      for (let i = start; i < stop; i++) { sum += ch[i] * ch[i]; count++; }
    }
    rms.push(count ? Math.sqrt(sum / count) : 0);
  }
  const max = rms.reduce((m, v) => Math.max(m, v), 0);
  if (!(max > 0)) return rms.map(() => 0);
  return rms.map((v) => Math.round((v / max) * 1000) / 1000);
}

/** DB 에서 온 파형 값이 쓸 만한가 (숫자 배열). 아니면 null — 그때는 막대 하나로 그린다. */
export function validPeaks(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  return value.every((v) => typeof v === 'number' && Number.isFinite(v)) ? (value as number[]) : null;
}

/** 클릭한 가로 위치를 0~1 비율로. */
export function seekRatio(clientX: number, left: number, width: number): number {
  if (!(width > 0)) return 0;
  return Math.min(1, Math.max(0, (clientX - left) / width));
}
