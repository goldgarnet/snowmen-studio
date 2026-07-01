import { useState, useRef, useCallback } from 'react';
import { useAuth } from './context/AuthContext';
import { GuardContext, StudioApi } from './context/GuardContext';
import LoginScreen from './components/auth/LoginScreen';
import TopNav, { Tab } from './components/layout/TopNav';
import MapStudio from './components/studio/MapStudio';
import MapHub from './components/hub/MapHub';
import './App.css';

export default function App() {
  const { loading, session, profile, signOut } = useAuth();
  const [tab, setTab] = useState<Tab>('hub');

  const studioApiRef = useRef<StudioApi | null>(null);
  const [pending, setPending] = useState<(() => void) | null>(null);
  const [saving, setSaving] = useState(false);

  const register = useCallback((api: StudioApi | null) => { studioApiRef.current = api; }, []);
  const attempt = useCallback((proceed: () => void) => {
    if (studioApiRef.current?.isDirty()) setPending(() => proceed);
    else proceed();
  }, []);
  const guardedSetTab = useCallback((t: Tab) => attempt(() => setTab(t)), [attempt]);

  if (loading) return <div className="app-loading">불러오는 중…</div>;
  if (!session) return <LoginScreen />;
  if (!profile) return <div className="app-loading">프로필 준비 중…</div>;

  const runPending = () => { const p = pending; setPending(null); p?.(); };

  return (
    <GuardContext.Provider value={{ register, attempt }}>
      <div className="app">
        <TopNav tab={tab} setTab={guardedSetTab} userName={profile.name} onLogout={() => attempt(signOut)} />
        <main className="app-main">
          {tab === 'studio' ? <MapStudio /> : <MapHub />}
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
