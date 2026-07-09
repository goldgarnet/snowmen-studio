import { supabase } from '../lib/supabase';
import type { SolutionRow } from './types';

export interface NewSolution {
  map_id: string;
  author_id: string;
  author_name: string;
  moves: string;
  turn_count?: number | null;
  note?: string | null;
}

// All solutions for a map, oldest first. The UI pins the author's own solution and
// then orders by fewest turns.
export async function listSolutions(mapId: string): Promise<SolutionRow[]> {
  const { data, error } = await supabase
    .from('solutions')
    .select('*')
    .eq('map_id', mapId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as SolutionRow[];
}

export async function insertSolution(payload: NewSolution): Promise<SolutionRow> {
  const { data, error } = await supabase.from('solutions').insert(payload).select().single();
  if (error) throw new Error(error.message);
  return data as SolutionRow;
}

// Delete your own solution (or any solution on a map you own — allowed by RLS).
export async function deleteSolution(id: string): Promise<void> {
  const { error } = await supabase.from('solutions').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// The map owner changed the layout — every recorded walkthrough is now stale, so
// wipe them all. (RLS lets the owner delete solutions on their own map.)
export async function deleteSolutionsForMap(mapId: string): Promise<void> {
  const { error } = await supabase.from('solutions').delete().eq('map_id', mapId);
  if (error) throw new Error(error.message);
}
