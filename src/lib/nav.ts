import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react';

// 앱 안 이동 기록(history). 라우터 라이브러리 없이 App 이 pushState/popstate 로 직접
// 라우팅하므로, 기록을 쓰는 곳을 모두 여기로 모은다.
//
// 앱이 push 한 기록 항목마다 history.state 에 다음을 남긴다.
//   idx       이 탭에서 앱이 쌓은 순번 (첫 항목 0, push 할 때마다 직전 +1)
//   from      push 직전 주소(경로+쿼리). '← 허브로' 같은 버튼이 '바로 앞 항목이 그 목록인가'를
//             보고 history.back() 할 수 있게 한다. 주소창·새 탭으로 연 첫 항목에는 없다 →
//             그때는 절대 back 하지 않는다(앱 밖으로 나가지 않게).
//   scrollTop 이 항목을 떠날 때의 .app-main 스크롤. 스크롤 컨테이너가 window 가 아니라서
//             브라우저 기본 복원이 듣지 않는다.
//   layer     같은 주소 위에 뜬 하위 화면(풀이 보기). 뒤로 = 그 화면만 닫기.
//
// 규칙: push 는 사용자 동작(클릭 등) 처리기에서만 한다. effect 안에서는 replace 만 쓴다
// (StrictMode 이중 실행에도 기록이 늘지 않게).

export const LOCATION_EVENT = 'app:locationchange';

export interface NavState {
  idx?: number;
  from?: string;
  scrollTop?: number;
  layer?: string;
}

export interface GoOptions {
  replace?: boolean;
  // push: 새 항목에 더할 값 / replace: 지금 항목 state 에 합칠 값 (기존 값은 지우지 않는다)
  state?: Partial<NavState>;
  // push 로 새로 연 목록이 어디서 시작하나. 'top' = 맨 위(쪽 번호·필터),
  // 'restore' = 그 주소에서 마지막으로 본 위치(탭·대체 이동).
  scroll?: 'top' | 'restore';
}

const hasWindow = typeof window !== 'undefined';
const SCROLL_KEY = 'snowmen-studio:nav:scroll';
const LIST_KEY_PREFIX = 'snowmen-studio:nav:list:';
const MAX_REMEMBERED_SCROLLS = 80;

export function currentUrl(): string {
  return `${window.location.pathname}${window.location.search}`;
}

export function readNavState(): NavState {
  const state: unknown = window.history.state;
  return state && typeof state === 'object' ? (state as NavState) : {};
}

// 같은 주소인가 (경로+쿼리, 해시 무시)
export function sameUrl(a: string, b: string): boolean {
  try {
    const x = new URL(a, 'http://x');
    const y = new URL(b, 'http://x');
    return x.pathname === y.pathname && x.search === y.search;
  } catch {
    return a === b;
  }
}

// ---------------------------------------------------------------- 구독 (useSyncExternalStore)

const subscribers = new Set<() => void>();
function subscribe(callback: () => void): () => void {
  subscribers.add(callback);
  return () => { subscribers.delete(callback); };
}

// 이 탭에서 앱이 지금 서 있는 항목의 순번. popstate 때 '떠나는 항목'을 알려고 들고 있는다.
let curIdx = 0;
let lastUrl = '';
// 주소가 바뀐 횟수 (push·replace·뒤로/앞으로 모두). 이동 뒤 안내(flash)에 쓴다.
let locSeq = 0;
// 스크롤 복원 대상인 '도착'. push·뒤로/앞으로 때만 바뀐다(검색어 replace 로는 안 바뀜).
//   scroll   복원할 값 (null = 손대지 않음)
//   returned 돌아온 도착인가 (뒤로/앞으로, '← …', 탭·대체 이동) — 방금 연 카드로 초점을 줄 때
let arrival: { seq: number; scroll: number | null; returned: boolean } = { seq: 0, scroll: null, returned: false };
// 떠날 때의 스크롤을 항목 순번별로 (같은 문서 안에서만). 새로고침 뒤에는 state.scrollTop 을 본다.
const scrollByIdx = new Map<number, number>();

function notifySubscribers(): void {
  for (const callback of [...subscribers]) callback();
}

// 앱이 직접 바꾼 주소(push·replace): 구독자와 App(LOCATION_EVENT)에 같은 호출 안에서 알린다 → 한 번에 그려진다.
function emit(): void {
  locSeq += 1;
  lastUrl = currentUrl();
  notifySubscribers();
  window.dispatchEvent(new Event(LOCATION_EVENT));
}

// ---------------------------------------------------------------- 스크롤 기억

