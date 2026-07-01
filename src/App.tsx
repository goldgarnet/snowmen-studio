import { useState } from 'react';
import { useAuth } from './context/AuthContext';
import LoginScreen from './components/auth/LoginScreen';
import TopNav, { Tab } from './components/layout/TopNav';
import MapStudio from './components/studio/MapStudio';
import MapHub from './components/hub/MapHub';
import './App.css';

export default function App() {
  const { loading, session, profile, signOut } = useAuth();
  const [tab, setTab] = useState<Tab>('studio');

  if (loading) return <div className="app-loading">불러오는 중…</div>;
  if (!session) return <LoginScreen />;
  if (!profile) return <div className="app-loading">프로필 준비 중…</div>;

  return (
    <div className="app">
      <TopNav tab={tab} setTab={setTab} userName={profile.name} onLogout={signOut} />
      <main className="app-main">
        {tab === 'studio' ? <MapStudio /> : <MapHub />}
      </main>
    </div>
  );
}
