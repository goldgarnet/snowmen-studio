import './TopNav.css';

export type Tab = 'studio' | 'hub';

interface TopNavProps {
  tab: Tab;
  setTab: (t: Tab) => void;
  userName: string;
  onLogout: () => void;
}

export default function TopNav({ tab, setTab, userName, onLogout }: TopNavProps) {
  return (
    <header className="topnav">
      <div className="topnav-brand">
        <div className="topnav-logo">❄</div>
        <div className="topnav-name">Snowmen <span>Studio</span></div>
      </div>

      <nav className="topnav-tabs">
        <button className={tab === 'studio' ? 'active' : ''} onClick={() => setTab('studio')}>맵 제작</button>
        <button className={tab === 'hub' ? 'active' : ''} onClick={() => setTab('hub')}>맵 허브</button>
      </nav>

      <div className="topnav-user">
        <span className="topnav-username">👤 {userName}</span>
        <button className="btn btn-ghost btn-sm" onClick={onLogout}>로그아웃</button>
      </div>
    </header>
  );
}
