import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  ACTIVE_STATES,
  activePlan,
  dailyUnitCeiling,
  ENTITLEMENT_STATES,
  type EntitlementRow,
  freeReach,
  inGrace,
  isActiveRow,
  isoInstant,
  limitFields,
  limitsFor,
  MEMORY_PAIRS,
  nextUtcMidnight,
  PAYMENT_GRACE_DAYS,
  paymentGraceEnd,
  planConfigFrom,
  planOf,
  PROVIDER_NAMES,
  providerNameFrom,
  resolveLimits,
} from './plans';

const NOW = new Date('2026-11-23T12:00:00Z');
const row = (over: Partial<EntitlementRow> = {}): EntitlementRow => ({
  entitlement: 'plus',
  source: 'test',
  provider_customer_id: 'cus_1',
  provider_subscription_id: 'sub_1',
  product_id: 'prod',
  period: 'month',
  state: 'active',
  period_end: '2026-12-23T12:00:00Z',
  grace_until: null,
  cancel_at_period_end: false,
  environment: 'sandbox',
  started_at: '2026-11-23T10:00:00Z',
  provider_updated_at: '2026-11-23T11:00:00Z',
  ...over,
});
const env = (values: Record<string, string>) => (name: string) => values[name];
const DEFAULT = planConfigFrom(() => undefined);
/** The secrets that switch plans on in these tests: the test provider, which runs only in a sandbox. */
const TEST_PROVIDER = { BILLING_PROVIDER: 'test', BILLING_TEST_SECRET: 'a-test-secret-of-length', BILLING_ENVIRONMENT: 'sandbox' };
const SB = 'sandbox' as const;

describe('the three copies', () => {
  it('analyze-food/, coach-chat/ and billing/ hold the same plans.ts, byte for byte', () => {
    const read = (dir: string) => readFileSync(join(__dirname, '..', dir, 'plans.ts'), 'utf8');
    expect(read('analyze-food')).toBe(read('billing'));
    expect(read('coach-chat')).toBe(read('billing'));
  });
  it('imports nothing, so a copy works alone in any function', () => {
    expect(readFileSync(join(__dirname, 'plans.ts'), 'utf8')).not.toMatch(/^import /m);
  });
});

