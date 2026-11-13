// 음악 탭 순수 로직 테스트 — `npm run test:music`
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
const members = require(path.join(__dirname, '../../src/lib/members.ts'));
let passed = 0;
function test(name, fn) {
  try { fn(); passed += 1; } catch (e) { console.error(`✗ ${name}`); throw e; }
}

// 늘 같은 순서를 내는 난수 (섞기 시험용)
function seeded(seed) {
  let s = seed;
  return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
}

test('주소: 모든 곡 · 챕터 · 공통 · 플레이리스트', () => {
  assert.equal(m.musicUrl({ kind: 'all' }), '/music');
  assert.equal(m.musicUrl({ kind: 'chapter', key: 'abc' }), '/music?ch=abc');
  assert.equal(m.chapterMusicUrl(m.COMMON_KEY), '/music?ch=common');
  assert.equal(m.musicUrl({ kind: 'playlist', id: 'p1' }), '/music?pl=p1');
  assert.deepEqual(m.parseMusicView('/music'), { kind: 'all' });
  assert.deepEqual(m.parseMusicView('/music?ch=abc'), { kind: 'chapter', key: 'abc' });
  assert.deepEqual(m.parseMusicView('/music?pl=p1#x'), { kind: 'playlist', id: 'p1' });
  assert.deepEqual(m.parseMusicView('/music?ch='), { kind: 'all' });
  assert.ok(m.sameView({ kind: 'chapter', key: 'a' }, m.parseMusicView('/music?ch=a')));
  assert.equal(m.chapterKeyOf({ chapter_id: null }), m.COMMON_KEY);
  assert.equal(m.chapterKeyOf({ chapter_id: 'c9' }), 'c9');
});

test('음악을 올리는 계정은 김정훈 · 황정빈 둘', () => {
  assert.equal(members.MUSIC_UPLOADER_IDS.length, 2);
  assert.ok(members.isMusicUploader('b807cfa1-b912-4a27-a0a5-af2a302e4577'));
  assert.ok(members.isMusicUploader('01bf932f-c8f4-4837-8ed1-417a3e1ee791'));
  assert.ok(!members.isMusicUploader('88f7ede6-15c5-4f2d-8178-b517617ed457'));
  assert.ok(!members.isMusicUploader(null));
  // DB 의 is_music_uploader 와 같은 계정이어야 한다.
  const sql = fs.readFileSync(path.join(__dirname, '../../supabase/migrations/2026-11-13_music_library.sql'), 'utf8');
  for (const id of members.MUSIC_UPLOADER_IDS) assert.ok(sql.includes(`'${id}'`), id);
});

test('모든 곡 순서: 챕터 번호 순 → 공통은 맨 뒤, 같은 챕터는 올린 순서', () => {
  const rank = new Map([['c0', 0], ['c1', 1]]);
  const s = (id, chapter_id, created_at) => ({ id, chapter_id, created_at });
  const list = [s('x', null, '2026-11-01'), s('b', 'c1', '2026-11-02'), s('a', 'c1', '2026-11-01'), s('z', 'c0', '2026-11-09'), s('q', 'gone', '2026-11-01')];
  assert.deepEqual(m.libraryOrder(list, rank).map((r) => r.id), ['z', 'a', 'b', 'q', 'x']);
});

test('플레이리스트 순서 옮기기', () => {
  assert.deepEqual(m.moveInList(['a', 'b', 'c', 'd'], 0, 2), ['b', 'c', 'a', 'd']);
  assert.deepEqual(m.moveInList(['a', 'b', 'c', 'd'], 3, 0), ['d', 'a', 'b', 'c']);
  assert.deepEqual(m.moveInList(['a', 'b'], 1, 1), ['a', 'b']);
  assert.deepEqual(m.moveInList(['a', 'b'], 5, 0), ['a', 'b']);
  assert.deepEqual(m.moveInList(['a', 'b', 'c'], 0, 99), ['b', 'c', 'a']);
});

test('반복 단추: 반복 안 함 → 플레이리스트 반복 → 한 곡 반복 → 다시 처음', () => {
  assert.equal(m.nextRepeat('off'), 'all');
  assert.equal(m.nextRepeat('all'), 'one');
  assert.equal(m.nextRepeat('one'), 'off');
  assert.deepEqual([...m.PLAYBACK_RATES], [0.5, 0.75, 1, 1.25, 1.5, 2]);
  assert.equal(m.rateLabel(1.25), '1.25×');
});

