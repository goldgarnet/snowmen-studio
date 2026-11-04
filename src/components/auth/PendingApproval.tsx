import { useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import './LoginScreen.css';

// 승인 전 계정이 보는 화면. 승인되면 다시 읽기로 알아채고 바로 들어간다.
export default function PendingApproval() {
  const { profile, refreshProfile, signOut } = useAuth();

  useEffect(() => {
    const check = () => { void refreshProfile(); };
    const timer = window.setInterval(check, 10_000);
    window.addEventListener('focus', check);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', check);
    };
  }, [refreshProfile]);

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-brand">
          <span className="login-logo">⛄</span>
          <h1>Snowmen Studio</h1>
        </div>
        <div className="login-wait" role="status">
          <h2>가입 승인을 기다리고 있습니다</h2>
          <p><b>{profile?.name}</b> ({profile?.username}) 계정의 가입 신청이 접수되었습니다.</p>
          <p>김정훈 님이 승인하면 이 화면에서 바로 시작됩니다.</p>
        </div>
        <button className="btn btn-ghost login-submit" type="button" onClick={() => void signOut()}>로그아웃</button>
      </div>
    </div>
  );
}