describe('activePlan: which rows make Plus active', () => {
  it('every active state before its paid-through time', () => {
    for (const state of ACTIVE_STATES) expect(isActiveRow(row({ state }), NOW, SB)).toBe(true);
    expect([...ACTIVE_STATES].sort()).toEqual(['active', 'canceling', 'in_grace', 'past_due', 'trialing']);
  });
  it('never expired or revoked, whatever the dates', () => {
    for (const state of ['expired', 'revoked'] as const) expect(isActiveRow(row({ state, period_end: '2099-01-01T00:00:00Z' }), NOW, SB)).toBe(false);
    expect(ENTITLEMENT_STATES.filter((s) => !ACTIVE_STATES.includes(s))).toEqual(['expired', 'revoked']);
  });
  it('the period end is exclusive: active a millisecond before, free at the instant', () => {
    const r = row({ period_end: '2026-11-23T12:00:00.000Z' });
    expect(isActiveRow(r, new Date('2026-11-23T11:59:59.999Z'), SB)).toBe(true);
    expect(isActiveRow(r, NOW, SB)).toBe(false);
    expect(isActiveRow(r, new Date('2026-11-23T12:00:00.001Z'), SB)).toBe(false);
  });
  it('grace_until takes the place of the period end (coalesce), later or earlier', () => {
    const pastDue = row({ state: 'past_due', period_end: '2026-11-20T00:00:00Z', grace_until: '2026-11-27T00:00:00Z' });
    expect(isActiveRow(pastDue, NOW, SB)).toBe(true);
    expect(isActiveRow(pastDue, new Date('2026-11-27T00:00:00Z'), SB)).toBe(false);
    // A grace that ended before the period end ends the plan (the provider said so).
    expect(isActiveRow(row({ grace_until: '2026-11-22T00:00:00Z' }), NOW, SB)).toBe(false);
  });
  it('no time at all is not active; an unreadable time is not active', () => {
    expect(isActiveRow(row({ period_end: null, grace_until: null }), NOW, SB)).toBe(false);
    expect(isActiveRow(row({ period_end: 'soon' }), NOW, SB)).toBe(false);
  });
  it('only the plus entitlement counts', () => {
    expect(isActiveRow(row({ entitlement: 'other' }), NOW, SB)).toBe(false);
  });
  it('a canceling plan keeps Plus to its period end', () => {
    const r = row({ state: 'canceling', cancel_at_period_end: true });
    expect(planOf([r], NOW, SB)).toBe('plus');
    expect(planOf([r], new Date('2026-12-23T12:00:00Z'), SB)).toBe('free');
  });
  it('picks the active row that lasts longest, and null for none', () => {
    const a = row({ source: 'test', period_end: '2026-12-01T00:00:00Z' });
    const b = row({ source: 'promotional', period_end: '2027-01-01T00:00:00Z' });
    const dead = row({ state: 'expired', period_end: '2030-01-01T00:00:00Z' });
    expect(activePlan([a, b, dead], NOW, SB)).toBe(b);
    expect(activePlan([dead], NOW, SB)).toBeNull();
    expect(activePlan([], NOW, SB)).toBeNull();
    expect(activePlan(null, NOW, SB)).toBeNull();
    expect(planOf(undefined, NOW, SB)).toBe('free');
  });
  it('R2: a row counts only in its own environment, so a sandbox purchase never gives Plus on live', () => {
    const sandbox = row({ environment: 'sandbox' });
    const live = row({ environment: 'live' });
    expect(planOf([sandbox], NOW, 'live')).toBe('free');
    expect(planOf([sandbox], NOW, 'sandbox')).toBe('plus');
    expect(planOf([live], NOW, 'live')).toBe('plus');
    expect(planOf([live], NOW, 'sandbox')).toBe('free');
    // The default environment is live.
    expect(DEFAULT.environment).toBe('live');
    expect(planConfigFrom(env({ BILLING_ENVIRONMENT: ' Sandbox ' })).environment).toBe('sandbox');
    expect(planConfigFrom(env({ BILLING_ENVIRONMENT: 'test' })).environment).toBe('live');
  });
  it('R8: a failed renewal with no grace from the provider keeps Plus until its period end + 7 days', () => {
    expect(PAYMENT_GRACE_DAYS).toBe(7);
    const r = row({ state: 'past_due', period_end: '2026-11-20T00:00:00Z', grace_until: null });
    expect(isActiveRow(r, NOW, SB)).toBe(true);
    expect(isActiveRow(r, new Date('2026-11-26T23:59:59.999Z'), SB)).toBe(true);
    expect(isActiveRow(r, new Date('2026-11-27T00:00:00.000Z'), SB)).toBe(false);
    expect(paymentGraceEnd(r)).toBe('2026-11-27T00:00:00.000Z');
    // The provider's own grace wins, shorter or longer.
    expect(paymentGraceEnd({ ...r, grace_until: '2026-11-22T00:00:00Z' })).toBe('2026-11-22T00:00:00.000Z');
    expect(isActiveRow({ ...r, grace_until: '2026-11-22T00:00:00Z' }, NOW, SB)).toBe(false);
    // Only for past_due: an active row ends at its period end, with no extra week.
    expect(isActiveRow(row({ state: 'active', period_end: '2026-11-20T00:00:00Z' }), NOW, SB)).toBe(false);
    expect(paymentGraceEnd(row())).toBeNull();
    expect(paymentGraceEnd(null)).toBeNull();
  });
});

describe('R1: plans are on only with PLANS=on and a provider this code knows', () => {
  it('PLANS=on with no provider, an unknown one, or one missing its secrets behaves as off', () => {
    expect(planConfigFrom(env({ PLANS: 'on' })).plansOn).toBe(false);
    expect(planConfigFrom(env({ PLANS: 'on', BILLING_PROVIDER: 'polar' })).plansOn).toBe(false);
    expect(planConfigFrom(env({ PLANS: 'on', BILLING_PROVIDER: 'test' })).plansOn).toBe(false);
    expect(planConfigFrom(env({ PLANS: 'on', BILLING_PROVIDER: 'test', BILLING_TEST_SECRET: 'short' })).plansOn).toBe(false);
    // The test provider never runs on a live setting.
    expect(planConfigFrom(env({ PLANS: 'on', BILLING_PROVIDER: 'test', BILLING_TEST_SECRET: 'a-test-secret-of-length' })).plansOn).toBe(false);
    expect(planConfigFrom(env({ PLANS: 'on', ...TEST_PROVIDER })).plansOn).toBe(true);
    expect(planConfigFrom(env({ PLANS: 'off', ...TEST_PROVIDER })).plansOn).toBe(false);
  });
  it('so a free account keeps the old numbers while there is nothing to buy', () => {
    const noProvider = planConfigFrom(env({ PLANS: 'on' }));
    expect(limitsFor({ plan: 'free', plansOn: noProvider.plansOn, createdAt: null, now: NOW, config: noProvider })).toMatchObject({ allowance: 'today', estimates: 40, questions: 30 });
  });
  it('providerNameFrom knows exactly the names providers.ts builds', () => {
    expect(PROVIDER_NAMES).toEqual(['test', 'polar']);
    expect(providerNameFrom(env(TEST_PROVIDER))).toBe('test');
    expect(providerNameFrom(env({ ...TEST_PROVIDER, BILLING_PROVIDER: ' TEST ' }))).toBe('test');
    for (const name of ['', 'off', 'none', 'stripe', 'paddle', 'polar']) expect(providerNameFrom(env({ ...TEST_PROVIDER, BILLING_PROVIDER: name }))).toBeNull();
  });
});

