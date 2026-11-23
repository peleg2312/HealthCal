/**
 * Where a question goes: the coach-chat edge function of this build's backend, with the signed-in
 * session. No backend, or nobody signed in: null, and the chat says the AI coach needs an account
 * (there is no sample mode: the coach never makes up an answer).
 */
import { FUNCTIONS_URL, isBackendConfigured, SUPABASE_ANON_KEY, supabase } from '@/services/supabase';

import type { CoachConnection } from './request';

export async function coachConnection(): Promise<CoachConnection | null> {
  if (!isBackendConfigured || !supabase) return null;
  let token: string | null = null;
  try {
    token = (await supabase.auth.getSession()).data.session?.access_token ?? null;
  } catch {
    token = null;
  }
  if (!token) return null;
  return { functionsUrl: FUNCTIONS_URL, accessToken: token, anonKey: SUPABASE_ANON_KEY };
}
