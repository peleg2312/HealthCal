/**
 * Buying and managing Plus.
 *
 * Buying: the server makes the checkout for the signed-in account (the app never names the person to
 * the payment company). Web: everything is saved (`flushPersistence`), then the page goes there and
 * comes back to /settings/plan?checkout=done. Phones: the system browser (`openAuthSessionAsync`),
 * back by healthcal://settings/plan?checkout=done. Either way the app then asks the server to re-read
 * the payment company every 2 s for up to 30 s (./wait.ts): waiting, then a toast, or "has not
 * arrived yet" and one more look at the next return to the front. A closed or cancelled checkout
 * changes nothing and says nothing more than that nothing was charged.
 *
 * Arriving: the moment Plus arrives after a payment is stamped (./arrival.ts) in the same step that
 * puts Plus in the plan store while this checkout is waiting or late (`watchArrival`, wired below),
 * so the plan screen's membership card knows of it on its first frame. The card takes it while the
 * page is in front (`takeArrival`): within ARRIVAL_WINDOW_MS (./wait.ts) its cup pours from the Free
 * level to the brim, once. It is memory only, never stored, so a later visit or another screen shows
 * nothing of it.
 *
 * Managing: "Manage or cancel", "Cancel subscription" and "Withdraw from the contract" all open the
 * payment company's own page (the portal), and the plan is read again on return.
 */
import * as WebBrowser from 'expo-web-browser';
import { AppState, Platform } from 'react-native';
import { create } from 'zustand';

import { flushPersistence } from '@/store/persistence';
import { toast } from '@/ui/Toast';

import { billingCall } from './api';
import { watchArrival, type CheckoutPhase } from './arrival';
import { planNow, refreshPlan, usePlanStore } from './cache';
import { checkoutBlockedHere, checkoutShown, PLAN_ROUTE } from './channel';
import { demoPreset } from './demo';
import { waitForPlus } from './wait';
import { notBuyableHere, plusOnToast, refusalLine } from './words';
import type { PlanOffer } from './view';

export type { CheckoutPhase } from './arrival';

interface CheckoutState {
  phase: CheckoutPhase;
  /** Which control is working, for its spinner. */
  busy: 'subscribe' | 'manage' | null;
}

function initialPhase(): CheckoutPhase {
  const d = demoPreset();
  return d === 'waiting' ? 'waiting' : d === 'late' ? 'late' : 'idle';
}

export const useCheckout = create<CheckoutState>(() => ({ phase: initialPhase(), busy: null }));

// Plus put in the plan store while this checkout waits (or is late) is the arrival: stamped in that
// same step, before the plan screen draws the subscriber page.
watchArrival(usePlanStore, () => useCheckout.getState().phase);

export const NATIVE_RETURN = 'healthcal://settings/plan?checkout=done';
export const NATIVE_PORTAL_RETURN = 'healthcal://settings/plan';

/** Where the payment page sends the person back to. */
export function checkoutReturnUrl(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') return `${window.location.origin}${PLAN_ROUTE}?checkout=done`;
  return NATIVE_RETURN;
}

function portalReturnUrl(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') return `${window.location.origin}${PLAN_ROUTE}`;
  return NATIVE_PORTAL_RETURN;
}

export type ActionResult = { ok: true } | { ok: false; message: string };

let waitToken = 0;

/** The person came back from the payment page: wait for the payment to arrive. */
export async function waitAfterCheckout(): Promise<void> {
  if (usePlanStore.getState().demo) return;
  const token = ++waitToken;
  useCheckout.setState({ phase: 'waiting', busy: null });
  const outcome = await waitForPlus({
    now: () => Date.now(),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    refresh: () => refreshPlan({ fromProvider: true }),
    stopped: () => token !== waitToken,
  });
  if (outcome.kind === 'stopped') return;
  if (outcome.kind === 'on') {
    useCheckout.setState({ phase: 'idle' });
    toast(plusOnToast(outcome.view.periodEnd));
    return;
  }
  useCheckout.setState({ phase: 'late' });
}

