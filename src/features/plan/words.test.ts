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
const MORNING = /\b(bad|fail|failed|failure|cheat|cheated|should|guilty|lazy|great|amazing|well done|keep it up|too much|missed your|goal missed|over budget|make up|only|unfortunately|oops|sorry)\b/i;

const offers: PlanOffer[] = [
  {
    id: 'm',
    plan: 'plus',
    period: 'month',
    amount: 399,
    currency: 'USD',
    taxIncluded: false,
  },
  {
    id: 'y',
    plan: 'plus',
    period: 'year',
    amount: 2999,
    currency: 'USD',
    taxIncluded: null,
  },
  {
    id: 'e',
    plan: 'plus',
    period: 'year',
    amount: 3499,
    currency: 'EUR',
    taxIncluded: true,
  },
  {
    id: 'i',
    plan: 'plus',
    period: 'month',
    amount: 1490,
    currency: 'ILS',
    taxIncluded: true,
  },
];
const CODES = [
  'already_subscribed',
  'plans_off',
  'not_configured',
  'provider_failed',
  'offline',
  'timeout',
  'rate_limited',
  'checkout_limit',
  'too_many',
  'offer_unknown',
  'return_url_invalid',
  'nothing_to_manage',
  'cancel_elsewhere',
  'unauthorized',
  'signed_out',
  'unconfirmed',
  'no_backend',
  'cancelled',
  'store_failed',
  'internal',
  'bad_answer',
  'unknown_action',
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
    // The table's row label with its unit under it, as it reads on the screen.
    for (const r of W.cardRows(v.limits)) add(`${r.label} ${W.rowUnit(r.key)}`);
    add(W.pastDueDetail(v));
    add(W.memberSince(v.startedAt, 2026));
    add(W.memberSince(v.startedAt, 2030));
    add(W.eachDayUntil(v.periodEnd));
    if (v.startedAt) add(W.withdrawSub(v.startedAt));
    add(W.freeAiLine(v.planLimits.free));
    add(
      W.savingAndTax(
        v.offers.find((o) => o.period === 'month'),
        v.offers.find((o) => o.period === 'year'),
        { taxIncluded: false },
      ),
    );
  }
  for (const o of offers) {
    add(W.priceLine(o));
    add(W.monthlyEquivalent(o));
    add(W.taxNote(o));
    add(W.subscribeLabel(o));
    add(W.renewalLine(o));
    add(W.periodLabel(o.period));
    add(W.tileLabel(o, true));
    add(W.tileLabel(o, false));
    add(`${W.amountText(o)} ${W.unitText(o.period)}`);
  }
  add(W.yearSavingLine(offers[0], offers[1]));
  add(W.freeAiLine({ estimates: 1, questions: 1 }));
  for (const c of CODES) {
    for (const ctx of ['checkout', 'manage', 'status'] as const) for (const src of [undefined, 'app_store', 'play_store', 'promotional', 'polar']) add(W.refusalLine(c, ctx, src));
    for (const src of [undefined, 'app_store', 'play_store']) add(W.deleteBlockedLine(c, src));
    const d = decideAfterCancel({ ok: false, code: c });
    if (d.next === 'blocked') add(d.message);
  }
  for (const s of ['paddle', 'polar', 'stripe', 'test', 'app_store', 'play_store', 'promotional'] as const) add(W.sourceLine(s));
  for (const s of [
    W.PLAN_INTRO,
    W.SELLER_LINE,
    W.NOTHING_TO_CHOOSE,
    W.SIGNED_OUT_LINE,
    W.LOADING_LINE,
    W.WAITING_LINE,
    W.LATE_LINE,
    W.CHECKOUT_CLOSED,
    W.MANAGE_LABEL,
    W.CANCEL_LABEL,
    W.WITHDRAW_LABEL,
    W.TERMS_LABEL,
    W.PRIVACY_LABEL,
    W.DELETE_PLAN_LINE,
    W.DELETE_ANYWAY_LABEL,
    W.RELEASED_LINE,
    W.PLAN_ACTIVE_LINE,
    W.ADD_PASSWORD_LABEL,
    W.ADD_PASSWORD_HINT,
    W.addPasswordSent('a@b.co'),
    W.notBuyableHere('channel'),
    W.notBuyableHere('frame'),
    W.PLAN_INTRO_LEAD,
    W.PLAN_INTRO_MORE,
    W.YOUR_PLAN_TAG,
    W.STAYS_FREE_TITLE,
    W.STAYS_FREE_IF_CANCEL,
    W.STAYS_FREE_AFTER_END,
    ...W.STAYS_FREE_ROWS,
    W.STAYS_FREE_NOTE,
    W.EACH_DAY_TITLE,
    W.PAST_DUE_HEAD,
    W.CANCEL_SUB,
    W.BOTH_LEAD,
    W.SIGNED_OUT_TITLE,
    W.SIGNED_OUT_BODY,
    W.SIGN_IN_ACTION,
    W.OFF_TITLE,
    W.LATE_TITLE,
    W.LATE_MORE,
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
  it("keeps a tile's amount unbroken and its unit whole", () => {
    expect(W.amountText({ amount: 12990, currency: 'CHF' })).toBe('CHF\u00A0129.90');
    expect(W.amountText({ amount: 12990, currency: 'CAD' })).toBe('CA$129.90');
    expect(W.amountText({ amount: 2999, currency: 'USD' })).toBe('$29.99');
    expect(W.unitText('month')).toBe('a\u00A0month');
    expect(W.unitText('year')).toBe('a\u00A0year');
    expect(W.tieMoney('About CHF 10.83 a month')).toBe('About CHF\u00A010.83 a\u00A0month');
    expect(W.tieMoney('About $2.50 a month')).toBe('About $2.50 a\u00A0month');
    expect(W.tieMoney(null)).toBe(null);
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

  it('the button drops the period, never the price, when a long price would be cut on a narrow phone', () => {
    const chf = { amount: 1490, currency: 'CHF', period: 'month' as const };
    expect(W.subscribeLabel(chf)).toMatch(/^Subscribe for CHF.14\.90 a month$/);
    const narrow = W.subscribeLabel(chf, W.subscribeLabelRoom(320));
    expect(narrow.startsWith('Subscribe for CHF')).toBe(true);
    expect(narrow).not.toMatch(/month/);
    expect(narrow.length).toBeLessThanOrEqual(W.subscribeLabelRoom(320));
    // The usual price keeps its period at every width.
    const usd = { amount: 399, currency: 'USD', period: 'month' as const };
    expect(W.subscribeLabel(usd, W.subscribeLabelRoom(320))).toBe('Subscribe for $3.99 a month');
    expect(W.subscribeLabel(usd, W.subscribeLabelRoom(390))).toBe('Subscribe for $3.99 a month');
  });

  it('at a large app text size the button holds fewer letters: the period goes, then the price, never cut', () => {
    const usd = { amount: 399, currency: 'USD', period: 'month' as const };
    expect(W.subscribeLabelRoom(360, 1)).toBe(W.subscribeLabelRoom(360));
    expect(W.subscribeLabel(usd, W.subscribeLabelRoom(390, 1.5))).toBe('Subscribe for $3.99');
    expect(W.subscribeLabel(usd, W.subscribeLabelRoom(320, 2))).toBe('Subscribe');
    for (const size of [1, 1.15, 1.3, 1.5, 1.75, 2]) {
      for (const w of [320, 360, 390]) {
        const label = W.subscribeLabel(usd, W.subscribeLabelRoom(w, size));
        expect(label.length <= W.subscribeLabelRoom(w, size) || label === 'Subscribe').toBe(true);
      }
    }
  });
});

describe('rows and dates', () => {
  it('reads the plan in one line', () => {
    const base = {
      plan: 'plus' as const,
      state: 'active' as const,
      periodEnd: '2027-12-23T12:00:00Z',
      cancelAtPeriodEnd: false,
      paymentGraceUntil: null,
    };
    expect(W.planRowLine({ ...base, plan: 'free', state: 'none' })).toBe('Free');
    expect(W.planRowLine(base)).toBe('Plus until Dec 23');
    expect(W.planRowLine({ ...base, state: 'canceling', cancelAtPeriodEnd: true })).toBe('Plus, ends Dec 23');
    expect(
      W.planRowLine({
        ...base,
        state: 'past_due',
        paymentGraceUntil: '2027-12-30T12:00:00Z',
      }),
    ).toBe('Plus, payment due by Dec 30');
    expect(W.plusOnToast('2027-12-23T12:00:00Z')).toBe('Plus is on until Dec 23, 2027.');
    expect(W.graceLine('2027-01-31T12:00:00Z')).toBe('Your earlier allowance stays until Jan 31.');
  });
  it('gives the three rows as figures with units', () => {
    expect(W.cardRows({ estimates: 5, questions: 5, memoryPairs: 3 }).map((r) => `${r.label}: ${r.value}`)).toEqual(['AI estimates: 5 a day', 'Coach questions: 5 a day', 'Coach memory: 3 exchanges']);
    expect(W.cardRows({ estimates: 40, questions: 30, memoryPairs: 1 })[2].value).toBe('1 exchange');
    expect(W.cardRows({ estimates: 5, questions: 5, memoryPairs: 3 }).map((r) => W.rowUnit(r.key))).toEqual(['a day', 'a day', 'earlier exchanges']);
  });
  it('says a failed renewal in two parts that together are the one sentence', () => {
    const now = Date.parse('2026-11-23T12:00:00Z');
    const late = demoView('past_due', now);
    expect(`${W.PAST_DUE_HEAD} ${W.pastDueDetail(late)}`).toBe(W.subscriberLine(late));
    expect(W.pastDueDetail(late)).toMatch(/^Plus stays on until [A-Z][a-z]{2} \d{1,2}, \d{4} while it is tried again\. You can change the card in Manage or cancel\.$/);
    const noDate = { ...late, paymentGraceUntil: null, periodEnd: null };
    expect(W.pastDueDetail(noDate)).toBe('You can change the card in Manage or cancel.');
    expect(`${W.PAST_DUE_HEAD} ${W.pastDueDetail(noDate)}`).toBe(W.subscriberLine(noDate));
  });
  it('says since when, with the year only when it is another one', () => {
    expect(W.memberSince('2026-11-21T12:00:00Z', 2026)).toBe('Since Nov 21');
    expect(W.memberSince('2025-11-21T12:00:00Z', 2026)).toBe('Since Nov 21, 2025');
    expect(W.memberSince(null, 2026)).toBe(null);
    expect(W.eachDayUntil('2026-12-24T12:00:00Z')).toBe('Each day until Dec 24, 2026');
    expect(W.eachDayUntil(null)).toBe('Each day with Plus');
    expect(W.withdrawSub('2026-11-21T12:00:00Z')).toBe('Within 14 days of buying, until Dec 5');
  });
  it('keeps the last words of a wrapping line together', () => {
    expect(W.tieEnd('Logging, food search, barcode and the diary')).toBe('Logging, food search, barcode and\u00A0the\u00A0diary');
    expect(W.tieEnd("On the payment company's page", 2)).toBe("On the payment company's\u00A0page");
    expect(W.tieDates('Plus stays on until Nov 29, 2026 while it is tried again.')).toBe('Plus stays on until Nov\u00A029,\u00A02026 while it is tried again.');
    expect(W.tieDates('Within 14 days of buying, until Dec 5')).toBe('Within 14 days of buying, until Dec\u00A05');
    expect(W.tieDates('Nothing to tie here.')).toBe('Nothing to tie here.');
    // Too short to wrap badly: left alone.
    expect(W.tieEnd('No ads, on any')).toBe('No ads, on any');
    expect(W.tieEnd('Sign in', 2)).toBe('Sign in');
  });
  it('names the tiles and the free AI allowance', () => {
    expect(W.tileLabel(offers[0], true)).toBe('Monthly, $3.99 a month, selected');
    expect(W.tileLabel(offers[1], false)).toBe('Yearly, $29.99 a year, about $2.50 a month');
    expect(W.freeAiLine({ estimates: 5, questions: 5 })).toBe('5 AI estimates and 5 coach questions a day');
    expect(W.freeAiLine({ estimates: 1, questions: 1 })).toBe('1 AI estimate and 1 coach question a day');
    expect(W.PLAN_INTRO).toBe('Everything on your phone stays free. Plus gives the AI estimate and the coach more each day.');
  });
});
