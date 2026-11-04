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
test('제작 크기는 줄마다 첫 크기만 캔버스로 본다', () => {
  assert.deepEqual(d.canvasSizes('256 × 288 px · 본체 150 × 166 px\n320 x 448 px'), [{ w: 256, h: 288 }, { w: 320, h: 448 }]);
});
test('그림 검사', () => {
  const item = { file_name: 'ch1/tile_cold.png', spec: '256 × 256 px (칸 전체)' };
  assert.deepEqual(d.imageWarnings(item, 'tile_cold.png', 256, 256), []);
  assert.equal(d.imageWarnings(item, 'tile.png', 256, 256).length, 1);
  assert.equal(d.imageWarnings(item, 'tile_cold.png', 512, 512).length, 1);
  assert.deepEqual(d.imageWarnings({ file_name: '', spec: '' }, 'a.png', 1, 1), []);
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
