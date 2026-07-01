import {
  createContext, useContext, useEffect, useState, useCallback, ReactNode,
} from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, supabaseConfigured, usernameToEmail } from '../lib/supabase';
import type { Profile } from '../api/types';

const LAST_USERNAME_KEY = 'snowmen-studio-last-username';

interface AuthValue {
  configured: boolean;
  loading: boolean;
  session: Session | null;
  profile: Profile | null;
  lastUsername: string;
  signUp: (username: string, password: string, name: string) => Promise<void>;
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

// Turn Supabase auth errors into short Korean messages.
function friendlyError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('already registered') || m.includes('already been registered')) return '이미 사용 중인 아이디입니다.';
  if (m.includes('invalid login credentials')) return '아이디 또는 비밀번호가 올바르지 않습니다.';
  if (m.includes('password should be at least')) return '비밀번호는 최소 6자 이상이어야 합니다.';
  if (m.includes('email not confirmed')) return '이메일 확인이 켜져 있습니다. Supabase에서 "Confirm email"을 꺼주세요.';
  return message;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(supabaseConfigured);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [lastUsername, setLastUsername] = useState<string>(
    () => localStorage.getItem(LAST_USERNAME_KEY) ?? '',
  );

  const loadProfile = useCallback(async (uid: string, session: Session) => {
    const { data } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle();
    if (data) {
      setProfile(data as Profile);
      return;
    }
    // Profile row missing (e.g. insert failed right after signup) — recreate it
    // from the auth user metadata so the account remains usable.
    const meta = session.user.user_metadata ?? {};
    const username = (meta.username as string) ?? session.user.email?.split('@')[0] ?? 'user';
    const name = (meta.name as string) ?? username;
    const { data: created } = await supabase
      .from('profiles')
      .insert({ id: uid, username, name })
      .select()
      .maybeSingle();
    if (created) setProfile(created as Profile);
  }, []);

  useEffect(() => {
    if (!supabaseConfigured) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      if (data.session) loadProfile(data.session.user.id, data.session).finally(() => setLoading(false));
      else setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s) loadProfile(s.user.id, s);
      else setProfile(null);
    });
    return () => sub.subscription.unsubscribe();
  }, [loadProfile]);

  const rememberUsername = (username: string) => {
    const u = username.trim();
    localStorage.setItem(LAST_USERNAME_KEY, u);
    setLastUsername(u);
  };

  const signUp = useCallback(async (username: string, password: string, name: string) => {
    const u = username.trim();
    const { data, error } = await supabase.auth.signUp({
      email: usernameToEmail(u),
      password,
      options: { data: { username: u, name: name.trim() } },
    });
    if (error) throw new Error(friendlyError(error.message));
    const uid = data.user?.id;
    if (uid) {
      await supabase.from('profiles').upsert({ id: uid, username: u, name: name.trim() });
    }
    rememberUsername(u);
  }, []);

  const signIn = useCallback(async (username: string, password: string) => {
    const u = username.trim();
    const { error } = await supabase.auth.signInWithPassword({
      email: usernameToEmail(u),
      password,
    });
    if (error) throw new Error(friendlyError(error.message));
    rememberUsername(u);
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        configured: supabaseConfigured,
        loading,
        session,
        profile,
        lastUsername,
        signUp,
        signIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
