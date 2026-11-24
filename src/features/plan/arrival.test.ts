import { beforeEach, describe, expect, it } from 'vitest';
import { create } from 'zustand';

import { arrivedWith, endArrival, stampArrival, takeArrival, useArrivalStore, watchArrival, type CheckoutPhase } from './arrival';
import { demoView } from './demo';
import { ARRIVAL_WINDOW_MS } from './wait';
import { UNKNOWN_PLAN, type PlanView } from './view';

const NOW = Date.parse('2026-11-23T12:00:00Z');
const free = demoView('free', NOW);
const plus = demoView('plus', NOW);
const state = () => useArrivalStore.getState();

beforeEach(() => {
  useArrivalStore.setState({ arrivedAt: null, arriving: false });
});

describe('taking the arrival', () => {
  it('a fresh stamp is taken once: arriving turns on and the stamp is gone', () => {
    stampArrival(NOW);
    takeArrival(NOW + 400);
    expect(state()).toEqual({ arrivedAt: null, arriving: true });
    // A second take (the page comes to the front again) changes nothing.
    takeArrival(NOW + 900);
    expect(state()).toEqual({ arrivedAt: null, arriving: true });
  });
  it('a stale stamp is dropped without playing', () => {
    stampArrival(NOW);
    takeArrival(NOW + ARRIVAL_WINDOW_MS);
    expect(state()).toEqual({ arrivedAt: null, arriving: false });
  });
  it('with no stamp there is nothing to take', () => {
    takeArrival(NOW);
    expect(state()).toEqual({ arrivedAt: null, arriving: false });
  });
  it('leaving the page ends the moment', () => {
    stampArrival(NOW);
    takeArrival(NOW + 10);
    endArrival();
    expect(state().arriving).toBe(false);
  });
});

describe('what counts as an arrival', () => {
  it('Plus put in the plan while a checkout waits or is late', () => {
    expect(arrivedWith(free, plus, 'waiting')).toBe(true);
    expect(arrivedWith(free, plus, 'late')).toBe(true);
    // The plan read for the first time on the return from the payment page.
    expect(arrivedWith(UNKNOWN_PLAN, plus, 'waiting')).toBe(true);
  });
  it('never with no checkout waiting, never when Plus was already held, never for Free', () => {
    for (const phase of ['idle', 'working'] as CheckoutPhase[]) expect(arrivedWith(free, plus, phase)).toBe(false);
    expect(arrivedWith(plus, plus, 'waiting')).toBe(false);
    expect(arrivedWith(free, free, 'waiting')).toBe(false);
  });
});

describe('the real order: the plan store first, the page after', () => {
  function stores(view: PlanView, phase: CheckoutPhase) {
    const plans = create<{ view: PlanView }>(() => ({ view }));
    const checkout = { phase };
    const stop = watchArrival(plans, () => checkout.phase, () => NOW);
    return { plans, checkout, stop };
  }

  it('Plus put in the store while the checkout waits is stamped in that same step, and the card then plays it', () => {
    const { plans, checkout, stop } = stores(free, 'waiting');
    // refreshPlan puts Plus in the store: before React draws anything, the stamp is there.
    plans.setState({ view: plus });
    expect(state().arrivedAt).toBe(NOW);
    // Then the wait ends (phase idle, the toast) and the card's effect takes the stamp.
    checkout.phase = 'idle';
    takeArrival(NOW + 300);
    expect(state()).toEqual({ arrivedAt: null, arriving: true });
    stop();
  });

  it('the late path (one more look on a return to the front) is an arrival too', () => {
    const { plans, stop } = stores(free, 'late');
    plans.setState({ view: plus });
    takeArrival(NOW + 50);
    expect(state().arriving).toBe(true);
    stop();
  });

  it('a card already on screen when the stamp lands takes it then', () => {
    const { plans, stop } = stores(free, 'waiting');
    // The card mounted first (nothing to take yet)...
    takeArrival(NOW);
    expect(state().arriving).toBe(false);
    // ...then the plan turns to Plus and the effect runs again on the new stamp.
    plans.setState({ view: plus });
    takeArrival(NOW + 200);
    expect(state().arriving).toBe(true);
    stop();
  });

  it('Plus read at a start or on a return with no checkout waiting stamps nothing', () => {
    const { plans, stop } = stores(free, 'idle');
    plans.setState({ view: plus });
    expect(state().arrivedAt).toBeNull();
    takeArrival(NOW);
    expect(state().arriving).toBe(false);
    stop();
  });
});
