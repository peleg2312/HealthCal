/**
 * The plan on this device: a display copy of the billing function's last status answer, under its own
 * key with its owner (the account it was read for), never in the synced settings or a synced
 * collection. The server decides every limit; this only says what to show.
 *
 * THE OWNER is the signed-in account (`user:<id>`). A stored copy for another account is never shown.
 * THE WIPE: whenever the account goes from this device (sign out, delete, a session that ended, a
 * switch to another account) or the profile goes away (erase this device), the copy goes with it:
 * one subscription started at app start from the root layout (`startPlan`), as the coach's chat is.
 *
 * WHEN IT IS ASKED AGAIN: at sign-in (and at a start that finds an account), on a return to the front
 * after five minutes or more away, after a checkout (the wait, ./checkout.ts) and after a limit answer
 * (`refreshPlanAfterLimit`, at most once a minute).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import { create } from 'zustand';

import { useAuth } from '@/services/auth';
import { useStore } from '@/store';

import { billingCall } from './api';
import { demoPreset, demoView, type PlanDemo } from './demo';
import { UNKNOWN_PLAN, viewFromStatus, type PlanView } from './view';

export const PLAN_CACHE_KEY = 'healthcal-plan';
/** Away at least this long, the plan is asked again on return (as the day goes back to today). */
export const PLAN_RETURN_MS = 5 * 60_000;
/** A limit answer asks again at most this often. */
export const PLAN_AFTER_LIMIT_MS = 60_000;

interface PlanStore {
  view: PlanView;
  owner: string | null;
  /** The preset of a test-hook build, else null. */
  demo: PlanDemo | null;
}

function initial(): PlanStore {
  const demo = demoPreset();
  return { view: demo ? demoView(demo, Date.now()) : UNKNOWN_PLAN, owner: null, demo };
}

export const usePlanStore = create<PlanStore>(() => initial());

/** The plan as last known for the signed-in account (the everyday allowance while not known). */
export function usePlan(): PlanView {
  return usePlanStore((s) => s.view);
}

export function planNow(): PlanView {
  return usePlanStore.getState().view;
}

/** The stored copy's owner for an account id. */
export function planOwner(userId: string | null | undefined): string | null {
  return userId ? `user:${userId}` : null;
}

/** What is stored, read for one owner: the view, or null when it is missing, broken or someone else's. */
export function readStoredPlan(raw: string | null, owner: string | null): PlanView | null {
  if (!raw || !owner) return null;
  try {
    const v = JSON.parse(raw) as { owner?: unknown; status?: unknown };
    if (!v || v.owner !== owner) return null;
    return viewFromStatus(v.status);
  } catch {
    return null;
  }
}

export function writeStoredPlan(owner: string, status: Record<string, unknown>, at: number): string {
  return JSON.stringify({ owner, at, status });
}

function sessionUser(): string | null {
  return useAuth.getState().session?.user.id ?? null;
}

/** Forget the plan on this device. */
export async function clearPlan(): Promise<void> {
  if (usePlanStore.getState().demo) return;
  usePlanStore.setState({ view: UNKNOWN_PLAN, owner: null });
  await AsyncStorage.removeItem(PLAN_CACHE_KEY).catch(() => {});
}

/** Show the stored copy for this account, if there is one and nothing newer arrived meanwhile. */
async function loadFor(userId: string): Promise<void> {
  const owner = planOwner(userId);
  let raw: string | null = null;
  try {
    raw = await AsyncStorage.getItem(PLAN_CACHE_KEY);
  } catch {
    raw = null;
  }
  const view = readStoredPlan(raw, owner);
  const s = usePlanStore.getState();
  if (view && s.owner !== owner && sessionUser() === userId) usePlanStore.setState({ view, owner });
}

const inFlight = new Map<string, Promise<PlanView>>();

/**
 * Ask the billing function for the plan (`fromProvider` re-reads the payment company first, for the
 * wait after a checkout). Never throws: on any failure it resolves with what is already known.
 */
export function refreshPlan(opts: { fromProvider?: boolean } = {}): Promise<PlanView> {
  const s = usePlanStore.getState();
  if (s.demo) return Promise.resolve(s.view);
  const action = opts.fromProvider ? 'refresh' : 'status';
  const running = inFlight.get(action);
  if (running) return running;
  const p = (async () => {
    const a = await billingCall({ action }).catch(() => null);
    if (!a || !a.ok || !a.userId) return planNow();
    // An answer for an account that is no longer the one on this device is dropped.
    if (a.userId !== sessionUser()) return planNow();
    const view = viewFromStatus(a.data);
    if (!view) return planNow();
    const owner = planOwner(a.userId)!;
    usePlanStore.setState({ view, owner });
    await AsyncStorage.setItem(PLAN_CACHE_KEY, writeStoredPlan(owner, a.data, Date.now())).catch(() => {});
    return view;
  })().finally(() => inFlight.delete(action));
  inFlight.set(action, p);
  return p;
}

let lastLimitAsk = 0;
/**
 * The AI estimate or the coach was refused for the day: the allowance may have changed (a plan began
 * or ended elsewhere), so the plan is asked again, at most once a minute.
 */
export function refreshPlanAfterLimit(now: number = Date.now()): Promise<PlanView> {
  if (now - lastLimitAsk < PLAN_AFTER_LIMIT_MS) return Promise.resolve(planNow());
  lastLimitAsk = now;
  return refreshPlan();
}

let started: (() => void) | null = null;

/**
 * Call once at app start, after the stored data was read (the root layout, beside startCoach).
 * Returns the way to stop, for tests.
 */
export function startPlanCache(): () => void {
  if (started) return started;
  if (usePlanStore.getState().demo) {
    started = () => {
      started = null;
    };
    return started;
  }
  const settle = (userId: string | null, ready: boolean) => {
    const s = usePlanStore.getState();
    if (!ready) return;
    if (!userId) {
      if (s.owner || s.view.known) void clearPlan();
      else void AsyncStorage.removeItem(PLAN_CACHE_KEY).catch(() => {});
      return;
    }
    if (s.owner !== planOwner(userId)) {
      usePlanStore.setState({ view: UNKNOWN_PLAN, owner: null });
      void loadFor(userId).then(() => refreshPlan());
    }
  };
  const a = useAuth.getState();
  settle(a.session?.user.id ?? null, a.ready);
  const unsubAuth = useAuth.subscribe((state, before) => {
    const id = state.session?.user.id ?? null;
    const was = before.session?.user.id ?? null;
    if (id !== was || state.ready !== before.ready) settle(id, state.ready);
  });
  const unsubStore = useStore.subscribe((state, before) => {
    if (before.profile && !state.profile) void clearPlan();
  });
  let awaySince: number | null = null;
  const appState = AppState.addEventListener('change', (st) => {
    if (st === 'active') {
      const away = awaySince;
      awaySince = null;
      if (away !== null && Date.now() - away >= PLAN_RETURN_MS && sessionUser()) void refreshPlan();
    } else if (awaySince === null) {
      awaySince = Date.now();
    }
  });
  started = () => {
    unsubAuth();
    unsubStore();
    appState.remove();
    started = null;
  };
  return started;
}
