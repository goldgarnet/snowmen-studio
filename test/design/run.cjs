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
const dueTasks = new Map([
  ['sketch', { id: 'sketch', name: '시안', owner: '시연', category: 'char', start_date: '2026-11-09', end_date: '2026-11-22' }],
  ['full', { id: 'full', name: '완성', owner: '시연', category: 'char', start_date: '2026-11-23', end_date: '2027-01-03' }],
]);
const dueItem = { status: 'todo', split: false, guide_done: false, task_id: 'full', draft_task_id: 'sketch' };
test('마감: 시안이 채택되면 완성 마감으로 넘어간다', () => {
  const before = d.itemDeadlines(dueItem, dueTasks, false, '2026-11-05');
  assert.deepEqual(before.map((x) => [x.label, x.date, x.days]), [['시안', '2026-11-22', 17], ['완성', '2027-01-03', 59]]);
  assert.equal(d.currentDeadline(before, 'todo').label, '시안');
  assert.equal(d.currentDeadline(d.itemDeadlines(dueItem, dueTasks, true, '2026-11-05'), 'todo').label, '완성');
});
test('마감: 나눈 항목의 가이드 마감은 일정의 가운데 날', () => {
  const split = { ...dueItem, split: true, draft_task_id: null };
  const list = d.itemDeadlines(split, dueTasks, false, '2026-11-05');
  assert.deepEqual(list.map((x) => [x.label, x.date]), [['가이드', '2026-12-13'], ['채색', '2027-01-03']]);
  assert.equal(d.currentDeadline(d.itemDeadlines({ ...split, guide_done: true }, dueTasks, false, '2026-11-05'), 'todo').label, '채색');
});
test('마감: 완료 항목과 일정 없는 항목', () => {
  assert.equal(d.currentDeadline(d.itemDeadlines(dueItem, dueTasks, false, '2026-11-05'), 'done'), null);
  assert.deepEqual(d.itemDeadlines({ ...dueItem, task_id: null, draft_task_id: null }, dueTasks, false, '2026-11-05'), []);
  assert.equal(d.daysLeft(3), 'D-3');
  assert.equal(d.daysLeft(0), '오늘까지');
  assert.equal(d.daysLeft(-2), '2일 지남');
});
test('지금 기간: 진행 중 · 다음 일정 · 확인 시점', () => {
  const t = (id, category, start_date, end_date) => ({ id, name: id, owner: '', category, start_date, end_date });
  const list = [t('a', 'base', '2026-11-02', '2026-11-08'), t('dev', 'dev', '2026-11-02', '2026-11-30'), t('b', 'char', '2026-11-09', '2026-11-22'),
    t('c', 'play', '2026-11-09', '2026-11-22'), t('m', 'mile', '2026-11-20', '2026-11-20')];
  assert.deepEqual(d.activeTasks(list, '2026-11-05').map((x) => x.id), ['a']);
  assert.deepEqual(d.nextTasks(list, '2026-11-05').map((x) => x.id), ['b', 'c']);
  assert.equal(d.nextCheck(list, '2026-11-05').id, 'm');
  assert.equal(d.nextCheck(list, '2026-11-21'), null);
});
test('타임라인 범위는 모든 일정을 담는다', () => {
  const r = d.timelineRange([{ start_date: '2026-10-20', end_date: '2027-03-31' }], '2026-11-05');
  assert.ok(r.from <= '2026-10-20');
  assert.ok(d.addDays(r.from, r.weeks * 7) > '2027-03-31');
  assert.equal(d.mondayOf(r.from), r.from);
});

test('게임 키는 파일명에서 확장자만 뺀다', () => {
  assert.equal(d.artKey('ch3/tile_cold.png'), 'ch3/tile_cold');
  assert.equal(d.artKey(' player_1_down.PNG '), 'player_1_down');
});
test('게임에는 파일명마다 가장 최근 그림만 넣는다', () => {
  const files = [
    { id: 'a', file_name: 'wall.png' },
    { id: 'b', file_name: 'cut_intro.ogv' },
    { id: 'c', file_name: '' },
  ];
  const images = [
    { id: 'new', file_id: 'a', path: 'n' },
    { id: 'old', file_id: 'a', path: 'o' },
    { id: 'video', file_id: 'b', path: 'v' },
    { id: 'noname', file_id: 'c', path: 'x' },
    { id: 'draft', file_id: null, path: 'd' },
  ];
  assert.deepEqual(d.previewArt(files, images), [{ key: 'wall', fileName: 'wall.png', imageId: 'new', path: 'n', sizeNote: null }]);
  const sized = d.previewArt([{ id: 'a', file_name: 'wall.png', canvas_w: 288, canvas_h: 384 }], [{ id: 'i', file_id: 'a', path: 'p', width: 1254, height: 1254 }]);
  assert.match(sized[0].sizeNote, /1254 × 1254/);
});
test('챕터 폴더 번호 읽기', () => {
  assert.equal(d.artChapter('ch3/tile_cold'), 3);
  assert.equal(d.artChapter('tile_cold'), 0);
});
console.log(`design: ${passed}개 통과`);
