// '풀었어요' 체크 순수 로직 테스트 — `npm run test:clears`
// 엔진 테스트(test/engine/run.cjs)와 같은 방식으로 TS 소스를 그대로 불러와 돌린다.
const fs = require('fs');
const assert = require('node:assert/strict');
const ts = require('../../node_modules/typescript');

require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2023,
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.Node10,
    },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

const { MEMBERS } = require('../../src/lib/members.ts');
const S = require('../../src/lib/solvedChecks.ts');
const B = require('../../src/lib/solvedBoard.ts');

// 테스트용 멤버 표 (실제 표가 바뀌어도 이 테스트는 그대로).
const A = 'acc-a', B1 = 'acc-b1', B2 = 'acc-b2', C = 'acc-c', X = 'outsider-x', Y = 'outsider-y';
const TEAM = [
  { name: '가나다', short: '나다', accountIds: [A] },
  { name: '라마바', short: '마바', accountIds: [B1, B2] },   // 계정 둘
  { name: '사아자', short: '아자', accountIds: [C] },
];
const LOOKUP = S.buildAccountLookup(TEAM);
const pairs = (map, ...users) => users.map((userId) => ({ mapId: map, userId }));
const idx = (checks, sols) => ({ checks: S.indexPairs(checks), solutions: S.indexPairs(sols) });
const states = (summary) => summary.members.map((r) => r.state);

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('계정 → 멤버: 한 사람의 여러 계정이 같은 사람으로 묶이고, 표 밖 계정은 없음', () => {
  assert.equal(LOOKUP.get(A), 0);
  assert.equal(LOOKUP.get(B1), 1);
  assert.equal(LOOKUP.get(B2), 1);
  assert.equal(LOOKUP.get(X), undefined);
});

test('한 계정이 두 사람에 적혀 있으면 앞사람이 이긴다', () => {
  const lookup = S.buildAccountLookup([...TEAM, { name: '중복', short: '중복', accountIds: [A] }]);
  assert.equal(lookup.get(A), 0);
});

test('체크 · 풀이 · 둘 다 · 없음 → checked / solution / checked / none', () => {
  const index = idx(pairs('m1', A, B1), pairs('m1', B1, C));
  const s = S.summarizeMap(index, 'm1', TEAM, LOOKUP, null);
  assert.deepEqual(states(s), ['checked', 'checked', 'solution']);
  assert.equal(s.solvedMembers, 3);
  const empty = S.summarizeMap(index, 'other-map', TEAM, LOOKUP, null);
  assert.deepEqual(states(empty), ['none', 'none', 'none']);
  assert.equal(empty.solvedMembers, 0);
});

test('둘째 계정으로만 체크해도 그 사람 칩이 채워진다', () => {
  const s = S.summarizeMap(idx(pairs('m1', B2), []), 'm1', TEAM, LOOKUP, null);
  assert.deepEqual(states(s), ['none', 'checked', 'none']);
});

test('내 칩 · 내 체크: 내 계정 기준으로 판단', () => {
  const index = idx(pairs('m1', B2), []);
  const s = S.summarizeMap(index, 'm1', TEAM, LOOKUP, B1);   // 나는 B1, 체크는 B2(같은 사람)
  assert.deepEqual(s.members.map((r) => r.mine), [false, true, false]);
  assert.equal(s.myCheck, false);                // 내 계정(B1)은 체크 안 함 → 토글은 꺼짐
  assert.equal(s.members[1].checkedElsewhere, true);
  const mine = S.summarizeMap(idx(pairs('m1', B1), []), 'm1', TEAM, LOOKUP, B1);
  assert.equal(mine.myCheck, true);
  assert.equal(mine.members[1].checkedElsewhere, false);
});

