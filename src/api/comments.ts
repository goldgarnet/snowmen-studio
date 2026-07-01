import { supabase } from '../lib/supabase';
import type { CommentRow } from './types';

export async function listComments(mapId: string): Promise<CommentRow[]> {
  const { data, error } = await supabase
    .from('comments')
    .select('*')
    .eq('map_id', mapId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as CommentRow[];
}

export async function addComment(payload: {
  map_id: string;
  author_id: string;
  author_name: string;
  body: string;
}): Promise<CommentRow> {
  const { data, error } = await supabase.from('comments').insert(payload).select().single();
  if (error) throw new Error(error.message);
  return data as CommentRow;
}

export async function deleteComment(id: string): Promise<void> {
  const { error } = await supabase.from('comments').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
