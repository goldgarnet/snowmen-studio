import { supabase } from '../lib/supabase';
import type { FolderRow } from './types';

export interface NewFolder {
  owner_id: string;
  name: string;
}

export type FolderPatch = Partial<Omit<FolderRow, 'id' | 'owner_id'>>;

// My folders (drafts + published), newest activity first.
export async function listMyFolders(ownerId: string): Promise<FolderRow[]> {
  const { data, error } = await supabase
    .from('map_folders')
    .select('*')
    .eq('owner_id', ownerId)
    .order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as FolderRow[];
}

// All hub (published) folders. Same sort convention as the map hub.
export async function listPublishedFolders(): Promise<FolderRow[]> {
  const { data, error } = await supabase
    .from('map_folders')
    .select('*')
    .eq('published', true)
    .order('created_at', { ascending: false })
    .order('published_at', { ascending: false, nullsFirst: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as FolderRow[];
}

export async function getFolder(id: string): Promise<FolderRow | null> {
  const { data, error } = await supabase.from('map_folders').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as FolderRow) ?? null;
}

export async function insertFolder(payload: NewFolder): Promise<FolderRow> {
  const { data, error } = await supabase
    .from('map_folders')
    .insert({ ...payload, updated_at: new Date().toISOString() })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as FolderRow;
}

export async function updateFolder(id: string, patch: FolderPatch): Promise<FolderRow> {
  const { data, error } = await supabase
    .from('map_folders')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as FolderRow;
}

// Deleting a folder leaves its maps intact (folder_id → null via ON DELETE SET NULL),
// so they fall back to being standalone maps. We first take them off the hub so an
// orphaned member map doesn't suddenly appear as a standalone published map.
export async function deleteFolder(id: string): Promise<void> {
  await supabase.from('maps').update({ published: false }).eq('folder_id', id);
  const { error } = await supabase.from('map_folders').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// Move a map into a folder (folderId) or back out (null). A map's published state is
// kept in lockstep with its folder: joining a published folder publishes it, joining a
// draft folder (or leaving a folder) turns it back into a private draft.
export async function moveMapToFolder(
  mapId: string, folderId: string | null, published: boolean
): Promise<void> {
  const patch: Record<string, unknown> = {
    folder_id: folderId,
    published,
    updated_at: new Date().toISOString(),
  };
  if (published) patch.published_at = new Date().toISOString();
  const { error } = await supabase.from('maps').update(patch).eq('id', mapId);
  if (error) throw new Error(error.message);
}

export interface FolderPublishMeta {
  name: string;
  author_name: string;
  comment: string | null;
  created_at: string;   // ISO (등록일)
}

// Publish a folder to the hub: stamp its metadata + publish every member map so each
// becomes an individually reviewable hub map (visible only inside this folder).
export async function publishFolder(folderId: string, meta: FolderPublishMeta): Promise<FolderRow> {
  const now = new Date().toISOString();
  const folder = await updateFolder(folderId, {
    name: meta.name,
    author_name: meta.author_name,
    comment: meta.comment,
    created_at: meta.created_at,
    published: true,
    published_at: now,
  });
  // Publish all member maps.
  const pub = await supabase.from('maps')
    .update({ published: true, published_at: now, updated_at: now })
    .eq('folder_id', folderId);
  if (pub.error) throw new Error(pub.error.message);
  // Member maps with no author inherit the folder's author for display.
  const inh = await supabase.from('maps')
    .update({ author_name: meta.author_name })
    .eq('folder_id', folderId)
    .is('author_name', null);
  if (inh.error) throw new Error(inh.error.message);
  return folder;
}

// Take a folder off the hub: it and all its maps become private drafts again.
export async function unpublishFolder(folderId: string): Promise<FolderRow> {
  const folder = await updateFolder(folderId, { published: false });
  const { error } = await supabase.from('maps')
    .update({ published: false, updated_at: new Date().toISOString() })
    .eq('folder_id', folderId);
  if (error) throw new Error(error.message);
  return folder;
}
