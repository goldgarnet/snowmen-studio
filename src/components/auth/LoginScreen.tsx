import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import './LoginScreen.css';

export default function LoginScreen() {
  const { signIn, signUp, lastUsername, configured } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [username, setUsername] = useState(lastUsername);
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!username.trim() || !password) {
      setError('아이디와 비밀번호를 입력하세요.');
      return;
    }
    if (mode === 'signup' && !name.trim()) {
      setError('이름을 입력하세요.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'login') await signIn(username, password);
      else await signUp(username, password, name);
    } catch (err) {
      setError(err instanceof Error ? err.message : '오류가 발생했습니다.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-brand">
          <span className="login-logo">⛄</span>
          <h1>Snowmen Studio</h1>
          <p>팀 맵 제작 · 허브</p>
        </div>

        {!configured && (
          <div className="login-warn">
            Supabase가 아직 설정되지 않았습니다. <code>.env</code> 파일에 URL과 anon key를 입력한 뒤
            다시 시작하세요. (자세한 내용은 <code>DEPLOY.md</code>)
          </div>
        )}

        <div className="login-tabs">
          <button
            className={mode === 'login' ? 'active' : ''}
            onClick={() => { setMode('login'); setError(null); }}
            type="button"
          >
            로그인
          </button>
          <button
            className={mode === 'signup' ? 'active' : ''}
            onClick={() => { setMode('signup'); setError(null); }}
            type="button"
          >
            회원가입
          </button>
        </div>

        <form className="login-form" onSubmit={submit} autoComplete="on">
          <label className="field-label">
            아이디
            <input
              className="field-input"
              name="username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={busy || !configured}
              placeholder="아이디"
            />
          </label>
          {mode === 'signup' && (
            <label className="field-label">
              이름
              <input
                className="field-input"
                name="name"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={busy || !configured}
                placeholder="표시될 이름"
              />
            </label>
          )}
          <label className="field-label">
            비밀번호
            <input
              className="field-input"
              name="password"
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy || !configured}
              placeholder="비밀번호 (6자 이상)"
            />
          </label>

          {error && <div className="login-error">{error}</div>}

          <button className="btn btn-primary login-submit" type="submit" disabled={busy || !configured}>
            {busy ? '처리 중…' : mode === 'login' ? '로그인' : '가입하고 시작하기'}
          </button>
        </form>

        <p className="login-hint">
          {mode === 'login'
            ? '계정이 없나요? 위 회원가입 탭을 눌러 아이디·비밀번호·이름만으로 가입하세요.'
            : '팀 내부용입니다. 별도 이메일 인증 없이 바로 사용할 수 있어요.'}
        </p>
      </div>
    </div>
  );
}
