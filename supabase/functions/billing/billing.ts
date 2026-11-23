/**
 * The billing function's rules: the actions the app may ask for, the webhook, and the provider
 * interface. Runtime-agnostic (no Deno globals), so every rule is unit-tested under Node
 * (billing.test.ts); index.ts only wires it to HTTP, Supabase and the chosen provider.
 *
 * What the server keeps (supabase/migrations/20261123000000_billing.sql): one row per person and
 * source in `billing_entitlements` (provider ids, state, paid-through time, grace, cancel at period
 * end, when it started, sandbox or live), the ids of webhook events already handled and the
 * tombstones of plans released or ended without their person in `billing_events`, and the recent
 * refresh and checkout calls per person in `billing_calls` (the rate limits). All are written only by
 * the service role; the app never reads them, it asks this function. No card, no address, no price paid.
 *
 * The webhook rule, for every provider: verify the signature over the raw body (a missing signature
 * is refused before the body is read), skip an event id already handled, then re-read the person's
 * current state from the provider and overwrite the row. Arrival order and repeats therefore do not
 * matter. A failed re-read forgets the event id again, so the provider's retry is handled.
 *
 * The checkout is made here, for the signed-in confirmed account: the person's id comes from their
 * token, never from the request body, and the browser never names the person to the provider.
 */
import {
  activePlan,
  type BillingEnvironment,
  type EntitlementRow,
  type EntitlementState,
  ENTITLEMENT_STATES,
  isOpenState,
  limitsFor,
  paymentGraceEnd,
  type Period,
  PERIODS,
  type Plan,
  planOf,
  type PlanConfig,
  PLUS,
  type Source,
  SOURCES,
} from './plans.ts';

// ------------------------------------------------------------- the caps

/** An action request is a few short fields. */
export const ACTION_CAP_BYTES = 4 * 1024;
/** Providers' webhook bodies are a few kilobytes; 64 KB leaves room and stops a flood. */
export const WEBHOOK_CAP_BYTES = 64 * 1024;
export const MAX_RETURN_URL = 512;
export const MAX_OFFER_ID = 64;

// ------------------------------------------------------------- the errors

export const BILLING_MESSAGES = {
  method_not_allowed: 'Use POST.',
  unauthorized: 'Sign in to see your plan.',
  unconfirmed: 'Confirm your email address to see your plan.',
  body_too_large: 'That request is too large.',
  bad_body: 'Send the request as JSON.',
  unknown_action: 'That is not something the plan service does.',
  plans_off: 'Plans are not offered yet.',
  not_configured: 'Payments are not set up on the server yet.',
  offer_unknown: 'That offer is not available. Open the plan screen again.',
  return_url_invalid: "The return address is not one of the app's own.",
  already_subscribed: 'Your plan is already active.',
  nothing_to_manage: 'There is no paid plan to manage on this account.',
  cancel_elsewhere: 'This plan was bought in another store. Cancel it there.',
  provider_failed: 'The payment service did not answer. Try again in a moment.',
  checkout_limit: 'Several payment pages were opened in the last hour. Try again later.',
  store_failed: 'Could not read or save your plan. Try again in a moment.',
  bad_signature: 'The event signature is missing or wrong.',
  internal: 'Something went wrong on the server. Try again.',
} as const;
export type BillingErrorCode = keyof typeof BILLING_MESSAGES;

export class BillingError extends Error {
  constructor(
    public code: BillingErrorCode,
    public status: number,
    public extra?: Record<string, unknown>,
  ) {
    super(BILLING_MESSAGES[code]);
  }
}

/** The JSON body of a refusal. */
export const errorBody = (e: BillingError) => ({ error: e.code, message: BILLING_MESSAGES[e.code], ...e.extra });

// ---------------------------------------------------------------- the body

/**
 * Reads a body of at most `cap` bytes as UTF-8 text, exactly as sent (a webhook signature is over
 * these bytes). A content-length above the cap is refused before anything is read; a chunked body is
 * cancelled as soon as it passes the cap.
 */
export async function readCappedText(stream: ReadableStream<Uint8Array> | null, cap: number, contentLength?: string | null): Promise<string> {
  if (contentLength != null && contentLength !== '') {
    const declared = Number(contentLength);
    if (!Number.isFinite(declared) || declared > cap) {
      await stream?.cancel().catch(() => undefined);
      throw new BillingError('body_too_large', 413);
    }
  }
  if (!stream) return '';
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > cap) {
      await reader.cancel().catch(() => undefined);
      throw new BillingError('body_too_large', 413);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    bytes.set(c, at);
    at += c.byteLength;
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new BillingError('bad_body', 400);
  }
}

// ------------------------------------------------------------- the actions

export const ACTIONS = ['status', 'refresh', 'checkout', 'portal', 'cancel-now'] as const;
export type ActionName = (typeof ACTIONS)[number];

export type BillingAction =
  | { action: 'status' }
  | { action: 'refresh' }
  | { action: 'checkout'; offerId: string | null; returnUrl: string }
  | { action: 'portal'; returnUrl: string }
  | { action: 'cancel-now'; force: boolean };

