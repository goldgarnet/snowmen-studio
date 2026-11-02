import type { FolderRow, MapRow, MapStatus } from '../api/types';
import { goBack, tabUrl } from './nav';

// 목록 화면의 상태를 주소 쿼리로 읽고 쓴다 — 새로고침·주소 공유·뒤로가기에도 같은 화면.
//   맵 허브   '/?page=<n>&filter=<상태>&q=<검색어>&unsolved=1&folder=<폴더 id>'   ('/hub' 별칭도 허브)
//   맵 제작   '/editor?page=<n>&folder=<폴더 id>'
//   챕터 구성 '/chapters?ch=<챕터 id>&map=<스테이지 맵 id>'
// 기본값(1쪽·전체·빈 검색·끔)은 주소에서 뺀다. 허브 파라미터 순서는 page → filter → q → unsolved → folder 로 고정.
// unsolved 는 feat/solved-checks 의 '내가 안 푼 맵' 거르기 자리다 — 거르기를 지역 상태로 두면 상세에
// 다녀올 때(허브가 다시 마운트) 거르기만 꺼지고 쪽 번호는 남아 다른 카드가 보인다. 합칠 때 그 토글은
// 이 값을 읽고 nav.go(…{ page: 1, unsolved: !on }) 로 쓴다.
// (api 모듈을 불러오지 않는다 — test/nav 가 Node 에서 이 파일을 그대로 돌린다.)

export type HubFilter = 'all' | MapStatus;
export const HUB_FILTERS: readonly HubFilter[] = ['all', 'pending', 'accepted', 'held', 'rejected'];

export interface ListQuery {
  page: number;          // 1부터. 숫자가 아니거나 1보다 작으면 1 (마지막 쪽 넘김은 목록이 정리)
  filter: HubFilter;     // 모르는 값이면 'all'
  q: string;
  unsolved: boolean;     // '내가 안 푼 맵'만 ('unsolved=1')
  folder: string | null;
}

export function splitUrl(url: string): { path: string; params: URLSearchParams } {
  const noHash = url.split('#')[0];
  const i = noHash.indexOf('?');
  return {
    path: i < 0 ? noHash : noHash.slice(0, i),
    params: new URLSearchParams(i < 0 ? '' : noHash.slice(i + 1)),
  };
}

export function parseListQuery(url: string): ListQuery {
  const { params } = splitUrl(url);
  const page = parseInt(params.get('page') ?? '', 10);
  const filter = params.get('filter') as HubFilter | null;
  return {
    page: Number.isFinite(page) && page >= 1 ? page : 1,
    filter: filter && HUB_FILTERS.includes(filter) ? filter : 'all',
    q: params.get('q') ?? '',
    unsolved: params.get('unsolved') === '1',
    folder: params.get('folder') || null,
  };
}

export function listUrl(base: string, query: Partial<ListQuery>): string {
  const params = new URLSearchParams();
  if (query.page && query.page > 1) params.set('page', String(query.page));
  if (query.filter && query.filter !== 'all') params.set('filter', query.filter);
  if (query.q) params.set('q', query.q);
  if (query.unsolved) params.set('unsolved', '1');
  if (query.folder) params.set('folder', query.folder);
  const search = params.toString();
  return search ? `${base}?${search}` : base;
}

export function isHubPath(path: string): boolean {
  return path === '/' || path === '/hub' || path === '/hub/';
}

// 허브 화면(목록 또는 폴더)
export function isHubUrl(url: string): boolean {
  return isHubPath(splitUrl(url).path);
}

export function isHubListUrl(url: string): boolean {
  const { path, params } = splitUrl(url);
  return isHubPath(path) && !params.get('folder');
}

export function isHubFolderUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const { path, params } = splitUrl(url);
  return isHubPath(path) && !!params.get('folder');
}

function isStudioPath(path: string): boolean {
  return path === '/editor' || path === '/editor/';
}

export function isStudioListUrl(url: string): boolean {
  const { path, params } = splitUrl(url);
  return isStudioPath(path) && !params.get('folder');
}

export function isStudioFolderUrl(url: string, folderId: string): boolean {
  const { path, params } = splitUrl(url);
  return isStudioPath(path) && params.get('folder') === folderId;
}

export function chapterUrl(chapterId: string | null, mapId: string | null = null): string {
  const params = new URLSearchParams();
  if (chapterId) params.set('ch', chapterId);
  if (chapterId && mapId) params.set('map', mapId);
  const search = params.toString();
  return search ? `/chapters?${search}` : '/chapters';
}

export function isChapterListUrl(url: string, chapterId: string | null): boolean {
  const { path, params } = splitUrl(url);
  return (path === '/chapters' || path === '/chapters/')
    && (params.get('ch') ?? null) === chapterId && !params.get('map');
}

// 맵 상세·못 찾음 화면의 '← 허브로'. 바로 앞이 허브(목록 또는 폴더)면 뒤로, 아니면 이 탭의
// 마지막 허브 목록(없으면 '/')으로 push.
export function backToHub(): void {
  goBack(tabUrl('hub', '/'), isHubUrl);
}

// ---------------------------------------------------------------- 허브 목록 캐시

// 허브·폴더 화면이 다시 마운트될 때 '불러오는 중…' 없이 바로 그리고, 뒤에서 새로 받는다
// (stale-while-revalidate). 상세에서 바꾼 상태·난이도·제목은 바로 고치고, 삭제·비공개는 뺀다.
export interface HubCache {
  maps: MapRow[];        // 공개 맵 전부 (단독 + 폴더 안)
  folders: FolderRow[];
  at: number;
}

let cache: HubCache | null = null;

export function getHubCache(): HubCache | null {
  return cache;
}

export function setHubCache(maps: MapRow[], folders: FolderRow[]): void {
  cache = { maps, folders, at: Date.now() };
}

export function getCachedMap(id: string): MapRow | null {
  return cache?.maps.find((m) => m.id === id) ?? null;
}

export function patchCachedMap(row: MapRow): void {
  if (!cache) return;
  if (!row.published) { removeCachedMap(row.id); return; }
  cache = { ...cache, maps: cache.maps.map((m) => (m.id === row.id ? row : m)) };
}

export function removeCachedMap(id: string): void {
  if (!cache) return;
  cache = { ...cache, maps: cache.maps.filter((m) => m.id !== id) };
}

// ---------------------------------------------------------------- 돌아오면 방금 연 카드에 초점

let lastOpened: string | null = null;

export function setLastOpenedMapId(id: string | null): void {
  lastOpened = id;
}

export function lastOpenedMapId(): string | null {
  return lastOpened;
}

// 그리드의 index 번째 카드에 초점을 준다(스크롤은 건드리지 않고). 카드가 .app-main 의 보이는
// 영역 밖이면 가장 가까운 쪽으로만 보이게 한다. 카드 구조(<button class=map-card> 또는
// <div class=map-card><button class=map-card-open>)를 가리지 않게 안쪽 버튼·링크를 찾는다.
export function focusGridItem(grid: HTMLElement | null, index: number): void {
  if (!grid || index < 0) return;
  const item = grid.children[index] as HTMLElement | undefined;
  if (!item) return;
  const target = item.matches('button, a[href], [tabindex]')
    ? item
    : item.querySelector<HTMLElement>('.map-card-open, a[href], button');
  if (!target) return;
  target.focus({ preventScroll: true });
  const main = item.closest<HTMLElement>('.app-main');
  if (!main) return;
  const box = item.getBoundingClientRect();
  const view = main.getBoundingClientRect();
  if (box.top < view.top || box.bottom > view.bottom) item.scrollIntoView({ block: 'nearest' });
}
