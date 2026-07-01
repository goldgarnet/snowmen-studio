// Database row shapes (mirror supabase/schema.sql).

export type MapStatus = 'pending' | 'accepted' | 'held' | 'rejected';

export interface Profile {
  id: string;
  username: string;
  name: string;
  created_at: string;
}

export interface MapRow {
  id: string;
  owner_id: string;
  title: string | null;
  author_name: string | null;
  code: string;
  comment: string | null;
  difficulty: number | null;
  status: MapStatus;
  published: boolean;
  created_at: string;
  updated_at: string;
}

export interface CommentRow {
  id: string;
  map_id: string;
  author_id: string;
  author_name: string;
  body: string;
  created_at: string;
}

export const STATUS_LABEL: Record<MapStatus, string> = {
  pending: '검토중',
  accepted: '채택',
  held: '보류',
  rejected: '반려',
};