const OFFER_ID = /^[A-Za-z0-9_.:-]{1,64}$/;

/** Parses and checks one action request. Unknown fields are ignored; every known one is checked. */
export function parseAction(text: string): BillingAction {
  let body: unknown;
  try {
    body = text === '' ? {} : JSON.parse(text);
  } catch {
    throw new BillingError('bad_body', 400);
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BillingError('bad_body', 400);
  const b = body as Record<string, unknown>;
  const action = b.action === undefined ? 'status' : b.action;
  if (typeof action !== 'string' || !(ACTIONS as readonly string[]).includes(action)) throw new BillingError('unknown_action', 400);
  const returnUrl = () => {
    if (typeof b.returnUrl !== 'string' || b.returnUrl.length === 0 || b.returnUrl.length > MAX_RETURN_URL) throw new BillingError('return_url_invalid', 400);
    return b.returnUrl;
  };
  switch (action as ActionName) {
    case 'checkout': {
      // A malformed offer id is answered `offer_unknown` by the action, after `plans_off` and
      // `not_configured`, so a caller learns nothing about offers while there are none.
      const offerId = typeof b.offerId === 'string' && OFFER_ID.test(b.offerId) ? b.offerId : null;
      return { action: 'checkout', offerId, returnUrl: returnUrl() };
    }
    case 'portal':
      return { action: 'portal', returnUrl: returnUrl() };
    case 'refresh':
      return { action: 'refresh' };
    case 'cancel-now':
      return { action: 'cancel-now', force: b.force === true };
    default:
      return { action: 'status' };
  }
}

/** The app's own addresses: where a checkout or portal may send the person back to. */
export const APP_SITE = 'https://healthcal.expo.app';
export const APP_SCHEME = 'healthcal:';

export interface ReturnRules {
  /** The configured site (BILLING_SITE_URL), e.g. a custom domain; https only. */
  siteUrl: string | null;
  /** Development: http://localhost and http://127.0.0.1 on any port. */
  allowLocalhost: boolean;
}

/**
 * Whether a return address is one of the app's own: https://healthcal.expo.app/..., the configured
 * site, healthcal://..., or localhost in development. No credentials in it, nothing but these.
 */
export function isAllowedReturnUrl(raw: string, rules: ReturnRules): boolean {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_RETURN_URL) return false;
  if (/[\s\u0000-\u001f\u007f\\]/.test(raw)) return false;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.username || url.password) return false;
  if (url.protocol === APP_SCHEME) return raw.startsWith('healthcal://');
  const origin = (u: string) => {
    try {
      const p = new URL(u);
      return p.protocol === 'https:' && !p.username && !p.password ? p.origin : null;
    } catch {
      return null;
    }
  };
  if (url.protocol === 'https:') return url.origin === APP_SITE || (rules.siteUrl !== null && url.origin === origin(rules.siteUrl));
  if (url.protocol === 'http:' && rules.allowLocalhost) return url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  return false;
}

// --------------------------------------------------------- the provider

/** What the plan screen can buy, read from the provider: the price shown is the price charged. */
export interface Offer {
  id: string;
  plan: typeof PLUS;
  period: Period;
  /** In the currency's minor unit (cents): 399 is $3.99. */
  amount: number;
  /** ISO 4217, upper case. */
  currency: string;
  /** Whether `amount` already holds the tax: true, false (tax is added at checkout) or null (unknown). */
  taxIncluded: boolean | null;
}

/** The provider's current record of one person's subscription, mapped to the row's fields. */
export interface ProviderState {
  source: Source;
  customerId: string | null;
  subscriptionId: string | null;
  productId: string | null;
  period: Period | null;
  state: EntitlementState;
  periodEnd: string | null;
  /** A failed renewal's grace from the provider; null otherwise (plans.ts then allows period end + 7 days). */
  graceUntil: string | null;
  cancelAtPeriodEnd: boolean;
  environment: BillingEnvironment;
  /** When the current subscription began (the provider's time); null when it does not say. */
  startedAt: string | null;
  /** The provider's own time for this state: an older state never overwrites a newer one. */
  updatedAt: string;
}

/** A verified webhook event: who it is about, as far as the provider says. */
export interface WebhookEvent {
  id: string;
  type: string;
  /** The Supabase user id the checkout carried (external customer id, custom data), when present. */
  userId: string | null;
  customerId: string | null;
}

export interface HeaderReader {
  get(name: string): string | null;
}