/** The late state looks once more whenever the app comes back to the front. Returns the way to stop. */
export function watchLateCheckout(): () => void {
  const sub = AppState.addEventListener('change', (st) => {
    if (st !== 'active' || useCheckout.getState().phase !== 'late' || usePlanStore.getState().demo) return;
    void refreshPlan({ fromProvider: true }).then((v) => {
      if (v.plan === 'plus' && useCheckout.getState().phase === 'late') {
        useCheckout.setState({ phase: 'idle' });
        toast(plusOnToast(v.periodEnd));
      }
    });
  });
  return () => sub.remove();
}

/** Tap on Subscribe. */
export async function startCheckout(offer: PlanOffer): Promise<ActionResult> {
  if (!checkoutShown()) return { ok: false, message: notBuyableHere('channel') };
  if (checkoutBlockedHere()) return { ok: false, message: notBuyableHere('frame') };
  if (useCheckout.getState().busy) return { ok: true };
  useCheckout.setState({ busy: 'subscribe', phase: 'working' });
  const returnUrl = checkoutReturnUrl();
  const a = await billingCall({ action: 'checkout', offerId: offer.id, returnUrl }).catch(() => null);
  if (!a || !a.ok || typeof a.data.url !== 'string' || !/^https?:\/\//.test(a.data.url)) {
    useCheckout.setState({ busy: null, phase: 'idle' });
    const code = !a ? 'offline' : a.ok ? 'bad_answer' : a.code;
    // The plan or the price may have changed under the screen: show what is true now.
    if (code === 'already_subscribed' || code === 'offer_unknown' || code === 'plans_off') void refreshPlan();
    return { ok: false, message: refusalLine(code, 'checkout') };
  }
  const url = a.data.url;
  if (Platform.OS === 'web') {
    // The page is about to be left: everything logged so far is saved first.
    await flushPersistence().catch(() => {});
    window.location.assign(url);
    return { ok: true };
  }
  let result: WebBrowser.WebBrowserAuthSessionResult;
  try {
    result = await WebBrowser.openAuthSessionAsync(url, returnUrl);
  } catch {
    useCheckout.setState({ busy: null, phase: 'idle' });
    return { ok: false, message: refusalLine('unknown', 'checkout') };
  }
  useCheckout.setState({ busy: null });
  if (result.type === 'success' && /[?&]checkout=done\b/.test(result.url)) {
    void waitAfterCheckout();
    return { ok: true };
  }
  // Closed or cancelled: nothing changed. One quiet look, in case the payment went through anyway.
  useCheckout.setState({ phase: 'idle' });
  void refreshPlan({ fromProvider: true });
  return { ok: false, message: refusalLine('cancelled', 'checkout') };
}

/** "Manage or cancel", "Cancel subscription", "Withdraw from the contract": the payment company's page. */
export async function openManage(): Promise<ActionResult> {
  const v = planNow();
  if (checkoutBlockedHere()) return { ok: false, message: notBuyableHere('frame').replace('can be bought', 'can be managed') };
  if (useCheckout.getState().busy) return { ok: true };
  useCheckout.setState({ busy: 'manage' });
  const returnUrl = portalReturnUrl();
  const a = await billingCall({ action: 'portal', returnUrl }).catch(() => null);
  if (!a || !a.ok || typeof a.data.url !== 'string' || !/^https?:\/\//.test(a.data.url)) {
    useCheckout.setState({ busy: null });
    const code = !a ? 'offline' : a.ok ? 'bad_answer' : a.code;
    return { ok: false, message: refusalLine(code, 'manage', a && !a.ok ? a.source ?? v.source ?? undefined : undefined) };
  }
  const url = a.data.url;
  if (Platform.OS === 'web') {
    await flushPersistence().catch(() => {});
    window.location.assign(url);
    return { ok: true };
  }
  try {
    await WebBrowser.openAuthSessionAsync(url, returnUrl);
  } catch {
    // The page closed on its own; the plan is read again below either way.
  }
  useCheckout.setState({ busy: null });
  void refreshPlan({ fromProvider: true });
  return { ok: true };
}
