/**
 * An invite code kept on this device while its owner creates an account.
 *
 * Someone without an account who opens an invite link and taps "Create a free
 * account" would otherwise lose the code: sign-up leads to setup and then to
 * Today. The code is kept here (this phone only, never synced) and, once they
 * are signed in and through setup, /friends/add opens with it filled in, once.
 * It is cleared when it is used and forgotten after 7 days.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import { isCompleteCode, normalizeCode } from './summary';

export const PENDING_INVITE_KEY = 'healthcal-pending-invite';
export const PENDING_INVITE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type PendingInvite = { code: string; savedAt: number };

/** The stored value, if it is a real code saved less than 7 days ago; otherwise null. */
export function readPendingInvite(raw: string | null, now: number): PendingInvite | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<PendingInvite>;
    const code = normalizeCode(typeof v.code === 'string' ? v.code : '');
    const savedAt = typeof v.savedAt === 'number' ? v.savedAt : NaN;
    if (!isCompleteCode(code) || !Number.isFinite(savedAt)) return null;
    // A clock set back by more than a minute makes the age meaningless: treat it as stale.
    if (now - savedAt > PENDING_INVITE_MAX_AGE_MS || savedAt - now > 60_000) return null;
    return { code, savedAt };
  } catch {
    return null;
  }
}

/** Screens a person is still finishing sign-up or setup on: the invite waits until they have left them. */
const NOT_YET = ['/auth', '/onboarding', '/welcome'];

/** Whether to open /friends/add with the kept code now. */
export function shouldOpenPendingInvite(s: { code: string | null; signedIn: boolean; onboarded: boolean; pathname: string }): boolean {
  if (!s.code || !s.signedIn || !s.onboarded) return false;
  if (s.pathname.startsWith('/friends/add')) return false;
  return !NOT_YET.some((p) => s.pathname === p || s.pathname.startsWith(`${p}/`));
}

type State = { loaded: boolean; invite: PendingInvite | null };
export const usePendingInviteStore = create<State>(() => ({ loaded: false, invite: null }));

let loading: Promise<void> | null = null;
/** Read the kept code from the device once; a stale or broken value is removed. */
export function loadPendingInvite(now = Date.now()): Promise<void> {
  if (!loading) {
    loading = (async () => {
      let raw: string | null = null;
      try {
        raw = await AsyncStorage.getItem(PENDING_INVITE_KEY);
      } catch {
        raw = null;
      }
      const invite = readPendingInvite(raw, now);
      // Something saved meanwhile (the person tapped the button while this was reading) wins.
      if (!usePendingInviteStore.getState().loaded) usePendingInviteStore.setState({ loaded: true, invite });
      if (raw && !invite) await AsyncStorage.removeItem(PENDING_INVITE_KEY).catch(() => {});
    })();
  }
  return loading;
}

/** Keep a code until its owner has an account. Not a complete code: nothing is kept. */
export async function savePendingInvite(code: string, now = Date.now()): Promise<void> {
  const c = normalizeCode(code);
  if (!isCompleteCode(c)) return;
  const invite = { code: c, savedAt: now };
  usePendingInviteStore.setState({ loaded: true, invite });
  await AsyncStorage.setItem(PENDING_INVITE_KEY, JSON.stringify(invite)).catch(() => {});
}

/** The code has been used (or is no longer wanted). */
export async function clearPendingInvite(): Promise<void> {
  usePendingInviteStore.setState({ loaded: true, invite: null });
  await AsyncStorage.removeItem(PENDING_INVITE_KEY).catch(() => {});
}

/** Only for tests: forget what was read so the next load reads the device again. */
export function resetPendingInviteForTests(): void {
  loading = null;
  usePendingInviteStore.setState({ loaded: false, invite: null });
}
