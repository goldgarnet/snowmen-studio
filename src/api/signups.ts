import { supabase } from '../lib/supabase';
import type { Profile } from './types';

// 가입 승인. 승인과 거절은 DB 함수가 luffy84 계정인지 확인한다.

export async function listPendingSignups(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('approved', false)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Profile[];
}

export async function approveSignup(id: string): Promise<void> {
  const { error } = await supabase.rpc('approve_signup', { p_user_id: id });
  if (error) throw new Error(error.message);
}

export async function rejectSignup(id: string): Promise<void> {
  const { error } = await supabase.rpc('reject_signup', { p_user_id: id });
  if (error) throw new Error(error.message);
}
