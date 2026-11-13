import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';
import { create } from 'zustand';

import { pendingChanges, useStore } from '@/store';
import { flushPersistence } from '@/store/persistence';

import { isBackendConfigured, openedFromRecoveryLink, supabase } from './supabase';
import { attachUser, syncNow } from './sync';

interface AuthState {
  /** False until the persisted session has been read on launch. */
  ready: boolean;
  session: Session | null;
  /** True while the first sync after sign-in is running. */
  restoring: boolean;
  /** The first sync after sign-in did not complete, so it is not yet known whether this account has a profile. */
  restoreFailed: boolean;
  /** The session ended without the user signing out here (expired, or signed out from another device). */
  sessionLost: boolean;
  /** The user arrived from a password-reset link and should choose a new password. */
  recovery: boolean;
  /**
   * Signing in was paused: this device holds this many changes from a different
   * account that were never backed up, and switching accounts would erase them.
   * Resolve with `confirmAccountSwitch()` or `cancelAccountSwitch()`.
   */
  switchBlocked: number | null;
}

export const useAuth = create<AuthState>(() => ({ ready: !isBackendConfigured, session: null, restoring: false, restoreFailed: false, sessionLost: false, recovery: false, switchBlocked: null }));

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
/** Set while this device is signing out on purpose, to tell that apart from a session that simply ended. */
let signingOut = false;

async function restore(userId: string, options: { discardOtherAccount?: boolean } = {}): Promise<void> {
  useAuth.setState({ restoring: true, restoreFailed: false, switchBlocked: null });
  const outcome = await attachUser(userId, options).catch(() => 'failed' as const);
  useAuth.setState({
    restoring: false,
    restoreFailed: outcome === 'failed',
    switchBlocked: outcome === 'blocked' ? pendingChanges(useStore.getState()) : null,
  });
}

/** The user chose to discard the other account's unsynced changes and continue signing in. */
export function confirmAccountSwitch(): Promise<void> {
  const userId = useAuth.getState().session?.user.id;
  return userId ? restore(userId, { discardOtherAccount: true }) : Promise.resolve();
}

/** The user chose to keep what is on the device: end the new session and leave the data untouched. */
export async function cancelAccountSwitch(): Promise<void> {
  if (supabase) {
    signingOut = true;
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } finally {
      signingOut = false;
    }
  }
  useAuth.setState({ session: null, switchBlocked: null, sessionLost: true });
}

/** Run the first sync again after it failed (offered on the sign-in screen). */
export function retryRestore(): Promise<void> {
  const userId = useAuth.getState().session?.user.id;
  return userId ? restore(userId) : Promise.resolve();
}

/** Read the stored session and keep the store in step with auth changes. Call once at startup. */
export function initAuth(): void {
  if (initialized || !supabase) return;
  initialized = true;
  supabase.auth.getSession().then(({ data }) => {
    useAuth.setState({ session: data.session, ready: true });
    if (data.session) void restore(data.session.user.id);
    // Local data belongs to an account but no session came back: it ended while the app was closed.
    else if (useStore.getState().ownerId) useAuth.setState({ sessionLost: true });
  });
  // The reset link may have been handled before this listener existed (see supabase.ts).
  if (openedFromRecoveryLink()) useAuth.setState({ recovery: true });
  supabase.auth.onAuthStateChange((event, session) => {
    useAuth.setState({ session });
    if (event === 'PASSWORD_RECOVERY') useAuth.setState({ recovery: true });
    if (event === 'SIGNED_IN' && session) {
      useAuth.setState({ sessionLost: false });
      // Deferred: Supabase forbids awaiting its own calls inside this callback.
      setTimeout(() => void restore(session.user.id), 0);
    }
    if (event === 'SIGNED_OUT' && !signingOut && useStore.getState().ownerId) {
      // Keep everything on the device, but stop pretending it is being backed up.
      useAuth.setState({ sessionLost: true });
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

/** Where the reset email should bring the user back to: this site on web, the app's own link on a phone. */
function resetRedirect(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') return `${window.location.origin}/auth?mode=reset`;
  return Linking.createURL('/auth', { queryParams: { mode: 'reset' } });
}

export async function sendPasswordReset(email: string): Promise<AuthResult> {
  if (!supabase) return { ok: false, message: 'Accounts are not set up for this build yet.' };
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: resetRedirect() });
  return error ? { ok: false, message: friendly(error.message) } : { ok: true };
}

/**
 * Finish a password reset. The reset link signs the user in with a short-lived
 * recovery session; this stores the password they chose.
 */
export async function updatePassword(password: string): Promise<AuthResult> {
  if (!supabase) return { ok: false, message: 'Accounts are not set up for this build yet.' };
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { ok: false, message: friendly(error.message) };
  useAuth.setState({ recovery: false });
  return { ok: true };
}

/**
 * On a phone the reset link opens the app with the recovery tokens in the URL
 * (the browser build reads them by itself). Returns true when the link was a
 * recovery link and the session was set.
 */
export async function handleAuthLink(url: string | null): Promise<boolean> {
  if (!supabase || !url || !/mode=reset/.test(url)) return false;
  const code = new URLSearchParams(url.split('?')[1]?.split('#')[0] ?? '').get('code');
  if (!code) return false;
  // The code only works together with the secret this device stored when it asked
  // for the reset, so a link opened anywhere else cannot sign anyone in.
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return false;
  useAuth.setState({ recovery: true });
  return true;
}

/**
 * Sign out of this device only. Pending changes are uploaded first; if they
 * cannot be (offline), the caller is told so nothing is thrown away silently.
 */
export async function signOut(options: { discardPending?: boolean } = {}): Promise<AuthResult> {
  if (supabase) {
    await syncNow().catch(() => {});
    const pending = pendingChanges(useStore.getState());
    if (pending > 0 && useAuth.getState().session && !options.discardPending) {
      return { ok: false, message: `${pending} ${pending === 1 ? 'change has' : 'changes have'} not been backed up yet. Connect to the internet and try again, or sign out anyway and lose them.` };
    }
    signingOut = true;
    try {
      // 'local' ends the session on this device even when the network is down,
      // and leaves the user's other devices signed in.
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error && useAuth.getState().session) return { ok: false, message: friendly(error.message) };
    } finally {
      signingOut = false;
    }
  }
  useAuth.setState({ session: null, sessionLost: false, restoreFailed: false, recovery: false, switchBlocked: null });
  useStore.getState().resetAll();
  await flushPersistence();
  return { ok: true };
}

/** Permanently delete the account and everything stored for it. */
export async function deleteAccount(): Promise<AuthResult> {
  if (supabase) {
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      const { error } = await supabase.rpc('delete_my_account');
      if (error) return { ok: false, message: friendly(error.message) };
      signingOut = true;
      try {
        await supabase.auth.signOut({ scope: 'local' });
      } finally {
        signingOut = false;
      }
    }
  }
  useAuth.setState({ session: null, sessionLost: false, restoreFailed: false, recovery: false });
  useStore.getState().resetAll();
  await flushPersistence();
  return { ok: true };
}

export function validateEmail(email: string): string | null {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim()) ? null : 'Enter a valid email address.';
}

export function validatePassword(password: string): string | null {
  return password.length >= 8 ? null : 'Use at least 8 characters.';
}
