/**
 * The plan as the app shows it: read from the billing function's status answer (pure, tested).
 *
 * The plan is decided on the server only. This is a display copy: what the last answer said, with
 * the everyday allowance (40 estimates, 30 questions, 3 earlier pairs) while nothing is known yet,
 * because that is what the server gives everyone while plans are off. A field the answer leaves out
 * or sends in a shape this code does not know reads as "nothing", never as Plus.
 */

export type PlanId = 'free' | 'plus';
export type PlanState = 'none' | 'active' | 'trialing' | 'in_grace' | 'past_due' | 'canceling' | 'expired' | 'revoked';
export type PlanSource = 'paddle' | 'polar' | 'stripe' | 'app_store' | 'play_store' | 'promotional' | 'test';
export type PlanPeriod = 'month' | 'year';

export interface PlanLimits {
  /** AI estimate units a day. */
  estimates: number;
  /** AI coach questions a day. */
  questions: number;
  /** Earlier question-and-answer pairs the coach may send. */
  memoryPairs: number;
}

export interface PlanOffer {
  id: string;
  plan: PlanId;
  period: PlanPeriod;
  /** In the currency's minor unit (cents, agorot). */
  amount: number;
  /** ISO 4217, upper case. */
  currency: string;
  /** True when the amount already holds the tax, false when tax is added, null when not known. */
  taxIncluded: boolean | null;
}

export interface PlanView {
  /** False until the first answer (or a cached answer) for this account. */
  known: boolean;
  plansOn: boolean;
  plan: PlanId;
  state: PlanState;
  periodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  source: PlanSource | null;
  period: PlanPeriod | null;
  /** The end of an earlier account's allowance, while it applies. */
  graceUntil: string | null;
  /** The end of a failed renewal's grace. */
  paymentGraceUntil: string | null;
  /** When the current subscription began (the 14 days to withdraw count from here). */
  startedAt: string | null;
  limits: PlanLimits;
  offers: PlanOffer[];
  canCheckout: boolean;
  canManage: boolean;
  /**
   * Each plan's allowance, for the two cards. From the answer's `planLimits` when the server sends it;
   * otherwise the server's documented defaults (PLAN_DEFAULTS), with the person's own plan taken from
   * `limits` (outside the earlier-account grace).
   */
  planLimits: { free: PlanLimits; plus: PlanLimits };
}

/**
 * The defaults in supabase/functions/billing/plans.ts (AI_FREE_DAILY_LIMIT, COACH_FREE_DAILY_LIMIT,
 * AI_DAILY_LIMIT, COACH_DAILY_LIMIT, MEMORY_PAIRS). Used for a card only when the answer carries no
 * `planLimits`; the figure for the person's own plan always comes from the answer.
 */
export const PLAN_DEFAULTS: { free: PlanLimits; plus: PlanLimits } = {
  free: { estimates: 5, questions: 5, memoryPairs: 3 },
  plus: { estimates: 40, questions: 30, memoryPairs: 6 },
};

/** The server's allowance for everyone while plans are off; shown while nothing is known. */
export const EVERYDAY_LIMITS: PlanLimits = { estimates: 40, questions: 30, memoryPairs: 3 };

export const UNKNOWN_PLAN: PlanView = {
  known: false,
  plansOn: false,
  plan: 'free',
  state: 'none',
  periodEnd: null,
  cancelAtPeriodEnd: false,
  source: null,
  period: null,
  graceUntil: null,
  paymentGraceUntil: null,
  startedAt: null,
  limits: EVERYDAY_LIMITS,
  offers: [],
  canCheckout: false,
  canManage: false,
  planLimits: PLAN_DEFAULTS,
};

const STATES: readonly PlanState[] = ['none', 'active', 'trialing', 'in_grace', 'past_due', 'canceling', 'expired', 'revoked'];
const SOURCES: readonly PlanSource[] = ['paddle', 'polar', 'stripe', 'app_store', 'play_store', 'promotional', 'test'];

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** An ISO instant the clock can read, else null. */
function instant(v: unknown): string | null {
  if (typeof v !== 'string' || v.length > 40) return null;
  return Number.isFinite(Date.parse(v)) ? v : null;
}

function count(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : fallback;
}

function limitsFrom(v: unknown, fallback: PlanLimits): PlanLimits {
  const l = isObj(v) ? v : {};
  return {
    estimates: count(l.estimates, fallback.estimates),
    questions: count(l.questions, fallback.questions),
    memoryPairs: count(l.memoryPairs, fallback.memoryPairs),
  };
}

function period(v: unknown): PlanPeriod | null {
  return v === 'month' || v === 'year' ? v : null;
}

