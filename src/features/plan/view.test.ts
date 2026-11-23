import { describe, expect, it } from 'vitest';

import { DEMO_PRESETS, demoView } from './demo';
import { canManageHere, canWithdraw, EVERYDAY_LIMITS, holdsPlus, offerFor, PLAN_DEFAULTS, planVisible, UNKNOWN_PLAN, viewFromStatus } from './view';

const OFFERS = [
  { id: 'test-plus-month', plan: 'plus', period: 'month', amount: 399, currency: 'USD', taxIncluded: false },
  { id: 'test-plus-year', plan: 'plus', period: 'year', amount: 2999, currency: 'usd', taxIncluded: null },
];

function status(over: Record<string, unknown> = {}) {
  return {
    plansOn: true,
    plan: 'free',
    state: 'none',
    periodEnd: null,
    cancelAtPeriodEnd: false,
    source: null,
    period: null,
    graceUntil: null,
    paymentGraceUntil: null,
    startedAt: null,
    limits: { estimates: 5, questions: 5, memoryPairs: 3 },
    offers: OFFERS,
    canCheckout: true,
    canManage: false,
    ...over,
  };
}

describe('viewFromStatus', () => {
  it('reads a free answer with its offers', () => {
    const v = viewFromStatus(status())!;
    expect(v.known).toBe(true);
    expect(v.plan).toBe('free');
    expect(v.limits).toEqual({ estimates: 5, questions: 5, memoryPairs: 3 });
    expect(v.offers.map((o) => o.id)).toEqual(['test-plus-month', 'test-plus-year']);
    expect(v.offers[1].currency).toBe('USD');
    expect(v.offers[0].taxIncluded).toBe(false);
    expect(v.offers[1].taxIncluded).toBe(null);
    expect(offerFor(v, 'year')?.amount).toBe(2999);
    expect(v.canCheckout).toBe(true);
    expect(planVisible(v)).toBe(true);
    expect(holdsPlus(v)).toBe(false);
  });

  it('reads every state the contract can send', () => {
    for (const state of ['none', 'active', 'trialing', 'in_grace', 'past_due', 'canceling', 'expired', 'revoked']) {
      const plan = ['active', 'trialing', 'in_grace', 'past_due', 'canceling'].includes(state) ? 'plus' : 'free';
      const v = viewFromStatus(status({ state, plan, source: 'test', period: 'year', periodEnd: '2027-12-23T12:00:00Z' }))!;
      expect(v.state).toBe(state);
      expect(holdsPlus(v)).toBe(plan === 'plus');
    }
  });

  it('treats an unknown state, source or period as nothing', () => {
    const v = viewFromStatus(status({ state: 'gold', source: 'bank', period: 'week', plan: 'premium' }))!;
    expect(v.state).toBe('none');
    expect(v.source).toBe(null);
    expect(v.period).toBe(null);
    expect(v.plan).toBe('free');
  });

  it('refuses what is not a status answer', () => {
    expect(viewFromStatus(null)).toBe(null);
    expect(viewFromStatus({ error: 'unauthorized', message: 'Sign in to see your plan.' })).toBe(null);
    expect(viewFromStatus([])).toBe(null);
  });

  it('drops malformed offers and dates', () => {
    const v = viewFromStatus(
      status({
        offers: [{ id: 'bad id', plan: 'plus', period: 'month', amount: 399, currency: 'USD' }, { id: 'x', plan: 'plus', period: 'month', amount: 3.5, currency: 'USD' }, ...OFFERS],
        periodEnd: 'tomorrow',
      }),
    )!;
    expect(v.offers).toHaveLength(2);
    expect(v.periodEnd).toBe(null);
  });

  it('shows no offer and no checkout while plans are off', () => {
    const v = viewFromStatus(status({ plansOn: false, offers: OFFERS, canCheckout: true, limits: EVERYDAY_LIMITS }))!;
    expect(v.offers).toEqual([]);
    expect(v.canCheckout).toBe(false);
    expect(planVisible(v)).toBe(false);
  });

  it('keeps the plan visible while one is held with plans off (R14)', () => {
    for (const state of ['active', 'canceling', 'past_due']) {
      const v = viewFromStatus(status({ plansOn: false, plan: state === 'past_due' ? 'plus' : 'plus', state, canManage: true }))!;
      expect(planVisible(v)).toBe(true);
    }
    expect(planVisible(viewFromStatus(status({ plansOn: false, plan: 'free', state: 'canceling' }))!)).toBe(true);
    expect(planVisible(viewFromStatus(status({ plansOn: false, plan: 'free', state: 'expired' }))!)).toBe(false);
  });

  it('is never visible before anything is known', () => {
    expect(planVisible(UNKNOWN_PLAN)).toBe(false);
    expect(UNKNOWN_PLAN.limits).toEqual({ estimates: 40, questions: 30, memoryPairs: 3 });
  });

  it('takes both cards from planLimits when sent, else the own plan from limits', () => {
    const sent = viewFromStatus(status({ planLimits: { free: { estimates: 7, questions: 6, memoryPairs: 3 }, plus: { estimates: 50, questions: 35, memoryPairs: 6 } } }))!;
    expect(sent.planLimits.free.estimates).toBe(7);
    expect(sent.planLimits.plus.questions).toBe(35);
    const own = viewFromStatus(status({ limits: { estimates: 8, questions: 4, memoryPairs: 3 } }))!;
    expect(own.planLimits.free).toEqual({ estimates: 8, questions: 4, memoryPairs: 3 });
    expect(own.planLimits.plus).toEqual(PLAN_DEFAULTS.plus);
    // In the earlier-account grace the person's own numbers are not the Free plan's.
    const grace = viewFromStatus(status({ limits: { estimates: 40, questions: 30, memoryPairs: 3 }, graceUntil: '2027-01-31T00:00:00Z' }))!;
    expect(grace.planLimits.free).toEqual(PLAN_DEFAULTS.free);
    expect(grace.graceUntil).toBe('2027-01-31T00:00:00Z');
  });
});

describe('withdraw and manage', () => {
  const start = Date.parse('2026-11-20T10:00:00Z');
  const plus = viewFromStatus(status({ plan: 'plus', state: 'active', source: 'polar', startedAt: '2026-11-20T10:00:00Z', canManage: true }))!;
  it('offers withdrawing for 14 days from the start', () => {
    expect(canWithdraw(plus, start + 13 * 86_400_000)).toBe(true);
    expect(canWithdraw(plus, start + 14 * 86_400_000)).toBe(false);
    expect(canWithdraw({ ...plus, startedAt: null }, start)).toBe(false);
    expect(canWithdraw({ ...plus, source: 'promotional' }, start)).toBe(false);
  });
  it('manages here only what the payment company holds', () => {
    expect(canManageHere(plus)).toBe(true);
    expect(canManageHere({ ...plus, source: 'app_store' })).toBe(false);
    expect(canManageHere({ ...plus, canManage: false })).toBe(false);
  });
});

describe('demo presets', () => {
  it('give every state a known view', () => {
    const now = Date.parse('2026-11-23T12:00:00Z');
    for (const p of DEMO_PRESETS) expect(demoView(p, now).known).toBe(true);
    expect(planVisible(demoView('off', now))).toBe(false);
    expect(holdsPlus(demoView('canceling', now))).toBe(true);
    expect(demoView('grace', now).graceUntil).not.toBe(null);
  });
});
