import { createClient, SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// The app must still render (with a friendly notice) when env vars are missing,
// e.g. before the operator has filled in .env. So the client is created lazily
// and `supabaseConfigured` gates any DB/auth calls.
export const supabaseConfigured = Boolean(url && anonKey);

// Usernames are turned into synthetic emails so we can use Supabase Auth (which
// requires an email) while users only ever type an id. This domain is never
// emailed to — "Confirm email" must be disabled in the Supabase dashboard.
export const EMAIL_DOMAIN = 'snowmen.local';
export const usernameToEmail = (username: string) =>
  `${username.trim().toLowerCase()}@${EMAIL_DOMAIN}`;

export const supabase: SupabaseClient = supabaseConfigured
  ? createClient(url!, anonKey!, {
      auth: {
        // Persist the session in localStorage and auto-refresh it → the user
        // stays logged in across browser restarts (자동 로그인).
        persistSession: true,
        autoRefreshToken: true,
        storageKey: 'snowmen-studio-auth',
      },
    })
  : // Dummy client that throws only if actually used while unconfigured.
    (new Proxy({}, {
      get() {
        throw new Error('Supabase가 설정되지 않았습니다. .env 파일을 확인하세요.');
      },
    }) as unknown as SupabaseClient);
