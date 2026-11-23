/**
 * Is "Continue with Google" on? The backend says so itself: GET <project>/auth/v1/settings answers
 * `external.google: true` once the owner switches the Google provider on in Supabase, so the button
 * appears with no release. Asked once a launch; the last answer is kept on this device under its own
 * key, so the button shows at once next time and offline. With no answer yet and nothing kept, the
 * button is not shown (a dead Google page would strand the person).
 *
 * The button never moves what is already on screen. A screen that offers it waits to draw the part
 * it sits in until the answer is known (`googleSettled`: the kept value or the fresh answer, or
 * `GOOGLE_SETTLE_CAP_MS` after the first ask, or both reads over with nothing), then decides once
 * for that visit (`useGoogleChoice`): an answer that arrives later shows on the next visit only.
 * On a tap, while this launch has no fresh answer yet, the setting is asked again
 * (`checkGoogleBeforeTap`, 2 s): Google switched off since is said, not opened.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useState } from 'react';
import { create } from 'zustand';

import { FUNCTIONS_URL, SUPABASE_ANON_KEY, isBackendConfigured } from '@/services/supabase';

/** This device's last answer: '1' on, '0' off. Never synced, never in the export. */
export const GOOGLE_SETTING_KEY = 'healthcal.googleSignIn';

/** How long a screen holds the part the button sits in for an answer, at most. */
export const GOOGLE_SETTLE_CAP_MS = 1500;
/** How long a tap waits for the setting when this launch has no answer yet. */
export const GOOGLE_TAP_CHECK_MS = 2000;

/** What a settings answer says about Google: true, false, or null when it is not a settings answer. */
export function googleOnFrom(body: unknown): boolean | null {
  if (!body || typeof body !== 'object') return null;
  const external = (body as { external?: unknown }).external;
  if (!external || typeof external !== 'object') return null;
  return (external as { google?: unknown }).google === true;
}

/** The kept answer as stored ('1', '0' or nothing). */
export function keptGoogleOn(stored: string | null | undefined): boolean | null {
  return stored === '1' ? true : stored === '0' ? false : null;
}

/** Whether to show the button: the fresh answer wins; else the kept one; else not shown. */
export function showGoogle(fresh: boolean | null, kept: boolean | null): boolean {
  return fresh ?? kept ?? false;
}

export interface GoogleSettingState {
  /** This launch's answer from the backend. */
  fresh: boolean | null;
  /** The answer kept on this device from an earlier launch. */
  kept: boolean | null;
  /** The kept value has been read (it may be nothing). */
  keptRead: boolean;
  /** This launch's ask is over (answered or failed). */
  freshDone: boolean;
  /** The cap after the first ask has passed. */
  capped: boolean;
}

/**
 * Whether a screen may draw the part the button sits in: an answer is known (fresh or kept), or
 * both reads are over with nothing, or the cap has passed. Drawn then, it is never redrawn for a
 * later answer during that visit.
 */
export function googleSettled(s: GoogleSettingState): boolean {
  return s.fresh !== null || s.kept !== null || (s.keptRead && s.freshDone) || s.capped;
}

/**
 * What a tap does: 'off' when Google is known to be off (this launch's answer, or the answer the
 * tap itself asked for), else 'go'. An answer that cannot be had lets the tap go on, as before.
 */
export function tapVerdict(fresh: boolean | null, asked: boolean | null): 'go' | 'off' {
  return (fresh ?? asked) === false ? 'off' : 'go';
}

const INITIAL: GoogleSettingState = { fresh: null, kept: null, keptRead: false, freshDone: false, capped: false };
const useGoogleSetting = create<GoogleSettingState>(() => INITIAL);

let asked = false;

/** One read of the backend's setting; keeps and stores a real answer. Null when there is none. */
async function readGoogleSetting(timeoutMs?: number): Promise<boolean | null> {
  const authUrl = FUNCTIONS_URL.replace(/\/functions\/v1$/, '/auth/v1');
  const abort = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = timeoutMs && abort ? setTimeout(() => abort.abort(), timeoutMs) : null;
  try {
    const r = await fetch(`${authUrl}/settings`, { headers: { apikey: SUPABASE_ANON_KEY }, signal: abort?.signal });
    const on = googleOnFrom(r.ok ? ((await r.json()) as unknown) : null);
    if (on !== null) {
      useGoogleSetting.setState({ fresh: on });
      AsyncStorage.setItem(GOOGLE_SETTING_KEY, on ? '1' : '0').catch(() => {});
    }
    return on;
  } catch {
    // Offline, too slow or the project is not answering: the kept answer stands.
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Ask the backend once this launch (idempotent; called by the screens that offer the button). */
export function askGoogleSetting(): void {
  if (asked || !isBackendConfigured) return;
  asked = true;
  setTimeout(() => useGoogleSetting.setState({ capped: true }), GOOGLE_SETTLE_CAP_MS);
  void AsyncStorage.getItem(GOOGLE_SETTING_KEY)
    .then((v) => useGoogleSetting.setState({ kept: keptGoogleOn(v), keptRead: true }))
    .catch(() => useGoogleSetting.setState({ keptRead: true }));
  void readGoogleSetting().then(() => useGoogleSetting.setState({ freshDone: true }));
}

/** Before a Google sign-in starts: ask again when this launch has no answer yet (2 s at most). */
export async function checkGoogleBeforeTap(): Promise<'go' | 'off'> {
  const fresh = useGoogleSetting.getState().fresh;
  if (fresh !== null || !isBackendConfigured) return tapVerdict(fresh, null);
  return tapVerdict(null, await readGoogleSetting(GOOGLE_TAP_CHECK_MS));
}

/** True when "Continue with Google" should be shown on this device now. */
export function useGoogleSignInOn(): boolean {
  const fresh = useGoogleSetting((s) => s.fresh);
  const kept = useGoogleSetting((s) => s.kept);
  return isBackendConfigured && showGoogle(fresh, kept);
}

/**
 * The button for one visit of a screen: `ready` once the answer is known (or the cap passed), and
 * `shown` decided at that moment and kept for the visit, so nothing on screen moves for a later answer.
 */
export function useGoogleChoice(): { ready: boolean; shown: boolean } {
  const settled = useGoogleSetting((s) => !isBackendConfigured || googleSettled(s));
  const on = useGoogleSignInOn();
  const [choice, setChoice] = useState<boolean | null>(() => (settled ? on : null));
  if (choice === null && settled) setChoice(on);
  return { ready: choice !== null, shown: choice === true };
}