test("표 밖 계정은 '+N' (체크+풀이 중복 없이, 체크 먼저)", () => {
  const index = idx(pairs('m1', A, Y, X), pairs('m1', X, Y, 'outsider-z'));
  const s = S.summarizeMap(index, 'm1', TEAM, LOOKUP, null);
  assert.deepEqual(s.others, [
    { userId: X, state: 'checked' },
    { userId: Y, state: 'checked' },
    { userId: 'outsider-z', state: 'solution' },
  ]);
  const names = new Map([[X, '엑스'], [Y, '와이']]);
  assert.equal(S.otherNames(s.others, (id) => names.get(id) ?? null), '엑스, 와이, 알 수 없는 계정(풀이)');
});

test('표 밖 계정으로 로그인해도 내 체크는 잡히고 내 칩은 없다', () => {
  const s = S.summarizeMap(idx(pairs('m1', X), []), 'm1', TEAM, LOOKUP, X);
  assert.equal(s.myCheck, true);
  assert.ok(s.members.every((r) => !r.mine));
  assert.equal(s.others.length, 1);
});

test("isSolvedByMe: 내 칸이 체크·풀이면 푼 것 (같은 사람 다른 계정 포함), 표 밖이면 내 계정의 체크·풀이", () => {
  const sum = (checks, sols, me) => S.summarizeMap(idx(checks, sols), 'm1', TEAM, LOOKUP, me);
  assert.equal(S.isSolvedByMe(sum([], [], A), A), false);                  // 아직
  assert.equal(S.isSolvedByMe(sum(pairs('m1', A), [], A), A), true);        // 직접 체크
  assert.equal(S.isSolvedByMe(sum([], pairs('m1', A), A), A), true);        // 풀이 등록
  assert.equal(S.isSolvedByMe(sum(pairs('m1', B2), [], B1), B1), true);     // 같은 사람의 다른 계정이 체크
  assert.equal(S.isSolvedByMe(sum(pairs('m1', C), [], A), A), false);       // 남이 푼 것
  assert.equal(S.isSolvedByMe(sum(pairs('m1', X), [], X), X), true);        // 표 밖 계정: 내 체크
  assert.equal(S.isSolvedByMe(sum(pairs('m1', Y), [], X), X), false);       // 표 밖 계정: 남의 체크
  assert.equal(S.isSolvedByMe(sum([], [], null), null), false);             // 로그인 정보 없음
});

test('withCheck: 켜고 끄기 · 원본 불변 · 같은 상태면 그대로', () => {
  const base = idx(pairs('m1', A), pairs('m1', C));
  const on = S.withCheck(base, 'm1', B1, true);
  assert.notEqual(on, base);
  assert.deepEqual([...on.checks.get('m1')].sort(), [A, B1].sort());
  assert.deepEqual([...base.checks.get('m1')], [A]);          // 원본 그대로
  assert.equal(on.solutions, base.solutions);                  // 풀이 쪽은 공유
  assert.equal(S.withCheck(on, 'm1', B1, true), on);           // 이미 켜짐 → 같은 객체
  const off = S.withCheck(S.withCheck(on, 'm1', B1, false), 'm1', A, false);
  assert.equal(off.checks.has('m1'), false);                   // 비면 키도 지움
  const fresh = S.withCheck(S.EMPTY_INDEX, 'new-map', A, true);
  assert.deepEqual([...fresh.checks.get('new-map')], [A]);
  assert.equal(S.EMPTY_INDEX.checks.size, 0);
});

test('withMapReplaced: 한 맵만 서버 값으로 교체', () => {
  const base = idx([...pairs('m1', A), ...pairs('m2', C)], pairs('m1', C));
  const next = S.withMapReplaced(base, 'm1', [B1], []);
  assert.deepEqual([...next.checks.get('m1')], [B1]);
  assert.equal(next.solutions.has('m1'), false);
  assert.deepEqual([...next.checks.get('m2')], [C]);           // 다른 맵은 그대로
});

