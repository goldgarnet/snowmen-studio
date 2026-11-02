import { useState, useRef, useCallback, useEffect } from 'react';
import { useAuth } from './context/AuthContext';
import { GuardContext, StudioApi } from './context/GuardContext';
import ClearsProvider from './context/ClearsProvider';
import LoginScreen from './components/auth/LoginScreen';
import TopNav, { Tab } from './components/layout/TopNav';
import MapStudio from './components/studio/MapStudio';
import MapHub from './components/hub/MapHub';
import MapDetail from './components/hub/MapDetail';
import ChapterComposer from './components/chapters/ChapterComposer';
import SolvedBoard from './components/solved/SolvedBoard';
import TestWorkbench from './components/test/TestWorkbench';
import { getMap } from './api/maps';
import type { MapRow } from './api/types';
import * as nav from './lib/nav';
import { backToHub, getCachedMap, splitUrl } from './lib/hubState';
import { useEscapeKey } from './lib/useEscapeKey';
import './App.css';

// 맵 상세를 '푼 맵 현황'에서 열었으면 from = 'solved' (주소 ?from=solved) — 뒤로가기가 현황으로 돌아간다.
type MapFrom = 'solved';

type AppRoute =
  | { kind: 'hub' }
  | { kind: 'solved' }
  | { kind: 'studio'; mapId?: string; play?: boolean; returnTo?: string }
  | { kind: 'chapters' }
  | { kind: 'test' }
  | { kind: 'map'; id: string; play?: boolean; returnTo?: string; from?: MapFrom }
  | { kind: 'notFound'; pathname: string };

const tabPath: Record<Tab, string> = {
  hub: '/',
  solved: '/solved',
  studio: '/editor',
  chapters: '/chapters',
};

function readReturnTo(search: string, fallback: string): string {
  const returnTo = new URLSearchParams(search).get('returnTo');
  if (!returnTo) return fallback;
  // Only an in-app absolute path is allowed, so a crafted URL cannot turn the
  // recorder's exit button into an external redirect.
  try {
    const url = new URL(returnTo, window.location.origin);
    return returnTo.startsWith('/') && url.origin === window.location.origin
      ? `${url.pathname}${url.search}`
      : fallback;
  } catch {
    return fallback;
  }
}

function readRoute(pathname: string, search = ''): AppRoute {
  if (pathname === '/' || pathname === '/hub' || pathname === '/hub/') return { kind: 'hub' };
  if (pathname === '/solved' || pathname === '/solved/') return { kind: 'solved' };
  if (pathname === '/editor' || pathname === '/editor/') return { kind: 'studio' };
  if (pathname === '/editor/play' || pathname === '/editor/play/') {
    return { kind: 'studio', play: true, returnTo: readReturnTo(search, '/editor') };
  }
  const editorPlayMatch = pathname.match(/^\/editor\/([^/]+)\/play\/?$/);
  if (editorPlayMatch) {
    const mapId = decodeURIComponent(editorPlayMatch[1]);
    return { kind: 'studio', mapId, play: true, returnTo: readReturnTo(search, `/editor/${encodeURIComponent(mapId)}`) };
  }
  const editorMatch = pathname.match(/^\/editor\/([^/]+)\/?$/);
  if (editorMatch) return { kind: 'studio', mapId: decodeURIComponent(editorMatch[1]) };
  if (pathname === '/chapters' || pathname === '/chapters/') return { kind: 'chapters' };
  if (pathname === '/test' || pathname === '/test/') return { kind: 'test' };
  const mapPlayMatch = pathname.match(/^\/maps\/([^/]+)\/play\/?$/);
  if (mapPlayMatch) {
    const id = decodeURIComponent(mapPlayMatch[1]);
    const returnTo = readReturnTo(search, `/maps/${encodeURIComponent(id)}`);
    // 현황판에서 연 상세에서 들어온 플레이면 returnTo 에 ?from=solved 가 있다.
    const fromSolved = new URLSearchParams(returnTo.split('?')[1] ?? '').get('from') === 'solved';
    return fromSolved ? { kind: 'map', id, play: true, returnTo, from: 'solved' } : { kind: 'map', id, play: true, returnTo };
  }
  const mapMatch = pathname.match(/^\/maps\/([^/]+)\/?$/);
  if (mapMatch) {
    const id = decodeURIComponent(mapMatch[1]);
    return new URLSearchParams(search).get('from') === 'solved' ? { kind: 'map', id, from: 'solved' } : { kind: 'map', id };
  }
  return { kind: 'notFound', pathname };
}

function routePath(route: AppRoute): string {
  if (route.kind === 'studio') {
    const path = route.mapId ? `/editor/${encodeURIComponent(route.mapId)}` : '/editor';
    return route.play ? `${path}/play?${new URLSearchParams({ returnTo: route.returnTo ?? path })}` : path;
  }
  if (route.kind === 'solved') return '/solved';
  if (route.kind === 'chapters') return '/chapters';
  if (route.kind === 'test') return '/test';
  if (route.kind === 'map') {
    const path = `/maps/${encodeURIComponent(route.id)}`;
    if (route.play) return `${path}/play?${new URLSearchParams({ returnTo: route.returnTo ?? path })}`;
    return route.from ? `${path}?${new URLSearchParams({ from: route.from })}` : path;
  }
  if (route.kind === 'notFound') return route.pathname;
  return '/';
}

