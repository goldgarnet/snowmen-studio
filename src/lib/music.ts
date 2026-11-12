// 챕터 음악 — 화면이 쓰는 순수 계산.
// (api 모듈은 type 으로만 불러온다 — test/music 이 Node 에서 이 파일을 그대로 돌린다.)
import type { MusicComment, MusicSample, MusicStatus } from '../api/music';

// ---------------------------------------------------------------- 주소

/** 챕터 밖의 곡(타이틀 · 엔딩 등)을 모은 칸의 주소 값. DB 에서는 chapter_id 가 비어 있다. */
export const COMMON_KEY = 'common';

/** 곡이 속한 칸: 챕터 id, 챕터가 없으면 COMMON_KEY. */
export const chapterKeyOf = (sample: Pick<MusicSample, 'chapter_id'>): string => sample.chapter_id ?? COMMON_KEY;

/** '/music' = 채택곡 모아 듣기, '/music?ch=<챕터 id | common>' = 그 칸의 곡. */
export function musicUrl(chapterKey: string | null): string {
  return chapterKey ? `/music?${new URLSearchParams({ ch: chapterKey })}` : '/music';
}

export function musicChapterKey(url: string): string | null {
  const i = url.indexOf('?');
  if (i < 0) return null;
  return new URLSearchParams(url.slice(i + 1).split('#')[0]).get('ch') || null;
}

// ---------------------------------------------------------------- 순서 · 묶음

export const STATUS_ORDER: readonly MusicStatus[] = ['accepted', 'pending', 'held', 'rejected'];

type Ordered = Pick<MusicSample, 'id' | 'created_at'>;

export const byUploadOrder = (a: Ordered, b: Ordered): number =>
  a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);

/** 칸 안의 곡 번호 — 올린 순서대로 1, 2, 3… 상태가 바뀌어도 그대로라 회의에서 '3번 곡'으로 부를 수 있다. */
export function sampleNumbers(samples: readonly Ordered[]): Map<string, number> {
  return new Map([...samples].sort(byUploadOrder).map((s, i) => [s.id, i + 1]));
}

export interface StatusGroup<T> {
  status: MusicStatus;
  samples: T[];
}

/** 채택 → 검토중 → 보류 → 반려로 묶는다. 묶음 안은 올린 순서, 빈 묶음은 뺀다. */
export function groupByStatus<T extends Ordered & Pick<MusicSample, 'status'>>(samples: readonly T[]): StatusGroup<T>[] {
  const sorted = [...samples].sort(byUploadOrder);
  return STATUS_ORDER
    .map((status) => ({ status, samples: sorted.filter((s) => s.status === status) }))
    .filter((g) => g.samples.length > 0);
}

export interface ChapterSummary {
  total: number;
  accepted: number;
  pending: number;
  held: number;
  rejected: number;
}

export function summarize(samples: readonly Pick<MusicSample, 'status'>[]): ChapterSummary {
  const sum: ChapterSummary = { total: samples.length, accepted: 0, pending: 0, held: 0, rejected: 0 };
  for (const s of samples) sum[s.status] += 1;
  return sum;
}

/** 이어 듣기 · 앞뒤 곡: 재생 목록에서 한 칸 옮긴 곡. 끝이면 null. 목록에 없는 곡이면 처음(또는 끝)부터. */
export function stepInQueue(queue: readonly string[], currentId: string | null, dir: 1 | -1): string | null {
  if (queue.length === 0) return null;
  const i = currentId ? queue.indexOf(currentId) : -1;
  if (i < 0) return dir > 0 ? queue[0] : queue[queue.length - 1];
  return queue[i + dir] ?? null;
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

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes === 0) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  const mb = bytes / (1024 * 1024);
  return mb >= 10 ? `${Math.round(mb)} MB` : `${mb.toFixed(1)} MB`;
}

export function formatWhen(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
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

/** 저장해 두는 파형 막대 수. 줄 폭에 맞춰 늘여 그린다. */
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

/** 파형 위에 찍을 피드백 표시 — 지점이 있고 곡 길이 안인 것만, 0~1 비율로. */
export function commentMarks(comments: readonly Pick<MusicComment, 'id' | 'at_sec' | 'body' | 'author_name'>[], duration: number | null | undefined) {
  if (!duration || !(duration > 0)) return [];
  return comments
    .filter((c) => c.at_sec != null && c.at_sec >= 0 && c.at_sec <= duration)
    .map((c) => ({ id: c.id, at: c.at_sec as number, ratio: (c.at_sec as number) / duration, label: `${formatTime(c.at_sec)} ${c.author_name}: ${c.body}` }));
}
