// 챕터 음악 순수 로직 테스트 — `npm run test:music`
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

const m = require(path.join(__dirname, '../../src/lib/music.ts'));
let passed = 0;
function test(name, fn) {
  try { fn(); passed += 1; } catch (e) { console.error(`✗ ${name}`); throw e; }
}

const s = (id, created_at, status = 'pending', chapter_id = 'c1') => ({ id, created_at, status, chapter_id });

test('주소: 모아 듣기 · 챕터 · 공통', () => {
  assert.equal(m.musicUrl(null), '/music');
  assert.equal(m.musicUrl('abc'), '/music?ch=abc');
  assert.equal(m.musicUrl(m.COMMON_KEY), '/music?ch=common');
  assert.equal(m.musicChapterKey('/music'), null);
  assert.equal(m.musicChapterKey('/music?ch=abc'), 'abc');
  assert.equal(m.musicChapterKey('/music?ch=abc#x'), 'abc');
  assert.equal(m.musicChapterKey('/music?ch='), null);
  assert.equal(m.chapterKeyOf({ chapter_id: null }), m.COMMON_KEY);
  assert.equal(m.chapterKeyOf({ chapter_id: 'c9' }), 'c9');
});

test('곡 번호는 올린 순서 — 상태가 바뀌어도 그대로', () => {
  const list = [s('b', '2026-11-12T10:00:02Z', 'accepted'), s('a', '2026-11-12T10:00:01Z', 'rejected'), s('c', '2026-11-12T10:00:03Z')];
  const n = m.sampleNumbers(list);
  assert.deepEqual([n.get('a'), n.get('b'), n.get('c')], [1, 2, 3]);
  // 같은 시각이면 id 순
  const tie = m.sampleNumbers([s('y', '2026-11-12T10:00:00Z'), s('x', '2026-11-12T10:00:00Z')]);
  assert.deepEqual([tie.get('x'), tie.get('y')], [1, 2]);
});

test('상태 묶음: 채택 → 검토중 → 보류 → 반려, 빈 묶음은 뺀다', () => {
  const list = [
    s('r', '2026-11-12T10:00:01Z', 'rejected'), s('p2', '2026-11-12T10:00:05Z'), s('a', '2026-11-12T10:00:09Z', 'accepted'),
    s('p1', '2026-11-12T10:00:02Z'),
  ];
  const g = m.groupByStatus(list);
  assert.deepEqual(g.map((x) => x.status), ['accepted', 'pending', 'rejected']);
  assert.deepEqual(g[1].samples.map((x) => x.id), ['p1', 'p2']);
  assert.deepEqual(m.groupByStatus([]), []);
});

test('요약', () => {
  const sum = m.summarize([{ status: 'accepted' }, { status: 'pending' }, { status: 'pending' }, { status: 'rejected' }]);
  assert.deepEqual(sum, { total: 4, accepted: 1, pending: 2, held: 0, rejected: 1 });
});

test('앞뒤 곡 · 이어 듣기', () => {
  const q = ['a', 'b', 'c'];
  assert.equal(m.stepInQueue(q, 'a', 1), 'b');
  assert.equal(m.stepInQueue(q, 'c', 1), null);
  assert.equal(m.stepInQueue(q, 'a', -1), null);
  assert.equal(m.stepInQueue(q, 'c', -1), 'b');
  assert.equal(m.stepInQueue(q, 'zzz', 1), 'a');
  assert.equal(m.stepInQueue(q, null, -1), 'c');
  assert.equal(m.stepInQueue([], 'a', 1), null);
});

test('시간 표시', () => {
  assert.equal(m.formatTime(0), '0:00');
  assert.equal(m.formatTime(7.9), '0:07');
  assert.equal(m.formatTime(222), '3:42');
  assert.equal(m.formatTime(3723), '1:02:03');
  assert.equal(m.formatTime(null), '--:--');
  assert.equal(m.formatTime(NaN), '--:--');
  assert.equal(m.formatTime(Infinity), '--:--');
  assert.equal(m.formatTime(-1), '--:--');
});

test('크기 표시', () => {
  assert.equal(m.formatBytes(1), '1 KB');
  assert.equal(m.formatBytes(500 * 1024), '500 KB');
  assert.equal(m.formatBytes(4.25 * 1024 * 1024), '4.3 MB');
  assert.equal(m.formatBytes(20 * 1024 * 1024), '20 MB');
  assert.equal(m.formatBytes(null), '');
});

test('파일 형식: 확장자가 먼저 — 빈 형식 · audio/mp3 도 올릴 수 있게', () => {
  assert.equal(m.audioType('a.mp3', ''), 'audio/mpeg');
  assert.equal(m.audioType('A.MP3', 'audio/mp3'), 'audio/mpeg');
  assert.equal(m.audioType('loop.wav', 'audio/x-wav'), 'audio/wav');
  assert.equal(m.audioType('x.m4a', 'audio/x-m4a'), 'audio/mp4');
  assert.equal(m.audioType('x.ogg', ''), 'audio/ogg');
  assert.equal(m.audioType('noext', 'audio/aiff'), 'audio/aiff');
  assert.equal(m.audioType('cover.png', 'image/png'), null);
  assert.equal(m.audioType('notes.txt', ''), null);
});