test('keepLocalChecks: 읽는 사이 내가 바꾼 맵만 지금 값 유지', () => {
  const fresh = idx([...pairs('m1', A), ...pairs('m2', C)], pairs('m1', C));
  const local = idx([...pairs('m1', A, B1), ...pairs('m2', A)], []);
  const merged = S.keepLocalChecks(fresh, local, ['m1']);
  assert.deepEqual([...merged.checks.get('m1')].sort(), [A, B1].sort());
  assert.deepEqual([...merged.checks.get('m2')], [C]);
  assert.equal(merged.solutions, fresh.solutions);
  assert.equal(S.keepLocalChecks(fresh, local, []), fresh);
  const cleared = S.keepLocalChecks(fresh, idx([], []), ['m2']); // 내가 다 끈 맵
  assert.equal(cleared.checks.has('m2'), false);
});

test('실제 멤버 표: 짧은 이름이 겹치지 않고, 계정 id 는 uuid 이며 두 사람에 겹치지 않는다', () => {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  const shorts = MEMBERS.map((m) => m.short);
  assert.ok(shorts.every((x) => x.trim().length > 0), '짧은 이름이 비었음');
  assert.equal(new Set(shorts).size, shorts.length, '짧은 이름이 겹침');
  const ids = MEMBERS.flatMap((m) => m.accountIds);
  for (const id of ids) assert.match(id, uuid, `uuid 꼴이 아님: ${id}`);
  assert.equal(new Set(ids).size, ids.length, '한 계정이 두 사람에 적혀 있음');
  assert.ok(MEMBERS.every((m) => m.accountIds.length > 0), '계정이 없는 멤버가 있음');
});

test('memberSolveTitle: 칩 · 현황판 칸 툴팁 (남의 칸 / 내 칸 켜짐 / 다른 계정 체크 / 아직)', () => {
  const s = S.summarizeMap(idx(pairs('m1', A, B2), []), 'm1', TEAM, LOOKUP, B1);
  assert.equal(S.memberSolveTitle(s.members[0], s.myCheck), '가나다 — 풀었어요');
  assert.equal(S.memberSolveTitle(s.members[1], s.myCheck), '라마바 — 풀었어요 (다른 계정으로 체크함) · 누르면 이 계정으로도 체크');
  const mine = S.summarizeMap(idx(pairs('m1', A), pairs('m1', C)), 'm1', TEAM, LOOKUP, A);
  assert.equal(S.memberSolveTitle(mine.members[0], mine.myCheck), '가나다 — 풀었어요 · 누르면 체크 해제');
  assert.equal(S.memberSolveTitle(mine.members[2], mine.myCheck), '사아자 — 풀이 등록 (자동 표시)');
  const none = S.summarizeMap(S.EMPTY_INDEX, 'm1', TEAM, LOOKUP, C);
  assert.equal(S.memberSolveTitle(none.members[2], none.myCheck), "사아자 — 아직 안 풂 · 누르면 '풀었어요' 체크");
});

// ---------- '푼 맵 현황' 표 (src/lib/solvedBoard.ts) ----------

const mapRow = (id, o = {}) => ({
  id, owner_id: 'owner', folder_id: null, sort_order: null, title: id, author_name: '작가', code: '', comment: null,
  solution: null, author_difficulty: null, difficulty: null, status: 'pending', published: true,
  published_at: null, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z', ...o,
});
const folderRow = (id, o = {}) => ({
  id, owner_id: 'owner', name: id, author_name: null, comment: null, published: true,
  published_at: null, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z', ...o,
});
// api/maps.ts compareMapOrder 와 같은 규칙 (그 파일은 supabase 를 불러와서 여기서 못 부른다)
const inFolderOrder = (a, b) => {
  const ao = a.sort_order ?? Number.MAX_SAFE_INTEGER;
  const bo = b.sort_order ?? Number.MAX_SAFE_INTEGER;
  return ao !== bo ? ao - bo : a.created_at.localeCompare(b.created_at);
};
const ids = (list) => list.map((e) => e.map.id);

