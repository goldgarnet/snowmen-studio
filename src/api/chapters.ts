import { supabase } from '../lib/supabase';
import type { MapRow } from './types';

// ---------- row shapes (mirror supabase/schema.sql) ----------

export interface ChapterRow {
  id: string;
  number: number;            // 챕터 번호 — 스테이지 번호 "2-1"의 앞부분
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface StageRow {
  id: string;
  chapter_id: string;
  map_id: string;
  sort_order: number;        // 챕터 안 순서 (스테이지 번호는 여기서 자동 파생)
  description: string | null;
  requires: string | null;   // 접근에 필요한 선행 스테이지 번호들 (예: "1-3, 2-1")
  unlocks: string | null;    // 클리어 시 해금되는 스테이지 번호들
  note: string | null;       // 비고 (자유 메모)
  created_at: string;
  updated_at: string;
  map?: MapRow | null;       // joined map row (list query)
}

// ---------- chapters ----------

export async function listChapters(): Promise<ChapterRow[]> {
  const { data, error } = await supabase
    .from('chapters')
    .select('*')
    .order('number', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as ChapterRow[];
}

export async function insertChapter(payload: { number: number; name: string; description?: string | null }): Promise<ChapterRow> {
  const { data, error } = await supabase
    .from('chapters')
    .insert({ ...payload, updated_at: new Date().toISOString() })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as ChapterRow;
}

export async function updateChapter(id: string, patch: Partial<Omit<ChapterRow, 'id'>>): Promise<ChapterRow> {
  const { data, error } = await supabase
    .from('chapters')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as ChapterRow;
}

// Deleting a chapter cascades to its stages (maps themselves are untouched).
export async function deleteChapter(id: string): Promise<void> {
  const { error } = await supabase.from('chapters').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ---------- stages ----------

// Stages of one chapter, in order, with the referenced map joined in.
export async function listStages(chapterId: string): Promise<StageRow[]> {
  const { data, error } = await supabase
    .from('stages')
    .select('*, map:maps(*)')
    .eq('chapter_id', chapterId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as StageRow[];
}

// Every stage across all chapters (for showing which maps are already placed).
export async function listAllStages(): Promise<StageRow[]> {
  const { data, error } = await supabase.from('stages').select('*');
  if (error) throw new Error(error.message);
  return (data ?? []) as StageRow[];
}

export async function insertStage(payload: {
  chapter_id: string; map_id: string; sort_order: number;
  description?: string | null; requires?: string | null; unlocks?: string | null; note?: string | null;
}): Promise<StageRow> {
  const { data, error } = await supabase
    .from('stages')
    .insert({ ...payload, updated_at: new Date().toISOString() })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as StageRow;
}

export async function updateStage(
  id: string,
  patch: Partial<Pick<StageRow, 'description' | 'requires' | 'unlocks' | 'note' | 'sort_order' | 'chapter_id' | 'map_id'>>,
): Promise<StageRow> {
  const { data, error } = await supabase
    .from('stages')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as StageRow;
}

export async function deleteStage(id: string): Promise<void> {
  const { error } = await supabase.from('stages').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// Persist a chapter's stage order: sort_order = index in `orderedIds` (renumbered
// 0..n-1 on every move, so stage numbers derived from position stay gapless).
export async function reorderStages(orderedIds: string[]): Promise<void> {
  const results = await Promise.all(
    orderedIds.map((id, i) => supabase.from('stages').update({ sort_order: i }).eq('id', id)),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);
}
