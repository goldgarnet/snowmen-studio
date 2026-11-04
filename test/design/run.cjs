// 디자인 작업 공간 순수 로직 테스트 — `npm run test:design`
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const ts = require('../../node_modules/typescript');

require.extensions['.ts'] = (module, filename) => {
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.CommonJS },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

const d = require(path.join(__dirname, '../../src/lib/designBoard.ts'));
let passed = 0;
function test(name, fn) {
  try { fn(); passed += 1; } catch (e) { console.error(`✗ ${name}`); throw e; }
}

const items = () => [
  { id: 'a', group_id: 'g1', sort_order: 0 }, { id: 'b', group_id: 'g1', sort_order: 1 },
  { id: 'c', group_id: 'g1', sort_order: 2 }, { id: 'x', group_id: 'g2', sort_order: 0 },
];
const order = (list, g) => list.filter((i) => i.group_id === g).sort(d.bySortOrder).map((i) => i.id);

test('같은 묶음에서 앞으로 옮기기', () => {
  const r = d.moveItem(items(), 'c', 'g1', 'a');
  assert.deepEqual(order(r.next, 'g1'), ['c', 'a', 'b']);
  assert.equal(r.changed.length, 3);
});
test('같은 묶음에서 맨 뒤로 옮기기', () => {
  assert.deepEqual(order(d.moveItem(items(), 'a', 'g1', null).next, 'g1'), ['b', 'c', 'a']);
});
test('제자리에 놓으면 저장할 것이 없다', () => {
  assert.equal(d.moveItem(items(), 'c', 'g1', null).changed.length, 0);
  assert.equal(d.moveItem(items(), 'a', 'g1', 'a').changed.length, 0);
});
test('다른 묶음으로 옮기기', () => {
  const r = d.moveItem(items(), 'b', 'g2', 'x');
  assert.deepEqual(order(r.next, 'g2'), ['b', 'x']);
  assert.deepEqual(order(r.next, 'g1'), ['a', 'c']);
  assert.equal(r.changed.find((i) => i.id === 'b').group_id, 'g2');
  assert.equal(r.next.length, 4);
});
test('빈 묶음으로 옮기면 번호가 그대로여도 묶음 변경을 저장한다', () => {
  const r = d.moveItem(items(), 'a', 'g3', null);
  assert.deepEqual(order(r.next, 'g3'), ['a']);
  assert.deepEqual(r.changed.map((i) => [i.id, i.group_id]), [['a', 'g3']]);
});
test('그림 크기 검사', () => {
  const slot = { canvas_w: 256, canvas_h: 288, body_w: 150, body_h: 166, bottom_px: 110, placement: 'stand' };
  assert.equal(d.sizeProblem(slot, 256, 288), null);
  assert.match(d.sizeProblem(slot, 512, 512), /512 × 512/);
  assert.equal(d.sizeProblem({ ...slot, canvas_w: null }, 1, 1), null);
  assert.equal(d.sizeProblem(slot, null, null), null);
});
test('본체 상자: 서 있는 것은 아래 여백 위, 표식은 가운데', () => {
  const stand = { canvas_w: 256, canvas_h: 288, body_w: 150, body_h: 166, bottom_px: 110, placement: 'stand' };
  assert.deepEqual(d.bodyBox(stand), { x: 53, y: 12, w: 150, h: 166 });
  assert.deepEqual(d.bodyBox({ ...stand, canvas_h: 256, body_w: 154, body_h: 132, placement: 'mark' }), { x: 51, y: 62, w: 154, h: 132 });
  assert.deepEqual(d.bodyBox({ canvas_w: 288, canvas_h: 384, body_w: 256, body_h: 325, bottom_px: null, placement: 'solid' }), { x: 16, y: 59, w: 256, h: 325 });
  assert.equal(d.bodyBox({ ...stand, body_w: null }), null);
});
test('항목 줄에 놓은 그림의 칸 찾기', () => {
  const slots = [{ id: 'a', file_name: 'x_down.png' }, { id: 'b', file_name: 'x_up.png' }];
  assert.equal(d.slotForDrop(slots, new Set(), 'x_up.png').id, 'b');
  assert.equal(d.slotForDrop(slots, new Set(['a']), 'other.png').id, 'b');
  assert.equal(d.slotForDrop(slots, new Set(['a', 'b']), 'other.png').id, 'a');
  assert.equal(d.slotForDrop([], new Set(), 'x.png'), null);
});
test('업로드 뒤 상태', () => {
  assert.equal(d.statusAfterUpload('todo', 1, 3), 'doing');
  assert.equal(d.statusAfterUpload('doing', 3, 3), 'review');
  assert.equal(d.statusAfterUpload('done', 1, 3), 'done');
  assert.equal(d.statusAfterUpload('review', 1, 3), 'review');
});
test('검색은 띄어쓰기와 대소문자를 무시한다', () => {
  assert.ok(d.matchesQuery('겨울 영혼', ['겨울의 영혼', 'soul_down.png']));
  assert.ok(d.matchesQuery('SOUL_DOWN', ['soul_down.png']));
  assert.ok(d.matchesQuery('눈 덩이', ['작은 눈덩이']));
  assert.ok(!d.matchesQuery('포탈', ['겨울의 영혼']));
  assert.ok(d.matchesQuery('   ', ['아무거나']));
});
test('글 나누기', () => {
  assert.deepEqual(d.textLines('가\n\n 나 \n'), ['가', '나']);
  assert.deepEqual(d.ideaList('집, 울타리,우물'), ['집', '울타리', '우물']);
});
test('날짜 계산', () => {
  assert.equal(d.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(d.diffDays('2026-11-09', '2027-02-26'), 109);
  assert.equal(d.mondayOf('2026-11-05'), '2026-11-02');
  assert.equal(d.mondayOf('2026-11-08'), '2026-11-02');
  assert.equal(d.mondayOf('2026-11-09'), '2026-11-09');
});
test('막대 끌기', () => {
  assert.deepEqual(d.dragDates('2026-11-09', '2026-11-22', 7, 'move'), { start: '2026-11-16', end: '2026-11-29' });
  assert.deepEqual(d.dragDates('2026-11-09', '2026-11-22', 30, 'start'), { start: '2026-11-22', end: '2026-11-22' });
  assert.deepEqual(d.dragDates('2026-11-09', '2026-11-22', -30, 'end'), { start: '2026-11-09', end: '2026-11-09' });
});
test('타임라인 범위는 모든 일정을 담는다', () => {
  const r = d.timelineRange([{ start_date: '2026-10-20', end_date: '2027-03-31' }], '2026-11-05');
  assert.ok(r.from <= '2026-10-20');
  assert.ok(d.addDays(r.from, r.weeks * 7) > '2027-03-31');
  assert.equal(d.mondayOf(r.from), r.from);
});
console.log(`design: ${passed}개 통과`);
