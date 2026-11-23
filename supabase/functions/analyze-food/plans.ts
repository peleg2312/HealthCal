/**
 * The free and paid plans' rules on the server: which limits a call gets and whether stored rows make
 * a plan active. Pure and runtime-agnostic (no Deno globals, no imports), so it is unit-tested under
 * Node (billing/plans.test.ts).
 *
 * A function folder is deployed alone (scripts/ops/provision-supabase.mjs uploads only the files in
 * it), so the functions cannot share a file at run time. This file therefore sits, byte for byte the
 * same, in analyze-food/, coach-chat/ and billing/, as coach-chat/coach.ts copies `mailboxOf` from
 * analyze-food. billing/plans.test.ts fails when the three copies differ: change one, copy it to the
 * other two.
 *
 * The decisions behind it (docs/plans-and-payments.md):
 *  - plans are on only when PLANS=on AND BILLING_PROVIDER names a provider this code knows, with the
 *    secrets it needs (`providerNameFrom`). Anything else (unset, 'off', PLANS=on with no provider)
 *    keeps today's limits for every account (AI_DAILY_LIMIT, COACH_DAILY_LIMIT, the project ceilings,
 *    3 pairs of coach memory): nobody is cut to the free numbers while there is nothing to buy. The AI
 *    functions read the same two secrets through this file, so they agree with the billing function;
 *  - with plans on, free accounts get AI_FREE_DAILY_LIMIT and COACH_FREE_DAILY_LIMIT, Plus gets
 *    AI_DAILY_LIMIT and COACH_DAILY_LIMIT, and a Plus call's project ceiling sits above everything
 *    free traffic can reach on the one shared daily row (`freeReach`) by AI_GLOBAL_PAID_EXTRA /
 *    COACH_GLOBAL_PAID_EXTRA (by default two thirds of AI_GLOBAL_DAILY_LIMIT and one sixth of
 *    `freeReach`), so a busy free day never blocks a payer. AI_DAILY_LIMIT=0 and
 *    AI_GLOBAL_DAILY_LIMIT=0 still mean "no estimates", as before plans;
 *  - an account created before PLANS_GRACE_BEFORE keeps today's allowance (the Plus limits, today's
 *    memory and ceiling) until PLANS_GRACE_UNTIL;
 *  - the plan is decided only from `billing_entitlements` rows, written only by the billing function,
 *    and a row counts only in its own environment (BILLING_ENVIRONMENT, 'live' unless set to
 *    'sandbox'), so a sandbox or test purchase never gives Plus on a live project;
 *  - a failed renewal (`past_due`) for which the provider gave no grace keeps Plus until its period
 *    end + 7 days (`PAYMENT_GRACE_DAYS`).
 */

// ------------------------------------------------------------------ names

export const PLUS = 'plus';
export type Plan = 'free' | 'plus';

export const ENTITLEMENT_STATES = ['active', 'trialing', 'in_grace', 'past_due', 'canceling', 'expired', 'revoked'] as const;
export type EntitlementState = (typeof ENTITLEMENT_STATES)[number];
/** States that keep the plan while their paid-through (or grace) time is still ahead. */
export const ACTIVE_STATES: readonly EntitlementState[] = ['active', 'trialing', 'in_grace', 'canceling', 'past_due'];

export const SOURCES = ['paddle', 'polar', 'stripe', 'app_store', 'play_store', 'promotional', 'test'] as const;
export type Source = (typeof SOURCES)[number];

export const PERIODS = ['month', 'year'] as const;
export type Period = (typeof PERIODS)[number];

export const ENVIRONMENTS = ['live', 'sandbox'] as const;
export type BillingEnvironment = (typeof ENVIRONMENTS)[number];

/**
 * The payment providers this code has a file for (billing/providers.ts builds them). Only these
 * switch plans on. A new provider's name goes here AND in providers.ts, with its secrets checked in
 * `providerNameFrom`.
 */
export const PROVIDER_NAMES = ['test', 'polar'] as const;
export type ProviderName = (typeof PROVIDER_NAMES)[number];

/** States that end a plan whatever the dates say. Every other state is a subscription still open. */
export const TERMINAL_STATES: readonly EntitlementState[] = ['expired', 'revoked'];
export const isOpenState = (state: EntitlementState): boolean => !TERMINAL_STATES.includes(state);

/** A failed renewal with no grace from the provider keeps Plus this long after its period end. */
export const PAYMENT_GRACE_DAYS = 7;