function mainEl(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.app-main');
}

function readScroll(): number {
  return Math.round(mainEl()?.scrollTop ?? 0);
}

function readUrlScrolls(): Record<string, number> {
  try {
    const raw = sessionStorage.getItem(SCROLL_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, number>) : {};
  } catch {
    return {};
  }
}

function rememberUrlScroll(url: string, top: number): void {
  try {
    const all = readUrlScrolls();
    delete all[url];
    all[url] = top;
    const keys = Object.keys(all);
    for (const key of keys.slice(0, Math.max(0, keys.length - MAX_REMEMBERED_SCROLLS))) delete all[key];
    sessionStorage.setItem(SCROLL_KEY, JSON.stringify(all));
  } catch {
    // 스크롤 기억은 편의 기능 — 저장소가 막혀도 이동은 그대로 된다.
  }
}

function urlScroll(url: string): number | null {
  const top = readUrlScrolls()[url];
  return typeof top === 'number' ? top : null;
}

function rememberLeaving(idx: number, url: string, top: number): void {
  scrollByIdx.set(idx, top);
  if (url) rememberUrlScroll(url, top);
}

// ---------------------------------------------------------------- 두 번 누르기 막기
// '← 허브로' 같은 버튼을 습관처럼 두 번 누르면(더블클릭)
//   (1) 첫 클릭의 history.back() 이 끝나기 전(popstate 전)에 두 번째 클릭이 같은 버튼을 또 눌러 두 칸 뒤로 가거나
//       앱 밖으로 나간다 → 뒤로 가는 중(backPending)에는 돌아가기·새 기록 쓰기를 하지 않는다.
//   (2) 돌아온 뒤 두 번째 클릭이 스크롤이 복원된 목록의 그 자리(카드·칩·쪽 버튼)를 누른다 → 앱이 화면을 옮긴
//       클릭에 이어진 더블클릭의 나머지 클릭(detail ≥ 2)은 버린다. 하나씩 따로 누른 클릭(detail 1)과
//       키보드(detail 0)는 그대로 둔다 — 빠르게 이어 누르는 것은 막지 않는다.
const BACK_PENDING_MS = 1000;
let backPending = false;
let backTimer: ReturnType<typeof setTimeout> | undefined;
let lastClickAt = -Infinity;   // 바로 앞 마우스 클릭 시각
let navAt = -Infinity;         // 앱이 마지막으로 화면을 옮긴 시각(push·뒤로·탭·플레이 끝내기)

function markNav(): void {
  navAt = performance.now();
}

// history.back() 을 부른 직후에 부른다(뒤로가기는 비동기라 popstate 는 늘 그 뒤에 온다). popstate 가 올 때까지
// (안 오면 1초) 돌아가기·새 기록 쓰기를 하지 않는다.
function backStarted(): void {
  backPending = true;
  clearTimeout(backTimer);
  backTimer = setTimeout(() => { backPending = false; }, BACK_PENDING_MS);
  markNav();
}

// 앱이 부른 뒤로가기가 아직 끝나지 않았나 (확인·테스트용)
export function isBackPending(): boolean {
  return backPending;
}

function onClickCapture(e: MouseEvent): void {
  if (!e.isTrusted || e.detail === 0) return;
  const prev = lastClickAt;
  lastClickAt = performance.now();
  if (e.detail >= 2 && navAt >= prev) {
    e.preventDefault();
    e.stopImmediatePropagation();
  }
}

// ---------------------------------------------------------------- 기록 쓰기

// 주소를 바꿨으면 true. 뒤로 가는 중에 새 기록을 쌓으려 하면 아무것도 하지 않고 false.
export function go(url: string, options: GoOptions = {}): boolean {
  const prevUrl = currentUrl();
  if (options.replace) {
    if (url === prevUrl && !options.state) return false;
    window.history.replaceState({ ...readNavState(), ...options.state }, '', url);
    emit();
    return true;
  }
  // 같은 주소로 다시 쌓지 않는다(활성 쪽·같은 탭 다시 누르기). 하위 화면(layer)은 예외.
  if (url === prevUrl && !options.state) return false;
  if (backPending) return false;
  // 떠나는 항목에 스크롤을 남긴다. 새 화면이 그려지면 .app-main 이 줄어 0 으로 깎이므로
  // 반드시 push 직전에 읽는다.
  const top = readScroll();
  window.history.replaceState({ ...readNavState(), scrollTop: top }, '');
  rememberLeaving(curIdx, prevUrl, top);
  for (const idx of [...scrollByIdx.keys()]) if (idx > curIdx) scrollByIdx.delete(idx);
  curIdx += 1;
  window.history.pushState({ ...options.state, idx: curIdx, from: prevUrl }, '', url);
  const restore = options.scroll === 'restore';
  arrival = { seq: arrival.seq + 1, scroll: restore ? (urlScroll(url) ?? 0) : 0, returned: restore };
  markNav();
  emit();
  return true;
}

