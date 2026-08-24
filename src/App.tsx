import { useState, useRef, useCallback, useEffect } from 'react';
import { useAuth } from './context/AuthContext';
import { GuardContext, StudioApi } from './context/GuardContext';
import LoginScreen from './components/auth/LoginScreen';
import TopNav, { Tab } from './components/layout/TopNav';
import MapStudio from './components/studio/MapStudio';
import MapHub from './components/hub/MapHub';
import MapDetail from './components/hub/MapDetail';
import ChapterComposer from './components/chapters/ChapterComposer';
import { getMap } from './api/maps';
import type { MapRow } from './api/types';
import './App.css';

type AppRoute =
  | { kind: 'hub' }
  | { kind: 'studio' }
  | { kind: 'chapters' }
  | { kind: 'map'; id: string }
  | { kind: 'notFound'; pathname: string };

const tabPath: Record<Tab, string> = {
  hub: '/',
  studio: '/editor',
  chapters: '/chapters',
};

function readRoute(pathname: string): AppRoute {
  if (pathname === '/' || pathname === '/hub' || pathname === '/hub/') return { kind: 'hub' };
  if (pathname === '/editor' || pathname === '/editor/') return { kind: 'studio' };
  if (pathname === '/chapters' || pathname === '/chapters/') return { kind: 'chapters' };
  const mapMatch = pathname.match(/^\/maps\/([^/]+)\/?$/);
  if (mapMatch) return { kind: 'map', id: decodeURIComponent(mapMatch[1]) };
  return { kind: 'notFound', pathname };
}

function routePath(route: AppRoute): string {
  if (route.kind === 'studio') return '/editor';
  if (route.kind === 'chapters') return '/chapters';
  if (route.kind === 'map') return `/maps/${encodeURIComponent(route.id)}`;
  if (route.kind === 'notFound') return route.pathname;
  return '/';
}

function MapRoute({ id, onBack }: { id: string; onBack: () => void }) {
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
      onPlay={() => undefined}
      onChanged={(updated) => { if (updated) setMap(updated); }}
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

export default function App() {
  const { loading, session, profile, signOut } = useAuth();
  const [route, setRoute] = useState<AppRoute>(() => readRoute(window.location.pathname));

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
    if (window.location.pathname !== nextPath) {
      window.history[replace ? 'replaceState' : 'pushState']({}, '', nextPath);
    }
    setRoute(nextRoute);
  }, []);
  const guardedSetTab = useCallback((t: Tab) => {
    attempt(() => navigate(readRoute(tabPath[t])));
  }, [attempt, navigate]);

  useEffect(() => {
    const onPopState = () => setRoute(readRoute(window.location.pathname));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    const title = route.kind === 'studio'
      ? '맵 제작 | Snowmen Studio'
      : route.kind === 'chapters'
        ? '챕터 구성 | Snowmen Studio'
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
    ? <MapStudio />
    : route.kind === 'chapters'
      ? <ChapterComposer />
      : route.kind === 'map'
        ? <MapRoute key={route.id} id={route.id} onBack={() => navigate({ kind: 'hub' })} />
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
              <button className="btn" disabled={saving} onClick={runPending}>저장 안 함</button>
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
