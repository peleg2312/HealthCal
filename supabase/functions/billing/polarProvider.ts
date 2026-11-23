/**
 * Polar (polar.sh), a merchant of record, as HealthCal's payment provider (BILLING_PROVIDER=polar).
 *
 * NOT YET RUN AGAINST POLAR. Built from Polar's documentation of 23 November 2026 (API version
 * 2026-10) and unit-tested against payloads written from it (polarProvider.test.ts); it has never
 * talked to Polar's sandbox or live API. docs/plans-and-payments.md ("Polar, step by step") lists what
 * only a sandbox run can show.
 *
 * Only `fetch` and Web Crypto: no SDK, so the function stays one flat folder (the deploy uploads only
 * its own files). Every Polar answer that is not the documented success, and every network failure,
 * is a thrown `PolarError`; the billing function then changes no row (billing.ts).
 *
 * The facts it builds on, each from Polar's own pages:
 *  - Base URLs https://api.polar.sh/v1 and https://sandbox-api.polar.sh/v1; `Authorization: Bearer
 *    <organization access token>`; a token from one environment does not work in the other; 500
 *    requests a minute live, 100 in the sandbox, 429 with Retry-After above it
 *    (https://polar.sh/docs/api-reference/2026-10/introduction.md, https://polar.sh/docs/integrate/sandbox.md).
 *  - The version is pinned with the `Polar-Version` header; without it Polar uses "Current", which
 *    changes every quarter. 2026-10 is Current until early January 2027, Deprecated until early April
 *    2027, then removed (https://polar.sh/docs/api-reference/2026-10/versioning.md). Webhook payloads
 *    follow the endpoint's own `api_version`, set when the endpoint is made.
 *  - Checkout: POST /v1/checkouts/ with `products` (product ids, not price ids), `external_customer_id`
 *    (a new customer is made with it, or the existing one is reused), `customer_email`, `success_url`,
 *    `return_url` (a back button), `metadata`; answers 201 with `url`
 *    (https://polar.sh/docs/api-reference/2026-10/checkouts/create-checkout-session.md).
 *  - Prices: GET /v1/products/{id}: `is_recurring`, `recurring_interval` (day, week, month, year),
 *    `recurring_interval_count`, `is_archived`, `prices[]` with `amount_type` 'fixed', `price_amount`
 *    in cents, `price_currency` (lower case), `tax_behavior` 'location' | 'inclusive' | 'exclusive' | null
 *    (https://polar.sh/docs/api-reference/2026-10/products/get-product.md,
 *    https://polar.sh/docs/features/tax-inclusive-pricing.md: 'location' is exclusive in the US, Canada
 *    and India and inclusive elsewhere, so it is `taxIncluded: null` here).
 *  - Subscriptions: GET /v1/subscriptions/?external_customer_id= (or customer_id=), statuses
 *    incomplete, incomplete_expired, trialing, active, past_due, canceled, unpaid, paused, trial_ended;
 *    `cancel_at_period_end`, `current_period_end`, `started_at`, `modified_at`, `ended_at`
 *    (https://polar.sh/docs/api-reference/2026-10/subscriptions/list-subscriptions.md). The customer
 *    state endpoint lists only active and trialing subscriptions, so it cannot show past_due and is not
 *    used.
 *  - Cancel at period end keeps `active` with `cancel_at_period_end: true`; DELETE /v1/subscriptions/{id}
 *    revokes now (status `canceled`, no refund; 403 when already revoked)
 *    (https://polar.sh/docs/features/subscriptions/manage.md,
 *    https://polar.sh/docs/api-reference/2026-10/subscriptions/revoke-subscription.md).
 *  - A failed renewal is `past_due`; Polar retries for up to 21 days, then revokes (`canceled`). Polar
 *    "advances it to the next billing cycle first, then attempts to charge", so on a past_due
 *    subscription `current_period_start` is the start of the UNPAID period and `current_period_end`
 *    its end; `past_due_at` is when the charge failed. So a past_due one is reported with `periodEnd`
 *    = `current_period_start` (paid through) and `graceUntil` = `past_due_at` + 7 days (else
 *    `current_period_start` + 7 days): Plus is kept 7 days after the failed charge, never for the
 *    whole unpaid period. Polar's own benefit grace is an organisation setting the API does not return
 *    (https://polar.sh/docs/features/subscriptions/failed-payments.md).
 *  - Refunds: refunding a subscription's order returns the money but does NOT end the subscription
 *    (https://polar.sh/docs/features/refunds.md). So a refund is read from the order: GET /v1/orders/
 *    ?subscription_id= (`status` paid, refunded, partially_refunded, `refundable_amount`), and a
 *    chargeback from GET /v1/disputes/?order_id= (`status` prevented, early_warning, needs_response,
 *    under_review, lost, won); there is no dispute webhook. POST /v1/refunds/ {order_id, reason, amount}
 *    refunds; 403 when already fully refunded, 409 when Stripe already refunded it
 *    (https://polar.sh/docs/api-reference/2026-10/orders/list-orders.md,
 *    https://polar.sh/docs/api-reference/2026-10/refunds/create-refund.md).
 *  - Deleting an account: DELETE /v1/customers/external/{external_id}?anonymize=true (scope
 *    `customers:write`; 204, 404 when there is none) "immediately cancels any active subscriptions and
 *    revokes any active benefits", clears the external id and, with anonymize, hashes the email and
 *    name and clears the billing address; Polar keeps the anonymised record for past orders
 *    (OpenAPI 2026-10, operations customers:delete_external and customers:delete).
 *  - Portal: POST /v1/customer-sessions/ with `customer_id` or `external_customer_id` and `return_url`
 *    answers 201 with `customer_portal_url`
 *    (https://polar.sh/docs/api-reference/2026-10/customer-sessions/create-customer-session.md).
 *  - Webhooks: headers `webhook-id`, `webhook-timestamp`, `webhook-signature`; secrets made on or after
 *    8 September 2026 are Standard Webhooks (key: the base64 after `whsec_`), older ones "Polar HMAC"
 *    (key: the UTF-8 bytes of the whole `whsec_...` string); both sign `<id>.<timestamp>.<raw body>`
 *    with HMAC-SHA256 and send `v1,<base64>` (space-separated when several). Polar's SDKs try both keys,
 *    and so does this file (https://polar.sh/docs/integrate/webhooks/delivery.md,
 *    https://github.com/standard-webhooks/standard-webhooks/blob/main/spec/standard-webhooks.md; the
 *    reference library's tolerance is 5 minutes either way). Body `{type, timestamp, api_version, data}`.
 */
