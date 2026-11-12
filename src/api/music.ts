import { supabase } from '../lib/supabase';
import { audioType, COMMON_KEY, safeStorageName } from '../lib/music';
import type { MapStatus } from './types';

// 챕터 음악 — 챕터마다 올린 후보 곡(샘플)과 피드백.
// 테이블 · 저장소는 supabase/migrations/2026-11-12_chapter_music.sql.

/** 채택 · 보류 · 반려 · 검토중 — 맵 허브와 같은 값과 이름(STATUS_LABEL)을 쓴다. */
export type MusicStatus = MapStatus;

export interface MusicSample {
  id: string;
  chapter_id: string | null;   // 없으면 공통 (타이틀 · 엔딩 등)
  title: string;
  note: string;
  status: MusicStatus;
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

export interface MusicComment {
  id: string;
  sample_id: string;
  author_id: string | null;
  author_name: string;
  body: string;
  at_sec: number | null;       // 곡의 몇 초 지점에 단 피드백 (없으면 곡 전체)
  created_at: string;
}

export interface MusicData {
  samples: MusicSample[];
  comments: MusicComment[];
}

const BUCKET = 'music-samples';
const PAGE = 1000;   // Supabase 는 한 번에 1000줄까지만 돌려준다

/** 듣기 주소가 살아 있는 시간(초). 화면은 이보다 일찍 새 주소를 받는다(musicUrlFresh). */
export const SIGNED_URL_SECONDS = 6 * 60 * 60;

/** SQL 을 아직 실행하지 않아 테이블 · 함수가 없을 때 나는 오류인가. */
export function isMusicNotInstalled(e: unknown): boolean {
  const err = e as { code?: unknown; message?: unknown } | null;
  if (!err) return false;
  if (['PGRST202', 'PGRST204', 'PGRST205', '42P01', '42703', '42883'].includes(String(err.code))) return true;
  return typeof err.message === 'string'
    && /music_\w+|set_music_status/.test(err.message)
    && /does not exist|could not find|schema cache/i.test(err.message);
}

async function readAll<T>(table: string): Promise<T[]> {
  const rows: T[] = [];
  for (;;) {
    const { data, error } = await supabase.from(table).select('*')
      .order('created_at', { ascending: true }).order('id').range(rows.length, rows.length + PAGE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as T[]));
    if ((data ?? []).length < PAGE) return rows;
  }
}

export async function loadMusic(): Promise<MusicData> {
  const [samples, comments] = await Promise.all([
    readAll<MusicSample>('music_samples'),
    readAll<MusicComment>('music_comments'),
  ]);
  return { samples, comments };
}

/** 행을 먼저 지우고 파일을 지운다. 파일 삭제가 실패해도 화면에 듣지 못하는 곡이 남지 않는다. */
async function removeStored(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await supabase.storage.from(BUCKET).remove(paths);
  if (error) console.warn('music: 저장소 파일을 지우지 못했습니다', error);
}

/** 곡 하나를 올린다. 저장소에 파일을 넣고 행을 만든다(행이 실패하면 파일도 지운다). */
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

/** 제목 · 메모 · 칸 옮기기. 올린 사람만 된다(다른 사람이면 DB 가 한 줄도 바꾸지 않는다). */
export async function updateMusicSample(
  id: string, patch: Partial<Pick<MusicSample, 'title' | 'note' | 'chapter_id'>>,
): Promise<MusicSample> {
  const { data, error } = await supabase.from('music_samples')
    .update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id).select();
  if (error) throw error;
  if (!data?.length) throw new Error('올린 사람만 고칠 수 있어요.');
  return data[0] as MusicSample;
}

/** 채택 · 보류 · 반려 · 검토중 — 회의에서 누구나 바꾼다. */
export async function setMusicStatus(id: string, status: MusicStatus): Promise<void> {
  const { error } = await supabase.rpc('set_music_status', { p_sample_id: id, p_status: status });
  if (error) throw error;
}

export async function deleteMusicSample(sample: Pick<MusicSample, 'id' | 'path'>): Promise<void> {
  const { data, error } = await supabase.from('music_samples').delete().eq('id', sample.id).select('id');
  if (error) throw error;
  if (!data?.length) throw new Error('올린 사람만 지울 수 있어요.');
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

export async function addMusicComment(row: Pick<MusicComment, 'sample_id' | 'author_name' | 'body' | 'at_sec'>): Promise<MusicComment> {
  const { data, error } = await supabase.from('music_comments').insert(row).select().single();
  if (error) throw error;
  return data as MusicComment;
}

export async function deleteMusicComment(id: string): Promise<void> {
  const { data, error } = await supabase.from('music_comments').delete().eq('id', id).select('id');
  if (error) throw error;
  if (!data?.length) throw new Error('쓴 사람만 지울 수 있어요.');
}