test('orderHubMaps: 허브와 같은 순서 — 단독 맵·폴더 최신순, 폴더 자리에 폴더 안 순서대로', () => {
  const maps = [
    mapRow('b', { created_at: '2026-10-01T00:00:00Z', published_at: '2026-10-01T01:00:00Z' }),
    mapRow('x', { folder_id: 'f1', sort_order: 1, created_at: '2026-09-01T00:00:00Z' }),
    mapRow('a', { created_at: '2026-10-03T00:00:00Z' }),
    mapRow('z', { folder_id: 'f1', created_at: '2026-08-01T00:00:00Z' }),
    mapRow('c', { created_at: '2026-10-01T00:00:00Z', published_at: '2026-10-01T05:00:00Z' }),   // b 와 같은 날, 더 늦게 공개
    mapRow('y', { folder_id: 'f1', sort_order: 0, created_at: '2026-09-02T00:00:00Z' }),
    mapRow('o', { folder_id: 'gone', created_at: '2026-09-15T00:00:00Z' }),   // 폴더 목록에 없는 폴더
    mapRow('w', { folder_id: 'f1', created_at: '2026-08-05T00:00:00Z' }),
  ];
  const before = maps.map((m) => m.id).join();
  const folders = [
    folderRow('f2', { name: '빈 폴더', created_at: '2026-10-05T00:00:00Z' }),   // 맵 없음 → 줄 없음
    folderRow('f1', { name: '라운드 5', created_at: '2026-10-02T00:00:00Z' }),
  ];
  const out = B.orderHubMaps(maps, folders, inFolderOrder);
  assert.deepEqual(ids(out), ['a', 'y', 'x', 'z', 'w', 'c', 'b', 'o']);
  assert.deepEqual(out.map((e) => e.folderName), [null, '라운드 5', '라운드 5', '라운드 5', '라운드 5', null, null, null]);
  assert.equal(maps.map((m) => m.id).join(), before, '입력 배열을 건드리면 안 됨');
});

test('orderHubMaps: 이름 없는 폴더 · 폴더를 못 읽었을 때 (전부 단독 맵으로, 빠짐없이)', () => {
  const maps = [mapRow('m1', { folder_id: 'f1' }), mapRow('m2', { created_at: '2026-10-02T00:00:00Z' })];
  const named = B.orderHubMaps(maps, [folderRow('f1', { name: '' })], inFolderOrder);
  assert.deepEqual(named.map((e) => e.folderName), [null, '이름 없는 폴더']);
  const noFolders = B.orderHubMaps(maps, [], inFolderOrder);
  assert.deepEqual(ids(noFolders), ['m2', 'm1']);
  assert.ok(noFolders.every((e) => e.folderName === null));
  assert.deepEqual(B.orderHubMaps([], [folderRow('f1')], inFolderOrder), []);
});

// 표 테스트용: m1 = A·B2 체크 + C·X(표 밖) 풀이 / m2 = 아무도 / m3 = A 풀이만
const boardIndex = idx(pairs('m1', A, B2), [...pairs('m1', C, X), ...pairs('m3', A)]);
const boardEntries = [
  { map: mapRow('m1', { title: 'Alpha 공방', author_name: '나인석', status: 'accepted' }), folderName: null },
  { map: mapRow('m2', { title: '릴레이 마을', author_name: '황정빈', status: 'pending' }), folderName: '라운드 5' },
  { map: mapRow('m3', { title: null, author_name: null, status: 'accepted' }), folderName: '라운드 5' },
];
const rowsFor = (me) => B.buildBoardRows(boardEntries, (id) => S.summarizeMap(boardIndex, id, TEAM, LOOKUP, me), me);