describe('planConfigFrom: the secrets and their defaults', () => {
  it('defaults: plans off, no provider, live, 40 and 30 for Plus, 5 and 5 free, ceilings 3,000 and 1,000, extras 2,000 and 500, no grace', () => {
    expect(DEFAULT).toEqual({
      plansOn: false,
      provider: null,
      environment: 'live',
      ai: { plus: 40, free: 5, global: 3000, paidExtra: 2000 },
      coach: { plus: 30, free: 5, global: 1000, paidExtra: 500 },
      graceBefore: null,
      graceUntil: null,
    });
  });
  it("only 'on' switches plans on (any case, spaces trimmed)", () => {
    for (const v of ['on', 'ON', ' On ']) expect(planConfigFrom(env({ PLANS: v, ...TEST_PROVIDER })).plansOn).toBe(true);
    for (const v of ['off', '', 'true', '1', 'yes']) expect(planConfigFrom(env({ PLANS: v, ...TEST_PROVIDER })).plansOn).toBe(false);
  });
  it('reads every number, and falls back on one that is not usable', () => {
    const c = planConfigFrom(
      env({ AI_DAILY_LIMIT: '50', AI_FREE_DAILY_LIMIT: '6', AI_GLOBAL_DAILY_LIMIT: '400', AI_GLOBAL_PAID_EXTRA: '0', COACH_DAILY_LIMIT: '20', COACH_FREE_DAILY_LIMIT: '3', COACH_GLOBAL_LIMIT: '200', COACH_GLOBAL_PAID_EXTRA: '50' }),
    );
    expect(c.ai).toEqual({ plus: 50, free: 6, global: 400, paidExtra: 0 });
    expect(c.coach).toEqual({ plus: 20, free: 3, global: 200, paidExtra: 50 });
    const bad = planConfigFrom(env({ AI_DAILY_LIMIT: '-3', AI_FREE_DAILY_LIMIT: '2.5', AI_GLOBAL_PAID_EXTRA: '-1', COACH_FREE_DAILY_LIMIT: 'five', COACH_DAILY_LIMIT: '0' }));
    expect([bad.ai.plus, bad.ai.free, bad.ai.paidExtra, bad.coach.free, bad.coach.plus]).toEqual([40, 5, 2000, 5, 30]);
  });
  it('R9: 0 still means "none" for AI_DAILY_LIMIT and AI_GLOBAL_DAILY_LIMIT, as before plans, on every plan', () => {
    const noneEach = planConfigFrom(env({ PLANS: 'on', ...TEST_PROVIDER, AI_DAILY_LIMIT: '0' }));
    expect([noneEach.ai.plus, noneEach.ai.free]).toEqual([0, 0]);
    for (const plan of ['free', 'plus'] as const) {
      for (const plansOn of [false, true]) expect(limitsFor({ plan, plansOn, createdAt: '2020-01-01T00:00:00Z', now: NOW, config: { ...noneEach, graceBefore: '2026-11-24T00:00:00.000Z', graceUntil: '2027-01-01T00:00:00.000Z' } }).estimates).toBe(0);
    }
    const noneAll = planConfigFrom(env({ PLANS: 'on', ...TEST_PROVIDER, AI_GLOBAL_DAILY_LIMIT: '0' }));
    for (const plan of ['free', 'plus'] as const) {
      for (const plansOn of [false, true]) expect(limitsFor({ plan, plansOn, createdAt: null, now: NOW, config: noneAll }).estimatesGlobal).toBe(0);
    }
    // The coach is not stopped by the estimates' 0, as before plans.
    expect(limitsFor({ plan: 'free', plansOn: true, createdAt: null, now: NOW, config: noneAll }).questionsGlobal).toBe(1000);
    expect(limitsFor({ plan: 'plus', plansOn: true, createdAt: null, now: NOW, config: noneAll }).questionsGlobal).toBeGreaterThan(1000);
    // A free number above Plus is held to Plus.
    expect(planConfigFrom(env({ AI_DAILY_LIMIT: '3', AI_FREE_DAILY_LIMIT: '5', COACH_DAILY_LIMIT: '2', COACH_FREE_DAILY_LIMIT: '9' }))).toMatchObject({ ai: { plus: 3, free: 3 }, coach: { plus: 2, free: 2 } });
  });
  it('R9: unset extras are two thirds of AI_GLOBAL_DAILY_LIMIT and one sixth of what free traffic can reach, so a lowered ceiling stays in proportion', () => {
    expect(planConfigFrom(env({ AI_GLOBAL_DAILY_LIMIT: '600' }))).toMatchObject({ ai: { global: 600, paidExtra: 400 }, coach: { paidExtra: 167 } });
    expect(planConfigFrom(env({ AI_GLOBAL_DAILY_LIMIT: '400' }))).toMatchObject({ ai: { paidExtra: 267 }, coach: { paidExtra: 167 } });
    expect(planConfigFrom(env({ AI_GLOBAL_DAILY_LIMIT: '400', COACH_GLOBAL_LIMIT: '400' }))).toMatchObject({ ai: { paidExtra: 267 }, coach: { paidExtra: 67 } });
    expect(planConfigFrom(env({ AI_GLOBAL_DAILY_LIMIT: '6000' }))).toMatchObject({ ai: { paidExtra: 4000 }, coach: { paidExtra: 1000 } });
    expect(planConfigFrom(env({ AI_GLOBAL_DAILY_LIMIT: '600', AI_GLOBAL_PAID_EXTRA: '50', COACH_GLOBAL_PAID_EXTRA: '0' }))).toMatchObject({ ai: { paidExtra: 50 }, coach: { paidExtra: 0 } });
  });
  it('P6: with AI_GLOBAL_DAILY_LIMIT=0 (no estimates) a Plus question still has room above the free coach ceiling', () => {
    const noEstimates = planConfigFrom(env({ PLANS: 'on', ...TEST_PROVIDER, AI_GLOBAL_DAILY_LIMIT: '0' }));
    expect(noEstimates.coach.paidExtra).toBe(167);
    const free = limitsFor({ plan: 'free', plansOn: true, createdAt: null, now: NOW, config: noEstimates });
    const plus = limitsFor({ plan: 'plus', plansOn: true, createdAt: null, now: NOW, config: noEstimates });
    expect(free.questionsGlobal).toBe(1000);
    expect(plus.questionsGlobal).toBe(1167);
    expect(plus.questionsGlobal).toBeGreaterThan(freeReach(noEstimates));
    expect(plus.estimatesGlobal).toBe(0);
    expect(dailyUnitCeiling(noEstimates)).toBe(1167);
  });
  it('grace dates: a day (start of that day, UTC) or a full instant; anything else means no grace', () => {
    expect(isoInstant('2026-11-23')).toBe('2026-11-23T00:00:00.000Z');
    expect(isoInstant('2027-01-31T23:59:59Z')).toBe('2027-01-31T23:59:59.000Z');
    expect(isoInstant('2027-01-31T12:00:00+02:00')).toBe('2027-01-31T10:00:00.000Z');
    for (const v of [undefined, '', 'soon', '2027-02-30', '31/01/2027', '2027-1-5']) expect(isoInstant(v)).toBeNull();
    const c = planConfigFrom(env({ PLANS_GRACE_BEFORE: '2026-11-24', PLANS_GRACE_UNTIL: '2027-01-31' }));
    expect([c.graceBefore, c.graceUntil]).toEqual(['2026-11-24T00:00:00.000Z', '2027-01-31T00:00:00.000Z']);
  });
});

