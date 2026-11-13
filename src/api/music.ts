import { supabase } from '../lib/supabase';
import { audioType, COMMON_KEY, safeStorageName } from '../lib/music';

// 음악 — 김정훈 · 황정빈이 올린 곡과 각자의 플레이리스트.
// 테이블 · 저장소는 supabase/migrations/2026-11-12_chapter_music.sql, 2026-11-13_music_library.sql.

export interface MusicSample {
  id: string;
  chapter_id: string | null;   // 없으면 공통 (타이틀 · 엔딩 등)
  title: string;
  note: string;
  path: string;                // 저장소(music-samples) 안의 경로
  file_name: string;           // 올린 파일의 원래 이름
  size_bytes: number | null;
  duration_sec: number | null;
  peaks: number[] | null;      // 파형 막대 높이(0~1)
  uploader_id: string | null;
  uploader_name: string;
  created_at: string;
  updated_at: string;
}

/** 내 플레이리스트. 만든 사람만 보고 고친다(DB 가 막는다). */
export interface MusicPlaylist {
  id: string;
  owner_id: string;
  name: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface MusicPlaylistItem {
  id: string;
  playlist_id: string;
  sample_id: string;
  sort_order: number;
  created_at: string;
}

export interface MusicData {
  samples: MusicSample[];
  playlists: MusicPlaylist[];
  items: MusicPlaylistItem[];
}

const BUCKET = 'music-samples';
const PAGE = 1000;   // Supabase 는 한 번에 1000줄까지만 돌려준다

/** 듣기 주소가 살아 있는 시간(초). 화면은 이보다 일찍 새 주소를 받는다(urls.ts). */
export const SIGNED_URL_SECONDS = 6 * 60 * 60;

/** SQL 을 아직 실행하지 않아 테이블이 없을 때 나는 오류인가. */
export function isMusicNotInstalled(e: unknown): boolean {
  const err = e as { code?: unknown; message?: unknown } | null;
  if (!err) return false;
  if (['PGRST204', 'PGRST205', '42P01', '42703'].includes(String(err.code))) return true;
  return typeof err.message === 'string'
    && /music_\w+/.test(err.message)
    && /does not exist|could not find|schema cache/i.test(err.message);
}

async function readAll<T>(table: string, column: string): Promise<T[]> {
  const rows: T[] = [];
  for (;;) {
    const { data, error } = await supabase.from(table).select('*')
      .order(column, { ascending: true }).order('id').range(rows.length, rows.length + PAGE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as T[]));
    if ((data ?? []).length < PAGE) return rows;
  }
}

export async function loadMusic(): Promise<MusicData> {
  const [samples, playlists, items] = await Promise.all([
    readAll<MusicSample>('music_samples', 'created_at'),
    readAll<MusicPlaylist>('music_playlists', 'sort_order'),
    readAll<MusicPlaylistItem>('music_playlist_items', 'sort_order'),
  ]);
  return { samples, playlists, items };
}

/** 행을 먼저 지우고 파일을 지운다. 파일 삭제가 실패해도 화면에 듣지 못하는 곡이 남지 않는다. */
async function removeStored(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await supabase.storage.from(BUCKET).remove(paths);
  if (error) console.warn('music: 저장소 파일을 지우지 못했습니다', error);
}