/** One row of public.billing_entitlements, as the service role reads it (supabase/migrations/*_billing.sql). */
export interface EntitlementRow {
  entitlement: string;
  source: Source;
  provider_customer_id: string | null;
  provider_subscription_id: string | null;
  product_id: string | null;
  period: Period | null;
  state: EntitlementState;
  period_end: string | null;
  grace_until: string | null;
  cancel_at_period_end: boolean;
  environment: BillingEnvironment;
  /** When the current subscription began (the 14-day withdrawal window counts from it); null when unknown. */
  started_at: string | null;
  provider_updated_at: string;
  updated_at?: string;
}

/** The columns to select, so every reader asks for the same ones. */
export const ENTITLEMENT_COLUMNS =
  'entitlement, source, provider_customer_id, provider_subscription_id, product_id, period, state, period_end, grace_until, cancel_at_period_end, environment, started_at, provider_updated_at, updated_at';

// ------------------------------------------------------------- the rule

const time = (iso: string | null | undefined): number => {
  if (typeof iso !== 'string' || iso === '') return NaN;
  return Date.parse(iso);
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Paid through, or in grace through: `coalesce(grace_until, period_end)`, as a time (NaN when neither).
 * A `past_due` row with no grace from the provider: its period end + PAYMENT_GRACE_DAYS.
 */
export function activeUntil(row: Pick<EntitlementRow, 'grace_until' | 'period_end' | 'state'>): number {
  const grace = time(row.grace_until);
  if (!Number.isNaN(grace)) return grace;
  const end = time(row.period_end);
  return row.state === 'past_due' && !Number.isNaN(end) ? end + PAYMENT_GRACE_DAYS * DAY_MS : end;
}

/** A failed renewal's grace end as an instant (the provider's, or the 7-day fallback); null for other states. */
export function paymentGraceEnd(row: Pick<EntitlementRow, 'grace_until' | 'period_end' | 'state'> | null): string | null {
  if (!row || (row.state !== 'past_due' && row.state !== 'in_grace')) return null;
  const until = activeUntil(row);
  return Number.isNaN(until) ? null : new Date(until).toISOString();
}

/**
 * One row keeps Plus at `now`: the plus entitlement, from this environment (BILLING_ENVIRONMENT), an
 * active state and `coalesce(grace_until, period_end) > now` (period end + 7 days for a past_due row
 * with no grace).
 */
export function isActiveRow(row: EntitlementRow, now: Date, environment: BillingEnvironment): boolean {
  if (row.entitlement !== PLUS || !ACTIVE_STATES.includes(row.state)) return false;
  if ((row.environment ?? 'live') !== environment) return false;
  const until = activeUntil(row);
  return !Number.isNaN(until) && until > now.getTime();
}

/**
 * The row that makes Plus active at `now` in `environment`, or null (free). With more than one active
 * row (two sources), the one that lasts longest.
 */
export function activePlan(rows: readonly EntitlementRow[] | null | undefined, now: Date, environment: BillingEnvironment): EntitlementRow | null {
  let best: EntitlementRow | null = null;
  for (const row of rows ?? []) {
    if (!isActiveRow(row, now, environment)) continue;
    if (!best || activeUntil(row) > activeUntil(best)) best = row;
  }
  return best;
}

export const planOf = (rows: readonly EntitlementRow[] | null | undefined, now: Date, environment: BillingEnvironment): Plan =>
  activePlan(rows, now, environment) ? 'plus' : 'free';

// --------------------------------------------------------- configuration

/** Coach memory, in completed question-and-answer pairs. Today (and free) 3, Plus 6. */
export const MEMORY_PAIRS = { free: 3, plus: 6 } as const;

export const DEFAULTS = {
  aiPlus: 40,
  aiFree: 5,
  aiGlobal: 3000,
  coachPlus: 30,
  coachFree: 5,
  coachGlobal: 1000,
} as const;

/**
 * The Plus extras when their secrets are unset, so a lowered ceiling keeps them in proportion:
 * estimates two thirds of AI_GLOBAL_DAILY_LIMIT, the coach one sixth of what free traffic can reach
 * (the higher of AI_GLOBAL_DAILY_LIMIT and COACH_GLOBAL_LIMIT, `freeReach`). 3,000 and 1,000 give
 * 2,000 and 500; AI_GLOBAL_DAILY_LIMIT=0 gives 0 (no estimates) and 167 for the coach.
 */
export const PAID_EXTRA_SHARE = { ai: 2 / 3, coach: 1 / 6 } as const;

export interface PlanConfig {
  plansOn: boolean;
  /** The provider BILLING_PROVIDER names, when this code knows it and its secrets are there; else null. */
  provider: ProviderName | null;
  /** BILLING_ENVIRONMENT: only rows from this environment count. */
  environment: BillingEnvironment;
  ai: { plus: number; free: number; global: number; paidExtra: number };
  coach: { plus: number; free: number; global: number; paidExtra: number };
  /** Accounts created before this instant get the grace; null: no grace. */
  graceBefore: string | null;
  /** The grace lasts until this instant; null: no grace. */
  graceUntil: string | null;
}

const positiveInt = (raw: string | undefined, fallback: number): number => {
  const n = raw === undefined || raw.trim() === '' ? NaN : Number(raw);
  return Number.isInteger(n) && n > 0 ? n : fallback;
};
const nonNegativeInt = (raw: string | undefined, fallback: number): number => {
  const n = raw === undefined || raw.trim() === '' ? NaN : Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
};
/** An ISO date ('2027-01-31', read as the start of that day in UTC) or date-time; anything else is null. */
export function isoInstant(raw: string | undefined): string | null {
  const v = raw?.trim();
  if (!v || !/^\d{4}-\d{2}-\d{2}(?:T[\d:.]+(?:Z|[+-]\d{2}:?\d{2})?)?$/.test(v)) return null;
  const at = Date.parse(/T/.test(v) ? v : `${v}T00:00:00Z`);
  if (Number.isNaN(at)) return null;
  // '2027-02-30' parses in some engines: hold a date to the calendar.
  if (!/T/.test(v) && new Date(at).toISOString().slice(0, 10) !== v) return null;
  return new Date(at).toISOString();
}

/** BILLING_ENVIRONMENT: 'sandbox' when set so (any case), otherwise 'live'. */
export const environmentFrom = (env: (name: string) => string | undefined): BillingEnvironment =>
  (env('BILLING_ENVIRONMENT') ?? '').trim().toLowerCase() === 'sandbox' ? 'sandbox' : 'live';

/** The test provider's signing secret must be at least this long. */
export const TEST_SECRET_MIN = 16;

/** Polar's access token and webhook secret must each be at least this long. */
export const POLAR_SECRET_MIN = 16;
const POLAR_PRODUCT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface PolarSettings {
  /** POLAR_ACCESS_TOKEN: an organization access token from the same environment (sandbox or live). */
  token: string;
  /** POLAR_WEBHOOK_SECRET: the `whsec_...` secret of the webhook endpoint. */
  webhookSecret: string;
  /** POLAR_PRODUCT_MONTH / POLAR_PRODUCT_YEAR: the product ids (UUIDs) sold as Plus; at least one. */
  productMonth: string | null;
  productYear: string | null;
}

/**
 * The Polar secrets (billing/polarProvider.ts), or null when one is missing or malformed: both
 * secrets at least POLAR_SECRET_MIN long, and at least one product id, every one given a UUID.
 */
export function polarSettingsFrom(env: (name: string) => string | undefined): PolarSettings | null {
  const token = (env('POLAR_ACCESS_TOKEN') ?? '').trim();
  const webhookSecret = (env('POLAR_WEBHOOK_SECRET') ?? '').trim();
  const product = (name: string): string | null | undefined => {
    const v = (env(name) ?? '').trim();
    if (v === '') return null;
    return POLAR_PRODUCT_ID.test(v) ? v.toLowerCase() : undefined;
  };
  const productMonth = product('POLAR_PRODUCT_MONTH');
  const productYear = product('POLAR_PRODUCT_YEAR');
  if (token.length < POLAR_SECRET_MIN || webhookSecret.length < POLAR_SECRET_MIN) return null;
  if (productMonth === undefined || productYear === undefined || (productMonth === null && productYear === null)) return null;
  return { token, webhookSecret, productMonth, productYear };
}

/**
 * The provider BILLING_PROVIDER names, or null: unset, unknown, or missing what it needs. The test
 * provider needs BILLING_TEST_SECRET and a sandbox environment (BILLING_ENVIRONMENT=sandbox): it
 * never runs as a live provider. Polar needs its secrets (`polarSettingsFrom`); BILLING_ENVIRONMENT
 * chooses its sandbox or its live API. A real provider's file adds its own required secrets here.
 */
export function providerNameFrom(env: (name: string) => string | undefined): ProviderName | null {
  const name = (env('BILLING_PROVIDER') ?? '').trim().toLowerCase();
  if (!(PROVIDER_NAMES as readonly string[]).includes(name)) return null;
  switch (name as ProviderName) {
    case 'test':
      return (env('BILLING_TEST_SECRET') ?? '').length >= TEST_SECRET_MIN && environmentFrom(env) === 'sandbox' ? 'test' : null;
    case 'polar':
      return polarSettingsFrom(env) ? 'polar' : null;
  }
  return null;
}

/** Every plan secret with its default when missing or not usable. */
export function planConfigFrom(env: (name: string) => string | undefined): PlanConfig {
  const provider = providerNameFrom(env);
  // 0 means "none" for these two, as before plans (the owner's off switch for estimates).
  const aiPlus = nonNegativeInt(env('AI_DAILY_LIMIT'), DEFAULTS.aiPlus);
  const aiGlobal = nonNegativeInt(env('AI_GLOBAL_DAILY_LIMIT'), DEFAULTS.aiGlobal);
  const coachPlus = positiveInt(env('COACH_DAILY_LIMIT'), DEFAULTS.coachPlus);
  const coachGlobal = positiveInt(env('COACH_GLOBAL_LIMIT'), DEFAULTS.coachGlobal);
  return {
    plansOn: (env('PLANS') ?? '').trim().toLowerCase() === 'on' && provider !== null,
    provider,
    environment: environmentFrom(env),
    ai: {
      plus: aiPlus,
      // Free never above Plus: AI_DAILY_LIMIT=0 stops every estimate.
      free: Math.min(nonNegativeInt(env('AI_FREE_DAILY_LIMIT'), DEFAULTS.aiFree), aiPlus),
      global: aiGlobal,
      paidExtra: nonNegativeInt(env('AI_GLOBAL_PAID_EXTRA'), Math.round(aiGlobal * PAID_EXTRA_SHARE.ai)),
    },
    coach: {
      plus: coachPlus,
      free: Math.min(positiveInt(env('COACH_FREE_DAILY_LIMIT'), DEFAULTS.coachFree), coachPlus),
      global: coachGlobal,
      // From what free traffic can reach (`freeReach`), not from AI_GLOBAL_DAILY_LIMIT alone, so with
      // AI_GLOBAL_DAILY_LIMIT=0 (no estimates) a Plus question still has room above the free ceiling.
      paidExtra: nonNegativeInt(env('COACH_GLOBAL_PAID_EXTRA'), Math.round(Math.max(aiGlobal, coachGlobal) * PAID_EXTRA_SHARE.coach)),
    },
    graceBefore: isoInstant(env('PLANS_GRACE_BEFORE')),
    graceUntil: isoInstant(env('PLANS_GRACE_UNTIL')),
  };
}

/**
 * The highest the shared daily row ('*' in ai_quota, counted by bump_ai_usage for estimates and the
 * coach together) can reach from calls that are not Plus: free, grace and plans-off calls stop at
 * AI_GLOBAL_DAILY_LIMIT (estimates) or COACH_GLOBAL_LIMIT (coach), whichever is higher.
 */
export const freeReach = (config: Pick<PlanConfig, 'ai' | 'coach'>): number => Math.max(config.ai.global, config.coach.global);

/**
 * The most units the shared row can reach in a day, Plus included: the bill's hard ceiling
 * (docs/plans-and-payments.md works it into money).
 */
export const dailyUnitCeiling = (config: Pick<PlanConfig, 'ai' | 'coach' | 'plansOn'>): number => {
  if (!config.plansOn) return freeReach(config);
  const estimates = config.ai.global === 0 ? 0 : freeReach(config) + config.ai.paidExtra;
  return Math.max(freeReach(config), estimates, freeReach(config) + config.coach.paidExtra);
};

// ---------------------------------------------------------------- limits

/**
 * Which allowance a call runs on: 'today' while plans are off (every account, today's numbers),
 * 'free', 'plus', or 'grace' (a free account created before PLANS_GRACE_BEFORE, until PLANS_GRACE_UNTIL).
 */
export type Allowance = 'today' | 'free' | 'plus' | 'grace';

export interface Limits {
  plansOn: boolean;
  plan: Plan;
  allowance: Allowance;
  /** AI estimate units per person per UTC day, and the project ceiling this call is held to. */
  estimates: number;
  estimatesGlobal: number;
  /** Coach questions per person per UTC day, and the project ceiling this call is held to. */
  questions: number;
  questionsGlobal: number;
  /** Completed question-and-answer pairs of history the coach sends to the model. */
  memoryPairs: number;
  /** When the earlier-account grace applies: the instant it ends; otherwise null. */
  graceUntil: string | null;
}

export interface LimitsInput {
  plan: Plan;
  plansOn: boolean;
  /** The account's creation instant (auth.users.created_at); missing means no grace. */
  createdAt: string | null | undefined;
  now: Date;
  config: PlanConfig;
}

/** Whether the earlier-account grace applies: created before PLANS_GRACE_BEFORE and now before PLANS_GRACE_UNTIL. */
export function inGrace(createdAt: string | null | undefined, now: Date, config: Pick<PlanConfig, 'graceBefore' | 'graceUntil'>): boolean {
  const before = time(config.graceBefore);
  const until = time(config.graceUntil);
  const created = time(createdAt ?? null);
  if (Number.isNaN(before) || Number.isNaN(until) || Number.isNaN(created)) return false;
  return created < before && now.getTime() < until;
}

/** The limits for one call. The one place that maps a plan to numbers. */
export function limitsFor({ plan, plansOn, createdAt, now, config }: LimitsInput): Limits {
  const { ai, coach } = config;
  if (!plansOn) {
    return { plansOn: false, plan, allowance: 'today', estimates: ai.plus, estimatesGlobal: ai.global, questions: coach.plus, questionsGlobal: coach.global, memoryPairs: MEMORY_PAIRS.free, graceUntil: null };
  }
  if (plan === 'plus') {
    // Above everything free traffic can put on the shared row, for estimates and the coach alike. A
    // project ceiling of 0 for estimates stays 0 (no estimates at all).
    const reach = freeReach(config);
    return {
      plansOn: true,
      plan,
      allowance: 'plus',
      estimates: ai.plus,
      estimatesGlobal: ai.global === 0 ? 0 : reach + ai.paidExtra,
      questions: coach.plus,
      questionsGlobal: reach + coach.paidExtra,
      memoryPairs: MEMORY_PAIRS.plus,
      graceUntil: null,
    };
  }
  if (inGrace(createdAt, now, config)) {
    // Today's allowance, kept: the Plus numbers, today's memory and today's project ceiling.
    return { plansOn: true, plan, allowance: 'grace', estimates: ai.plus, estimatesGlobal: ai.global, questions: coach.plus, questionsGlobal: coach.global, memoryPairs: MEMORY_PAIRS.free, graceUntil: config.graceUntil };
  }
  return { plansOn: true, plan, allowance: 'free', estimates: ai.free, estimatesGlobal: ai.global, questions: coach.free, questionsGlobal: coach.global, memoryPairs: MEMORY_PAIRS.free, graceUntil: null };
}

/** Reads one person's entitlement rows; the functions pass a closure over their service-role client. */
export type EntitlementReader = (userId: string) => Promise<{ rows: EntitlementRow[] | null; error: unknown }>;

/**
 * The limits for a signed-in caller. While plans are off nothing is read (today's behaviour exactly).
 * Throws when the rows cannot be read: the caller answers 'quota_check_failed' rather than guessing.
 */
export async function resolveLimits(input: { read: EntitlementReader; userId: string; createdAt: string | null | undefined; now: Date; config: PlanConfig }): Promise<Limits> {
  const { read, userId, createdAt, now, config } = input;
  if (!config.plansOn) return limitsFor({ plan: 'free', plansOn: false, createdAt, now, config });
  const { rows, error } = await read(userId);
  if (error) throw new Error('entitlements_unreadable');
  return limitsFor({ plan: planOf(rows, now, config.environment), plansOn: true, createdAt, now, config });
}

// ------------------------------------------------------- the limit answer

/** The next midnight UTC after `now`: when the daily counts start again (bump_ai_usage counts by UTC day). */
export function nextUtcMidnight(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString();
}

export interface LimitFields {
  /** The person's daily number for this feature. */
  limit: number;
  /** 'free' or 'plus' while plans are on; null while they are off (the app then shows no plan words). */
  plan: Plan | null;
  plansOn: boolean;
  /** When the earlier-account grace applies, the instant it ends. */
  graceUntil?: string;
  /** When the count starts again (next midnight UTC); the app says it in local time. */
  resetsAt: string;
  /** The units the refused call needed: 1 for a quick estimate or a question, 5 for a careful estimate. */
  cost: number;
}

/** The fields every limit answer carries beside `error`, `message` and `remaining`, so the app can word it. */
export function limitFields(limits: Limits, feature: 'estimates' | 'questions', now: Date, cost: number): LimitFields {
  return {
    limit: feature === 'estimates' ? limits.estimates : limits.questions,
    plan: limits.plansOn ? limits.plan : null,
    plansOn: limits.plansOn,
    ...(limits.graceUntil ? { graceUntil: limits.graceUntil } : null),
    resetsAt: nextUtcMidnight(now),
    cost,
  };
}