// '← 허브로' 처럼 '돌아가기' 버튼. 바로 앞 항목(state.from)이 돌아갈 화면이면 history.back()
// 으로 기록을 늘리지 않고, 아니면(새 탭·주소창으로 바로 연 경우) fallbackUrl 로 push 한다.
// from 이 없으면 back 하지 않는다 — 앱 밖으로 나가지 않게. 뒤로 가는 중이면(두 번 누름) 아무것도 안 한다.
export function goBack(fallbackUrl: string, isTarget: (from: string) => boolean): void {
  if (backPending) return;
  const { from } = readNavState();
  if (typeof from === 'string' && isTarget(from)) {
    window.history.back();
    backStarted();
    return;
  }
  go(fallbackUrl, { scroll: 'restore' });
}

// 플레이(녹화)를 끝내고 들어오기 전 화면(returnTo)으로. 앱이 returnTo 에서 push 한 항목이면
// back — 플레이 한 번에 기록이 늘지 않고 뒤로가기에 플레이 화면이 다시 나오지 않는다.
// 주소로 바로 들어온 경우엔 returnTo 로 replace.
export function exitTo(returnTo: string): void {
  if (backPending) return;
  const { from } = readNavState();
  if (typeof from === 'string' && sameUrl(from, returnTo)) {
    window.history.back();
    backStarted();
    return;
  }
  if (go(returnTo, { replace: true })) markNav();
}

// ---------------------------------------------------------------- 같은 주소 위의 하위 화면

// 풀이 보기처럼 주소는 그대로 두고 화면만 덮는 하위 화면을 기록 하나로 쌓는다. 지금 항목이 이미
// 하위 화면 항목이면(새로고침 뒤 등) 쌓지 않고 바꿔 적는다 — 닫기(뒤로) 한 번에 늘 상세로 돌아오게.
export function pushLayer(layer: string): void {
  if (backPending) return;
  if (readNavState().layer) {
    go(currentUrl(), { replace: true, state: { layer } });
    markNav();
    return;
  }
  go(currentUrl(), { state: { layer } });
}

// 하위 화면 닫기 = 뒤로. 기록에 그 표시가 없으면(새로고침 등) fallback 만 부른다.
export function closeLayer(fallback: () => void): void {
  if (backPending) return;
  if (readNavState().layer) {
    window.history.back();
    backStarted();
  } else fallback();
}

// 지금 항목의 하위 화면 표시를 지운다(보여 줄 수 없게 된 경우 — 예: 그 풀이가 지워짐).
export function clearLayer(): void {
  if (readNavState().layer) go(currentUrl(), { replace: true, state: { layer: undefined } });
}

const readLayer = () => readNavState().layer ?? null;
const readFrom = () => readNavState().from ?? null;
const readArrivalSeq = () => arrival.seq;
const readLocSeq = () => locSeq;
const serverNull = () => null;
const serverZero = () => 0;
const serverUrl = () => '/';

export function useLayer(): string | null {
  return useSyncExternalStore(subscribe, readLayer, serverNull);
}

// 지금 항목의 from (이 화면을 연 주소). 뒤로 버튼 문구를 정할 때.
export function useNavFrom(): string | null {
  return useSyncExternalStore(subscribe, readFrom, serverNull);
}

// 지금 주소(경로+쿼리). push·replace·뒤로/앞으로 모두 반영한다.
export function useLocation(): string {
  return useSyncExternalStore(subscribe, currentUrl, serverUrl);
}

// ---------------------------------------------------------------- 상단 탭 = 그 탭의 마지막 목록

export function rememberListUrl(tab: string, url: string): void {
  try { sessionStorage.setItem(LIST_KEY_PREFIX + tab, url); }
  catch { /* 기억 못 해도 탭은 기본 주소로 간다 */ }
}

export function tabUrl(tab: string, fallback: string): string {
  try { return sessionStorage.getItem(LIST_KEY_PREFIX + tab) || fallback; }
  catch { return fallback; }
}

// 상단 탭: 이 브라우저 탭이 그 탭에서 마지막으로 본 목록 화면으로 push. 이미 그 화면이면 그대로.
export function goTab(tab: string, fallback: string): void {
  go(tabUrl(tab, fallback), { scroll: 'restore' });
}