/**
 * Everything a payment provider must do. One file per provider beside index.ts in
 * supabase/functions/billing/ (flat: the deploy uploads only the folder's own files), chosen by
 * BILLING_PROVIDER in providers.ts, its name in PROVIDER_NAMES and its required secrets in
 * `providerNameFrom` (plans.ts). testProvider.ts is the reference.
 *
 * What a real provider's file must map, in `readState` (the test provider sends whatever state its
 * signed event carries, so it needs none of this):
 *  - a refund in full of the current period, or a chargeback (dispute) lost or opened: `revoked`, so
 *    Plus ends now. A partial refund changes nothing. Map it from the provider's order or refund
 *    record, not only from the subscription's own status, which can stay "active" after a refund;
 *  - a failed renewal: `past_due`, with the provider's own grace end in `graceUntil` when it has one
 *    (without one, plans.ts allows period end + 7 days);
 *  - cancelled at period end: `canceling` with `cancelAtPeriodEnd: true`; ended: `expired`;
 *  - `environment`: 'sandbox' for the provider's sandbox, 'live' for real money. A row counts only
 *    where it equals BILLING_ENVIRONMENT;
 *  - `startedAt`: when the current subscription began (the 14-day withdrawal window counts from it);
 *  - several subscriptions for one person (a double checkout from two devices): keep the provider's
 *    "one subscription per customer" setting on; if more than one is live anyway, return the one that
 *    started last and end the others at once, with a refund where the provider allows it;
 *  - `userId` may be null (the person no longer exists here): find the subscription by `customerId`.
 */
export interface BillingProvider {
  readonly id: Source;
  /** The prices on sale now (cache them for a few minutes; the plan screen asks on every open). */
  offers(): Promise<Offer[]>;
  /** A hosted checkout for this person and offer; the provider sends them back to `returnUrl`. */
  createCheckout(input: { userId: string; email: string | null; offer: Offer; returnUrl: string }): Promise<{ url: string }>;
  /** A one-time link to the provider's own portal (manage, cancel, card). */
  portalUrl(input: { userId: string; customerId: string | null; returnUrl: string }): Promise<string>;
  /**
   * Ends now, with no further charge, EVERY subscription the provider holds for this person (by the
   * user id it carries as external id, or the customer id), not only `subscriptionId`. Used before an
   * account is deleted and for a subscription whose person no longer exists. With `refund: true`
   * (billing.ts `endOrphan` always passes it) the provider's file also refunds each ended
   * subscription's last payment where the provider allows it. Nothing to end is not an error.
   */
  cancelNow(input: { userId: string | null; customerId: string | null; subscriptionId: string | null; refund?: boolean }): Promise<void>;
  /**
   * Optional: removes the person's customer record at the provider (anonymised where it can), after
   * every subscription has been ended, when the account is deleted. Nothing to remove is not an
   * error. A provider without this step leaves the record to its own retention rules.
   */
  forgetCustomer?(input: { userId: string; customerId: string | null }): Promise<void>;
  /** The person's current subscription at the provider, or null when there is none (see the mapping above). */
  readState(input: { userId: string | null; customerId: string | null }): Promise<ProviderState | null>;
  /** Cheap check, before the body is read: is a signature header there at all? */
  signaturePresent(headers: HeaderReader): boolean;
  /** Verifies the signature over the raw body and returns the event, or null when it does not verify. */
  verifyWebhook(raw: string, headers: HeaderReader, now: Date): Promise<WebhookEvent | null>;
}

// ------------------------------------------------------------ the store

/** The calls a person may make to the provider through this function (counted in billing_calls). */
export const CALL_RULES = {
  /** `refresh` reads the provider at most once every 2 s and 60 times an hour; otherwise it answers from the table. */
  refresh: { gapMs: 2000, perHour: 60 },
  /** `checkout` makes at most 10 payment pages an hour. */
  checkout: { gapMs: 0, perHour: 10 },
} as const;
export type CallKind = keyof typeof CALL_RULES;

/**
 * What a tombstone in billing_events says: a plan released for a delete ('released'), a subscription
 * ended because its person is gone ('orphan_ended'), an event about a subscription whose person could
 * not be matched and that was left alone ('unmatched'), or a customer record the provider could not
 * remove when its account was deleted ('customer_kept').
 */
export type ReleaseKind = 'released' | 'orphan_ended' | 'unmatched' | 'customer_kept';

/** A Supabase user id. Only such an id, reported gone by `userExists`, lets a subscription be ended as an orphan. */
export const USER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The tables, as the service role sees them. index.ts implements it with Supabase; tests use memory. */
export interface BillingStore {
  rows(userId: string): Promise<EntitlementRow[]>;
  /**
   * Upsert by (user, entitlement, source); a row whose provider time is older than the stored one is
   * ignored. Throws when the person does not exist (the foreign key).
   */
  write(userId: string, row: EntitlementRow): Promise<void>;
  /** Records an event id; false when it was already recorded. */
  recordEvent(event: { provider: string; eventId: string; type: string; userId: string | null }): Promise<boolean>;
  forgetEvent(provider: string, eventId: string): Promise<void>;
  /** A tombstone in billing_events: the source and the provider ids, kept after the account goes. */
  recordRelease(release: { provider: string; kind: ReleaseKind; customerId: string | null; subscriptionId: string | null; userId: string | null }): Promise<void>;
  /** Counts one call of this kind for the person when CALL_RULES allow it; false when they do not. */
  takeCall(userId: string, kind: CallKind): Promise<boolean>;
  /** False only when the person certainly does not exist; throws when that cannot be told. */
  userExists(userId: string): Promise<boolean>;
  userForCustomer(source: Source, customerId: string): Promise<string | null>;
}