/** 곡 하나를 올린다(김정훈 · 황정빈만). 저장소에 파일을 넣고 행을 만든다(행이 실패하면 파일도 지운다). */
export async function uploadMusicSample(input: {
  chapterId: string | null;
  file: File;
  title: string;
  durationSec: number | null;
  peaks: number[] | null;
  uploaderName: string;
}): Promise<MusicSample> {
  const { chapterId, file } = input;
  const type = audioType(file.name, file.type) ?? 'audio/mpeg';
  // 파일 형식은 파일 자체에 실려 간다(upload 의 contentType 은 File 에는 쓰이지 않는다).
  const body = file.type === type ? file : new File([file], file.name, { type });
  const path = `${chapterId ?? COMMON_KEY}/${Date.now()}-${safeStorageName(file.name)}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, body, { contentType: type });
  if (error) throw error;
  try {
    const { data, error: rowError } = await supabase.from('music_samples').insert({
      chapter_id: chapterId,
      title: input.title,
      path,
      file_name: file.name,
      size_bytes: file.size,
      duration_sec: input.durationSec,
      peaks: input.peaks,
      uploader_name: input.uploaderName,
    }).select().single();
    if (rowError) throw rowError;
    return data as MusicSample;
  } catch (e) {
    await removeStored([path]);
    throw e;
  }
}

/** 제목 · 메모 · 챕터 옮기기 (김정훈 · 황정빈만 — 다른 계정이면 DB 가 한 줄도 바꾸지 않는다). */
export async function updateMusicSample(
  id: string, patch: Partial<Pick<MusicSample, 'title' | 'note' | 'chapter_id'>>,
): Promise<MusicSample> {
  const { data, error } = await supabase.from('music_samples')
    .update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id).select();
  if (error) throw error;
  if (!data?.length) throw new Error('음악을 올리는 계정만 고칠 수 있어요.');
  return data[0] as MusicSample;
}

export async function deleteMusicSample(sample: Pick<MusicSample, 'id' | 'path'>): Promise<void> {
  const { data, error } = await supabase.from('music_samples').delete().eq('id', sample.id).select('id');
  if (error) throw error;
  if (!data?.length) throw new Error('음악을 올리는 계정만 지울 수 있어요.');
  await removeStored([sample.path]);
}

/** 듣기 주소를 한 번에 받는다. 비공개 저장소라 서명한 주소로만 들을 수 있다. */
export async function signMusicUrls(paths: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const unique = [...new Set(paths)];
  if (unique.length === 0) return result;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(unique, SIGNED_URL_SECONDS);
  if (error) throw error;
  for (const row of data ?? []) {
    if (row.path && row.signedUrl && !row.error) result.set(row.path, row.signedUrl);
  }
  return result;
}

/** 내려받기 주소 — 받으면 올린 때의 파일 이름으로 저장된다. */
export async function musicDownloadUrl(sample: Pick<MusicSample, 'path' | 'file_name' | 'title'>): Promise<string> {
  const name = sample.file_name || `${sample.title || 'music'}.mp3`;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(sample.path, 60, { download: name });
  if (error) throw error;
  return data.signedUrl;
}

// ---------------------------------------------------------------- 내 플레이리스트

export async function createPlaylist(name: string, sortOrder: number): Promise<MusicPlaylist> {
  const { data, error } = await supabase.from('music_playlists')
    .insert({ name, sort_order: sortOrder }).select().single();
  if (error) throw error;
  return data as MusicPlaylist;
}

export async function renamePlaylist(id: string, name: string): Promise<MusicPlaylist> {
  const { data, error } = await supabase.from('music_playlists')
    .update({ name, updated_at: new Date().toISOString() }).eq('id', id).select().single();
  if (error) throw error;
  return data as MusicPlaylist;
}

export async function deletePlaylist(id: string): Promise<void> {
  const { error } = await supabase.from('music_playlists').delete().eq('id', id);
  if (error) throw error;
}

export async function addToPlaylist(playlistId: string, sampleId: string, sortOrder: number): Promise<MusicPlaylistItem> {
  const { data, error } = await supabase.from('music_playlist_items')
    .insert({ playlist_id: playlistId, sample_id: sampleId, sort_order: sortOrder }).select().single();
  if (error) throw error;
  return data as MusicPlaylistItem;
}

export async function removeFromPlaylist(itemId: string): Promise<void> {
  const { error } = await supabase.from('music_playlist_items').delete().eq('id', itemId);
  if (error) throw error;
}

/** 플레이리스트 안 순서를 저장한다 — 바뀐 줄만. */
export async function reorderPlaylist(changes: { id: string; sort_order: number }[]): Promise<void> {
  const results = await Promise.all(
    changes.map((c) => supabase.from('music_playlist_items').update({ sort_order: c.sort_order }).eq('id', c.id)),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) throw failed.error;
}