describe('limitsFor: the limits for one call', () => {
  const on = planConfigFrom(env({ PLANS: 'on', ...TEST_PROVIDER, PLANS_GRACE_BEFORE: '2026-11-24', PLANS_GRACE_UNTIL: '2027-02-01' }));
  const early = '2026-01-10T09:00:00Z';
  const late = '2026-11-24T00:00:00Z';

  it("plans off: today's numbers for every account and plan, today's memory, no grace", () => {
    for (const plan of ['free', 'plus'] as const) {
      for (const createdAt of [early, late, null]) {
        expect(limitsFor({ plan, plansOn: false, createdAt, now: NOW, config: { ...on, plansOn: false } })).toEqual({
          plansOn: false,
          plan,
          allowance: 'today',
          estimates: 40,
          estimatesGlobal: 3000,
          questions: 30,
          questionsGlobal: 1000,
          memoryPairs: 3,
          graceUntil: null,
        });
      }
    }
  });
  it('free: 5 estimates and 5 questions, the shared ceilings, 3 pairs', () => {
    expect(limitsFor({ plan: 'free', plansOn: true, createdAt: late, now: NOW, config: on })).toEqual({
      plansOn: true,
      plan: 'free',
      allowance: 'free',
      estimates: 5,
      estimatesGlobal: 3000,
      questions: 5,
      questionsGlobal: 1000,
      memoryPairs: MEMORY_PAIRS.free,
      graceUntil: null,
    });
  });
  it('plus: 40 and 30, a ceiling above all free traffic by the paid extras, 6 pairs; an earlier account changes nothing', () => {
    for (const createdAt of [early, late]) {
      expect(limitsFor({ plan: 'plus', plansOn: true, createdAt, now: NOW, config: on })).toEqual({
        plansOn: true,
        plan: 'plus',
        allowance: 'plus',
        estimates: 40,
        estimatesGlobal: 5000,
        questions: 30,
        questionsGlobal: 3500,
        memoryPairs: MEMORY_PAIRS.plus,
        graceUntil: null,
      });
    }
  });
  it("grace: an account created before PLANS_GRACE_BEFORE keeps today's allowance until PLANS_GRACE_UNTIL", () => {
    const g = limitsFor({ plan: 'free', plansOn: true, createdAt: early, now: NOW, config: on });
    expect(g).toEqual({ plansOn: true, plan: 'free', allowance: 'grace', estimates: 40, estimatesGlobal: 3000, questions: 30, questionsGlobal: 1000, memoryPairs: 3, graceUntil: '2027-02-01T00:00:00.000Z' });
  });
  it('grace edges: created at the cut-off instant is not earlier; the grace ends at its instant', () => {
    const at = (createdAt: string | null, now: Date) => limitsFor({ plan: 'free', plansOn: true, createdAt, now, config: on }).allowance;
    expect(at('2026-11-23T23:59:59.999Z', NOW)).toBe('grace');
    expect(at('2026-11-24T00:00:00.000Z', NOW)).toBe('free');
    expect(at(early, new Date('2027-01-31T23:59:59.999Z'))).toBe('grace');
    expect(at(early, new Date('2027-02-01T00:00:00.000Z'))).toBe('free');
    expect(at(null, NOW)).toBe('free');
    expect(at('not a date', NOW)).toBe('free');
  });
  it('R9: a Plus call is never blocked by free traffic on the shared row, for estimates and the coach alike', () => {
    // Free (and grace) estimates fill the shared row up to 3,000; free questions stop at 1,000.
    const free = limitsFor({ plan: 'free', plansOn: true, createdAt: late, now: NOW, config: on });
    const grace = limitsFor({ plan: 'free', plansOn: true, createdAt: early, now: NOW, config: on });
    const plus = limitsFor({ plan: 'plus', plansOn: true, createdAt: late, now: NOW, config: on });
    const reachedByFree = Math.max(free.estimatesGlobal, free.questionsGlobal, grace.estimatesGlobal, grace.questionsGlobal);
    expect(reachedByFree).toBe(freeReach(on));
    expect(plus.estimatesGlobal).toBeGreaterThan(reachedByFree);
    expect(plus.questionsGlobal).toBeGreaterThan(reachedByFree);
    // Also when the coach's own ceiling is the higher one.
    const coachHigh = { ...on, coach: { ...on.coach, global: 5000 } };
    const p2 = limitsFor({ plan: 'plus', plansOn: true, createdAt: late, now: NOW, config: coachHigh });
    expect(p2.estimatesGlobal).toBe(7000);
    expect(p2.questionsGlobal).toBe(5500);
    // The bill's hard ceiling in units: 3,000 + 2,000 with the defaults; 3,000 while plans are off.
    expect(dailyUnitCeiling(on)).toBe(5000);
    expect(dailyUnitCeiling(DEFAULT)).toBe(3000);
    // The guide's lowered examples (docs/plans-and-payments.md, "What the AI can cost at most").
    expect(dailyUnitCeiling(planConfigFrom(env({ PLANS: 'on', ...TEST_PROVIDER, AI_GLOBAL_DAILY_LIMIT: '400' })))).toBe(1267);
    expect(dailyUnitCeiling(planConfigFrom(env({ PLANS: 'on', ...TEST_PROVIDER, AI_GLOBAL_DAILY_LIMIT: '400', COACH_GLOBAL_LIMIT: '400' })))).toBe(667);
  });
  it('no grace unless both dates are set', () => {
    expect(inGrace(early, NOW, { graceBefore: '2026-11-24T00:00:00.000Z', graceUntil: null })).toBe(false);
    expect(inGrace(early, NOW, { graceBefore: null, graceUntil: '2027-02-01T00:00:00.000Z' })).toBe(false);
    expect(limitsFor({ plan: 'free', plansOn: true, createdAt: early, now: NOW, config: { ...on, graceUntil: null } }).allowance).toBe('free');
  });
});

