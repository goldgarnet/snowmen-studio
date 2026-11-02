// '푼 맵 현황' 표 (맵 × 멤버) — 순수 로직 (DB·React 없음, test/clears 에서 직접 검사한다).
//
// 행 = 허브에 올라온 맵. 허브와 같은 범위·순서다 (orderHubMaps).
// 열 = 멤버 표(members.ts) 순서의 사람들 + 푼 사람 수. 칸의 뜻은 '풀었어요' 칩과 같다 (solvedChecks.ts):
//   checked = 직접 체크 · solution = 풀이 등록(자동 표시) · none = 아직.
import type { FolderRow, MapRow, StatusFilter } from '../api/types';
import type { Member } from './members';
import { isSolvedByMe, type MapSolveSummary, type MemberSolve, type OtherSolve } from './solvedChecks';

export interface BoardMapEntry {
  map: MapRow;
  /** 폴더 안 맵이면 그 폴더 이름, 단독 맵이면 null */
  folderName: string | null;
}

/**
 * 허브 목록(listPublishedMaps · listPublishedFolders)을 허브 화면과 같은 순서로 한 줄로 편다.
 *  · 단독 맵과 폴더를 등록일(created_at) 최신순, 같으면 공개 시각(published_at) 최신순으로 놓는다 (MapHub 와 같은 정렬).
 *  · 폴더 자리에는 그 폴더의 맵을 폴더 안 순서(compareInFolder = api/maps 의 compareMapOrder)대로 붙인다.
 *  · 폴더 목록에 없는 폴더의 맵(폴더 테이블을 못 읽었을 때 등)은 단독 맵 자리에 둔다 — 빠뜨리지 않는다.
 */
export function orderHubMaps(
  maps: readonly MapRow[],
  folders: readonly FolderRow[],
  compareInFolder: (a: MapRow, b: MapRow) => number,
): BoardMapEntry[] {
  const folderById = new Map(folders.map((f) => [f.id, f]));
  const inFolder = new Map<string, MapRow[]>();
  const blocks: { date: string; pub: string; entries: BoardMapEntry[] }[] = [];

  for (const map of maps) {
    const folder = map.folder_id ? folderById.get(map.folder_id) : undefined;
    if (!folder) {
      blocks.push({ date: map.created_at, pub: map.published_at ?? '', entries: [{ map, folderName: null }] });
      continue;
    }
    const list = inFolder.get(folder.id);
    if (list) list.push(map); else inFolder.set(folder.id, [map]);
  }
  for (const folder of folders) {
    const list = inFolder.get(folder.id);
    if (!list) continue;   // 빈 폴더 (또는 이미 넣은 폴더)
    inFolder.delete(folder.id);
    const folderName = folder.name || '이름 없는 폴더';
    blocks.push({
      date: folder.created_at,
      pub: folder.published_at ?? '',
      entries: [...list].sort(compareInFolder).map((map) => ({ map, folderName })),
    });
  }

  blocks.sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : a.pub < b.pub ? 1 : a.pub > b.pub ? -1 : 0);
  return blocks.flatMap((b) => b.entries);
}

export interface BoardRow {
  map: MapRow;
  folderName: string | null;
  /** 멤버 표 순서의 칸 (summarizeMap 의 members 그대로) */
  cells: MemberSolve[];
  /** 멤버 표 밖 계정 중 푼 계정 ('+N') */
  others: OtherSolve[];
  /** 푼 멤버 수 (직접 체크 + 풀이 등록) */
  solvedMembers: number;
  /** 내 계정이 직접 체크했는가 (= 내 칸 토글의 현재 값) */
  myCheck: boolean;
  /** 내가 푼 맵인가 — 내 칸이 체크·풀이면 푼 것. 멤버 표 밖 계정이면 내 계정의 체크·풀이로 본다. */
  solvedByMe: boolean;
}

/** 맵 줄마다 멤버별 상태를 붙인다. summarize = ClearsContext 의 summarize (같은 상태를 본다). */
export function buildBoardRows(
  entries: readonly BoardMapEntry[],
  summarize: (mapId: string) => MapSolveSummary,
  myUserId: string | null,
): BoardRow[] {
  return entries.map(({ map, folderName }) => {
    const s = summarize(map.id);
    return {
      map,
      folderName,
      cells: s.members,
      others: s.others,
      solvedMembers: s.solvedMembers,
      myCheck: s.myCheck,
      solvedByMe: isSolvedByMe(s, myUserId),
    };
  });
}

export interface BoardFilter {
  /** 제목 · 제작자 · 폴더 이름 검색어 (대소문자 무시) */
  query: string;
  status: StatusFilter;
  /** 내가 안 푼 맵만 */
  unsolvedOnly: boolean;
  /** '내가 안 푼 맵만'을 켠 채 방금 체크한 맵 — 누르자마자 줄이 사라지지 않게 남겨 둔다 */
  keep?: ReadonlySet<string>;
}

export function filterBoardRows(rows: readonly BoardRow[], f: BoardFilter): BoardRow[] {
  const q = f.query.trim().toLowerCase();
  return rows.filter((r) => {
    if (f.status !== 'all' && r.map.status !== f.status) return false;
    if (f.unsolvedOnly && r.solvedByMe && !f.keep?.has(r.map.id)) return false;
    if (!q) return true;
    return `${r.map.title ?? ''} ${r.map.author_name ?? ''} ${r.folderName ?? ''}`.toLowerCase().includes(q);
  });
}

export interface MemberTotal {
  member: Member;
  /** 푼 맵 수 (직접 체크 + 풀이 등록) */
  solved: number;
  checked: number;
  solution: number;
}

/** 멤버별 푼 맵 수 — 주어진 줄만 센다 (화면에서는 거른 뒤 보이는 줄). */
export function boardTotals(rows: readonly BoardRow[], members: readonly Member[]): MemberTotal[] {
  const totals = members.map((member): MemberTotal => ({ member, solved: 0, checked: 0, solution: 0 }));
  for (const row of rows) {
    for (const cell of row.cells) {
      const t = totals[members.indexOf(cell.member)];
      if (!t || cell.state === 'none') continue;
      t.solved += 1;
      if (cell.state === 'checked') t.checked += 1; else t.solution += 1;
    }
  }
  return totals;
}