/** The row a provider state becomes. */
export function rowFrom(state: ProviderState): EntitlementRow {
  return {
    entitlement: PLUS,
    source: state.source,
    provider_customer_id: state.customerId,
    provider_subscription_id: state.subscriptionId,
    product_id: state.productId,
    period: state.period,
    state: state.state,
    period_end: state.periodEnd,
    grace_until: state.graceUntil,
    cancel_at_period_end: state.cancelAtPeriodEnd,
    environment: state.environment,
    started_at: state.startedAt,
    provider_updated_at: state.updatedAt,
  };
}

const iso = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'string' || v.length > 40) throw new Error('bad time');
  const t = Date.parse(v);
  if (Number.isNaN(t)) throw new Error('bad time');
  return new Date(t).toISOString();
};
const shortText = (v: unknown, max = 200): string | null => {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'string' || v.length === 0 || v.length > max) throw new Error('bad text');
  return v;
};

/** Checks a provider state from untrusted JSON (the test provider's events); throws when anything is off. */
export function checkProviderState(v: unknown): ProviderState {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('bad state');
  const s = v as Record<string, unknown>;
  if (!(SOURCES as readonly unknown[]).includes(s.source)) throw new Error('bad source');
  if (!(ENTITLEMENT_STATES as readonly unknown[]).includes(s.state)) throw new Error('bad state');
  if (s.period !== null && s.period !== undefined && !(PERIODS as readonly unknown[]).includes(s.period)) throw new Error('bad period');
  if (s.environment !== undefined && s.environment !== 'sandbox' && s.environment !== 'live') throw new Error('bad environment');
  const updatedAt = iso(s.updatedAt);
  if (!updatedAt) throw new Error('bad updatedAt');
  return {
    source: s.source as Source,
    customerId: shortText(s.customerId),
    subscriptionId: shortText(s.subscriptionId),
    productId: shortText(s.productId),
    period: (s.period ?? null) as Period | null,
    state: s.state as EntitlementState,
    periodEnd: iso(s.periodEnd),
    graceUntil: iso(s.graceUntil),
    cancelAtPeriodEnd: s.cancelAtPeriodEnd === true,
    environment: (s.environment ?? 'sandbox') as BillingEnvironment,
    startedAt: iso(s.startedAt),
    updatedAt,
  };
}

// ------------------------------------------------------------ the status

export interface Caller {
  id: string;
  email: string | null;
  /** auth.users.created_at, for the earlier-account grace. */
  createdAt: string | null;
}

export interface BillingContext {
  caller: Caller;
  provider: BillingProvider | null;
  store: BillingStore;
  config: PlanConfig;
  returnRules: ReturnRules;
  now: Date;
}

export interface PlanNumbers {
  estimates: number;
  questions: number;
  memoryPairs: number;
}

export interface StatusAnswer {
  plansOn: boolean;
  plan: Plan;
  /** The row's state, or 'none' when there is no row. */
  state: EntitlementState | 'none';
  periodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  source: Source | null;
  period: Period | null;
  /** When the current subscription began (the 14-day withdrawal window counts from it); null when unknown or none. */
  startedAt: string | null;
  /** The earlier-account grace's end, when it applies to this person now. */
  graceUntil: string | null;
  /** A failed renewal's grace end (state past_due or in_grace): the provider's, or period end + 7 days. */
  paymentGraceUntil: string | null;
  limits: { estimates: number; questions: number; memoryPairs: number };
  /**
   * The free and Plus numbers as they are with plans on, from the same configuration (`limitsFor`),
   * so the plan screen's two cards show the server's figures. Sent with plans off too: then they are
   * what plans would give once switched on, not the person's numbers now (those are `limits`).
   */
  planLimits: { free: PlanNumbers; plus: PlanNumbers };
  offers: Offer[];
  canCheckout: boolean;
  canManage: boolean;
}

/** The row shown: the active one, else the most recently changed one of this environment. */
export function shownRow(rows: readonly EntitlementRow[], now: Date, environment: BillingEnvironment): EntitlementRow | null {
  const active = activePlan(rows, now, environment);
  if (active) return active;
  let latest: EntitlementRow | null = null;
  for (const r of rows) {
    if (r.environment !== environment) continue;
    if (!latest || Date.parse(r.provider_updated_at) > Date.parse(latest.provider_updated_at)) latest = r;
  }
  return latest;
}

/** A row of this BILLING_ENVIRONMENT (a row without one is live, as in plans.ts `isActiveRow`). */
const inEnvironment = (r: EntitlementRow, environment: BillingEnvironment) => (r.environment ?? 'live') === environment;

/** The row whose provider portal can be opened from here: from this provider and environment, with a customer id. */
const manageableRow = (rows: readonly EntitlementRow[], provider: BillingProvider | null, environment: BillingEnvironment): EntitlementRow | null =>
  provider === null ? null : (rows.find((r) => r.source === provider.id && !!r.provider_customer_id && inEnvironment(r, environment)) ?? null);

