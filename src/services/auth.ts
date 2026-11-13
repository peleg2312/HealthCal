import type { Session } from '@supabase/supabase-js';
import { create } from 'zustand';

import { useStore } from '@/store';

import { isBackendConfigured, supabase } from './supabase';
import { attachUser, syncNow } from './sync';

interface AuthState {
  /** False until the persisted session has been read on launch. */
  ready: boolean;
  session: Session | null;
  /** True while the first sync after sign-in is running. */
  restoring: boolean;
}

export const useAuth = create<AuthState>(() => ({ ready: !isBackendConfigured, session: null, restoring: false }));

export type AuthResult = { ok: true; needsEmailConfirmation?: boolean } | { ok: false; message: string };

/** Turn provider errors into something a person can act on. */
function friendly(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login')) return 'That email and password do not match. Check them and try again.';
  if (m.includes('already registered') || m.includes('already been registered')) return 'An account with this email already exists. Sign in instead.';
  if (m.includes('email not confirmed')) return 'Confirm your email first: open the link we sent you, then sign in.';
  if (m.includes('password') && m.includes('6')) return 'Use a password with at least 8 characters.';
  if (m.includes('rate limit')) return 'Too many attempts. Wait a minute and try again.';
  if (m.includes('network') || m.includes('fetch')) return 'No connection. Check your internet and try again.';
  return message;
}

let initialized = false;

/** Read the stored session and keep the store in step with auth changes. Call once at startup. */
export function initAuth(): void {
  if (initialized || !supabase) return;
  initialized = true;
  supabase.auth.getSession().then(({ data }) => {
    useAuth.setState({ session: data.session, ready: true });
    if (data.session) void attachUser(data.session.user.id);
  });
  supabase.auth.onAuthStateChange((event, session) => {
    useAuth.setState({ session });
    if (event === 'SIGNED_IN' && session) {
      useAuth.setState({ restoring: true });
      // Deferred: Supabase forbids awaiting its own calls inside this callback.
      setTimeout(() => {
        attachUser(session.user.id).finally(() => useAuth.setState({ restoring: false }));
      }, 0);
    }
  });
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  if (!supabase) return { ok: false, message: 'Accounts are not set up for this build yet.' };
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  return error ? { ok: false, message: friendly(error.message) } : { ok: true };
}

export async function signUp(email: string, password: string): Promise<AuthResult> {
  if (!supabase) return { ok: false, message: 'Accounts are not set up for this build yet.' };
  const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
  if (error) return { ok: false, message: friendly(error.message) };
  return { ok: true, needsEmailConfirmation: !data.session };
}

export async function sendPasswordReset(email: string): Promise<AuthResult> {
  if (!supabase) return { ok: false, message: 'Accounts are not set up for this build yet.' };
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
  return error ? { ok: false, message: friendly(error.message) } : { ok: true };
}

/** Sign out. Local data is removed so the next person on this device starts clean. */
export async function signOut(): Promise<void> {
  if (supabase) {
    // Upload anything still pending first, so signing out never loses entries.
    await syncNow().catch(() => {});
    await supabase.auth.signOut();
  }
  useStore.getState().resetAll();
}

/** Permanently delete the account and everything stored for it. */
export async function deleteAccount(): Promise<AuthResult> {
  if (supabase) {
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      const { error } = await supabase.rpc('delete_my_account');
      if (error) return { ok: false, message: friendly(error.message) };
      await supabase.auth.signOut();
    }
  }
  useStore.getState().resetAll();
  return { ok: true };
}

export function validateEmail(email: string): string | null {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim()) ? null : 'Enter a valid email address.';
}

export function validatePassword(password: string): string | null {
  return password.length >= 8 ? null : 'Use at least 8 characters.';
}
