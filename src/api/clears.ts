import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { ClearRow } from './types';

// '풀었어요' 체크 (map_clears) + 자동 표시에 쓰는 풀이 작성자 목록.
// 오류는 PostgrestError 그대로 던진다 — 테이블이 아직 없는지(code) 가려야 해서.

export interface MapUserPair {
  mapId: string;
  userId: string;
}

// Supabase(PostgREST)는 한 번에 최대 1000줄(기본값)만 돌려준다. 맵 × 사람 수가
// 금방 그 이상이 되므로, 첫 쪽에서 전체 개수를 받아 다 모일 때까지 이어 읽는다.
const PAGE = 1000;

interface PageResult<T> {
  data: T[] | null;
  error: PostgrestError | null;
  count: number | null;
}

async function fetchAllRows<T>(
  page: (from: number, to: number, withCount: boolean) => PromiseLike<PageResult<T>>,
): Promise<T[]> {
  const rows: T[] = [];
  let total: number | null = null;
  for (let first = true; ; first = false) {
    const from = rows.length;
    const { data, error, count } = await page(from, from + PAGE - 1, first);
    if (error) throw error;
    if (first) total = count;
    const got = data ?? [];
    rows.push(...got);
    const done = total != null ? rows.length >= total : got.length < PAGE;
    if (got.length === 0 || done) return rows;
  }
}

/** map_clears 테이블이 아직 없을 때(마이그레이션 전) 나는 오류인가. */
export function isMissingTableError(e: unknown): boolean {
  const err = e as { code?: unknown; message?: unknown } | null;
  if (!err) return false;
  if (err.code === 'PGRST205' || err.code === '42P01') return true;
  const msg = typeof err.message === 'string' ? err.message : '';
  return msg.includes('map_clears') && /does not exist|could not find|schema cache/i.test(msg);
}

/** 모든 맵의 체크 (허브 맵 목록용). */
export async function listAllClears(): Promise<MapUserPair[]> {
  const rows = await fetchAllRows<Pick<ClearRow, 'map_id' | 'user_id'>>((from, to, withCount) =>
    supabase
      .from('map_clears')
      .select('map_id,user_id', withCount ? { count: 'exact' } : undefined)
      .order('map_id', { ascending: true })
      .order('user_id', { ascending: true })
      .range(from, to));
  return rows.map((r) => ({ mapId: r.map_id, userId: r.user_id }));
}

/** 한 맵의 체크 — 체크한 계정 id 목록 (맵 상세용). */
export async function listClearsForMap(mapId: string): Promise<string[]> {
  const { data, error } = await supabase.from('map_clears').select('user_id').eq('map_id', mapId);
  if (error) throw error;
  return ((data ?? []) as Pick<ClearRow, 'user_id'>[]).map((r) => r.user_id);
}

/** 내 체크 켜기/끄기. 이미 그 상태여도 오류 없이 지나간다. */
export async function setMyClear(mapId: string, userId: string, solved: boolean): Promise<void> {
  const { error } = solved
    ? await supabase
        .from('map_clears')
        .upsert({ map_id: mapId, user_id: userId }, { onConflict: 'map_id,user_id', ignoreDuplicates: true })
    : await supabase.from('map_clears').delete().eq('map_id', mapId).eq('user_id', userId);
  if (error) throw error;
}

/** 모든 맵의 풀이 작성자 (풀이를 등록한 사람 = 푼 것으로 자동 표시). */
export async function listAllSolutionAuthors(): Promise<MapUserPair[]> {
  const rows = await fetchAllRows<{ map_id: string; author_id: string }>((from, to, withCount) =>
    supabase
      .from('solutions')
      .select('map_id,author_id', withCount ? { count: 'exact' } : undefined)
      .order('id', { ascending: true })
      .range(from, to));
  return rows.map((r) => ({ mapId: r.map_id, userId: r.author_id }));
}

/** 한 맵의 풀이 작성자 id 목록. */
export async function listSolutionAuthorsForMap(mapId: string): Promise<string[]> {
  const { data, error } = await supabase.from('solutions').select('author_id').eq('map_id', mapId);
  if (error) throw error;
  return ((data ?? []) as { author_id: string }[]).map((r) => r.author_id);
}

/** 계정 id → 이름 (멤버 표 밖 계정 '+N' 툴팁용). */
export async function listProfileNames(): Promise<Map<string, string>> {
  const { data, error } = await supabase.from('profiles').select('id,name');
  if (error) throw error;
  return new Map(((data ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name]));
}
