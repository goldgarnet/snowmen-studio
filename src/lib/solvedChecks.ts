// '풀었어요' 체크 — 순수 로직 (DB·React 없음, test/clears 에서 직접 검사한다).
//
// 한 맵에서 한 사람이 '푼' 근거는 두 가지다.
//   · checked  — map_clears 에 직접 체크한 행이 있음 (칩을 눌러 켜고 끔)
//   · solution — 그 맵에 풀이(solutions)를 등록함 → 자동으로 푼 것으로 본다
// 둘 다 있으면 checked 로 친다. 멤버(사람)는 계정 여럿 중 하나라도 해당하면 된다.
import type { Member } from './members';

export type SolveState = 'checked' | 'solution' | 'none';

/** mapId → 그 맵에 표시된 계정 id 집합 */
export type MapUserIndex = ReadonlyMap<string, ReadonlySet<string>>;

export interface SolveIndex {
  checks: MapUserIndex;     // map_clears (직접 체크)
  solutions: MapUserIndex;  // solutions (풀이 등록)
}

export const EMPTY_INDEX: SolveIndex = { checks: new Map(), solutions: new Map() };

const NO_USERS: ReadonlySet<string> = new Set();

/** (mapId, userId) 쌍 목록 → mapId 별 계정 집합 */
export function indexPairs(pairs: Iterable<{ mapId: string; userId: string }>): MapUserIndex {
  const out = new Map<string, Set<string>>();
  for (const { mapId, userId } of pairs) {
    const set = out.get(mapId);
    if (set) set.add(userId); else out.set(mapId, new Set([userId]));
  }
  return out;
}

/** 계정 id → MEMBERS 안의 위치. 한 계정이 두 사람에 적혀 있으면 앞사람이 이긴다. */
export function buildAccountLookup(members: readonly Member[]): ReadonlyMap<string, number> {
  const out = new Map<string, number>();
  members.forEach((m, i) => {
    for (const id of m.accountIds) if (!out.has(id)) out.set(id, i);
  });
  return out;
}

export interface MemberSolve {
  member: Member;
  state: SolveState;
  /** 보는 사람(나)의 칩 — 내 칩만 눌러서 켜고 끈다 */
  mine: boolean;
  /** 같은 사람의 '다른' 계정이 직접 체크함 (내 계정으로는 못 끈다 — 툴팁 안내용) */
  checkedElsewhere: boolean;
}

export interface OtherSolve {
  userId: string;
  state: Exclude<SolveState, 'none'>;
}

export interface MapSolveSummary {
  members: MemberSolve[];
  /** 멤버 표에 없는 계정 중 푼 계정 ('+N') */
  others: OtherSolve[];
  /** 내 계정이 직접 체크했는가 (= 토글의 현재 값) */
  myCheck: boolean;
  /** 푼 멤버 수 (checked + solution) */
  solvedMembers: number;
}

export function summarizeMap(
  index: SolveIndex,
  mapId: string,
  members: readonly Member[],
  lookup: ReadonlyMap<string, number>,
  myUserId: string | null,
): MapSolveSummary {
  const checks = index.checks.get(mapId) ?? NO_USERS;
  const sols = index.solutions.get(mapId) ?? NO_USERS;

  const memberRows = members.map((member): MemberSolve => {
    const owns = (id: string) => member.accountIds.includes(id);
    const anyCheck = member.accountIds.some((id) => checks.has(id));
    const anySol = member.accountIds.some((id) => sols.has(id));
    const mine = myUserId != null && owns(myUserId);
    return {
      member,
      state: anyCheck ? 'checked' : anySol ? 'solution' : 'none',
      mine,
      checkedElsewhere: member.accountIds.some((id) => id !== myUserId && checks.has(id)),
    };
  });

  const others: OtherSolve[] = [];
  for (const id of new Set([...checks, ...sols])) {
    if (lookup.has(id)) continue;
    others.push({ userId: id, state: checks.has(id) ? 'checked' : 'solution' });
  }
  others.sort((a, b) => (a.state === b.state ? a.userId.localeCompare(b.userId) : a.state === 'checked' ? -1 : 1));

  return {
    members: memberRows,
    others,
    myCheck: myUserId != null && checks.has(myUserId),
    solvedMembers: memberRows.filter((r) => r.state !== 'none').length,
  };
}