test('대기열: 누른 곡부터, 섞지 않으면 목록 순서 그대로', () => {
  const q = m.makeQueue(['a', 'b', 'c', 'd'], 2, false);
  assert.deepEqual(q.order, [0, 1, 2, 3]);
  assert.equal(q.position, 2);
  assert.equal(m.currentOf(q), 'c');
  assert.deepEqual(m.makeQueue([], 0, false), { items: [], order: [], position: -1 });
  assert.equal(m.currentOf(m.emptyQueue()), null);
});

test('섞기: 누른 곡이 맨 앞, 나머지는 한 번씩 모두', () => {
  const q = m.makeQueue(['a', 'b', 'c', 'd', 'e'], 3, true, seeded(7));
  assert.equal(q.order[0], 3);
  assert.equal(q.position, 0);
  assert.equal(m.currentOf(q), 'd');
  assert.deepEqual([...q.order].sort(), [0, 1, 2, 3, 4]);
  // 같은 씨앗이면 같은 순서
  assert.deepEqual(m.makeQueue(['a', 'b', 'c', 'd', 'e'], 3, true, seeded(7)).order, q.order);
  // 여러 씨앗에서 모두 순열이고 맨 앞은 고른 곡
  for (let seed = 1; seed < 40; seed++) {
    const order = m.shuffledOrder(6, 2, seeded(seed));
    assert.equal(order[0], 2);
    assert.deepEqual([...order].sort(), [0, 1, 2, 3, 4, 5]);
  }
});

test('다음 · 이전: 반복 안 함은 끝에서 멈추고, 반복은 처음으로 돈다', () => {
  const q = { items: ['a', 'b', 'c'], order: [0, 1, 2], position: 2 };
  assert.equal(m.stepPosition(q, 1, 'off'), null);
  assert.equal(m.stepPosition(q, 1, 'all'), 0);
  assert.equal(m.stepPosition(q, 1, 'one'), 0);
  assert.equal(m.stepPosition({ ...q, position: 0 }, -1, 'off'), null);
  assert.equal(m.stepPosition({ ...q, position: 0 }, -1, 'all'), 2);
  assert.equal(m.stepPosition({ ...q, position: 1 }, 1, 'off'), 2);
  assert.equal(m.stepPosition(m.emptyQueue(), 1, 'all'), null);
});

test('섞기를 켜고 꺼도 지금 곡은 그대로', () => {
  const q = m.makeQueue(['a', 'b', 'c', 'd'], 1, false);
  const on = m.withShuffle(q, true, seeded(3));
  assert.equal(m.currentOf(on), 'b');
  assert.equal(on.position, 0);
  const off = m.withShuffle(on, false);
  assert.deepEqual(off.order, [0, 1, 2, 3]);
  assert.equal(off.position, 1);
  assert.equal(m.currentOf(off), 'b');
});

test('대기열에서 빼기: 앞 곡을 빼면 지금 자리를 당긴다', () => {
  const q = { items: ['a', 'b', 'c', 'd'], order: [0, 1, 2, 3], position: 2 };
  const r1 = m.removeAt(q, 0);
  assert.deepEqual(r1.items, ['b', 'c', 'd']);
  assert.equal(m.currentOf(r1), 'c');
  const r2 = m.removeAt(q, 3);
  assert.equal(m.currentOf(r2), 'c');
  assert.deepEqual(r2.items, ['a', 'b', 'c']);
  // 섞인 순서에서도 같은 곡을 가리킨다
  const shuffled = { items: ['a', 'b', 'c', 'd'], order: [2, 0, 3, 1], position: 2 };   // 지금 = d
  const r3 = m.removeAt(shuffled, 0);   // c 를 뺀다
  assert.deepEqual(r3.items, ['a', 'b', 'd']);
  assert.equal(m.currentOf(r3), 'd');
  assert.deepEqual(r3.order.map((i) => r3.items[i]), ['a', 'd', 'b']);
  assert.equal(m.removeAt({ items: ['a'], order: [0], position: 0 }, 0).position, -1);
  assert.equal(m.removeAt(q, 9), q);
});

test('다음에 재생 · 대기열에 추가', () => {
  const q = { items: ['a', 'b', 'c'], order: [0, 1, 2], position: 0 };
  const next = m.enqueue(q, 'x', 'next');
  assert.deepEqual(next.order.map((i) => next.items[i]), ['a', 'x', 'b', 'c']);
  assert.equal(m.currentOf(next), 'a');
  const end = m.enqueue(q, 'y', 'end');
  assert.deepEqual(end.order.map((i) => end.items[i]), ['a', 'b', 'c', 'y']);
  const fromEmpty = m.enqueue(m.emptyQueue(), 'z', 'next');
  assert.equal(m.currentOf(fromEmpty), 'z');
});