function MapRoute({
  id, onBack, backLabel, onEditInStudio, recording, onStartRecording, onStopRecording,
}: {
  id: string;
  onBack: () => void;
  backLabel?: string;   // 뒤로가기 버튼 문구 (없으면 허브로)
  onEditInStudio: () => void;
  recording: boolean;
  onStartRecording: () => void;
  onStopRecording: () => void;
}) {
  // 허브에서 연 맵은 목록 캐시의 행으로 바로 그리고, 아래 getMap 응답으로 갱신한다.
  const [map, setMap] = useState<MapRow | null>(() => getCachedMap(id));
  const [loading, setLoading] = useState(() => !getCachedMap(id));
  // 응답을 기다리는 동안 상세에서 바꾼 값(상태·난이도·수정)이 있으면 늦게 온 응답으로 되돌리지 않는다.
  // 조회가 실패하면 캐시로 그린 상세는 그대로 둔다(캐시가 없으면 아래 '찾을 수 없음').
  const mapRef = useRef(map);
  useEffect(() => { mapRef.current = map; });

  useEffect(() => {
    let active = true;
    const requested = mapRef.current;
    void getMap(id)
      .then((loaded) => { if (active && mapRef.current === requested) setMap(loaded); })
      .catch((error) => { console.error(error); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);

  useEffect(() => {
    if (map) document.title = `${map.title || '제목 없음'} | Snowmen Studio`;
  }, [map]);

  if (loading) return <div className="app-loading">맵을 불러오는 중…</div>;
  if (!map) {
    return (
      <div className="app-loading">
        <p>맵을 찾을 수 없거나 접근 권한이 없습니다.</p>
        <button className="btn" onClick={onBack}>{backLabel ?? '허브로'}</button>
      </div>
    );
  }

  return (
    <MapDetail
      key={map.id}
      map={map}
      onBack={onBack}
      backLabel={backLabel}
      onChanged={(updated) => { if (updated) setMap(updated); }}
      onEditInStudio={onEditInStudio}
      recording={recording}
      onStartRecording={onStartRecording}
      onStopRecording={onStopRecording}
    />
  );
}

// '푼 맵 현황'에서 연 상세의 뒤로가기 — 바로 앞 기록이 현황판이면 진짜 뒤로(보던 조건·스크롤 그대로),
// 주소로 바로 들어왔으면 현황판으로 이동한다. 허브의 backToHub 와 같은 규칙.
function backToSolved(): void {
  nav.goBack(nav.tabUrl('solved', '/solved'), (from) => splitUrl(from).path.replace(/\/$/, '') === '/solved');
}

function NotFoundRoute({ onBack }: { onBack: () => void }) {
  return (
    <div className="app-loading">
      <p>요청한 주소를 찾을 수 없습니다.</p>
      <button className="btn" onClick={onBack}>허브로</button>
    </div>
  );
}

export default function App() {
  const { loading, session, profile, signOut } = useAuth();
  const [route, setRoute] = useState<AppRoute>(() => readRoute(window.location.pathname, window.location.search));

  const studioApiRef = useRef<StudioApi | null>(null);
  const [pending, setPending] = useState<(() => void) | null>(null);
  const [saving, setSaving] = useState(false);

  const register = useCallback((api: StudioApi | null) => { studioApiRef.current = api; }, []);
  const attempt = useCallback((proceed: () => void) => {
    if (studioApiRef.current?.isDirty()) setPending(() => proceed);
    else proceed();
  }, []);
  const navigate = useCallback((nextRoute: AppRoute, replace = false) => {
    const nextPath = routePath(nextRoute);
    if (`${window.location.pathname}${window.location.search}` !== nextPath) {
      // 뒤로 가는 중(두 번 누름)이라 주소를 못 바꿨으면 화면도 그대로 둔다.
      if (!nav.go(nextPath, { replace })) return;
    }
    setRoute(nextRoute);
  }, []);
  const guardedSetTab = useCallback((t: Tab) => {
    attempt(() => nav.goTab(t, tabPath[t]));
  }, [attempt]);

  useEffect(() => {
    // 뒤로/앞으로(popstate)와 화면이 직접 바꾼 주소(nav) 모두 화면을 따른다. 주소가 바뀌면
    // 떠 있던 '저장하지 않은 변경사항' 창은 닫는다(언마운트된 스튜디오로 저장하지 않게).
    let lastUrl = nav.currentUrl();
    const onLocation = () => {
      setRoute(readRoute(window.location.pathname, window.location.search));
      const url = nav.currentUrl();
      if (url !== lastUrl) { lastUrl = url; setPending(null); }
    };
    window.addEventListener('popstate', onLocation);
    window.addEventListener(nav.LOCATION_EVENT, onLocation);
    return () => {
      window.removeEventListener('popstate', onLocation);
      window.removeEventListener(nav.LOCATION_EVENT, onLocation);
    };
  }, []);

  useEffect(() => {
    const title = route.kind === 'studio'
      ? '맵 제작 | Snowmen Studio'
      : route.kind === 'solved'
        ? '푼 맵 현황 | Snowmen Studio'
      : route.kind === 'chapters'
      ? '챕터 구성 | Snowmen Studio'
        : route.kind === 'test'
          ? '엔진 테스트 | Snowmen Studio'
      : route.kind === 'map'
          ? '맵 | Snowmen Studio'
          : route.kind === 'notFound'
            ? '페이지를 찾을 수 없음 | Snowmen Studio'
            : '맵 허브 | Snowmen Studio';
    document.title = title;
  }, [route]);

  useEscapeKey(() => { if (!saving) setPending(null); }, Boolean(pending));

  if (loading) return <div className="app-loading">불러오는 중…</div>;
  if (!session) return <LoginScreen />;
  if (!profile) return <div className="app-loading">프로필 준비 중…</div>;

  const runPending = () => { const p = pending; setPending(null); p?.(); };
  const tab: Tab = route.kind === 'studio' ? 'studio'
    : route.kind === 'chapters' ? 'chapters'
      : route.kind === 'solved' || (route.kind === 'map' && route.from === 'solved') ? 'solved'
        : 'hub';
  const content = route.kind === 'studio'
    ? <MapStudio
        editMapId={route.mapId}
        playing={Boolean(route.play)}
        onEditRouteChange={(mapId, options) => navigate(mapId ? { kind: 'studio', mapId } : { kind: 'studio' }, options?.replace)}
        onPlayRouteChange={(mapId) => {
          const returnTo = nav.currentUrl();
          navigate({ kind: 'studio', mapId: mapId ?? 'new', play: true, returnTo });
        }}
        onExitPlay={() => nav.exitTo(route.returnTo ?? routePath({ kind: 'studio', mapId: route.mapId }))}
      />
    : route.kind === 'chapters'
      ? <ChapterComposer
          onStartMapRecording={(mapId) => {
            const returnTo = nav.currentUrl();
            navigate({ kind: 'map', id: mapId, play: true, returnTo });
          }}
        />
      : route.kind === 'test'
        ? <TestWorkbench />
      : route.kind === 'solved'
        ? <SolvedBoard
            myUserId={profile.id}
            mapHref={(id) => routePath({ kind: 'map', id, from: 'solved' })}
            onOpenMap={(id) => navigate({ kind: 'map', id, from: 'solved' })}
          />
      : route.kind === 'map'
        ? <MapRoute
            key={route.id}
            id={route.id}
            onBack={route.from === 'solved' ? backToSolved : backToHub}
            backLabel={route.from === 'solved' ? '← 푼 맵 현황으로' : undefined}
            onEditInStudio={() => navigate({ kind: 'studio', mapId: route.id })}
            recording={Boolean(route.play)}
            onStartRecording={() => {
              // 지금 주소(?from=solved 포함)로 돌아온다 — 플레이 주소의 returnTo 에서 from 을 다시 읽는다.
              const returnTo = nav.currentUrl();
              navigate({ kind: 'map', id: route.id, play: true, returnTo, from: route.from });
            }}
            onStopRecording={() => nav.exitTo(route.returnTo ?? routePath({ kind: 'map', id: route.id }))}
          />
        : route.kind === 'notFound'
          ? <NotFoundRoute onBack={backToHub} />
          : <MapHub onOpenMap={(map) => navigate({ kind: 'map', id: map.id })} />;

  return (
    <GuardContext.Provider value={{ register, attempt }}>
      {/* '풀었어요' 체크 상태 — 허브 카드와 맵 상세가 같이 본다. 계정이 바뀌면 새로 읽는다. */}
      <ClearsProvider key={profile.id} userId={profile.id}>
        <div className="app">
          <TopNav tab={tab} setTab={guardedSetTab} userName={profile.name} onLogout={() => attempt(signOut)} />
          <main className="app-main">
            {content}
          </main>
        </div>
      </ClearsProvider>

      {pending && (
        <div className="modal-backdrop" onClick={() => !saving && setPending(null)}>
          <div className="modal unsaved-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">저장하지 않은 변경사항</h3>
            <p className="unsaved-text">
              제작 중인 맵에 저장하지 않은 변경사항이 있어요. 저장할까요?
            </p>
            <div className="modal-actions">
              <button className="btn btn-ghost" disabled={saving} onClick={() => setPending(null)}>취소</button>
              <button
                className="btn"
                disabled={saving}
                onClick={() => { studioApiRef.current?.discard(); runPending(); }}
              >저장 안 함</button>
              <button
                className="btn btn-primary"
                disabled={saving}
                onClick={async () => {
                  setSaving(true);
                  try { await studioApiRef.current?.save(); }
                  catch (e) { alert('저장 실패: ' + (e as Error).message); setSaving(false); return; }
                  setSaving(false);
                  runPending();
                }}
              >
                {saving ? '저장 중…' : '저장 후 이동'}
              </button>
            </div>
          </div>
        </div>
      )}
    </GuardContext.Provider>
  );
}
