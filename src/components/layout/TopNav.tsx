import { useTheme } from '../../context/ThemeContext';
import './TopNav.css';

export type Tab = 'studio' | 'hub';

interface TopNavProps {
  tab: Tab;
  setTab: (t: Tab) => void;
  userName: string;
  onLogout: () => void;
}

export default function TopNav({ tab, setTab, userName, onLogout }: TopNavProps) {
  const { theme, toggle } = useTheme();
  return (
    <header className="topnav">
      <div className="topnav-brand">
        <div className="topnav-logo"><span>❄</span></div>
        <div className="topnav-name">Snowmen <span>Studio</span></div>
      </div>

      <nav className="topnav-tabs">
        <button className={tab === 'hub' ? 'active' : ''} onClick={() => setTab('hub')}>맵 허브</button>
        <button className={tab === 'studio' ? 'active' : ''} onClick={() => setTab('studio')}>맵 제작</button>
      </nav>

      <div className="topnav-user">
        <button
          className="topnav-theme"
          onClick={toggle}
          aria-label={theme === 'dark' ? '라이트 모드로' : '다크 모드로'}
          title={theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
        >
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
        <span className="topnav-username">👤 {userName}</span>
        <button className="btn btn-ghost btn-sm" onClick={onLogout}>로그아웃</button>
      </div>
    </header>
  );
}