import { type BillingProvider, type HeaderReader, type Offer, type ProviderState, type WebhookEvent } from './billing.ts';
import { type BillingEnvironment, type EntitlementState, PAYMENT_GRACE_DAYS, type Period, PLUS, type PolarSettings, polarSettingsFrom, environmentFrom } from './plans.ts';

export const POLAR_API_VERSION = '2026-10';
export const POLAR_BASE_URLS: Record<BillingEnvironment, string> = {
  live: 'https://api.polar.sh',
  sandbox: 'https://sandbox-api.polar.sh',
};
export const POLAR_TOLERANCE_SECONDS = 300;
/** Polar waits 10 s for a webhook answer and the re-read may take three calls, so each call gets 3 s. */
export const POLAR_TIMEOUT_MS = 3000;
export const POLAR_OFFERS_CACHE_MS = 5 * 60 * 1000;
export const POLAR_HEADERS = { id: 'webhook-id', timestamp: 'webhook-timestamp', signature: 'webhook-signature' } as const;

/** What went wrong, by kind; never the body or the token. */
export type PolarErrorKind = 'network' | 'timeout' | 'http' | 'bad_answer';

export class PolarError extends Error {
  constructor(
    public kind: PolarErrorKind,
    public path: string,
    public status: number | null = null,
    public retryAfter: string | null = null,
  ) {
    super(`polar ${kind} ${status ?? ''} ${path}`.trim());
    this.name = 'PolarError';
  }
}

