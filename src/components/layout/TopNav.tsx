import { useEffect, useRef } from 'react';
import { useTheme } from '../../context/ThemeContext';
import './TopNav.css';

export type Tab = 'studio' | 'hub' | 'solved' | 'chapters' | 'design';

interface TopNavProps {
  tab: Tab;
  setTab: (t: Tab) => void;
  userName: string;
  onLogout: () => void;
}

export default function TopNav({ tab, setTab, userName, onLogout }: TopNavProps) {
  const { theme, toggle } = useTheme();
  const tabsRef = useRef<HTMLElement>(null);

  // 좁은 화면에서 탭 줄이 가로로 밀려 있으면 지금 탭이 보이게 한다 (다 들어가면 아무 일 없음).
  useEffect(() => {
    const nav = tabsRef.current;
    if (!nav || nav.scrollWidth <= nav.clientWidth) return;
    nav.querySelector('button.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [tab]);

  return (
    <header className="topnav">
      <div className="topnav-brand">
        <div className="topnav-logo"><span>❄</span></div>
        <div className="topnav-name">Snowmen <span>Studio</span></div>
      </div>

      <nav className="topnav-tabs" ref={tabsRef}>
        <button className={tab === 'hub' ? 'active' : ''} onClick={() => setTab('hub')}>맵 허브</button>
        <button className={tab === 'solved' ? 'active' : ''} onClick={() => setTab('solved')}>푼 맵 현황</button>
        <button className={tab === 'studio' ? 'active' : ''} onClick={() => setTab('studio')}>맵 제작</button>
        <button className={tab === 'chapters' ? 'active' : ''} onClick={() => setTab('chapters')}>챕터 구성</button>
        <button className={tab === 'design' ? 'active' : ''} onClick={() => setTab('design')}>디자인 작업</button>
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
