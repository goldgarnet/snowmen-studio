// Database row shapes (mirror supabase/schema.sql).

export type MapStatus = 'pending' | 'accepted' | 'held' | 'rejected';

export interface Profile {
  id: string;
  username: string;
  name: string;
  created_at: string;
  approved?: boolean;   // 가입 승인 여부. 승인제 SQL 을 돌리기 전에는 값이 없다.
}

export interface FolderRow {
  id: string;
  owner_id: string;
  name: string;
  author_name: string | null;
  comment: string | null;
  published: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MapRow {
  id: string;
  owner_id: string;
  folder_id: string | null;           // 속한 맵 폴더 (null = 단독 맵)
  sort_order: number | null;          // 폴더 안에서의 순서 (null = 미지정 → 등록일 순으로 맨 뒤)
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

// '풀었어요' 체크 한 줄 = 한 사람이 한 맵을 풀었다고 표시함 (기본키 map_id + user_id).
export interface ClearRow {
  map_id: string;
  user_id: string;
  created_at: string;
}

export const STATUS_LABEL: Record<MapStatus, string> = {
  pending: '검토중',
  accepted: '채택',
  held: '보류',
  rejected: '반려',
};

// 상태 필터 칩 (전체 + 회의 결정 4가지) — 맵 허브와 '푼 맵 현황'이 같이 쓴다.
export type StatusFilter = 'all' | MapStatus;
export const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: '전체' },
  { key: 'pending', label: '검토중' },
  { key: 'accepted', label: '채택' },
  { key: 'held', label: '보류' },
  { key: 'rejected', label: '반려' },
];