/** Subscription statuses that keep a person's plan running (or about to). */
const LIVE = ['active', 'trialing', 'past_due', 'unpaid'] as const;
/** Statuses with nothing left to end. */
const ENDED = ['canceled', 'incomplete_expired', 'trial_ended'] as const;
/** A checkout that was never paid: not a plan, but ended at a delete all the same. */
const UNPAID_START = ['incomplete'] as const;
/** Dispute statuses that end Plus: a chargeback opened or lost. 'prevented' is a refund (read from the order); 'won' and 'early_warning' change nothing. */
const CHARGEBACK = ['needs_response', 'under_review', 'lost'] as const;

const DAY_MS = 24 * 60 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EVENT_ID = /^[A-Za-z0-9_.:-]{1,200}$/;
const EVENT_TYPE = /^[a-z_.]{1,64}$/;

// ------------------------------------------------------------- the answers

interface PolarSubscription {
  id: string;
  status: string;
  customerId: string;
  externalId: string | null;
  productId: string | null;
  interval: string | null;
  intervalCount: number;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  /** When the subscription entered past_due (the failed charge). */
  pastDueAt: string | null;
  cancelAtPeriodEnd: boolean;
  startedAt: string | null;
  createdAt: string;
  modifiedAt: string | null;
  endedAt: string | null;
  endsAt: string | null;
}

interface PolarOrder {
  id: string;
  status: string;
  refundableAmount: number;
  createdAt: string;
  modifiedAt: string | null;
}

interface PolarDispute {
  status: string;
  modifiedAt: string | null;
  createdAt: string;
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
/** A time as an ISO instant, or null; anything unreadable is null. */
const instant = (v: unknown): string | null => {
  if (typeof v !== 'string' || v.length > 40) return null;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
};
const text = (v: unknown, max = 200): string | null => (typeof v === 'string' && v.length > 0 && v.length <= max ? v : null);
const later = (...times: (string | null)[]): string | null => {
  let best: string | null = null;
  for (const t of times) if (t && (!best || Date.parse(t) > Date.parse(best))) best = t;
  return best;
};

function itemsOf(json: unknown, path: string): unknown[] {
  if (!isObject(json) || !Array.isArray(json.items)) throw new PolarError('bad_answer', path);
  return json.items;
}

function readSubscription(v: unknown, path: string): PolarSubscription {
  if (!isObject(v)) throw new PolarError('bad_answer', path);
  const id = text(v.id);
  const status = text(v.status, 40);
  const createdAt = instant(v.created_at);
  const customer = isObject(v.customer) ? v.customer : null;
  const customerId = text(v.customer_id) ?? text(customer?.id);
  if (!id || !status || !createdAt || !customerId) throw new PolarError('bad_answer', path);
  return {
    id,
    status,
    customerId,
    externalId: text(customer?.external_id),
    productId: text(v.product_id),
    interval: text(v.recurring_interval, 10),
    intervalCount: typeof v.recurring_interval_count === 'number' ? v.recurring_interval_count : 1,
    currentPeriodStart: instant(v.current_period_start),
    currentPeriodEnd: instant(v.current_period_end),
    pastDueAt: instant(v.past_due_at),
    cancelAtPeriodEnd: v.cancel_at_period_end === true,
    startedAt: instant(v.started_at),
    createdAt,
    modifiedAt: instant(v.modified_at),
    endedAt: instant(v.ended_at),
    endsAt: instant(v.ends_at),
  };
}

function readOrder(v: unknown, path: string): PolarOrder {
  if (!isObject(v)) throw new PolarError('bad_answer', path);
  const id = text(v.id);
  const status = text(v.status, 40);
  const createdAt = instant(v.created_at);
  if (!id || !status || !createdAt) throw new PolarError('bad_answer', path);
  return {
    id,
    status,
    refundableAmount: typeof v.refundable_amount === 'number' && v.refundable_amount > 0 ? Math.floor(v.refundable_amount) : 0,
    createdAt,
    modifiedAt: instant(v.modified_at),
  };
}

function readDispute(v: unknown, path: string): PolarDispute {
  if (!isObject(v)) throw new PolarError('bad_answer', path);
  const status = text(v.status, 40);
  const createdAt = instant(v.created_at);
  if (!status || !createdAt) throw new PolarError('bad_answer', path);
  return { status, createdAt, modifiedAt: instant(v.modified_at) };
}

/** One Plus offer from a Polar product, or null when the product is not a monthly or yearly fixed price on sale. */
export function offerFromProduct(product: unknown, period: Period): Offer | null {
  if (!isObject(product)) return null;
  const id = text(product.id);
  if (!id || !UUID.test(id) || product.is_archived === true || product.is_recurring === false) return null;
  if (product.recurring_interval !== period) return null;
  if (typeof product.recurring_interval_count === 'number' && product.recurring_interval_count !== 1) return null;
  if (!Array.isArray(product.prices)) return null;
  const fixed = product.prices.filter(
    (p): p is Record<string, unknown> =>
      isObject(p) && p.amount_type === 'fixed' && p.is_archived !== true && typeof p.price_amount === 'number' && Number.isInteger(p.price_amount) && p.price_amount > 0 && typeof p.price_currency === 'string',
  );
  // A product can hold prices in several currencies: US dollars first (the owner's prices), else the first.
  const price = fixed.find((p) => String(p.price_currency).toLowerCase() === 'usd') ?? fixed[0];
  if (!price) return null;
  const currency = String(price.price_currency).toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) return null;
  const tax = price.tax_behavior;
  return { id: id.toLowerCase(), plan: PLUS, period, amount: price.price_amount as number, currency, taxIncluded: tax === 'inclusive' ? true : tax === 'exclusive' ? false : null };
}

