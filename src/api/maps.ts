import { supabase } from '../lib/supabase';
import type { MapRow, MapStatus } from './types';

// A 'YYYY-MM-DD' registration date → ISO timestamp (noon local, to avoid the
// date shifting a day across time zones).
export function registeredToISO(dateStr: string): string {
  return new Date(`${dateStr}T12:00:00`).toISOString();
}

// ISO timestamp → 'YYYY-MM-DD' for prefilling the 등록일 date input.
export function isoToDateStr(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export interface NewMap {
  owner_id: string;
  title?: string | null;
  author_name?: string | null;
  code: string;
  comment?: string | null;
  author_difficulty?: number | null;  // 출제자 난이도
  difficulty?: number | null;         // 회의 결정 난이도 (보통 등록 시 null)
  status?: MapStatus;
  published?: boolean;
  published_at?: string | null;   // 허브 공개 시각 (허브 정렬 기준)
  created_at?: string;   // 등록일 (편집 가능)
}

// created_at is editable (등록일) so it is NOT omitted here.
export type MapPatch = Partial<Omit<MapRow, 'id' | 'owner_id'>>;

// My saved maps (drafts + my published maps), newest activity first.
export async function listMyMaps(ownerId: string): Promise<MapRow[]> {
  const { data, error } = await supabase
    .from('maps')
    .select('*')
    .eq('owner_id', ownerId)
    .order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as MapRow[];
}

// All hub (published) maps. Sorted by 생성 날짜(created_at, 등록일) first, and for
// ties by 공개 날짜(published_at, most recent first).
export async function listPublishedMaps(): Promise<MapRow[]> {
  const { data, error } = await supabase
    .from('maps')
    .select('*')
    .eq('published', true)
    .order('created_at', { ascending: false })
    .order('published_at', { ascending: false, nullsFirst: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as MapRow[];
}

// Take a published map back to a private draft (owner-only). Keeps its metadata so
// it can be re-published later (which re-stamps published_at).
export async function unpublishMap(id: string): Promise<MapRow> {
  return updateMap(id, { published: false });
}

export async function getMap(id: string): Promise<MapRow | null> {
  const { data, error } = await supabase.from('maps').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as MapRow) ?? null;
}

export async function insertMap(payload: NewMap): Promise<MapRow> {
  const { data, error } = await supabase
    .from('maps')
    .insert({ ...payload, updated_at: new Date().toISOString() })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as MapRow;
}

// Owner-only content update (title/code/comment/author_name/published).
export async function updateMap(id: string, patch: MapPatch): Promise<MapRow> {
  const { data, error } = await supabase
    .from('maps')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as MapRow;
}

export async function deleteMap(id: string): Promise<void> {
  const { error } = await supabase.from('maps').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// Shared review update — status and/or difficulty, editable by any member (RPC).
export async function setReview(
  mapId: string,
  review: { status?: MapStatus; difficulty?: number },
): Promise<void> {
  const { error } = await supabase.rpc('set_map_review', {
    p_map_id: mapId,
    p_status: review.status ?? null,
    p_difficulty: review.difficulty ?? null,
  });
  if (error) throw new Error(error.message);
}

// Everything the current user is allowed to read (published maps + own drafts),
// for the "전체 백업 내보내기" text export.
export async function fetchAllForBackup(): Promise<MapRow[]> {
  const { data, error } = await supabase
    .from('maps')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as MapRow[];
}