/** The free and Plus numbers as they are with plans on (no earlier-account grace): the plan screen's two cards. */
export function planLimitsFor(config: PlanConfig, now: Date): { free: PlanNumbers; plus: PlanNumbers } {
  const pick = (plan: Plan): PlanNumbers => {
    const l = limitsFor({ plan, plansOn: true, createdAt: null, now, config });
    return { estimates: l.estimates, questions: l.questions, memoryPairs: l.memoryPairs };
  };
  return { free: pick('free'), plus: pick(PLUS) };
}

export async function statusFor(ctx: BillingContext, rows?: EntitlementRow[]): Promise<StatusAnswer> {
  const { caller, provider, store, config, now } = ctx;
  const mine = rows ?? (await store.rows(caller.id));
  const plan = planOf(mine, now, config.environment);
  const limits = limitsFor({ plan, plansOn: config.plansOn, createdAt: caller.createdAt, now, config });
  const row = shownRow(mine, now, config.environment);
  let offers: Offer[] = [];
  if (config.plansOn && provider) {
    try {
      offers = await provider.offers();
    } catch {
      offers = [];
    }
  }
  return {
    plansOn: config.plansOn,
    plan,
    state: row?.state ?? 'none',
    periodEnd: row?.period_end ?? null,
    cancelAtPeriodEnd: row?.cancel_at_period_end ?? false,
    source: row?.source ?? null,
    period: row?.period ?? null,
    startedAt: row?.started_at ?? null,
    graceUntil: limits.allowance === 'grace' ? limits.graceUntil : null,
    paymentGraceUntil: paymentGraceEnd(row),
    limits: { estimates: limits.estimates, questions: limits.questions, memoryPairs: limits.memoryPairs },
    planLimits: planLimitsFor(config, now),
    offers,
    canCheckout: config.plansOn && provider !== null && plan === 'free' && offers.length > 0,
    canManage: manageableRow(mine, provider, config.environment) !== null,
  };
}

// ------------------------------------------------------- syncing a person

/** A subscription the provider still holds open (not expired or revoked), whatever its dates say. */
const isLive = (state: ProviderState | null | undefined): state is ProviderState => !!state && isOpenState(state.state);

/**
 * A live subscription whose person no longer exists here: end it at the provider at once, refund its
 * last payment (`refund: true`; the provider's file does it where the provider allows) and keep a
 * tombstone. Called only for a user id (a UUID) that `userExists` reported gone. Throws when the
 * provider fails, so a webhook is retried.
 */
export async function endOrphan(provider: BillingProvider, store: BillingStore, input: { userId: string; customerId: string | null; state: ProviderState }): Promise<void> {
  const customerId = input.state.customerId ?? input.customerId;
  await provider.cancelNow({ userId: input.userId, customerId, subscriptionId: input.state.subscriptionId, refund: true });
  await store.recordRelease({ provider: provider.id, kind: 'orphan_ended', customerId, subscriptionId: input.state.subscriptionId, userId: null });
}

/**
 * Re-reads the person's state at the provider and writes it. With no subscription at the provider, a
 * row this provider wrote earlier and still holds open is marked expired, keeping the row's own
 * provider time (never the server's clock, so a provider event with a slightly older clock is still
 * applied). A read that throws changes nothing. A live subscription whose person no longer exists
 * (the account went while the read was on its way) is ended at the provider.
 */
export async function syncFromProvider(provider: BillingProvider, store: BillingStore, userId: string, known?: EntitlementRow[]): Promise<EntitlementRow[]> {
  const rows = known ?? (await store.rows(userId));
  const customerId = rows.find((r) => r.source === provider.id && r.provider_customer_id)?.provider_customer_id ?? null;
  const state = await provider.readState({ userId, customerId });
  if (state) {
    try {
      await store.write(userId, rowFrom(state));
    } catch (e) {
      // Ended only for a user id that is a UUID and definitely gone; when that cannot be told, the
      // error stands (a refresh answers 502, a webhook is retried) and the subscription is left alone.
      if (!USER_ID.test(userId) || (await store.userExists(userId))) throw e;
      if (isLive(state)) await endOrphan(provider, store, { userId, customerId, state });
      return [];
    }
  } else {
    for (const r of rows.filter((x) => x.source === provider.id && isOpenState(x.state))) {
      await store.write(userId, { ...r, state: 'expired' });
    }
  }
  return store.rows(userId);
}

// ------------------------------------------------------------ the actions

export interface Answer {
  status: number;
  body: unknown;
}

const fail = (e: BillingError): Answer => ({ status: e.status, body: errorBody(e) });

/** Rows that keep a payment running somewhere: open, and not a promotional grant (nothing is charged for one). */
const paidOpen = (rows: readonly EntitlementRow[]) => rows.filter((r) => isOpenState(r.state) && r.source !== 'promotional');

/**
 * The answer to `cancel-now` on success. `cancelled: true` means nothing paid keeps running for this
 * person at the payment company, so the account may be deleted; `ended` says whether this call ended
 * a subscription. With `force`, when that could not be done: `cancelled: false, released: true`.
 */