/** The plan state a Polar subscription status means, before refunds and chargebacks. */
export function stateFromStatus(status: string, cancelAtPeriodEnd: boolean): EntitlementState {
  switch (status) {
    case 'active':
      return cancelAtPeriodEnd ? 'canceling' : 'active';
    case 'trialing':
      return cancelAtPeriodEnd ? 'canceling' : 'trialing';
    case 'past_due':
    case 'unpaid':
      return 'past_due';
    default:
      // canceled, paused (benefits revoked until it resumes), incomplete_expired, trial_ended, anything new.
      return 'expired';
  }
}

const byStartDesc = (a: PolarSubscription, b: PolarSubscription) =>
  Date.parse(b.startedAt ?? b.createdAt) - Date.parse(a.startedAt ?? a.createdAt) || Date.parse(b.createdAt) - Date.parse(a.createdAt);
const byChangeDesc = (a: PolarSubscription, b: PolarSubscription) =>
  Date.parse(later(b.modifiedAt, b.createdAt)!) - Date.parse(later(a.modifiedAt, a.createdAt)!);

// ------------------------------------------------------------- the webhook

const b64ToBytes = (s: string): Uint8Array<ArrayBuffer> | null => {
  try {
    const bin = atob(s);
    const out = new Uint8Array(new ArrayBuffer(bin.length));
    for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
};
const bytesToB64 = (bytes: ArrayBuffer): string => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const utf8 = (s: string): Uint8Array<ArrayBuffer> => {
  const e = new TextEncoder().encode(s);
  const out = new Uint8Array(new ArrayBuffer(e.length));
  out.set(e);
  return out;
};

/**
 * The HMAC keys a `whsec_...` secret may mean: the Standard Webhooks key (the base64 after `whsec_`)
 * and the older Polar HMAC key (the UTF-8 bytes of the whole string).
 */
export function polarWebhookKeys(secret: string): Uint8Array<ArrayBuffer>[] {
  const keys: Uint8Array<ArrayBuffer>[] = [];
  const body = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret;
  const standard = b64ToBytes(body);
  if (standard && standard.length > 0) keys.push(standard);
  keys.push(utf8(secret));
  return keys;
}

const hmacKey = (key: Uint8Array<ArrayBuffer>, use: 'sign' | 'verify') => crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, [use]);