// ---------------------------------------------------------------- 스크롤 복원

// 지금 도착에서 복원할 스크롤과 '돌아온 도착'인지 (확인·테스트용)
export function currentArrival(): { scroll: number | null; returned: boolean } {
  return { scroll: arrival.scroll, returned: arrival.returned };
}

// 목록 화면이 실제로 그려진 직후(ready) 도착한 항목의 스크롤을 한 번 복원한다. 데이터가 오기
// 전에 복원하면 0 으로 잘리므로 ready 는 '목록이 다 그려졌다' 여야 한다.
// afterRestore(returned) 는 복원 뒤에 불린다 — 방금 연 카드로 초점 주기 등.
export function useScrollRestore(ready: boolean, afterRestore?: (returned: boolean) => void): void {
  const seq = useSyncExternalStore(subscribe, readArrivalSeq, serverZero);
  const doneRef = useRef(-1);
  const afterRef = useRef(afterRestore);
  useLayoutEffect(() => { afterRef.current = afterRestore; });
  useLayoutEffect(() => {
    if (!ready || doneRef.current === seq) return;
    doneRef.current = seq;
    const el = mainEl();
    if (el && arrival.scroll != null) el.scrollTop = arrival.scroll;
    afterRef.current?.(arrival.returned);
  }, [ready, seq]);
}

// ---------------------------------------------------------------- 이동 뒤 안내

// history.back() 은 비동기라, 이동을 부른 화면이 아니라 '돌아간 화면'이 안내를 띄우게 한다.
let pendingFlash: { key: string; message: string; seq: number; at: number } | null = null;
const FLASH_TTL_MS = 10_000;

export function flashAfterNav(key: string, message: string): void {
  pendingFlash = { key, message, seq: locSeq, at: Date.now() };
}

export function useFlashAfterNav(key: string, show: (message: string) => void): void {
  const seq = useSyncExternalStore(subscribe, readLocSeq, serverZero);
  const showRef = useRef(show);
  useLayoutEffect(() => { showRef.current = show; });
  useEffect(() => {
    const pending = pendingFlash;
    if (!pending || pending.key !== key || seq <= pending.seq) return;
    pendingFlash = null;
    if (Date.now() - pending.at > FLASH_TTL_MS) return;
    queueMicrotask(() => showRef.current(pending.message));
  }, [key, seq]);
}

// ---------------------------------------------------------------- 시작

// 뒤로/앞으로. 캡처 단계로 등록해 App 의 popstate 처리기보다 먼저 돈다 — 이 시점의 DOM 은 아직
// 떠나는 화면이라(React 가 다시 그리기 전) 떠나는 스크롤을 읽을 수 있다.
// 구독자 알림은 다음 태스크로 미룬다: 브라우저는 popstate 처리기 사이마다 마이크로태스크를 돌리므로
// 여기서 바로 알리면 App 이 경로(route)를 바꾸기 전에 '새 주소 + 옛 경로' 화면이 한 번 그려지고,
// 그 화면의 effect 가 주소를 잘못 고쳐 쓴다. App 의 setRoute 로 그릴 때 구독 훅들은 새 값을 직접 읽는다.
function onPopState(): void {
  backPending = false;
  clearTimeout(backTimer);
  rememberLeaving(curIdx, lastUrl, readScroll());
  const state = readNavState();
  curIdx = typeof state.idx === 'number' ? state.idx : 0;
  const top = scrollByIdx.get(curIdx) ?? (typeof state.scrollTop === 'number' ? state.scrollTop : null)
    ?? urlScroll(currentUrl()) ?? 0;
  arrival = { seq: arrival.seq + 1, scroll: top, returned: true };
  locSeq += 1;
  lastUrl = currentUrl();
  setTimeout(notifySubscribers, 0);
}

function onPageHide(): void {
  // 새로고침·탭 닫기 직전 위치를 이 항목에 남긴다.
  try { window.history.replaceState({ ...readNavState(), scrollTop: readScroll() }, ''); }
  catch { /* 문서가 이미 내려가는 중이면 무시 */ }
}

if (hasWindow) {
  window.history.scrollRestoration = 'manual';
  const state = readNavState();
  if (typeof state.idx !== 'number') window.history.replaceState({ ...state, idx: 0 }, '');
  curIdx = readNavState().idx ?? 0;
  lastUrl = currentUrl();
  arrival = { seq: 0, scroll: typeof state.scrollTop === 'number' ? state.scrollTop : null, returned: false };
  window.addEventListener('popstate', onPopState, true);
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('click', onClickCapture, true);
}