/** 내가 푼 맵인가 — 내 칩(멤버 표의 내 칸)이 체크·풀이면 푼 것. 멤버 표 밖 계정이면 내 계정의 체크·풀이로 본다.
 *  '내가 안 푼 맵' 거르기(허브 · 푼 맵 현황)가 같이 쓴다. */
export function isSolvedByMe(s: MapSolveSummary, myUserId: string | null): boolean {
  const mine = s.members.find((r) => r.mine);
  if (mine) return mine.state !== 'none';
  return myUserId != null && s.others.some((o) => o.userId === myUserId);
}

export const SOLVE_STATE_LABEL: Record<SolveState, string> = {
  checked: '풀었어요',
  solution: '풀이 등록 (자동 표시)',
  none: '아직 안 풂',
};

/** 칩 · '푼 맵 현황' 칸의 툴팁: '이름 — 상태'. 내 칸이면 누르면 어떻게 되는지까지. */
export function memberSolveTitle(row: MemberSolve, myCheck: boolean): string {
  const base = `${row.member.name} — ${SOLVE_STATE_LABEL[row.state]}`;
  if (!row.mine) return base;
  if (myCheck) return `${base} · 누르면 체크 해제`;
  if (row.checkedElsewhere) return `${base} (다른 계정으로 체크함) · 누르면 이 계정으로도 체크`;
  return `${base} · 누르면 '풀었어요' 체크`;
}

/** '+N' 툴팁 · 맵 상세 '그 외' 줄에 쓰는 이름 목록 (풀이로만 자동 표시된 계정은 '(풀이)') */
export function otherNames(others: readonly OtherSolve[], nameOf: (userId: string) => string | null): string {
  return others
    .map((o) => `${nameOf(o.userId) ?? '알 수 없는 계정'}${o.state === 'solution' ? '(풀이)' : ''}`)
    .join(', ');
}

function withUsers(idx: MapUserIndex, mapId: string, users: ReadonlySet<string>): MapUserIndex {
  const next = new Map(idx);
  if (users.size === 0) next.delete(mapId); else next.set(mapId, users);
  return next;
}

/** 한 계정의 직접 체크를 켜거나 끈 새 인덱스 (원본은 그대로). */
export function withCheck(index: SolveIndex, mapId: string, userId: string, on: boolean): SolveIndex {
  const cur = index.checks.get(mapId) ?? NO_USERS;
  if (cur.has(userId) === on) return index;
  const users = new Set(cur);
  if (on) users.add(userId); else users.delete(userId);
  return { ...index, checks: withUsers(index.checks, mapId, users) };
}

/** 한 맵의 체크·풀이를 서버에서 새로 읽은 값으로 통째로 바꾼 새 인덱스. */
export function withMapReplaced(
  index: SolveIndex,
  mapId: string,
  checkUserIds: Iterable<string>,
  solutionUserIds: Iterable<string>,
): SolveIndex {
  return {
    checks: withUsers(index.checks, mapId, new Set(checkUserIds)),
    solutions: withUsers(index.solutions, mapId, new Set(solutionUserIds)),
  };
}

/** 서버에서 통째로 새로 읽은 인덱스에, 읽는 사이 내가 바꾼 맵들의 체크만 지금 값으로 덮는다. */
export function keepLocalChecks(fresh: SolveIndex, local: SolveIndex, mapIds: Iterable<string>): SolveIndex {
  let checks = fresh.checks;
  for (const mapId of mapIds) checks = withUsers(checks, mapId, local.checks.get(mapId) ?? NO_USERS);
  return checks === fresh.checks ? fresh : { ...fresh, checks };
}