/** Signs as Polar does (Standard Webhooks, `v1,<base64>`); for the tests and the stand-in backend. */
export async function signPolarWebhook(input: { id: string; rawBody: string; secret: string; at: Date; legacy?: boolean }): Promise<Record<string, string>> {
  const t = Math.floor(input.at.getTime() / 1000);
  const keys = polarWebhookKeys(input.secret);
  const key = input.legacy ? keys[keys.length - 1] : keys[0];
  const mac = await crypto.subtle.sign('HMAC', await hmacKey(key, 'sign'), utf8(`${input.id}.${t}.${input.rawBody}`));
  return { [POLAR_HEADERS.id]: input.id, [POLAR_HEADERS.timestamp]: String(t), [POLAR_HEADERS.signature]: `v1,${bytesToB64(mac)}` };
}

/** Whether the three headers sign this raw body with this secret within the tolerance (constant-time compare by WebCrypto). */
export async function verifyPolarSignature(rawBody: string, headers: HeaderReader, secret: string, now: Date, tolerance = POLAR_TOLERANCE_SECONDS): Promise<boolean> {
  const id = headers.get(POLAR_HEADERS.id);
  const ts = headers.get(POLAR_HEADERS.timestamp);
  const sig = headers.get(POLAR_HEADERS.signature);
  if (!id || !ts || !sig || !EVENT_ID.test(id) || !/^\d{1,12}$/.test(ts) || sig.length > 2000) return false;
  if (Math.abs(now.getTime() / 1000 - Number(ts)) > tolerance) return false;
  const signed = utf8(`${id}.${ts}.${rawBody}`);
  const macs = sig
    .split(' ')
    .map((part) => {
      const comma = part.indexOf(',');
      return comma > 0 && part.slice(0, comma) === 'v1' ? b64ToBytes(part.slice(comma + 1)) : null;
    })
    .filter((m): m is Uint8Array<ArrayBuffer> => !!m && m.length === 32);
  if (macs.length === 0) return false;
  for (const key of polarWebhookKeys(secret)) {
    const k = await hmacKey(key, 'verify');
    for (const mac of macs) if (await crypto.subtle.verify('HMAC', k, mac, signed)) return true;
  }
  return false;
}

/** Who a Polar event is about: the external id (our user id) and Polar's customer id, wherever the payload holds them. */
export function personOfEvent(type: string, data: unknown): { userId: string | null; customerId: string | null } {
  if (!isObject(data)) return { userId: null, customerId: null };
  const customer = isObject(data.customer) ? data.customer : null;
  const isCustomer = type.startsWith('customer.');
  const external = isCustomer ? data.external_id : (customer?.external_id ?? data.external_customer_id);
  const customerId = isCustomer ? data.id : (data.customer_id ?? customer?.id);
  return {
    userId: typeof external === 'string' && UUID.test(external) ? external.toLowerCase() : null,
    customerId: typeof customerId === 'string' && UUID.test(customerId) ? customerId.toLowerCase() : null,
  };
}

// ------------------------------------------------------------- the provider

export interface PolarProviderOptions extends PolarSettings {
  environment: BillingEnvironment;
  /** Tests pass a fake; the function uses the global fetch. */
  fetch?: typeof fetch;
  timeoutMs?: number;
  offersCacheMs?: number;
  /** The clock for the offers cache. */
  clock?: () => number;
}

/** The provider's options from the function's secrets, or null when they are missing (plans.ts `polarSettingsFrom`). */
export function polarOptionsFrom(env: (name: string) => string | undefined): PolarProviderOptions | null {
  const settings = polarSettingsFrom(env);
  return settings ? { ...settings, environment: environmentFrom(env) } : null;
}

