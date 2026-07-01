import { supabase } from '../lib/supabase';
import type { MapRow, MapStatus } from './types';

export interface NewMap {
  owner_id: string;
  title?: string | null;
  author_name?: string | null;
  code: string;
  comment?: string | null;
  difficulty?: number | null;
  status?: MapStatus;
  published?: boolean;
}

export type MapPatch = Partial<Omit<MapRow, 'id' | 'owner_id' | 'created_at'>>;

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

// All hub (published) maps, newest first.
export async function listPublishedMaps(): Promise<MapRow[]> {
  const { data, error } = await supabase
    .from('maps')
    .select('*')
    .eq('published', true)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as MapRow[];
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