export interface CancelAnswer {
  cancelled: boolean;
  released: true;
  ended: boolean;
  /**
   * Whether the person's customer record at the payment company was removed (anonymised): true when
   * it was (or there was none), false when that step failed (a `customer_kept` tombstone is kept and
   * the account may still be deleted), null when it was not tried (no provider, a provider without the
   * step, or a forced release).
   */
  customerRemoved: boolean | null;
}

/**
 * Ends every paid subscription of the caller before the account is deleted (R4). The provider is
 * asked first (its current state), then told to end everything it holds for the person, then read
 * again: a subscription it still shows open is a failure. Every open row of this provider is then
 * closed (expired, at its own provider time), so `delete_my_account` (which refuses while a paid
 * row is open) can go ahead. Throws a BillingError when it could not.
 */
async function cancelEverything(ctx: BillingContext, rows: EntitlementRow[]): Promise<CancelAnswer> {
  const { caller, provider, store } = ctx;
  const open = paidOpen(rows);
  const elsewhere = open.find((r) => !provider || r.source !== provider.id);
  if (elsewhere) {
    if (provider) throw new BillingError('cancel_elsewhere', 409, { source: elsewhere.source });
    throw new BillingError('not_configured', 503);
  }
  if (!provider) return { cancelled: true, released: true, ended: false, customerRemoved: null };

  const customerId = rows.find((r) => r.source === provider.id && r.provider_customer_id)?.provider_customer_id ?? null;
  let before: ProviderState | null;
  try {
    before = await provider.readState({ userId: caller.id, customerId });
  } catch {
    throw new BillingError('provider_failed', 502);
  }
  let ended = false;
  if (isLive(before) || open.length > 0) {
    try {
      await provider.cancelNow({
        userId: caller.id,
        customerId: before?.customerId ?? customerId,
        subscriptionId: before?.subscriptionId ?? open[0]?.provider_subscription_id ?? null,
      });
    } catch {
      throw new BillingError('provider_failed', 502);
    }
    ended = true;
    let after: ProviderState | null | undefined;
    try {
      after = await provider.readState({ userId: caller.id, customerId: before?.customerId ?? customerId });
    } catch {
      after = undefined; // Ended at the provider; its own events will say so later.
    }
    if (isLive(after)) throw new BillingError('provider_failed', 502);
    if (after) {
      try {
        await store.write(caller.id, rowFrom(after));
      } catch {
        throw new BillingError('store_failed', 500);
      }
    }
  }
  try {
    for (const r of paidOpen(await store.rows(caller.id))) {
      if (r.source === provider.id) await store.write(caller.id, { ...r, state: 'expired', cancel_at_period_end: false });
    }
  } catch {
    throw new BillingError('store_failed', 500);
  }
  return { cancelled: true, released: true, ended, customerRemoved: await forgetAtProvider(provider, store, caller.id, before?.customerId ?? customerId) };
}

/**
 * After every subscription is ended for a deletion: removes the person's customer record at the
 * provider where its file can. A failure never fails the deletion: it is recorded (a `customer_kept`
 * tombstone with Polar's customer id, else `external:<user id>`, so the owner can remove it by hand)
 * and the answer says `customerRemoved: false`.
 */
async function forgetAtProvider(provider: BillingProvider, store: BillingStore, userId: string, customerId: string | null): Promise<boolean | null> {
  if (!provider.forgetCustomer) return null;
  try {
    await provider.forgetCustomer({ userId, customerId });
    return true;
  } catch {
    await store
      .recordRelease({ provider: provider.id, kind: 'customer_kept', customerId: customerId ?? `external:${userId}`, subscriptionId: null, userId })
      .catch(() => undefined);
    return false;
  }
}