type Query = Record<string, string | number>;

/** cancelNow's input; `refund` (billing.ts `endOrphan` passes true; default: only when `userId` is null) also refunds each ended subscription's last payment. */
export interface PolarCancelInput {
  userId: string | null;
  customerId: string | null;
  subscriptionId: string | null;
  refund?: boolean;
}

/** One offers cache per running function instance, keyed by environment and product ids. */
const offersCache = new Map<string, { at: number; offers: Offer[] }>();

export function createPolarProvider(
  options: PolarProviderOptions,
): BillingProvider & { cancelNow(input: PolarCancelInput): Promise<void>; forgetCustomer(input: { userId: string; customerId: string | null }): Promise<void> } {
  const base = POLAR_BASE_URLS[options.environment];
  const doFetch = options.fetch ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  const timeoutMs = options.timeoutMs ?? POLAR_TIMEOUT_MS;
  const cacheMs = options.offersCacheMs ?? POLAR_OFFERS_CACHE_MS;
  const clock = options.clock ?? (() => Date.now());

  /** One call. `accept` lists statuses besides 2xx that mean "already done" (answered as null). */
  async function call(method: string, path: string, opts: { query?: Query; body?: unknown; accept?: number[] } = {}): Promise<unknown> {
    const url = new URL(path, base);
    for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, String(v));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await doFetch(url.toString(), {
        method,
        headers: {
          Authorization: `Bearer ${options.token}`,
          Accept: 'application/json',
          'Polar-Version': POLAR_API_VERSION,
          ...(opts.body === undefined ? null : { 'Content-Type': 'application/json' }),
        },
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        signal: controller.signal,
      });
    } catch {
      throw new PolarError(controller.signal.aborted ? 'timeout' : 'network', path);
    } finally {
      clearTimeout(timer);
    }
    if (opts.accept?.includes(res.status)) {
      await res.body?.cancel().catch(() => undefined);
      return null;
    }
    if (res.status < 200 || res.status > 299) {
      await res.body?.cancel().catch(() => undefined);
      throw new PolarError('http', path, res.status, res.headers.get('retry-after'));
    }
    // 204 No Content (a deleted customer) has no body to read.
    if (res.status === 204) return null;
    try {
      return await res.json();
    } catch {
      throw new PolarError('bad_answer', path, res.status);
    }
  }

  /**
   * Every subscription Polar holds for the person, by our user id and/or Polar's customer id (one page
   * of 100: one person has a handful). With `every` false (a read), the list by customer id is skipped
   * when the list by external id already found that customer: it could only list the same ones.
   * `cancelNow` asks for both lists always.
   */
  async function subscriptionsOf(userId: string | null, customerId: string | null, every: boolean): Promise<PolarSubscription[]> {
    const found = new Map<string, PolarSubscription>();
    const lists: Query[] = [];
    if (userId) lists.push({ external_customer_id: userId });
    if (customerId && UUID.test(customerId)) lists.push({ customer_id: customerId });
    for (const filter of lists) {
      if (!every && 'customer_id' in filter && [...found.values()].some((s) => s.customerId.toLowerCase() === String(filter.customer_id).toLowerCase())) continue;
      const path = '/v1/subscriptions/';
      const json = await call('GET', path, { query: { ...filter, limit: 100, sorting: '-started_at' } });
      for (const item of itemsOf(json, path)) {
        const s = readSubscription(item, path);
        found.set(s.id, s);
      }
    }
    return [...found.values()];
  }

  /** The newest order that was paid for (paid, refunded or partly refunded): the payment for the current period. */
  async function lastPaidOrder(subscriptionId: string): Promise<PolarOrder | null> {
    const path = '/v1/orders/';
    const json = await call('GET', path, { query: { subscription_id: subscriptionId, limit: 10, sorting: '-created_at' } });
    const orders = itemsOf(json, path)
      .map((o) => readOrder(o, path))
      .filter((o) => o.status === 'paid' || o.status === 'refunded' || o.status === 'partially_refunded')
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    return orders[0] ?? null;
  }

  async function disputesOf(orderId: string): Promise<PolarDispute[]> {
    const path = '/v1/disputes/';
    const json = await call('GET', path, { query: { order_id: orderId, limit: 10 } });
    return itemsOf(json, path).map((d) => readDispute(d, path));
  }

  /** Revokes a subscription now (403: already revoked; 404: gone) and, when asked, refunds its last payment in full. */
  async function endSubscription(id: string, refund: 'duplicate' | 'other' | null): Promise<void> {
    if (!UUID.test(id)) return;
    await call('DELETE', `/v1/subscriptions/${encodeURIComponent(id)}`, { accept: [403, 404] });
    if (!refund) return;
    const order = await lastPaidOrder(id);
    if (!order || order.refundableAmount <= 0 || order.status === 'refunded') return;
    await call('POST', '/v1/refunds/', {
      body: {
        order_id: order.id,
        reason: refund,
        amount: order.refundableAmount,
        comment: refund === 'duplicate' ? 'HealthCal: a second subscription for the same account' : 'HealthCal: the account no longer exists',
      },
      // 403: already fully refunded; 409: Stripe already refunded it.
      accept: [403, 409],
    });
  }

  /** The row's fields for one subscription; for a live one, a full refund or a chargeback of the current payment makes it revoked. */
  async function stateOf(s: PolarSubscription, live: boolean): Promise<ProviderState> {
    let state = stateFromStatus(s.status, s.cancelAtPeriodEnd);
    let updatedAt = later(s.modifiedAt, s.createdAt)!;
    if (live) {
      const order = await lastPaidOrder(s.id);
      if (order) {
        updatedAt = later(updatedAt, order.modifiedAt, order.createdAt)!;
        if (order.status === 'refunded') state = 'revoked';
        const disputes = await disputesOf(order.id);
        for (const d of disputes) {
          if ((CHARGEBACK as readonly string[]).includes(d.status)) {
            state = 'revoked';
            updatedAt = later(updatedAt, d.modifiedAt, d.createdAt)!;
          }
        }
      }
    }
    const period: Period | null = (s.interval === 'month' || s.interval === 'year') && s.intervalCount === 1 ? s.interval : null;
    const ended = state === 'expired';
    // A failed renewal: Polar has already moved to the unpaid period, so it was paid through that
    // period's start, and Plus is kept PAYMENT_GRACE_DAYS after the failed charge.
    const pastDue = state === 'past_due';
    const failedAt = s.pastDueAt ?? s.currentPeriodStart;
    const graceUntil = pastDue && failedAt ? new Date(Date.parse(failedAt) + PAYMENT_GRACE_DAYS * DAY_MS).toISOString() : null;
    return {
      source: 'polar',
      customerId: s.customerId,
      subscriptionId: s.id,
      productId: s.productId,
      period,
      state,
      periodEnd: ended ? (s.endedAt ?? s.endsAt ?? s.currentPeriodEnd) : pastDue ? s.currentPeriodStart : s.currentPeriodEnd,
      graceUntil,
      cancelAtPeriodEnd: state === 'canceling',
      environment: options.environment,
      startedAt: s.startedAt ?? s.createdAt,
      updatedAt,
    };
  }

  return {
    id: 'polar',

    async offers() {
      const key = `${options.environment}|${options.productMonth}|${options.productYear}`;
      const cached = offersCache.get(key);
      if (cached && clock() - cached.at < cacheMs) return cached.offers.map((o) => ({ ...o }));
      const offers: Offer[] = [];
      for (const [period, productId] of [['month', options.productMonth], ['year', options.productYear]] as const) {
        if (!productId) continue;
        const product = await call('GET', `/v1/products/${encodeURIComponent(productId)}`);
        const offer = offerFromProduct(product, period);
        if (offer) offers.push(offer);
        else console.warn('billing: the Polar product for', period, 'is not a fixed', period + 'ly', 'price on sale');
      }
      offersCache.set(key, { at: clock(), offers });
      return offers.map((o) => ({ ...o }));
    },

    async createCheckout({ userId, email, offer, returnUrl }) {
      // The back button returns to the plan screen without claiming a payment.
      let back: string | null = null;
      try {
        const u = new URL(returnUrl);
        u.searchParams.delete('checkout');
        back = u.toString();
      } catch {
        back = null;
      }
      const path = '/v1/checkouts/';
      const json = await call('POST', path, {
        body: {
          products: [offer.id],
          external_customer_id: userId,
          ...(email && email.length <= 254 && email.includes('@') ? { customer_email: email } : null),
          success_url: returnUrl,
          ...(back ? { return_url: back } : null),
          metadata: { healthcal_user_id: userId },
        },
      });
      const url = isObject(json) ? text(json.url, 2083) : null;
      if (!url || !url.startsWith('https://')) throw new PolarError('bad_answer', path);
      return { url };
    },

    async portalUrl({ userId, customerId, returnUrl }) {
      const path = '/v1/customer-sessions/';
      const who = customerId && UUID.test(customerId) ? { customer_id: customerId } : { external_customer_id: userId };
      const json = await call('POST', path, { body: { ...who, return_url: returnUrl } });
      const url = isObject(json) ? text(json.customer_portal_url, 2083) : null;
      if (!url || !url.startsWith('https://')) throw new PolarError('bad_answer', path);
      return url;
    },

    async cancelNow(input: PolarCancelInput) {
      const refund = input.refund ?? input.userId === null;
      const subs = await subscriptionsOf(input.userId, input.customerId, true);
      for (const s of subs) {
        if ((ENDED as readonly string[]).includes(s.status)) continue;
        // A never-paid checkout has nothing to refund.
        await endSubscription(s.id, refund && !(UNPAID_START as readonly string[]).includes(s.status) ? 'other' : null);
      }
      // One the lists did not show (for example under another customer): end it by its id.
      if (input.subscriptionId && !subs.some((s) => s.id === input.subscriptionId)) {
        await endSubscription(input.subscriptionId, refund ? 'other' : null);
      }
    },

    async forgetCustomer({ userId }) {
      // After cancelNow, when the account is deleted: the customer by our id, anonymised. 404: none.
      if (!UUID.test(userId)) return;
      await call('DELETE', `/v1/customers/external/${encodeURIComponent(userId)}`, { query: { anonymize: 'true' }, accept: [404] });
    },

    async readState({ userId, customerId }) {
      const subs = await subscriptionsOf(userId, customerId, false);
      const live = subs.filter((s) => (LIVE as readonly string[]).includes(s.status)).sort(byStartDesc);
      if (live.length > 0) {
        // Two live subscriptions for one person (a double checkout): keep the newest, end the rest now with a refund.
        for (const extra of live.slice(1)) await endSubscription(extra.id, 'duplicate');
        return stateOf(live[0], true);
      }
      // None live: the most recently changed one that was ever a plan says it ended; a never-paid checkout is no plan.
      const past = subs.filter((s) => !(UNPAID_START as readonly string[]).includes(s.status) && s.status !== 'incomplete_expired').sort(byChangeDesc);
      return past.length > 0 ? stateOf(past[0], false) : null;
    },

    signaturePresent(headers: HeaderReader) {
      return !!headers.get(POLAR_HEADERS.signature);
    },

    async verifyWebhook(raw: string, headers: HeaderReader, now: Date): Promise<WebhookEvent | null> {
      if (!(await verifyPolarSignature(raw, headers, options.webhookSecret, now))) return null;
      let body: unknown;
      try {
        body = JSON.parse(raw);
      } catch {
        return null;
      }
      if (!isObject(body) || typeof body.type !== 'string' || !EVENT_TYPE.test(body.type)) return null;
      const id = headers.get(POLAR_HEADERS.id)!;
      return { id, type: body.type, ...personOfEvent(body.type, body.data) };
    },
  };
}