test('시간 · 길이 · 크기 · 날짜 표시', () => {
  assert.equal(m.formatTime(0), '0:00');
  assert.equal(m.formatTime(7.9), '0:07');
  assert.equal(m.formatTime(222), '3:42');
  assert.equal(m.formatTime(3723), '1:02:03');
  assert.equal(m.formatTime(null), '--:--');
  assert.equal(m.formatTime(NaN), '--:--');
  assert.equal(m.formatTotal([120, 59.6, null]), '3분');
  assert.equal(m.formatTotal([3600, 300]), '1시간 5분');
  assert.equal(m.formatTotal([]), '0분');
  assert.equal(m.formatBytes(0), '0 KB');
  assert.equal(m.formatBytes(1), '1 KB');
  assert.equal(m.formatBytes(4.25 * 1024 * 1024), '4.3 MB');
  assert.equal(m.formatBytes(20 * 1024 * 1024), '20 MB');
  assert.equal(m.formatBytes(null), '');
  assert.match(m.formatDate('2026-11-13T10:00:00'), /^2026\.11\.13$/);
});

test('파일 형식: 확장자가 먼저 — 빈 형식 · audio/mp3 도 올릴 수 있게', () => {
  assert.equal(m.audioType('a.mp3', ''), 'audio/mpeg');
  assert.equal(m.audioType('A.MP3', 'audio/mp3'), 'audio/mpeg');
  assert.equal(m.audioType('loop.wav', 'audio/x-wav'), 'audio/wav');
  assert.equal(m.audioType('x.m4a', 'audio/x-m4a'), 'audio/mp4');
  assert.equal(m.audioType('noext', 'audio/aiff'), 'audio/aiff');
  assert.equal(m.audioType('cover.png', 'image/png'), null);
});

test('올릴 수 없는 파일', () => {
  assert.equal(m.fileProblem({ name: 'a.mp3', size: 1000, type: 'audio/mpeg' }), null);
  assert.match(m.fileProblem({ name: 'a.png', size: 1000, type: 'image/png' }), /음악 파일/);
  assert.match(m.fileProblem({ name: 'a.mp3', size: 0, type: 'audio/mpeg' }), /빈 파일/);
  assert.match(m.fileProblem({ name: 'big.wav', size: m.MAX_MUSIC_BYTES + 1, type: 'audio/wav' }), /20 MB까지/);
});

test('제목 기본값과 저장소 이름', () => {
  assert.equal(m.titleFromFileName('설원 아침 v2.mp3'), '설원 아침 v2');
  assert.equal(m.titleFromFileName('  boss   theme.final.wav '), 'boss theme.final');
  assert.equal(m.safeStorageName('설원 아침 v2.mp3'), 'v2.mp3');
  assert.equal(m.safeStorageName('Snow Day (loop).MP3'), 'Snow_Day_loop.mp3');
  assert.equal(m.safeStorageName('아침.mp3'), 'track.mp3');
  assert.ok(/^[a-zA-Z0-9._-]+$/.test(m.safeStorageName('곡 #1 / 최종?!.ogg')));
});

test('파형: 구간 RMS 를 가장 큰 구간에 맞춘다', () => {
  const ch = new Float32Array([...new Float32Array(100).fill(0.1), ...new Float32Array(100).fill(0.5)]);
  assert.deepEqual(m.computePeaks([ch], 2), [0.2, 1]);
  assert.deepEqual(m.computePeaks([new Float32Array([1, 1, 0, 0]), new Float32Array([1, 1, 0, 0])], 2), [1, 0]);
  assert.equal(m.computePeaks([new Float32Array([0.5, 0.25])], 160).length, 2);
  assert.deepEqual(m.computePeaks([new Float32Array(10)], 4), [0, 0, 0, 0]);
  assert.equal(m.computePeaks([], 10), null);
  const many = m.computePeaks([Float32Array.from({ length: 48000 }, (_, i) => Math.sin(i / 10) * (i / 48000))]);
  assert.equal(many.length, m.PEAK_BARS);
  assert.equal(Math.max(...many), 1);
  assert.deepEqual(m.validPeaks([0, 0.5, 1]), [0, 0.5, 1]);
  assert.equal(m.validPeaks(['1']), null);
  assert.equal(m.validPeaks(null), null);
});

test('누른 자리 비율', () => {
  assert.equal(m.seekRatio(150, 100, 200), 0.25);
  assert.equal(m.seekRatio(50, 100, 200), 0);
  assert.equal(m.seekRatio(400, 100, 200), 1);
  assert.equal(m.seekRatio(150, 100, 0), 0);
});

console.log(`music: ${passed}개 통과`);