/** Runs one action for the signed-in caller. Never throws: every failure is an answer. */
export async function handleAction(action: BillingAction, ctx: BillingContext): Promise<Answer> {
  const { caller, provider, store, config, now } = ctx;
  try {
    let rows: EntitlementRow[];
    try {
      rows = await store.rows(caller.id);
    } catch {
      throw new BillingError('store_failed', 500);
    }

    switch (action.action) {
      case 'status':
        return { status: 200, body: await statusFor(ctx, rows) };

      case 'refresh': {
        if (provider) {
          // At most once every 2 s and 60 times an hour per person; otherwise the table answers.
          const allowed = await store.takeCall(caller.id, 'refresh').catch(() => false);
          if (allowed) {
            try {
              rows = await syncFromProvider(provider, store, caller.id, rows);
            } catch {
              throw new BillingError('provider_failed', 502);
            }
          }
        }
        return { status: 200, body: await statusFor(ctx, rows) };
      }

      case 'checkout': {
        if (!config.plansOn) throw new BillingError('plans_off', 409);
        if (!provider) throw new BillingError('not_configured', 503);
        if (action.offerId === null) throw new BillingError('offer_unknown', 400);
        if (planOf(rows, now, config.environment) === 'plus') throw new BillingError('already_subscribed', 409);
        if (!isAllowedReturnUrl(action.returnUrl, ctx.returnRules)) throw new BillingError('return_url_invalid', 400);
        let allowed: boolean;
        try {
          allowed = await store.takeCall(caller.id, 'checkout');
        } catch {
          throw new BillingError('store_failed', 500);
        }
        if (!allowed) throw new BillingError('checkout_limit', 429);
        let offers: Offer[];
        try {
          offers = await provider.offers();
        } catch {
          throw new BillingError('provider_failed', 502);
        }
        const offer = offers.find((o) => o.id === action.offerId);
        if (!offer) throw new BillingError('offer_unknown', 400);
        try {
          const { url } = await provider.createCheckout({ userId: caller.id, email: caller.email, offer, returnUrl: action.returnUrl });
          return { status: 200, body: { url } };
        } catch {
          throw new BillingError('provider_failed', 502);
        }
      }

      case 'portal': {
        if (!provider) throw new BillingError('not_configured', 503);
        if (!isAllowedReturnUrl(action.returnUrl, ctx.returnRules)) throw new BillingError('return_url_invalid', 400);
        // Only a row of this environment: a sandbox customer id means nothing to the live API.
        const row = manageableRow(rows, provider, config.environment);
        if (!row) {
          const elsewhere = activePlan(rows, now, config.environment);
          if (elsewhere && elsewhere.source !== 'promotional') throw new BillingError('cancel_elsewhere', 409, { source: elsewhere.source });
          throw new BillingError('nothing_to_manage', 404);
        }
        try {
          return { status: 200, body: { url: await provider.portalUrl({ userId: caller.id, customerId: row.provider_customer_id, returnUrl: action.returnUrl }) } };
        } catch {
          throw new BillingError('provider_failed', 502);
        }
      }

      case 'cancel-now': {
        // Account deletion asks this first. A promotional grant simply goes with the account.
        try {
          return { status: 200, body: await cancelEverything(ctx, rows) };
        } catch (e) {
          if (!action.force || !(e instanceof BillingError) || e.code === 'store_failed') throw e;
        }
        // force: the provider could not end it (or there is none for this source). Release the rows
        // so the account can go, and keep a tombstone of each, so the owner can still cancel and
        // refund it at the payment company and later events can be matched.
        try {
          for (const r of paidOpen(await store.rows(caller.id))) {
            await store.write(caller.id, { ...r, state: 'revoked', cancel_at_period_end: false });
            await store.recordRelease({ provider: r.source, kind: 'released', customerId: r.provider_customer_id, subscriptionId: r.provider_subscription_id, userId: caller.id });
          }
        } catch {
          throw new BillingError('store_failed', 500);
        }
        const answer: CancelAnswer & { cancelled: false } = { cancelled: false, released: true, ended: false, customerRemoved: null };
        return { status: 200, body: answer };
      }
    }
  } catch (e) {
    if (e instanceof BillingError) return fail(e);
    return fail(new BillingError('internal', 500));
  }
}

// ------------------------------------------------------------- the webhook

/**
 * One webhook delivery. The order is the rule: no provider, refuse; no signature header, refuse
 * before reading; read the capped raw body; verify; find the person; record the event id (seen:
 * acknowledge, do nothing); re-read and overwrite; on a failed re-read forget the id and answer 5xx
 * so the provider retries. A subscription is ended as an orphan (R6, refunded, tombstone
 * `orphan_ended`) ONLY when its customer's external id is a UUID that `userExists` definitely reports
 * gone. With no external id, one that is not a UUID, or when the auth service cannot answer, the event
 * is recorded with what is known (tombstone `unmatched`) and the subscription is left alone.
 */