test('올릴 수 없는 파일', () => {
  assert.equal(m.fileProblem({ name: 'a.mp3', size: 1000, type: 'audio/mpeg' }), null);
  assert.match(m.fileProblem({ name: 'a.png', size: 1000, type: 'image/png' }), /음악 파일/);
  assert.match(m.fileProblem({ name: 'a.mp3', size: 0, type: 'audio/mpeg' }), /빈 파일/);
  assert.match(m.fileProblem({ name: 'big.wav', size: m.MAX_MUSIC_BYTES + 1, type: 'audio/wav' }), /20 MB까지/);
  assert.equal(m.fileProblem({ name: 'edge.mp3', size: m.MAX_MUSIC_BYTES, type: 'audio/mpeg' }), null);
});

test('제목 기본값과 저장소 이름', () => {
  assert.equal(m.titleFromFileName('설원 아침 v2.mp3'), '설원 아침 v2');
  assert.equal(m.titleFromFileName('  boss   theme.final.wav '), 'boss theme.final');
  assert.equal(m.titleFromFileName('.mp3'), '.mp3');
  assert.equal(m.safeStorageName('설원 아침 v2.mp3'), 'v2.mp3');
  assert.equal(m.safeStorageName('Snow Day (loop).MP3'), 'Snow_Day_loop.mp3');
  assert.equal(m.safeStorageName('아침.mp3'), 'track.mp3');
  assert.match(m.safeStorageName('a'.repeat(200) + '.mp3'), /^a{60}\.mp3$/);
  assert.ok(/^[a-zA-Z0-9._-]+$/.test(m.safeStorageName('곡 #1 / 최종?!.ogg')));
});

test('파형: 구간 RMS 를 가장 큰 구간에 맞춘다', () => {
  const quiet = new Float32Array(100).fill(0.1);
  const loud = new Float32Array(100).fill(0.5);
  const ch = new Float32Array([...quiet, ...loud]);
  const peaks = m.computePeaks([ch], 2);
  assert.deepEqual(peaks, [0.2, 1]);
  // 채널 둘은 함께 잰다
  const stereo = m.computePeaks([new Float32Array([1, 1, 0, 0]), new Float32Array([1, 1, 0, 0])], 2);
  assert.deepEqual(stereo, [1, 0]);
  // 막대 수보다 샘플이 적으면 샘플 수만큼
  assert.equal(m.computePeaks([new Float32Array([0.5, 0.25])], 160).length, 2);
  assert.deepEqual(m.computePeaks([new Float32Array(10)], 4), [0, 0, 0, 0]);
  assert.equal(m.computePeaks([], 10), null);
  assert.equal(m.computePeaks([new Float32Array(0)], 10), null);
  const many = m.computePeaks([Float32Array.from({ length: 48000 }, (_, i) => Math.sin(i / 10) * (i / 48000))]);
  assert.equal(many.length, m.PEAK_BARS);
  assert.ok(many.every((v) => v >= 0 && v <= 1));
  assert.equal(Math.max(...many), 1);
});

test('DB 의 파형 값 검사', () => {
  assert.deepEqual(m.validPeaks([0, 0.5, 1]), [0, 0.5, 1]);
  assert.equal(m.validPeaks(null), null);
  assert.equal(m.validPeaks([]), null);
  assert.equal(m.validPeaks(['1']), null);
  assert.equal(m.validPeaks({ 0: 1 }), null);
});

test('누른 자리 비율', () => {
  assert.equal(m.seekRatio(150, 100, 200), 0.25);
  assert.equal(m.seekRatio(50, 100, 200), 0);
  assert.equal(m.seekRatio(400, 100, 200), 1);
  assert.equal(m.seekRatio(150, 100, 0), 0);
});

test('파형 위 피드백 표시', () => {
  const comments = [
    { id: 'a', at_sec: 30, body: '여기 좋음', author_name: '정훈' },
    { id: 'b', at_sec: null, body: '전체', author_name: '은기' },
    { id: 'c', at_sec: 999, body: '곡 밖', author_name: '희윤' },
  ];
  const marks = m.commentMarks(comments, 120);
  assert.deepEqual(marks.map((x) => [x.id, x.ratio]), [['a', 0.25]]);
  assert.match(marks[0].label, /^0:30 정훈: 여기 좋음$/);
  assert.deepEqual(m.commentMarks(comments, 0), []);
  assert.deepEqual(m.commentMarks(comments, null), []);
});

console.log(`music: ${passed}개 통과`);