test('buildBoardRows: 멤버 칸 · 푼 사람 수 · 내 체크 · 내가 푼 맵', () => {
  const rows = rowsFor(A);
  assert.deepEqual(rows.map((r) => r.map.id), ['m1', 'm2', 'm3']);
  assert.deepEqual(rows[0].cells.map((c) => c.state), ['checked', 'checked', 'solution']);
  assert.deepEqual(rows.map((r) => r.solvedMembers), [3, 0, 1]);
  assert.deepEqual(rows[0].others, [{ userId: X, state: 'solution' }]);
  assert.deepEqual(rows.map((r) => r.myCheck), [true, false, false]);
  assert.deepEqual(rows.map((r) => r.solvedByMe), [true, false, true]);   // m3 은 풀이만 등록 → 푼 것
  assert.equal(rows[1].folderName, '라운드 5');
});

test('buildBoardRows: 표 밖 계정은 내 계정의 체크·풀이로, 로그인 없으면 아무것도 안 푼 것', () => {
  assert.deepEqual(rowsFor(X).map((r) => r.solvedByMe), [true, false, false]);   // X 는 m1 에 풀이 등록
  assert.ok(rowsFor(X).every((r) => r.cells.every((c) => !c.mine)));
  assert.deepEqual(rowsFor(null).map((r) => r.solvedByMe), [false, false, false]);
  assert.deepEqual(rowsFor(B1).map((r) => r.solvedByMe), [true, false, false]);   // 같은 사람의 둘째 계정(B2)이 체크
});

test('filterBoardRows: 상태 · 검색(제목/제작자/폴더, 대소문자·앞뒤 공백 무시) · 내가 안 푼 맵만 · 방금 체크한 맵 남기기', () => {
  const rows = rowsFor(A);
  const f = (o) => B.filterBoardRows(rows, { query: '', status: 'all', unsolvedOnly: false, ...o }).map((r) => r.map.id);
  assert.deepEqual(f({}), ['m1', 'm2', 'm3']);
  assert.deepEqual(f({ status: 'accepted' }), ['m1', 'm3']);
  assert.deepEqual(f({ status: 'rejected' }), []);
  assert.deepEqual(f({ query: '  ALPHA ' }), ['m1']);
  assert.deepEqual(f({ query: '정빈' }), ['m2']);
  assert.deepEqual(f({ query: '라운드' }), ['m2', 'm3']);
  assert.deepEqual(f({ unsolvedOnly: true }), ['m2']);
  assert.deepEqual(f({ unsolvedOnly: true, keep: new Set(['m1']) }), ['m1', 'm2']);
  assert.deepEqual(f({ unsolvedOnly: true, status: 'accepted' }), []);
  assert.deepEqual(f({ keep: new Set(['m1']), status: 'pending' }), ['m2']);   // 남기기는 '안 푼 맵만'에만 쓴다
});

test('boardTotals: 멤버별 푼 맵 수 (직접 체크 / 풀이 등록 따로), 주어진 줄만 센다', () => {
  const rows = rowsFor(A);
  const pick = (totals) => totals.map((t) => [t.member.short, t.solved, t.checked, t.solution]);
  assert.deepEqual(pick(B.boardTotals(rows, TEAM)), [['나다', 2, 1, 1], ['마바', 1, 1, 0], ['아자', 1, 0, 1]]);
  assert.deepEqual(pick(B.boardTotals(rows.slice(1), TEAM)), [['나다', 1, 0, 1], ['마바', 0, 0, 0], ['아자', 0, 0, 0]]);
  assert.deepEqual(pick(B.boardTotals([], TEAM)), [['나다', 0, 0, 0], ['마바', 0, 0, 0], ['아자', 0, 0, 0]]);
});

let failed = 0;
for (const t of tests) {
  try { t.fn(); console.log(`PASS ${t.name}`); }
  catch (e) { failed += 1; console.error(`FAIL ${t.name}\n  ${e instanceof Error ? e.message : e}`); }
}
console.log(`\n${tests.length - failed} passed, ${failed} failed`);
process.exitCode = failed === 0 ? 0 : 1;
