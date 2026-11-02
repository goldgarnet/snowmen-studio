// 이동 기록(nav)·목록 주소(hubState) 순수 로직 테스트 — `npm run test:nav`
// 엔진 테스트(test/engine/run.cjs)와 같은 방식으로 TS 소스를 그대로 불러와 돌린다.
// 브라우저 대신 아주 작은 가짜 history/location/sessionStorage 를 깔고, 테스트마다 모듈을 새로 읽는다.
const fs = require('fs');
const path = require('path');
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

const NAV = path.join(__dirname, '../../src/lib/nav.ts');
const HUB = path.join(__dirname, '../../src/lib/hubState.ts');

// ---------------------------------------------------------------- 가짜 브라우저

class FakeStorage {
  constructor() { this.map = new Map(); }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
}

function setGlobal(name, value) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}

// startUrl 에서 시작하는 새 탭. history.back()/forward() 는 브라우저처럼 비동기(popstate 는 다음 틱).
function freshBrowser(startUrl = '/', { storage = new FakeStorage() } = {}) {
  const listeners = new Map();
  const entries = [{ url: startUrl, state: null }];
  let index = 0;
  const clone = (v) => (v == null ? null : JSON.parse(JSON.stringify(v)));
  const split = (url) => {
    const i = url.indexOf('?');
    return i < 0 ? { pathname: url, search: '' } : { pathname: url.slice(0, i), search: url.slice(i) };
  };
  const main = { scrollTop: 0 };
  const traverse = (delta) => setTimeout(() => {
    const next = index + delta;
    if (next < 0 || next >= entries.length) return;
    index = next;
    for (const fn of listeners.get('popstate') ?? []) fn({ type: 'popstate' });
  }, 0);
  const history = {
    scrollRestoration: 'auto',
    get state() { return clone(entries[index].state); },
    get length() { return entries.length; },
    pushState(state, _title, url) {
      entries.splice(index + 1);
      entries.push({ url: url ?? entries[index].url, state: clone(state) });
      index += 1;
    },
    replaceState(state, _title, url) {
      entries[index] = { url: url ?? entries[index].url, state: clone(state) };
    },
    back() { traverse(-1); },
    forward() { traverse(1); },
  };
  setGlobal('window', globalThis);
  setGlobal('history', history);
  setGlobal('location', {
    get pathname() { return split(entries[index].url).pathname; },
    get search() { return split(entries[index].url).search; },
  });
  setGlobal('document', { querySelector: (sel) => (sel === '.app-main' ? main : null) });
  setGlobal('sessionStorage', storage);
  setGlobal('addEventListener', (type, fn) => {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(fn);
  });
  setGlobal('removeEventListener', (type, fn) => listeners.get(type)?.delete(fn));
  setGlobal('dispatchEvent', (event) => {
    for (const fn of listeners.get(event.type) ?? []) fn(event);
    return true;
  });
  delete require.cache[NAV];
  delete require.cache[HUB];
  const nav = require(NAV);
  const hub = require(HUB);
  const events = [];
  globalThis.addEventListener(nav.LOCATION_EVENT, () => events.push(nav.currentUrl()));
  return { nav, hub, history, main, storage, events, url: () => nav.currentUrl(), entries };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

// ---------------------------------------------------------------- 테스트

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

// ----- hubState: 주소 ↔ 목록 상태

test('목록 주소: 기본값(1쪽·전체·빈 검색·끔)은 빼고 순서는 page → filter → q → unsolved → folder', () => {
  const { hub } = freshBrowser();
  assert.equal(hub.listUrl('/', {}), '/');
  assert.equal(hub.listUrl('/', { page: 1, filter: 'all', q: '', unsolved: false, folder: null }), '/');
  assert.equal(hub.listUrl('/', { folder: 'f1', q: 'ab', filter: 'accepted', page: 3 }), '/?page=3&filter=accepted&q=ab&folder=f1');
  assert.equal(hub.listUrl('/', { folder: 'f1', unsolved: true, q: 'ab', page: 2 }), '/?page=2&q=ab&unsolved=1&folder=f1');
  assert.equal(hub.listUrl('/hub', { page: 2 }), '/hub?page=2');
  assert.equal(hub.listUrl('/editor', { page: 2, folder: 'x' }), '/editor?page=2&folder=x');
});

test('목록 주소: 잘못된 쪽·필터는 1쪽·전체로 읽는다 (마지막 쪽 넘김은 화면이 정리)', () => {
  const { hub } = freshBrowser();
  const base = { filter: 'all', q: '', unsolved: false, folder: null };
  assert.deepEqual(hub.parseListQuery('/'), { page: 1, ...base });
  assert.deepEqual(hub.parseListQuery('/?page=abc'), { page: 1, ...base });
  assert.deepEqual(hub.parseListQuery('/?page=0'), { page: 1, ...base });
  assert.deepEqual(hub.parseListQuery('/?page=-4'), { page: 1, ...base });
  assert.equal(hub.parseListQuery('/?page=999').page, 999);
  assert.equal(hub.parseListQuery('/?filter=zzz').filter, 'all');
  assert.equal(hub.parseListQuery('/?filter=held').filter, 'held');
  assert.equal(hub.parseListQuery('/?unsolved=1').unsolved, true);
  assert.equal(hub.parseListQuery('/?unsolved=yes').unsolved, false);
});

test('목록 주소: 한글 검색어·폴더가 왕복해도 그대로 (파라미터 순서 무관)', () => {
  const { hub } = freshBrowser();
  const url = hub.listUrl('/', { page: 2, filter: 'accepted', q: '나인석 a+b&c', unsolved: true, folder: 'f-1' });
  assert.deepEqual(hub.parseListQuery(url), { page: 2, filter: 'accepted', q: '나인석 a+b&c', unsolved: true, folder: 'f-1' });
  assert.deepEqual(hub.parseListQuery('/?q=%EB%82%98%EC%9D%B8%EC%84%9D&page=2&filter=accepted'),
    { page: 2, filter: 'accepted', q: '나인석', unsolved: false, folder: null });
  assert.ok(hub.isHubListUrl('/?page=2&unsolved=1') && !hub.isHubFolderUrl('/?unsolved=1'));
});

test('화면 종류: 허브 목록·허브 폴더·맵 제작 목록·폴더·챕터 목록', () => {
  const { hub } = freshBrowser();
  assert.ok(hub.isHubListUrl('/?page=3') && hub.isHubListUrl('/hub') && hub.isHubListUrl('/'));
  assert.ok(!hub.isHubListUrl('/?page=3&folder=a'));
  assert.ok(hub.isHubFolderUrl('/?page=3&folder=a') && !hub.isHubFolderUrl('/maps/a') && !hub.isHubFolderUrl(null));
  assert.ok(hub.isHubUrl('/?folder=a') && !hub.isHubUrl('/maps/a') && !hub.isHubUrl('/editor'));
  assert.ok(hub.isStudioListUrl('/editor?page=2') && !hub.isStudioListUrl('/editor?folder=f') && !hub.isStudioListUrl('/editor/new'));
  assert.ok(hub.isStudioFolderUrl('/editor?page=2&folder=f', 'f') && !hub.isStudioFolderUrl('/editor?folder=g', 'f'));
  assert.equal(hub.chapterUrl(null, 'm'), '/chapters');
  assert.equal(hub.chapterUrl('c1', 'm1'), '/chapters?ch=c1&map=m1');
  assert.ok(hub.isChapterListUrl('/chapters?ch=c1', 'c1') && !hub.isChapterListUrl('/chapters?ch=c1&map=m', 'c1'));
  assert.ok(!hub.isChapterListUrl('/chapters?ch=c2', 'c1'));
});

test('허브 캐시: 상세에서 바꾼 행은 고치고, 비공개·삭제는 뺀다', () => {
  const { hub } = freshBrowser();
  const row = (id, extra = {}) => ({ id, published: true, title: id, ...extra });
  assert.equal(hub.getHubCache(), null);
  hub.patchCachedMap(row('a'));               // 캐시가 없으면 아무 일도 없다
  assert.equal(hub.getHubCache(), null);
  hub.setHubCache([row('a'), row('b')], []);
  hub.patchCachedMap(row('a', { title: 'A2' }));
  assert.equal(hub.getCachedMap('a').title, 'A2');
  hub.patchCachedMap(row('b', { published: false }));
  assert.equal(hub.getCachedMap('b'), null);
  hub.removeCachedMap('a');
  assert.deepEqual(hub.getHubCache().maps, []);
});

// ----- nav: 기록 쓰기

test('시작: 첫 항목에 idx 0, scrollRestoration = manual', () => {
  const { history } = freshBrowser('/?page=3');
  assert.equal(history.state.idx, 0);
  assert.equal(history.state.from, undefined);
  assert.equal(history.scrollRestoration, 'manual');
});

test('push: 새 항목에 idx+1·from(직전 주소), 떠나는 항목엔 scrollTop', () => {
  const { nav, history, main, url, events, entries } = freshBrowser('/?page=3');
  main.scrollTop = 181;
  nav.go('/maps/a');
  assert.equal(url(), '/maps/a');
  assert.equal(history.length, 2);
  assert.deepEqual(history.state, { idx: 1, from: '/?page=3' });
  assert.deepEqual(entries[0].state, { idx: 0, scrollTop: 181 });
  assert.deepEqual(events, ['/maps/a']);
});

test('replace: 주소만 바꾸고 state(idx·from·scrollTop)는 지우지 않는다', () => {
  const { nav, history, url } = freshBrowser('/');
  nav.go('/maps/a');
  nav.go('/maps/a?x=1', { replace: true });
  assert.equal(url(), '/maps/a?x=1');
  assert.equal(history.length, 2);
  assert.deepEqual(history.state, { idx: 1, from: '/' });
  nav.go('/maps/a?x=1', { replace: true, state: { from: '/?page=2' } });
  assert.deepEqual(history.state, { idx: 1, from: '/?page=2' });
});

test('같은 주소로 다시 push 하지 않는다 (활성 쪽·같은 탭 다시 누르기)', () => {
  const { nav, history, events } = freshBrowser('/?page=3');
  nav.go('/?page=3');
  nav.go('/?page=3', { replace: true });
  assert.equal(history.length, 1);
  assert.deepEqual(events, []);
});

test('goBack: 바로 앞이 돌아갈 화면이면 뒤로 — 왕복해도 기록이 늘지 않는다', async () => {
  const { nav, hub, history, url } = freshBrowser('/?page=3');
  for (let i = 0; i < 5; i++) {
    nav.go(`/maps/m${i}`);
    hub.backToHub();
    await tick();
    assert.equal(url(), '/?page=3');
  }
  assert.ok(history.length <= 2, `history.length=${history.length}`);
  history.forward();
  await tick();
  assert.equal(url(), '/maps/m4');
});

test('goBack: from 이 없으면(주소로 바로 연 상세) 절대 뒤로 가지 않고 이 탭의 마지막 허브 목록으로 push', async () => {
  const storage = new FakeStorage();
  const first = freshBrowser('/?page=4', { storage });
  first.nav.rememberListUrl('hub', '/?page=4');
  const { hub, history, url } = freshBrowser('/maps/a', { storage });   // 같은 탭에서 주소창 이동
  hub.backToHub();
  await tick();
  assert.equal(url(), '/?page=4');
  assert.equal(history.length, 2);
  assert.equal(history.state.from, '/maps/a');
});

test('goBack: 폴더에서 연 상세는 그 폴더로 뒤로, 바로 앞이 다른 화면이면 push', async () => {
  const { nav, hub, url, history } = freshBrowser('/?page=3&folder=f1');
  nav.go('/maps/a');
  assert.ok(hub.isHubFolderUrl(history.state.from));
  hub.backToHub();
  await tick();
  assert.equal(url(), '/?page=3&folder=f1');

  const other = freshBrowser('/editor');
  other.nav.go('/maps/a');
  other.hub.backToHub();
  await tick();
  assert.equal(other.url(), '/');
  assert.equal(other.history.length, 3);
});

test('exitTo: 앱이 returnTo 에서 push 한 플레이면 뒤로, 주소로 바로 연 플레이면 replace', async () => {
  const a = freshBrowser('/maps/a');
  a.nav.go('/maps/a/play?returnTo=%2Fmaps%2Fa');
  a.nav.exitTo('/maps/a');
  await tick();
  assert.equal(a.url(), '/maps/a');
  assert.equal(a.history.length, 2);   // 플레이 항목은 앞으로 쪽에 남는다

  const b = freshBrowser('/maps/a/play?returnTo=%2Fmaps%2Fa');
  b.nav.exitTo('/maps/a');
  assert.equal(b.url(), '/maps/a');
  assert.equal(b.history.length, 1);

  const c = freshBrowser('/chapters?ch=c1&map=m1');
  c.nav.go('/maps/m1/play?returnTo=%2Fchapters%3Fch%3Dc1%26map%3Dm1');
  c.nav.exitTo('/chapters?ch=c1&map=m1');
  await tick();
  assert.equal(c.url(), '/chapters?ch=c1&map=m1');
});

test('하위 화면(풀이 보기): 같은 주소로 기록 하나, 닫기 = 뒤로', async () => {
  const { nav, history, url } = freshBrowser('/maps/a');
  nav.pushLayer('solution:s1');
  assert.equal(url(), '/maps/a');
  assert.equal(history.length, 2);
  assert.equal(history.state.layer, 'solution:s1');
  let fallback = 0;
  nav.closeLayer(() => { fallback += 1; });
  await tick();
  assert.equal(history.state.layer, undefined);
  assert.equal(fallback, 0);
  nav.closeLayer(() => { fallback += 1; });   // 표시가 없으면 뒤로 가지 않는다
  await tick();
  assert.equal(fallback, 1);
  assert.equal(url(), '/maps/a');
});

test('스크롤: 쪽 이동은 맨 위, 뒤로는 떠날 때 값, 탭·대체 이동은 그 주소의 마지막 값', async () => {
  const { nav, main } = freshBrowser('/?page=2');
  main.scrollTop = 181;
  nav.go('/?page=3');                                  // 쪽 번호 → 맨 위
  assert.deepEqual(nav.currentArrival(), { scroll: 0, returned: false });
  main.scrollTop = 40;
  window.history.back();
  await tick();
  assert.deepEqual(nav.currentArrival(), { scroll: 181, returned: true });
  main.scrollTop = 181;
  nav.go('/editor');                                   // 다른 탭으로
  main.scrollTop = 0;
  nav.goTab('hub', '/');                               // 기억이 없으면 기본 주소
  assert.equal(nav.currentUrl(), '/');
  nav.go('/?page=2', { scroll: 'restore' });           // 그 주소의 마지막 값
  assert.deepEqual(nav.currentArrival(), { scroll: 181, returned: true });
});

test('두 번 누름: 돌아가기를 두 번 불러도 뒤로는 한 번 (popstate 전까지 새 기록도 안 쌓음)', async () => {
  const { nav, hub, history, url, entries } = freshBrowser('/?page=3');
  nav.go('/?page=4');
  nav.go('/maps/a');
  hub.backToHub();
  assert.ok(nav.isBackPending());
  hub.backToHub();                                   // 더블클릭의 두 번째 — 아직 popstate 전
  assert.equal(nav.go('/maps/b'), false);            // 뒤로 가는 중에는 push 하지 않는다
  assert.equal(history.length, 3);
  await tick();
  assert.equal(url(), '/?page=4');                   // 한 칸만
  assert.ok(!nav.isBackPending());
  assert.equal(entries.length, 3);
  // popstate 뒤에는 다시 정상
  nav.go('/maps/c');
  hub.backToHub();
  await tick();
  assert.equal(url(), '/?page=4');
});

test('두 번 누름: 플레이 끝내기·풀이 보기 닫기도 한 번만 뒤로', async () => {
  const a = freshBrowser('/?page=3');
  a.nav.go('/maps/a');
  a.nav.go('/maps/a/play?returnTo=%2Fmaps%2Fa');
  a.nav.exitTo('/maps/a');
  a.nav.exitTo('/maps/a');
  await tick();
  assert.equal(a.url(), '/maps/a');

  const b = freshBrowser('/?page=3');
  b.nav.go('/maps/a');
  b.nav.pushLayer('solution:s1');
  let fallback = 0;
  b.nav.closeLayer(() => { fallback += 1; });
  b.nav.closeLayer(() => { fallback += 1; });
  await tick();
  assert.equal(b.url(), '/maps/a');
  assert.equal(b.history.state.layer, undefined);
  assert.equal(b.history.state.idx, 1);              // 상세 항목 (허브로 두 칸 가지 않음)
  assert.equal(fallback, 0);
});

test('하위 화면: 이미 하위 화면 항목이면 쌓지 않고 바꿔 적는다, clearLayer 는 표시만 지운다', () => {
  const { nav, history } = freshBrowser('/maps/a');
  nav.pushLayer('solution:s1');
  assert.equal(history.length, 2);
  nav.pushLayer('solution:s2');                      // 새로고침 뒤 다시 보기 등
  assert.equal(history.length, 2);
  assert.equal(history.state.layer, 'solution:s2');
  assert.equal(history.state.idx, 1);
  nav.clearLayer();
  assert.equal(history.state.layer, undefined);
  assert.equal(history.state.idx, 1);
  assert.equal(nav.currentUrl(), '/maps/a');
});

test('더블클릭: 화면을 옮긴 클릭에 이어진 두 번째 클릭(detail 2)만 버린다', () => {
  const { nav } = freshBrowser('/?page=3');
  const click = (detail) => {
    const ev = { type: 'click', isTrusted: true, detail, stopped: false, prevented: false,
      preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; } };
    window.dispatchEvent(ev);
    return ev;
  };
  // 첫 클릭이 화면을 옮기면(push) 이어진 두 번째 클릭은 버린다
  assert.equal(click(1).stopped, false);
  nav.go('/maps/a');
  const second = click(2);
  assert.ok(second.stopped && second.prevented);
  // 화면을 옮기지 않은 클릭에 이어진 더블클릭(글자 고르기 등)은 그대로
  assert.equal(click(1).stopped, false);
  assert.equal(click(2).stopped, false);
  // 따로 누른 클릭(detail 1)과 키보드(detail 0)는 이동 직후라도 그대로
  nav.go('/maps/b');
  assert.equal(click(1).stopped, false);
  nav.go('/maps/c');
  assert.equal(click(0).stopped, false);
});

test('상단 탭: 그 탭의 마지막 목록으로 push, 이미 그 화면이면 그대로', () => {
  const { nav, history, url } = freshBrowser('/maps/a');
  nav.rememberListUrl('hub', '/?filter=accepted&page=2');
  nav.goTab('hub', '/');
  assert.equal(url(), '/?filter=accepted&page=2');
  assert.equal(history.length, 2);
  nav.goTab('hub', '/');
  assert.equal(history.length, 2);
  nav.goTab('solved', '/solved');                      // 기억 없는 탭은 기본 주소
  assert.equal(url(), '/solved');
});

// ---------------------------------------------------------------- 실행

(async () => {
  let passed = 0;
  let failed = 0;
  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log(`PASS ${name}`);
      passed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`FAIL ${name}\n  ${message}`);
      failed += 1;
    }
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed === 0 ? 0 : 1;
})();
