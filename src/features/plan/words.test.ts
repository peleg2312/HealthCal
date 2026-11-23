/**
 * Ruling R19 and the morning page's banned list hold for every string the plan's words can return,
 * across a grid of views, offers and refusals; and the price formatting is exact.
 */
import { describe, expect, it } from 'vitest';

import { decideAfterCancel } from './accountRules';
import { DEMO_PRESETS, demoView } from './demo';
import type { PlanOffer } from './view';
import * as W from './words';

const R19 = /\b(upgrade|unlock|premium|run out|ran out|don't miss|do not miss|limited time|free users|last chance|hurry|only \d+ left|ends in|countdown)\b/i;
const MORNING =
  /\b(bad|fail|failed|failure|cheat|cheated|should|guilty|lazy|great|amazing|well done|keep it up|too much|missed your|goal missed|over budget|make up|only|unfortunately|oops|sorry)\b/i;

const offers: PlanOffer[] = [
  { id: 'm', plan: 'plus', period: 'month', amount: 399, currency: 'USD', taxIncluded: false },
  { id: 'y', plan: 'plus', period: 'year', amount: 2999, currency: 'USD', taxIncluded: null },
  { id: 'e', plan: 'plus', period: 'year', amount: 3499, currency: 'EUR', taxIncluded: true },
  { id: 'i', plan: 'plus', period: 'month', amount: 1490, currency: 'ILS', taxIncluded: true },
];
const CODES = [
  'already_subscribed', 'plans_off', 'not_configured', 'provider_failed', 'offline', 'timeout', 'rate_limited', 'checkout_limit', 'too_many', 'offer_unknown',
  'return_url_invalid', 'nothing_to_manage', 'cancel_elsewhere', 'unauthorized', 'signed_out', 'unconfirmed', 'no_backend', 'cancelled',
  'store_failed', 'internal', 'bad_answer', 'unknown_action',
];

function all(): Set<string> {
  const out = new Set<string>();
  const add = (s: string | null | undefined) => s && out.add(s);
  const now = Date.parse('2026-11-23T12:00:00Z');
  for (const p of DEMO_PRESETS) {
    const v = demoView(p, now);
    add(W.planShortLine(v));
    add(W.planRowLine(v));
    add(W.graceLine(v.graceUntil));
    add(W.subscriberLine(v));
    add(W.sourceLine(v.source));
    add(W.plusOnToast(v.periodEnd));
    if (v.startedAt) add(W.withdrawLine(v.startedAt));
    for (const r of W.cardRows(v.limits)) {
      add(r.label);
      add(r.value);
    }
    add(W.cardLabel(W.PLUS_CARD_TITLE, v.planLimits.plus, true));
  }
  for (const o of offers) {
    add(W.priceLine(o));
    add(W.monthlyEquivalent(o));
    add(W.taxNote(o));
    add(W.subscribeLabel(o));
    add(W.renewalLine(o));
    add(W.periodLabel(o.period));
  }
  for (const c of CODES) {
    for (const ctx of ['checkout', 'manage', 'status'] as const) for (const src of [undefined, 'app_store', 'play_store', 'promotional', 'polar']) add(W.refusalLine(c, ctx, src));
    for (const src of [undefined, 'app_store', 'play_store']) add(W.deleteBlockedLine(c, src));
    const d = decideAfterCancel({ ok: false, code: c });
    if (d.next === 'blocked') add(d.message);
  }
  for (const s of ['paddle', 'polar', 'stripe', 'test', 'app_store', 'play_store', 'promotional'] as const) add(W.sourceLine(s));
  for (const s of [
    W.PLAN_INTRO, W.SELLER_LINE, W.NOTHING_TO_CHOOSE, W.SIGNED_OUT_LINE, W.LOADING_LINE, W.WAITING_LINE, W.LATE_LINE, W.CHECKOUT_CLOSED,
    W.MANAGE_LABEL, W.CANCEL_LABEL, W.WITHDRAW_LABEL, W.TERMS_LABEL, W.PRIVACY_LABEL, W.DELETE_PLAN_LINE, W.DELETE_ANYWAY_LABEL,
    W.RELEASED_LINE, W.PLAN_ACTIVE_LINE, W.ADD_PASSWORD_LABEL, W.ADD_PASSWORD_HINT, W.addPasswordSent('a@b.co'),
    W.notBuyableHere('channel'), W.notBuyableHere('frame'),
  ])
    add(s);
  return out;
}

describe('plan words', () => {
  const strings = [...all()];
  it('hold to ruling R19 and the banned list', () => {
    expect(strings.length).toBeGreaterThan(60);
    const bad = strings.filter((s) => R19.test(s) || MORNING.test(s) || s.includes('!'));
    expect(bad).toEqual([]);
  });
  it('never name a payment company', () => {
    const bad = strings.filter((s) => /\b(polar|paddle|stripe|paypal|revenuecat)\b/i.test(s));
    expect(bad).toEqual([]);
  });
  it('start with a capital or a figure', () => {
    expect(strings.filter((s) => !/^[A-Z0-9$€₪]/.test(s))).toEqual([]);
  });
});

describe('money', () => {
  it('formats USD, EUR and ILS from minor units', () => {
    expect(W.formatMoney(2999, 'USD')).toBe('$29.99');
    expect(W.formatMoney(399, 'usd')).toBe('$3.99');
    expect(W.formatMoney(400, 'USD')).toBe('$4');
    expect(W.formatMoney(3499, 'EUR')).toBe('€34.99');
    expect(W.formatMoney(1490, 'ILS')).toBe('₪14.90');
    expect(W.formatMoney(129900, 'ILS')).toBe('₪1,299');
    expect(W.formatMoney(450, 'CHF')).toBe('CHF 4.50');
    expect(W.formatMoney(500, 'JPY')).toBe('¥500');
  });
  it('says the price, the period, the monthly equivalent and the tax', () => {
    const year = offers[1];
    expect(W.priceLine(year)).toBe('$29.99 a year');
    expect(W.monthlyEquivalent(year)).toBe('About $2.50 a month');
    expect(W.monthlyEquivalent(offers[0])).toBe(null);
    expect(W.monthlyEquivalent(offers[2])).toBe('About €2.92 a month');
    expect(W.taxNote(year)).toBe('Tax is added where it applies');
    expect(W.taxNote(offers[2])).toBe(null);
    expect(W.subscribeLabel(year)).toBe('Subscribe for $29.99 a year');
    expect(W.renewalLine(year)).toBe('Renews every year at $29.99 until you cancel. Cancel any time; Plus then stays to the end of the paid year.');
    expect(W.subscribeLabel(offers[3])).toBe('Subscribe for ₪14.90 a month');
  });
});

describe('rows and dates', () => {
  it('reads the plan in one line', () => {
    const base = { plan: 'plus' as const, state: 'active' as const, periodEnd: '2027-12-23T12:00:00Z', cancelAtPeriodEnd: false, paymentGraceUntil: null };
    expect(W.planRowLine({ ...base, plan: 'free', state: 'none' })).toBe('Free');
    expect(W.planRowLine(base)).toBe('Plus until Dec 23');
    expect(W.planRowLine({ ...base, state: 'canceling', cancelAtPeriodEnd: true })).toBe('Plus, ends Dec 23');
    expect(W.planRowLine({ ...base, state: 'past_due', paymentGraceUntil: '2027-12-30T12:00:00Z' })).toBe('Plus, payment due by Dec 30');
    expect(W.plusOnToast('2027-12-23T12:00:00Z')).toBe('Plus is on until Dec 23, 2027.');
    expect(W.graceLine('2027-01-31T12:00:00Z')).toBe('Your earlier allowance stays until Jan 31.');
  });
  it('gives the three rows as figures with units', () => {
    expect(W.cardRows({ estimates: 5, questions: 5, memoryPairs: 3 }).map((r) => `${r.label}: ${r.value}`)).toEqual([
      'AI estimates: 5 a day',
      'Coach questions: 5 a day',
      'Coach memory: 3 exchanges',
    ]);
    expect(W.cardRows({ estimates: 40, questions: 30, memoryPairs: 1 })[2].value).toBe('1 exchange');
  });
});