export async function handleWebhook(input: {
  provider: BillingProvider | null;
  store: BillingStore;
  headers: HeaderReader;
  readBody: () => Promise<string>;
  now: Date;
}): Promise<Answer> {
  const { provider, store, headers, readBody, now } = input;
  if (!provider) return fail(new BillingError('not_configured', 503));
  if (!provider.signaturePresent(headers)) return fail(new BillingError('bad_signature', 401));

  let raw: string;
  try {
    raw = await readBody();
  } catch (e) {
    return fail(e instanceof BillingError ? e : new BillingError('bad_body', 400));
  }

  let event: WebhookEvent | null;
  try {
    event = await provider.verifyWebhook(raw, headers, now);
  } catch {
    event = null;
  }
  if (!event) return fail(new BillingError('bad_signature', 401));

  try {
    // Whether the person the event names exists: true, false (definitely gone), or null (no user id
    // that is a UUID, or the auth service could not say).
    const named = event.userId !== null && USER_ID.test(event.userId) ? event.userId : null;
    const exists: boolean | null = named ? await store.userExists(named).catch(() => null) : null;
    let userId = exists === true ? named : null;
    if (!userId && event.customerId) userId = await store.userForCustomer(provider.id, event.customerId);

    if (!userId) {
      if (!event.userId && !event.customerId) return { status: 200, body: { received: true, ignored: 'unknown_person' } };
      const fresh = await store.recordEvent({ provider: provider.id, eventId: event.id, type: event.type, userId: null });
      if (!fresh) return { status: 200, body: { received: true, duplicate: true } };
      let state: ProviderState | null;
      try {
        state = await provider.readState({ userId: event.userId, customerId: event.customerId });
      } catch {
        await store.forgetEvent(provider.id, event.id).catch(() => undefined);
        return fail(new BillingError('provider_failed', 502));
      }
      if (named && exists === false) {
        // R6 / P4: the only case a subscription is ended here: its customer's external id is one of
        // our user ids and the auth service says that person is gone.
        if (isLive(state)) {
          try {
            await endOrphan(provider, store, { userId: named, customerId: event.customerId, state });
          } catch {
            await store.forgetEvent(provider.id, event.id).catch(() => undefined);
            return fail(new BillingError('provider_failed', 502));
          }
          return { status: 200, body: { received: true, ignored: 'unknown_person', ended: true } };
        }
        return { status: 200, body: { received: true, ignored: 'unknown_person' } };
      }
      if (named && exists === null && state) {
        // The auth service could not say: the person may well exist, so the row is written as for
        // anyone (the foreign key refuses it when they do not), and nothing is ended.
        try {
          await store.write(named, rowFrom(state));
          return { status: 200, body: { received: true } };
        } catch {
          // Gone or unwritable: recorded below, left alone.
        }
      }
      // No external id (a checkout link made in the provider's dashboard), one that is not ours, or
      // a person who cannot be told apart from a gone one: the event id is recorded above, and a live
      // subscription gets an `unmatched` tombstone with what is known, for the owner to look at. It is
      // never ended from here.
      if (isLive(state)) {
        await store.recordRelease({ provider: provider.id, kind: 'unmatched', customerId: state?.customerId ?? event.customerId, subscriptionId: state?.subscriptionId ?? null, userId: null });
      }
      return { status: 200, body: { received: true, ignored: 'unknown_person' } };
    }

    const fresh = await store.recordEvent({ provider: provider.id, eventId: event.id, type: event.type, userId });
    if (!fresh) return { status: 200, body: { received: true, duplicate: true } };

    try {
      await syncFromProvider(provider, store, userId);
    } catch {
      await store.forgetEvent(provider.id, event.id).catch(() => undefined);
      return fail(new BillingError('provider_failed', 502));
    }
    return { status: 200, body: { received: true } };
  } catch {
    return fail(new BillingError('store_failed', 500));
  }
}

// -------------------------------------------------------- a store in memory

const HOUR_MS = 60 * 60 * 1000;

/**
 * The tables in memory, with the same rules as the SQL (one row per person, entitlement and source;
 * newer provider time wins; an event id once; a write for an unknown person fails as the foreign
 * key does; the call counts of CALL_RULES). For the unit tests, and the shape the stand-in backend
 * mirrors. `clock` gives the time the call counts use (the SQL uses now()).
 */
export function createMemoryStore(
  users: Iterable<string> = [],
  clock: () => Date = () => new Date(),
): BillingStore & {
  entitlements: Map<string, EntitlementRow>;
  events: Set<string>;
  releases: { provider: string; kind: ReleaseKind; customerId: string | null; subscriptionId: string | null; userId: string | null }[];
  calls: Map<string, number[]>;
  users: Set<string>;
} {
  const entitlements = new Map<string, EntitlementRow>();
  const events = new Set<string>();
  const releases: { provider: string; kind: ReleaseKind; customerId: string | null; subscriptionId: string | null; userId: string | null }[] = [];
  const calls = new Map<string, number[]>();
  const known = new Set(users);
  const key = (u: string, e: string, s: string) => `${u}|${e}|${s}`;
  return {
    entitlements,
    events,
    releases,
    calls,
    users: known,
    async rows(userId) {
      return [...entitlements.entries()].filter(([k]) => k.startsWith(`${userId}|`)).map(([, r]) => ({ ...r }));
    },
    async write(userId, row) {
      if (!known.has(userId)) throw new Error('billing_entitlements_user_id_fkey');
      const k = key(userId, row.entitlement, row.source);
      const old = entitlements.get(k);
      if (old && Date.parse(old.provider_updated_at) > Date.parse(row.provider_updated_at)) return;
      entitlements.set(k, { ...row });
    },
    async recordEvent({ provider, eventId }) {
      const k = `${provider}|${eventId}`;
      if (events.has(k)) return false;
      events.add(k);
      return true;
    },
    async forgetEvent(provider, eventId) {
      events.delete(`${provider}|${eventId}`);
    },
    async recordRelease(release) {
      releases.push({ ...release });
    },
    async takeCall(userId, kind) {
      const rule = CALL_RULES[kind];
      const at = clock().getTime();
      const k = `${userId}|${kind}`;
      const recent = (calls.get(k) ?? []).filter((t) => t > at - HOUR_MS);
      if (recent.length >= rule.perHour || (recent.length > 0 && at - recent[recent.length - 1] < rule.gapMs)) {
        calls.set(k, recent);
        return false;
      }
      recent.push(at);
      calls.set(k, recent);
      return true;
    },
    async userExists(userId) {
      return known.has(userId);
    },
    async userForCustomer(source, customerId) {
      for (const [k, r] of entitlements) if (r.source === source && r.provider_customer_id === customerId) return k.split('|')[0];
      return null;
    },
  };
}
