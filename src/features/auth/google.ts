/**
 * "Continue with Google" through Supabase's browser sign-in, with the PKCE client the app already
 * has (src/services/supabase.ts). No Google module on the phone, so it ships as an over-the-air update.
 *
 * - Web: a full-page redirect to Supabase, Google, and back to /auth?mode=google&code=…; the client
 *   exchanges the code by itself as the page loads (`detectSessionInUrl`), and `settleWebReturn`
 *   says how that went.
 * - Android and iPhone: the system browser (`openAuthSessionAsync`, never a WebView: Google refuses
 *   embedded browsers) comes back to healthcal://auth?mode=google&code=…, and `finishGoogleReturn`
 *   exchanges the code once. On Android the same link can also reach the app's own link handler
 *   and the router; the exchange is single-flight by code, so a second delivery is a no-op, and a
 *   cold start on the link (the app was closed while the browser was open) finishes the sign-in,
 *   because the code verifier waits in the device's storage.
 *
 * After the session exists, everything is the email sign-in's path: `initAuth`'s SIGNED_IN runs the
 * first sync, and the sign-in gate decides between Today, onboarding and the account-switch question.
 * Nothing from Google's profile (name, picture) is copied anywhere.
 */
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { create } from 'zustand';

import { supabase } from '@/services/supabase';
import { inFramedViewer } from '@/services/viewer';
import { flushPersistence } from '@/store/persistence';
import { toast } from '@/ui/Toast';

import { googleReturnFrom, linkedToastFor, paramsOfUrl, problemFromError, type GoogleProblem } from './words';

export type GoogleOutcome = { ok: true } | { ok: false; problem: GoogleProblem };

interface GoogleFlowState {
  /** idle: nothing under way. working: the browser is open or a code is being exchanged. done: signed in. failed: see `problem`. */
  status: 'idle' | 'working' | 'done' | 'failed';
  problem: GoogleProblem | null;
}

/** Where the Google sign-in stands on this device, for the waiting view and the forms. */
export const useGoogleFlow = create<GoogleFlowState>(() => ({ status: 'idle', problem: null }));

/** Back to idle once a screen has shown a problem, so it is not shown again on the next visit. */
export function clearGoogleProblem(): void {
  if (useGoogleFlow.getState().status === 'failed') useGoogleFlow.setState({ status: 'idle', problem: null });
}

function fail(problem: GoogleProblem): GoogleOutcome {
  useGoogleFlow.setState({ status: 'failed', problem });
  return { ok: false, problem };
}

function succeed(identities: readonly { provider?: string; created_at?: string }[] | undefined): GoogleOutcome {
  useGoogleFlow.setState({ status: 'done', problem: null });
  const linked = linkedToastFor(identities, Date.now());
  if (linked) toast(linked);
  return { ok: true };
}

/** Exchanges by code: the first call does the work, every later call with the same code gets its answer. */
const exchanges = new Map<string, Promise<GoogleOutcome>>();
let lastExchange: Promise<GoogleOutcome> | null = null;

/** Where Google sends the person back to: this site's /auth?mode=google, or the app's own link. */
export function googleRedirect(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') return `${window.location.origin}/auth?mode=google`;
  return Linking.createURL('/auth', { queryParams: { mode: 'google' } });
}

/**
 * Start a Google sign-in from a tap. On the web the page then leaves for Google ('redirecting');
 * on a phone this resolves when the browser closes, with the outcome of the one exchange.
 */
export async function startGoogleSignIn(): Promise<'redirecting' | GoogleOutcome> {
  if (!supabase) return fail('unknown');
  if (inFramedViewer()) return fail('framed');
  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.onLine === false) return fail('offline');
  useGoogleFlow.setState({ status: 'working', problem: null });
  lastExchange = null;
  const redirectTo = googleRedirect();
  if (Platform.OS === 'web') {
    // The page is about to be left: everything logged so far is saved first.
    await flushPersistence().catch(() => {});
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
    return error ? fail(problemFromError(error.message, error.code)) : 'redirecting';
  }
  const { data, error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo, skipBrowserRedirect: true } });
  if (error || !data?.url) return fail(problemFromError(error?.message ?? 'no url', error?.code));
  let result: WebBrowser.WebBrowserAuthSessionResult;
  try {
    result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  } catch (e) {
    return fail(problemFromError(e instanceof Error ? e.message : String(e)));
  }
  if (result.type === 'success') return finishGoogleReturn(result.url);
  // Android: the return may have come through the app's link instead and be under way already.
  const pending = lastExchange;
  if (pending) return pending;
  return fail('cancelled');
}

/**
 * Finish a Google return on a phone (healthcal://auth?mode=google&…): exchange its code once.
 * Safe to call from every place the link arrives (the browser session's result, the app's link
 * handler, the screen the router opened); the second call with the same code returns the first's answer.
 */
export function finishGoogleReturn(url: string): Promise<GoogleOutcome> {
  const ret = googleReturnFrom(paramsOfUrl(url));
  if (ret.kind === 'none') return Promise.resolve(useGoogleFlow.getState().status === 'done' ? { ok: true } : fail('cancelled'));
  if (ret.kind === 'error') return Promise.resolve(fail(ret.problem));
  return finishGoogleCode(ret.code, ret.flowId);
}

/** Exchange one Google code for a session, once: a second call with the same code returns the first's answer. */
export function finishGoogleCode(code: string, flowId: string | null): Promise<GoogleOutcome> {
  const known = exchanges.get(code);
  if (known) return known;
  const run = (async (): Promise<GoogleOutcome> => {
    if (!supabase) return fail('unknown');
    useGoogleFlow.setState({ status: 'working', problem: null });
    try {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined);
      if (error || !data.session) return fail(problemFromError(error?.message ?? 'no session', error?.code));
      return succeed(data.session.user.identities);
    } catch (e) {
      return fail(problemFromError(e instanceof Error ? e.message : String(e)));
    }
  })();
  exchanges.set(code, run);
  lastExchange = run;
  return run;
}

let webSettled: Promise<GoogleOutcome> | null = null;

/**
 * The web return: the client exchanged the code by itself while the page loaded (when this browser
 * holds the verifier). Waits for that and says how it went. A code opened in a browser that did not
 * start the sign-in, or opened a second time, ends with no session: 'notFinished'.
 */
export function settleWebReturn(): Promise<GoogleOutcome> {
  if (webSettled) return webSettled;
  webSettled = (async (): Promise<GoogleOutcome> => {
    if (!supabase) return fail('unknown');
    useGoogleFlow.setState({ status: 'working', problem: null });
    try {
      const { error } = await supabase.auth.initialize();
      const { data } = await supabase.auth.getSession();
      if (data.session) return succeed(data.session.user.identities);
      return fail(error ? problemFromError(error.message, error.code) : 'notFinished');
    } catch (e) {
      return fail(problemFromError(e instanceof Error ? e.message : String(e)));
    }
  })();
  return webSettled;
}

let returnScreens = 0;

/** The waiting view counts itself while it is on screen, so a screen that started the flow does not open a second one. */
export function markReturnScreen(open: boolean): void {
  returnScreens = Math.max(0, returnScreens + (open ? 1 : -1));
}

/** True while a Google return screen (/auth?mode=google) is on screen. */
export const returnScreenOpen = (): boolean => returnScreens > 0;
