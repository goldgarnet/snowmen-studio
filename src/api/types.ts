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
  solution: string | null;            // 출제자 풀이(이동 순서 기록). null = 미등록
  author_difficulty: number | null;  // 출제자 난이도
  difficulty: number | null;         // 회의 결정 난이도 (null = 미결정)
  status: MapStatus;
  published: boolean;
  published_at: string | null;       // 허브에 가장 최근 공개된 시각 (정렬 기준)
  created_at: string;
  updated_at: string;
}

export interface CommentRow {
  id: string;
  map_id: string;
  author_id: string;
  author_name: string;
  body: string;
  suggested_difficulty: number | null;  // 피드백에 첨부한 난이도 제안
  created_at: string;
}

export interface SolutionRow {
  id: string;
  map_id: string;
  author_id: string;
  author_name: string;
  moves: string;                 // 이동 순서 기록 (예: "RRULW")
  turn_count: number | null;     // 턴 수 (정렬/표시용)
  note: string | null;           // 한 줄 코멘트 (선택)
  created_at: string;
}

export const STATUS_LABEL: Record<MapStatus, string> = {
  pending: '검토중',
  accepted: '채택',
  held: '보류',
  rejected: '반려',
};