describe('resolveLimits: reading the plan', () => {
  it('reads nothing while plans are off', async () => {
    let reads = 0;
    const read = async () => {
      reads += 1;
      return { rows: [row()], error: null };
    };
    const l = await resolveLimits({ read, userId: 'u', createdAt: null, now: NOW, config: DEFAULT });
    expect([reads, l.allowance, l.estimates]).toEqual([0, 'today', 40]);
  });
  it('with plans on: an active row is Plus, none is free, an unreadable table throws', async () => {
    const on = { ...DEFAULT, plansOn: true, environment: 'sandbox' as const };
    expect((await resolveLimits({ read: async () => ({ rows: [row()], error: null }), userId: 'u', createdAt: null, now: NOW, config: on })).plan).toBe('plus');
    expect((await resolveLimits({ read: async () => ({ rows: [], error: null }), userId: 'u', createdAt: null, now: NOW, config: on })).estimates).toBe(5);
    expect((await resolveLimits({ read: async () => ({ rows: null, error: null }), userId: 'u', createdAt: null, now: NOW, config: on })).plan).toBe('free');
    await expect(resolveLimits({ read: async () => ({ rows: null, error: { message: 'down' } }), userId: 'u', createdAt: null, now: NOW, config: on })).rejects.toThrow('entitlements_unreadable');
    // R2 in the AI functions too: a sandbox row on a live setting is free.
    expect((await resolveLimits({ read: async () => ({ rows: [row()], error: null }), userId: 'u', createdAt: null, now: NOW, config: { ...on, environment: 'live' } })).plan).toBe('free');
  });
});