function offerFrom(v: unknown): PlanOffer | null {
  if (!isObj(v)) return null;
  const p = period(v.period);
  if (typeof v.id !== 'string' || !/^[A-Za-z0-9_.:-]{1,64}$/.test(v.id)) return null;
  if (v.plan !== 'plus' || !p) return null;
  if (typeof v.amount !== 'number' || !Number.isInteger(v.amount) || v.amount <= 0) return null;
  if (typeof v.currency !== 'string' || !/^[A-Za-z]{3}$/.test(v.currency)) return null;
  const taxIncluded = v.taxIncluded === true ? true : v.taxIncluded === false ? false : null;
  return { id: v.id, plan: 'plus', period: p, amount: v.amount, currency: v.currency.toUpperCase(), taxIncluded };
}

/**
 * The view from one status answer. Null when the answer is not a status answer at all (an error,
 * an empty body), so a broken answer never replaces what is known.
 */
export function viewFromStatus(raw: unknown): PlanView | null {
  if (!isObj(raw) || typeof raw.plansOn !== 'boolean') return null;
  const state = STATES.includes(raw.state as PlanState) ? (raw.state as PlanState) : 'none';
  const source = SOURCES.includes(raw.source as PlanSource) ? (raw.source as PlanSource) : null;
  const limits = limitsFrom(raw.limits, EVERYDAY_LIMITS);
  const plan: PlanId = raw.plan === 'plus' ? 'plus' : 'free';
  const graceUntil = instant(raw.graceUntil);
  const sent = isObj(raw.planLimits) ? raw.planLimits : null;
  const own = graceUntil ? null : plan;
  const planLimits = {
    free: limitsFrom(sent?.free, own === 'free' && raw.plansOn ? limits : PLAN_DEFAULTS.free),
    plus: limitsFrom(sent?.plus, own === 'plus' && raw.plansOn ? limits : PLAN_DEFAULTS.plus),
  };
  const offers = Array.isArray(raw.offers) ? raw.offers.map(offerFrom).filter((o): o is PlanOffer => !!o) : [];
  return {
    known: true,
    plansOn: raw.plansOn,
    plan,
    state,
    periodEnd: instant(raw.periodEnd),
    cancelAtPeriodEnd: raw.cancelAtPeriodEnd === true,
    source,
    period: period(raw.period),
    graceUntil,
    paymentGraceUntil: instant(raw.paymentGraceUntil),
    startedAt: instant(raw.startedAt),
    limits,
    // No offer is shown while plans are off, whatever else the answer holds.
    offers: raw.plansOn ? offers : [],
    canCheckout: raw.plansOn && raw.canCheckout === true,
    canManage: raw.canManage === true,
    planLimits,
  };
}

/** A plan the person holds and has paid for (or that is ending or waiting on a payment). */
export function holdsPlus(v: Pick<PlanView, 'plan' | 'state'>): boolean {
  return v.plan === 'plus' || v.state === 'canceling' || v.state === 'past_due' || v.state === 'in_grace';
}

/** Ruling R14: the plan is shown while plans are on, or while the person holds a plan. */
export function planVisible(v: PlanView): boolean {
  return v.known && (v.plansOn || holdsPlus(v));
}

/** The plan is ending at the period's end (cancelled, still on until then). */
export function isEnding(v: Pick<PlanView, 'state' | 'cancelAtPeriodEnd'>): boolean {
  return v.state === 'canceling' || v.cancelAtPeriodEnd;
}

/** A renewal payment failed and Plus is kept for a grace period. */
export function paymentLate(v: Pick<PlanView, 'state'>): boolean {
  return v.state === 'past_due' || v.state === 'in_grace';
}

/** The offer for a period, if the server sent one. */
export function offerFor(v: Pick<PlanView, 'offers'>, p: PlanPeriod): PlanOffer | null {
  return v.offers.find((o) => o.period === p) ?? null;
}

export const WITHDRAW_DAYS = 14;

/** Ruling R16: "Withdraw from the contract" is offered for 14 days from the subscription's start. */
export function canWithdraw(v: Pick<PlanView, 'startedAt' | 'plan' | 'state' | 'source'>, now: number): boolean {
  if (!holdsPlus(v) || !v.startedAt || v.source === 'promotional') return false;
  const start = Date.parse(v.startedAt);
  return Number.isFinite(start) && now >= start && now < start + WITHDRAW_DAYS * 86_400_000;
}

/** The person has something the payment company's page can manage. */
export function canManageHere(v: Pick<PlanView, 'canManage' | 'plan' | 'state' | 'source'>): boolean {
  return v.canManage && holdsPlus(v) && v.source !== 'app_store' && v.source !== 'play_store' && v.source !== 'promotional';
}
