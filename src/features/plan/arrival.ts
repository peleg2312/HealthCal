/**
 * Plus arriving after a payment (ruling D3): the one moment of the plan screen, the membership cup
 * pouring from the Free level to the brim, once, and only while the page is in front.
 *
 * THE STAMP (`arrivedAt`) is set in the same step that puts Plus in the plan store, while a checkout
 * is waiting or late (`watchArrival`, wired once in ./checkout.ts): a plan-store listener runs inside
 * that store's own update, before React draws the subscriber page, so the membership card already
 * knows of the arrival on its first frame and starts at the Free level instead of pouring up from
 * empty. Plus that turns up while no checkout is waiting (a start, a return to the front, another
 * device) is not an arrival and stamps nothing.
 *
 * TAKING IT (`takeArrival`) is the card's effect while the page is in front: a fresh stamp
 * (`arrivalFresh`, ./wait.ts) turns `arriving` on for as long as the page stays, and the stamp is gone
 * either way, so the moment plays a single time. A stamp that lands after the card is on screen is
 * taken the same way (the effect runs again when it lands). Leaving the page ends it (`endArrival`).
 * Memory only, never stored.
 */
import { create } from 'zustand';

import { demoPreset } from './demo';
import { holdsPlus, type PlanView } from './view';
import { arrivalFresh } from './wait';

export type CheckoutPhase = 'idle' | 'working' | 'waiting' | 'late';

export interface ArrivalState {
  /** When Plus arrived after a payment in this run of the app (ms), until the plan screen has taken it; else null. */
  arrivedAt: number | null;
  /** The plan screen took a fresh arrival and is showing it (the membership cup pouring to the brim). */
  arriving: boolean;
}

export const useArrivalStore = create<ArrivalState>(() => ({ arrivedAt: demoPreset() === 'arriving' ? Date.now() : null, arriving: false }));

/** Whether a change of the plan is Plus arriving after a payment: Plus is held now, was not before, and a checkout is waiting or late. */
export function arrivedWith(before: PlanView, after: PlanView, phase: CheckoutPhase): boolean {
  if (phase !== 'waiting' && phase !== 'late') return false;
  const plus = (v: PlanView) => v.plan === 'plus' && holdsPlus(v);
  return plus(after) && !plus(before);
}

/** Plus arrived now. */
export function stampArrival(now: number = Date.now()): void {
  useArrivalStore.setState({ arrivedAt: now });
}

/**
 * The membership card is in front: take the stamp. If Plus arrived just now `arriving` turns true
 * for as long as the page stays; either way the stamp is gone, so the moment plays a single time.
 * Called from an effect, never while rendering.
 */
export function takeArrival(now: number = Date.now()): void {
  const at = useArrivalStore.getState().arrivedAt;
  if (at === null) return;
  useArrivalStore.setState({ arrivedAt: null, arriving: arrivalFresh(at, now) });
}

/** The plan page was left: the moment is over. */
export function endArrival(): void {
  if (useArrivalStore.getState().arriving) useArrivalStore.setState({ arriving: false });
}

/** A store of the plan, as ./cache.ts keeps it (only its `subscribe` is used). */
interface PlanSource {
  subscribe(listener: (state: { view: PlanView }, before: { view: PlanView }) => void): () => void;
}

/**
 * Stamp the arrival in the same step that puts Plus in the plan store, while a checkout waits.
 * Returns the way to stop (for tests).
 */
export function watchArrival(plans: PlanSource, phase: () => CheckoutPhase, now: () => number = () => Date.now()): () => void {
  return plans.subscribe((state, before) => {
    if (arrivedWith(before.view, state.view, phase())) stampArrival(now());
  });
}