describe('the limit answer fields', () => {
  it('reset at the next midnight UTC, also from the last millisecond of a day and across a year', () => {
    expect(nextUtcMidnight(new Date('2026-11-23T00:00:00Z'))).toBe('2026-11-24T00:00:00.000Z');
    expect(nextUtcMidnight(new Date('2026-11-23T23:59:59.999Z'))).toBe('2026-11-24T00:00:00.000Z');
    expect(nextUtcMidnight(new Date('2026-12-31T22:00:00Z'))).toBe('2027-01-01T00:00:00.000Z');
  });
  it('carry the limit, the plan (null while plans are off), plansOn, the reset, and the grace end when it applies', () => {
    const on = planConfigFrom(env({ PLANS: 'on', ...TEST_PROVIDER, PLANS_GRACE_BEFORE: '2026-11-24', PLANS_GRACE_UNTIL: '2027-02-01' }));
    const off = limitsFor({ plan: 'free', plansOn: false, createdAt: null, now: NOW, config: DEFAULT });
    expect(limitFields(off, 'estimates', NOW, 1)).toEqual({ limit: 40, plan: null, plansOn: false, resetsAt: '2026-11-24T00:00:00.000Z', cost: 1 });
    const grace = limitsFor({ plan: 'free', plansOn: true, createdAt: '2026-01-01T00:00:00Z', now: NOW, config: on });
    expect(limitFields(grace, 'estimates', NOW, 5)).toEqual({ limit: 40, plan: 'free', plansOn: true, graceUntil: '2027-02-01T00:00:00.000Z', resetsAt: '2026-11-24T00:00:00.000Z', cost: 5 });
    const plus = limitsFor({ plan: 'plus', plansOn: true, createdAt: null, now: NOW, config: on });
    expect(limitFields(plus, 'questions', NOW, 1)).toEqual({ limit: 30, plan: 'plus', plansOn: true, resetsAt: '2026-11-24T00:00:00.000Z', cost: 1 });
  });
});
