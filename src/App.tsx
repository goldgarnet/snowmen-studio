import { useState, useRef, useCallback, useEffect } from 'react';
import { useAuth } from './context/AuthContext';
import { GuardContext, StudioApi } from './context/GuardContext';
import LoginScreen from './components/auth/LoginScreen';
import TopNav, { Tab } from './components/layout/TopNav';
import MapStudio from './components/studio/MapStudio';
import MapHub from './components/hub/MapHub';
import MapDetail from './components/hub/MapDetail';
import ChapterComposer from './components/chapters/ChapterComposer';
import TestWorkbench from './components/test/TestWorkbench';
import { getMap } from './api/maps';
import type { MapRow } from './api/types';
import './App.css';

type AppRoute =
  | { kind: 'hub' }
  | { kind: 'studio'; mapId?: string; play?: boolean; returnTo?: string }
  | { kind: 'chapters' }
  | { kind: 'test' }
  | { kind: 'map'; id: string; play?: boolean; returnTo?: string }
  | { kind: 'notFound'; pathname: string };

const tabPath: Record<Tab, string> = {
  hub: '/',
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
    return { kind: 'map', id, play: true, returnTo: readReturnTo(search, `/maps/${encodeURIComponent(id)}`) };
  }
  const mapMatch = pathname.match(/^\/maps\/([^/]+)\/?$/);
  if (mapMatch) return { kind: 'map', id: decodeURIComponent(mapMatch[1]) };
  return { kind: 'notFound', pathname };
}

function routePath(route: AppRoute): string {
  if (route.kind === 'studio') {
    const path = route.mapId ? `/editor/${encodeURIComponent(route.mapId)}` : '/editor';
    return route.play ? `${path}/play?${new URLSearchParams({ returnTo: route.returnTo ?? path })}` : path;
  }
  if (route.kind === 'chapters') return '/chapters';
  if (route.kind === 'test') return '/test';
  if (route.kind === 'map') {
    const path = `/maps/${encodeURIComponent(route.id)}`;
    return route.play ? `${path}/play?${new URLSearchParams({ returnTo: route.returnTo ?? path })}` : path;
  }
  if (route.kind === 'notFound') return route.pathname;
  return '/';
}

function MapRoute({
  id, onBack, onEditInStudio, recording, onStartRecording, onStopRecording,
}: {
  id: string;
  onBack: () => void;
  onEditInStudio: () => void;
  recording: boolean;
  onStartRecording: () => void;
  onStopRecording: () => void;
}) {
  const [map, setMap] = useState<MapRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    void getMap(id)
      .then((loaded) => { if (active) setMap(loaded); })
      .catch((error) => { console.error(error); if (active) setMap(null); })
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
        <button className="btn" onClick={onBack}>허브로</button>
      </div>
    );
  }

  return (
    <MapDetail
      key={map.id}
      map={map}
      onBack={onBack}
      onChanged={(updated) => { if (updated) setMap(updated); }}
      onEditInStudio={onEditInStudio}
      recording={recording}
      onStartRecording={onStartRecording}
      onStopRecording={onStopRecording}
    />
  );
}

function NotFoundRoute({ onBack }: { onBack: () => void }) {
  return (
    <div className="app-loading">
      <p>요청한 주소를 찾을 수 없습니다.</p>
      <button className="btn" onClick={onBack}>허브로</button>
    </div>
  );
}

function readLocationRoute(location: string): AppRoute {
  const url = new URL(location, window.location.origin);
  return readRoute(url.pathname, url.search);
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
      window.history[replace ? 'replaceState' : 'pushState']({}, '', nextPath);
    }
    setRoute(nextRoute);
  }, []);
  const guardedSetTab = useCallback((t: Tab) => {
    attempt(() => navigate(readRoute(tabPath[t])));
  }, [attempt, navigate]);

  useEffect(() => {
    const onPopState = () => setRoute(readRoute(window.location.pathname, window.location.search));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    const title = route.kind === 'studio'
      ? '맵 제작 | Snowmen Studio'
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

  if (loading) return <div className="app-loading">불러오는 중…</div>;
  if (!session) return <LoginScreen />;
  if (!profile) return <div className="app-loading">프로필 준비 중…</div>;

  const runPending = () => { const p = pending; setPending(null); p?.(); };
  const tab: Tab = route.kind === 'studio' ? 'studio' : route.kind === 'chapters' ? 'chapters' : 'hub';
  const content = route.kind === 'studio'
    ? <MapStudio
        editMapId={route.mapId}
        playing={Boolean(route.play)}
        onEditRouteChange={(mapId) => navigate(mapId ? { kind: 'studio', mapId } : { kind: 'studio' })}
        onPlayRouteChange={(mapId) => {
          const returnTo = routePath({ kind: 'studio', mapId: mapId ?? route.mapId });
          navigate({ kind: 'studio', mapId: mapId ?? route.mapId, play: true, returnTo });
        }}
        onExitPlay={() => navigate(readLocationRoute(route.returnTo ?? routePath({ kind: 'studio', mapId: route.mapId })))}
      />
    : route.kind === 'chapters'
      ? <ChapterComposer
          onStartMapRecording={(mapId) => {
            const returnTo = routePath({ kind: 'chapters' });
            navigate({ kind: 'map', id: mapId, play: true, returnTo });
          }}
        />
      : route.kind === 'test'
        ? <TestWorkbench />
      : route.kind === 'map'
        ? <MapRoute
            key={route.id}
            id={route.id}
            onBack={() => navigate({ kind: 'hub' })}
            onEditInStudio={() => navigate({ kind: 'studio', mapId: route.id })}
            recording={Boolean(route.play)}
            onStartRecording={() => {
              const returnTo = routePath({ kind: 'map', id: route.id });
              navigate({ kind: 'map', id: route.id, play: true, returnTo });
            }}
            onStopRecording={() => navigate(readLocationRoute(route.returnTo ?? routePath({ kind: 'map', id: route.id })))}
          />
        : route.kind === 'notFound'
          ? <NotFoundRoute onBack={() => navigate({ kind: 'hub' })} />
          : <MapHub onOpenMap={(map) => navigate({ kind: 'map', id: map.id })} />;

  return (
    <GuardContext.Provider value={{ register, attempt }}>
      <div className="app">
        <TopNav tab={tab} setTab={guardedSetTab} userName={profile.name} onLogout={() => attempt(signOut)} />
        <main className="app-main">
          {content}
        </main>
      </div>

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
