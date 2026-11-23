/**
 * The Polar provider against payloads written from Polar's documentation (API version 2026-10; each
 * fixture names the page it follows). No request leaves this file: `fetch` is a fake that answers
 * like the documented endpoints. NOT a proof that Polar answers this way: only a sandbox run is
 * (docs/plans-and-payments.md, "Polar, step by step").
 */
import { createHmac } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { createMemoryStore, handleAction, handleWebhook, type BillingContext } from './billing';
import { activePlan, isActiveRow, paymentGraceEnd, planConfigFrom, polarSettingsFrom, providerNameFrom } from './plans';
import {
  createPolarProvider,
  offerFromProduct,
  personOfEvent,
  POLAR_API_VERSION,
  POLAR_HEADERS,
  PolarError,
  type PolarProviderOptions,
  polarWebhookKeys,
  signPolarWebhook,
  stateFromStatus,
  verifyPolarSignature,
} from './polarProvider';
import { providerFrom } from './providers';

const NOW = new Date('2026-11-23T12:00:00Z');
const USER = '11111111-1111-4111-8111-111111111111';
const GONE = '33333333-3333-4333-8333-333333333333';
const CUSTOMER = '992fae2a-2a17-4b7a-8d9e-e287cf90131b'; // the example id on the customer state page
const ORG = '1dbfc517-0bbf-4301-9ba8-555ca42b9737';
const MONTH = 'aaaaaaaa-0000-4000-8000-000000000001';
const YEAR = 'aaaaaaaa-0000-4000-8000-000000000002';
const SUB_A = 'bbbbbbbb-0000-4000-8000-00000000000a';
const SUB_B = 'bbbbbbbb-0000-4000-8000-00000000000b';
const ORDER_A = '57107b74-8400-4d80-a2fc-54c2b4239cb3'; // the example order id on the dispute schema
const ORDER_B = 'cccccccc-0000-4000-8000-00000000000b';
/** A Standard Webhooks secret: whsec_ + base64 of 32 bytes (a made-up test value, not a real secret). */
const SECRET = `whsec_${Buffer.from('healthcal-polar-test-key-32bytes').toString('base64')}`;
const TOKEN = 'polar_oat_test_token_not_real_000000';

const headersOf = (h: Record<string, string>) => ({ get: (n: string) => h[n.toLowerCase()] ?? null });

// ------------------------------------------------------------- fixtures

/**
 * A subscription as GET /v1/subscriptions/ lists it
 * (https://polar.sh/docs/api-reference/2026-10/subscriptions/list-subscriptions.md, schema Subscription;
 * the example values: amount 10000, currency 'usd', times '2026-01-01T00:00:00.000000Z').
 */
function subscription(over: Record<string, unknown> = {}) {
  return {
    created_at: '2026-11-01T10:00:00.000000Z',
    modified_at: '2026-11-01T10:00:05.000000Z',
    id: SUB_A,
    amount: 399,
    currency: 'usd',
    recurring_interval: 'month',
    recurring_interval_count: 1,
    status: 'active',
    current_period_start: '2026-11-01T10:00:00.000000Z',
    current_period_end: '2026-12-01T10:00:00.000000Z',
    trial_start: null,
    trial_end: null,
    cancel_at_period_end: false,
    canceled_at: null,
    started_at: '2026-11-01T10:00:00.000000Z',
    ends_at: null as string | null,
    ended_at: null as string | null,
    past_due_at: null,
    customer_id: CUSTOMER,
    product_id: MONTH,
    discount_id: null,
    checkout_id: null,
    metadata: {},
    customer: { id: CUSTOMER, external_id: USER, email: 'customer@example.com', organization_id: ORG, type: 'individual' },
    ...over,
  };
}

/** An order as GET /v1/orders/ lists it (https://polar.sh/docs/api-reference/2026-10/orders/list-orders.md, schema Order). */
function order(over: Record<string, unknown> = {}) {
  return {
    id: ORDER_A,
    created_at: '2026-11-01T10:00:01.000000Z',
    modified_at: '2026-11-01T10:00:03.000000Z',
    status: 'paid',
    paid: true,
    subtotal_amount: 399,
    net_amount: 399,
    tax_amount: 0,
    total_amount: 399,
    refunded_amount: 0,
    refunded_tax_amount: 0,
    currency: 'usd',
    billing_reason: 'subscription_create',
    customer_id: CUSTOMER,
    subscription_id: SUB_A,
    refundable_amount: 399,
    refundable_tax_amount: 0,
    ...over,
  };
}

/** A dispute as GET /v1/disputes/ lists it (https://polar.sh/docs/api-reference/2026-10 Core API, schema Dispute; its examples: status 'needs_response', amount 1000). */
function dispute(over: Record<string, unknown> = {}) {
  return {
    created_at: '2026-11-20T09:00:00.000000Z',
    modified_at: '2026-11-20T09:00:00.000000Z',
    id: 'dddddddd-0000-4000-8000-000000000001',
    status: 'needs_response',
    resolved: false,
    closed: false,
    amount: 399,
    tax_amount: 0,
    currency: 'usd',
    reason: 'fraudulent',
    order_id: ORDER_A,
    payment_id: '42b94870-36b9-4573-96b6-b90b1c99a353',
    ...over,
  };
}

/** A product as GET /v1/products/{id} returns it (https://polar.sh/docs/api-reference/2026-10/products/get-product.md, schemas Product and ProductPriceFixed). */
function product(id: string, interval: 'month' | 'year', amount: number, over: Record<string, unknown> = {}, price: Record<string, unknown> = {}) {
  return {
    id,
    created_at: '2026-11-01T00:00:00.000000Z',
    modified_at: null,
    name: interval === 'month' ? 'HealthCal Plus monthly' : 'HealthCal Plus yearly',
    visibility: 'public',
    recurring_interval: interval,
    recurring_interval_count: 1,
    is_recurring: true,
    is_archived: false,
    organization_id: ORG,
    prices: [
      {
        id: `${id.slice(0, 30)}price1`,
        created_at: '2026-11-01T00:00:00.000000Z',
        modified_at: null,
        source: 'catalog',
        amount_type: 'fixed',
        price_currency: 'usd',
        tax_behavior: 'exclusive',
        is_archived: false,
        product_id: id,
        price_amount: amount,
        ...price,
      },
    ],
    benefits: [],
    medias: [],
    ...over,
  };
}

const page = (items: unknown[]) => ({ items, pagination: { total_count: items.length, max_page: 1 } });

// ------------------------------------------------------------- a fake Polar

interface Sent {
  method: string;
  url: URL;
  headers: Record<string, string>;
  body: unknown;
}
type Reply = { status: number; json?: unknown; headers?: Record<string, string> } | 'network' | 'hang';

/** Answers like the documented endpoints from the given data; records every request. */
function fakePolar(data: { subs?: ReturnType<typeof subscription>[]; orders?: Record<string, ReturnType<typeof order>[]>; disputes?: Record<string, ReturnType<typeof dispute>[]>; products?: Record<string, unknown> }, override?: (s: Sent) => Reply | undefined) {
  const sent: Sent[] = [];
  const subs = data.subs ?? [];
  const fetchFn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]));
    const s: Sent = { method: init?.method ?? 'GET', url, headers, body: init?.body ? JSON.parse(String(init.body)) : undefined };
    sent.push(s);
    const reply: Reply = override?.(s) ?? route(s);
    if (reply === 'network') throw new TypeError('fetch failed');
    if (reply === 'hang') {
      return new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
    }
    return new Response(reply.json === undefined ? null : JSON.stringify(reply.json), { status: reply.status, headers: { 'content-type': 'application/json', ...reply.headers } });
  }) as typeof fetch;

  function route(s: Sent): Reply {
    const p = s.url.pathname;
    const q = s.url.searchParams;
    if (s.method === 'GET' && p === '/v1/subscriptions/') {
      const ext = q.get('external_customer_id');
      const cus = q.get('customer_id');
      return { status: 200, json: page(subs.filter((x) => (ext ? x.customer.external_id === ext : true) && (cus ? x.customer_id === cus : true))) };
    }
    if (s.method === 'GET' && p === '/v1/orders/') return { status: 200, json: page(data.orders?.[q.get('subscription_id') ?? ''] ?? []) };
    if (s.method === 'GET' && p === '/v1/disputes/') return { status: 200, json: page(data.disputes?.[q.get('order_id') ?? ''] ?? []) };
    if (s.method === 'GET' && p.startsWith('/v1/products/')) {
      const found = data.products?.[p.split('/')[3]];
      return found ? { status: 200, json: found } : { status: 404, json: { error: 'ResourceNotFound', detail: 'Not found' } };
    }
    if (s.method === 'DELETE' && p.startsWith('/v1/subscriptions/')) {
      const sub = subs.find((x) => x.id === p.split('/')[3]);
      if (!sub) return { status: 404, json: { error: 'ResourceNotFound' } };
      if (sub.status === 'canceled') return { status: 403, json: { error: 'AlreadyCanceledSubscription' } };
      sub.status = 'canceled';
      sub.ended_at = NOW.toISOString();
      sub.modified_at = NOW.toISOString();
      return { status: 200, json: sub };
    }
    if (s.method === 'DELETE' && p.startsWith('/v1/customers/external/')) {
      const ext = decodeURIComponent(p.split('/')[4]);
      const held = subs.filter((x) => x.customer.external_id === ext);
      if (held.length === 0) return { status: 404, json: { error: 'ResourceNotFound' } };
      for (const x of held) x.customer = { ...x.customer, external_id: null as unknown as string };
      return { status: 204 };
    }
    if (s.method === 'POST' && p === '/v1/refunds/') return { status: 201, json: { id: 'eeeeeeee-0000-4000-8000-000000000001', status: 'pending', ...(s.body as object) } };
    if (s.method === 'POST' && p === '/v1/checkouts/') return { status: 201, json: { id: 'ffffffff-0000-4000-8000-000000000001', status: 'open', url: 'https://sandbox-api.polar.sh/v1/checkout-links/polar_c_example/redirect', expires_at: '2026-11-23T13:00:00Z' } };
    if (s.method === 'POST' && p === '/v1/customer-sessions/') return { status: 201, json: { id: 'x', token: 'polar_cst_example', expires_at: '2026-11-23T13:00:00Z', customer_portal_url: 'https://sandbox.polar.sh/healthcal/portal?customer_session_token=polar_cst_example', customer_id: CUSTOMER } };
    return { status: 404, json: { error: 'NotFound' } };
  }
  return { fetch: fetchFn, sent, subs };
}

const options = (fetchFn: typeof fetch, over: Partial<PolarProviderOptions> = {}): PolarProviderOptions => ({
  token: TOKEN,
  webhookSecret: SECRET,
  productMonth: MONTH,
  productYear: YEAR,
  environment: 'sandbox',
  fetch: fetchFn,
  timeoutMs: 50,
  offersCacheMs: 0,
  ...over,
});

// ------------------------------------------------------------- the secrets

describe('the Polar secrets and BILLING_PROVIDER=polar', () => {
  const ENV = { BILLING_PROVIDER: 'polar', POLAR_ACCESS_TOKEN: TOKEN, POLAR_WEBHOOK_SECRET: SECRET, POLAR_PRODUCT_MONTH: MONTH, POLAR_PRODUCT_YEAR: YEAR };
  const env = (o: Record<string, string>) => (n: string) => o[n];
  it('needs the token, the webhook secret and at least one product id, each well formed', () => {
    expect(providerNameFrom(env(ENV))).toBe('polar');
    expect(providerNameFrom(env({ ...ENV, POLAR_PRODUCT_YEAR: '' }))).toBe('polar');
    expect(providerNameFrom(env({ ...ENV, POLAR_PRODUCT_MONTH: '', POLAR_PRODUCT_YEAR: '' }))).toBeNull();
    expect(providerNameFrom(env({ ...ENV, POLAR_PRODUCT_MONTH: 'price_123' }))).toBeNull();
    expect(providerNameFrom(env({ ...ENV, POLAR_ACCESS_TOKEN: '' }))).toBeNull();
    expect(providerNameFrom(env({ ...ENV, POLAR_WEBHOOK_SECRET: 'short' }))).toBeNull();
    expect(polarSettingsFrom(env({ ...ENV, POLAR_PRODUCT_MONTH: ` ${MONTH.toUpperCase()} ` }))?.productMonth).toBe(MONTH);
  });
  it('providers.ts builds it, on the sandbox API only with BILLING_ENVIRONMENT=sandbox, and plans are on exactly when it is built', () => {
    expect(providerFrom(env(ENV))?.id).toBe('polar');
    expect(providerFrom(env({ ...ENV, POLAR_WEBHOOK_SECRET: '' }))).toBeNull();
    for (const e of [ENV, { ...ENV, BILLING_ENVIRONMENT: 'sandbox' }, { ...ENV, POLAR_ACCESS_TOKEN: '' }]) {
      expect(providerFrom(env(e)) !== null).toBe(planConfigFrom(env({ ...e, PLANS: 'on' })).plansOn);
    }
  });
  it('talks to https://api.polar.sh live and https://sandbox-api.polar.sh in the sandbox, pinned to the API version', async () => {
    for (const [environment, host] of [['live', 'api.polar.sh'], ['sandbox', 'sandbox-api.polar.sh']] as const) {
      const polar = fakePolar({ subs: [] });
      await createPolarProvider(options(polar.fetch, { environment })).readState({ userId: USER, customerId: null });
      expect(polar.sent[0].url.host).toBe(host);
      expect(polar.sent[0].headers.authorization).toBe(`Bearer ${TOKEN}`);
      expect(polar.sent[0].headers['polar-version']).toBe(POLAR_API_VERSION);
    }
  });
});

// ------------------------------------------------------------- the signature

describe('the webhook signature (Standard Webhooks, https://polar.sh/docs/integrate/webhooks/delivery.md)', () => {
  const raw = JSON.stringify({ type: 'subscription.updated', timestamp: '2026-11-23T12:00:00Z', api_version: '2026-10', data: subscription() });
  const id = 'msg_2KWPBgLlAfxdpx2AI54pPJ85f4W'; // the id format of the spec's example
  /** The vector, computed here by the documented method with Node's own crypto: base64(HMAC-SHA256(base64-decoded secret, "<id>.<t>.<body>")). */
  const expected = (t: number, key: Buffer | string = Buffer.from(SECRET.slice(6), 'base64')) => `v1,${createHmac('sha256', key).update(`${id}.${t}.${raw}`).digest('base64')}`;
  const T = Math.floor(NOW.getTime() / 1000);

  it('signs exactly as the spec computes', async () => {
    const h = await signPolarWebhook({ id, rawBody: raw, secret: SECRET, at: NOW });
    expect(h).toEqual({ 'webhook-id': id, 'webhook-timestamp': String(T), 'webhook-signature': expected(T) });
  });
  it('accepts the documented vector, also among several signatures', async () => {
    expect(await verifyPolarSignature(raw, headersOf({ 'webhook-id': id, 'webhook-timestamp': String(T), 'webhook-signature': expected(T) }), SECRET, NOW)).toBe(true);
    const several = `v1,${Buffer.alloc(32).toString('base64')} v2a,abc ${expected(T)}`;
    expect(await verifyPolarSignature(raw, headersOf({ 'webhook-id': id, 'webhook-timestamp': String(T), 'webhook-signature': several }), SECRET, NOW)).toBe(true);
  });
  it('accepts an older "Polar HMAC" secret (key: the UTF-8 bytes of the whole whsec_ string)', async () => {
    const legacy = expected(T, SECRET);
    expect(await verifyPolarSignature(raw, headersOf({ 'webhook-id': id, 'webhook-timestamp': String(T), 'webhook-signature': legacy }), SECRET, NOW)).toBe(true);
    expect(polarWebhookKeys(SECRET)).toHaveLength(2);
  });
  it('refuses a tampered body, a changed id, a stale or future time, a wrong secret and missing headers', async () => {
    const good = { 'webhook-id': id, 'webhook-timestamp': String(T), 'webhook-signature': expected(T) };
    expect(await verifyPolarSignature(raw.replace('active', 'canceled'), headersOf(good), SECRET, NOW)).toBe(false);
    expect(await verifyPolarSignature(raw, headersOf({ ...good, 'webhook-id': 'msg_other' }), SECRET, NOW)).toBe(false);
    expect(await verifyPolarSignature(raw, headersOf({ ...good, 'webhook-timestamp': String(T - 301), 'webhook-signature': expected(T - 301) }), SECRET, NOW)).toBe(false);
    expect(await verifyPolarSignature(raw, headersOf({ ...good, 'webhook-timestamp': String(T + 301), 'webhook-signature': expected(T + 301) }), SECRET, NOW)).toBe(false);
    expect(await verifyPolarSignature(raw, headersOf({ ...good, 'webhook-timestamp': String(T - 299), 'webhook-signature': expected(T - 299) }), SECRET, NOW)).toBe(true);
    const otherSecret = `whsec_${Buffer.from('another-secret-of-thirty-two-byt').toString('base64')}`;
    expect(await verifyPolarSignature(raw, headersOf(good), otherSecret, NOW)).toBe(false);
    expect(await verifyPolarSignature(raw, headersOf({ ...good, 'webhook-signature': expected(T).replace('v1,', 'v2,') }), SECRET, NOW)).toBe(false);
    for (const missing of Object.values(POLAR_HEADERS)) {
      const h: Record<string, string> = { ...good };
      delete h[missing];
      expect(await verifyPolarSignature(raw, headersOf(h), SECRET, NOW)).toBe(false);
    }
  });
});

describe('verifyWebhook: who an event is about', () => {
  const provider = createPolarProvider(options(fakePolar({}).fetch));
  const signed = async (body: unknown, id = 'msg_1') => {
    const raw = JSON.stringify(body);
    return { raw, headers: headersOf(await signPolarWebhook({ id, rawBody: raw, secret: SECRET, at: NOW })) };
  };
  it('subscription.updated: the external id and the customer id (https://polar.sh/docs/api-reference/2026-10/subscription_updated.md)', async () => {
    const { raw, headers } = await signed({ type: 'subscription.updated', timestamp: NOW.toISOString(), api_version: '2026-10', data: subscription() });
    expect(provider.signaturePresent(headers)).toBe(true);
    expect(await provider.verifyWebhook(raw, headers, NOW)).toEqual({ id: 'msg_1', type: 'subscription.updated', userId: USER, customerId: CUSTOMER });
  });
  it('customer.state_changed carries the customer itself (https://polar.sh/docs/api-reference/2026-10/customer_state_changed.md, its example external_id "usr_1337" is not one of our ids)', async () => {
    const state = { id: CUSTOMER, external_id: USER, email: 'customer@example.com', type: 'individual', active_subscriptions: [], granted_benefits: [], active_meters: [] };
    expect(personOfEvent('customer.state_changed', state)).toEqual({ userId: USER, customerId: CUSTOMER });
    expect(personOfEvent('customer.state_changed', { ...state, external_id: 'usr_1337' })).toEqual({ userId: null, customerId: CUSTOMER });
  });
  it('order.refunded and refund.created: by the customer id (https://polar.sh/docs/api-reference/2026-10/order_refunded.md, refund_created.md)', () => {
    expect(personOfEvent('order.refunded', { ...order({ status: 'refunded' }), customer: { id: CUSTOMER, external_id: USER } })).toEqual({ userId: USER, customerId: CUSTOMER });
    expect(personOfEvent('refund.created', { id: 'r', order_id: ORDER_A, subscription_id: SUB_A, customer_id: CUSTOMER, status: 'succeeded' })).toEqual({ userId: null, customerId: CUSTOMER });
    expect(personOfEvent('product.updated', { id: MONTH })).toEqual({ userId: null, customerId: null });
  });
  it('a body that is not JSON or has no type is refused even when signed', async () => {
    const bad = await signed('not an object');
    expect(await provider.verifyWebhook(bad.raw, bad.headers, NOW)).toBeNull();
    const raw = 'not json';
    expect(await provider.verifyWebhook(raw, headersOf(await signPolarWebhook({ id: 'msg_2', rawBody: raw, secret: SECRET, at: NOW })), NOW)).toBeNull();
    expect(provider.signaturePresent(headersOf({}))).toBe(false);
  });
});

// ------------------------------------------------------------- offers

describe('offers: the two products, read from Polar', () => {
  it('a monthly and a yearly fixed price, in cents and upper-case currency, with tax as Polar says', async () => {
    const polar = fakePolar({ products: { [MONTH]: product(MONTH, 'month', 399), [YEAR]: product(YEAR, 'year', 2999, {}, { tax_behavior: 'inclusive' }) } });
    const offers = await createPolarProvider(options(polar.fetch)).offers();
    expect(offers).toEqual([
      { id: MONTH, plan: 'plus', period: 'month', amount: 399, currency: 'USD', taxIncluded: false },
      { id: YEAR, plan: 'plus', period: 'year', amount: 2999, currency: 'USD', taxIncluded: true },
    ]);
  });
  it('location-based or unset tax is unknown (null); US dollars are chosen among several currencies; anything else is left out', () => {
    expect(offerFromProduct(product(MONTH, 'month', 399, {}, { tax_behavior: 'location' }), 'month')?.taxIncluded).toBeNull();
    expect(offerFromProduct(product(MONTH, 'month', 399, {}, { tax_behavior: null }), 'month')?.taxIncluded).toBeNull();
    const two = product(MONTH, 'month', 399);
    two.prices.unshift({ ...two.prices[0], price_currency: 'eur', price_amount: 379 });
    expect(offerFromProduct(two, 'month')).toMatchObject({ amount: 399, currency: 'USD' });
    expect(offerFromProduct(product(MONTH, 'month', 399, { is_archived: true }), 'month')).toBeNull();
    expect(offerFromProduct(product(MONTH, 'year', 399), 'month')).toBeNull();
    expect(offerFromProduct(product(MONTH, 'month', 399, { recurring_interval_count: 3 }), 'month')).toBeNull();
    expect(offerFromProduct(product(MONTH, 'month', 399, {}, { amount_type: 'custom' }), 'month')).toBeNull();
  });
  it('are cached for five minutes; a failure is thrown and not cached', async () => {
    let at = 0;
    const polar = fakePolar({ products: { [MONTH]: product(MONTH, 'month', 399), [YEAR]: product(YEAR, 'year', 2999) } });
    const provider = createPolarProvider(options(polar.fetch, { offersCacheMs: 300_000, clock: () => at, productMonth: MONTH, productYear: YEAR, environment: 'live' }));
    await provider.offers();
    await provider.offers();
    expect(polar.sent).toHaveLength(2);
    at = 300_001;
    await provider.offers();
    expect(polar.sent).toHaveLength(4);
    const down = fakePolar({}, () => ({ status: 500 }));
    await expect(createPolarProvider(options(down.fetch, { productYear: null })).offers()).rejects.toBeInstanceOf(PolarError);
  });
});

// ------------------------------------------------------------- the state

describe('readState: every subscription status Polar documents', () => {
  const read = async (subs: ReturnType<typeof subscription>[], extra: Parameters<typeof fakePolar>[0] = {}) => {
    const polar = fakePolar({ subs, orders: { [SUB_A]: [order()] }, ...extra });
    const state = await createPolarProvider(options(polar.fetch)).readState({ userId: USER, customerId: null });
    return { state, polar };
  };
  const row = (s: NonNullable<Awaited<ReturnType<typeof read>>['state']>) => ({
    entitlement: 'plus', source: s.source, provider_customer_id: s.customerId, provider_subscription_id: s.subscriptionId, product_id: s.productId, period: s.period,
    state: s.state, period_end: s.periodEnd, grace_until: s.graceUntil, cancel_at_period_end: s.cancelAtPeriodEnd, environment: s.environment, started_at: s.startedAt, provider_updated_at: s.updatedAt,
  });

  it('active: Plus to the period end, with the ids, the period, the start and Polar\'s own time', async () => {
    const { state, polar } = await read([subscription()]);
    expect(state).toEqual({
      source: 'polar', customerId: CUSTOMER, subscriptionId: SUB_A, productId: MONTH, period: 'month', state: 'active',
      periodEnd: '2026-12-01T10:00:00.000Z', graceUntil: null, cancelAtPeriodEnd: false, environment: 'sandbox',
      startedAt: '2026-11-01T10:00:00.000Z', updatedAt: '2026-11-01T10:00:05.000Z',
    });
    expect(polar.sent.map((s) => `${s.method} ${s.url.pathname}`)).toEqual(['GET /v1/subscriptions/', 'GET /v1/orders/', 'GET /v1/disputes/']);
    expect(polar.sent[0].url.searchParams.get('external_customer_id')).toBe(USER);
  });
  it('cancelled but still active (cancel_at_period_end, https://polar.sh/docs/integrate/webhooks/events.md "Cancellation Sequences"): canceling, Plus kept to the period end', async () => {
    const { state } = await read([subscription({ cancel_at_period_end: true, canceled_at: '2026-11-20T00:00:00Z', ends_at: '2026-12-01T10:00:00Z' })]);
    expect(state).toMatchObject({ state: 'canceling', cancelAtPeriodEnd: true, periodEnd: '2026-12-01T10:00:00.000Z' });
    expect(isActiveRow(row(state!), NOW, 'sandbox')).toBe(true);
  });
  it('trialing; and trialing set to cancel', async () => {
    expect((await read([subscription({ status: 'trialing' })])).state?.state).toBe('trialing');
    expect((await read([subscription({ status: 'trialing', cancel_at_period_end: true })])).state?.state).toBe('canceling');
  });
  it('P1: past_due (and unpaid): Polar has already moved to the unpaid period, so Plus is kept 7 days after the failed charge, never for the unpaid period', async () => {
    // https://polar.sh/docs/features/subscriptions/failed-payments.md: "Polar advances it to the next
    // billing cycle first, then attempts to charge"; `past_due_at` is stamped with the failure.
    const cases = [
      { interval: 'month', start: '2026-12-01T10:00:00.000Z', end: '2027-01-01T10:00:00.000Z' },
      { interval: 'year', start: '2027-11-01T10:00:00.000Z', end: '2028-11-01T10:00:00.000Z' },
    ];
    for (const c of cases) {
      for (const status of ['past_due', 'unpaid']) {
        const failedAt = new Date(Date.parse(c.start) + 5 * 60_000).toISOString(); // the charge failed five minutes into the new period
        const sub = subscription({ status, recurring_interval: c.interval, current_period_start: c.start, current_period_end: c.end, past_due_at: failedAt });
        const { state } = await read([sub]);
        const graceEnd = new Date(Date.parse(failedAt) + 7 * 86_400_000).toISOString();
        expect(state).toMatchObject({ state: 'past_due', period: c.interval, periodEnd: c.start, graceUntil: graceEnd });
        const r = row(state!);
        expect(paymentGraceEnd(r)).toBe(graceEnd);
        expect(isActiveRow(r, new Date(Date.parse(graceEnd) - 1000), 'sandbox')).toBe(true);
        expect(isActiveRow(r, new Date(Date.parse(graceEnd) + 1000), 'sandbox')).toBe(false);
        // Never kept for the unpaid period: well before its end, Plus is gone.
        expect(isActiveRow(r, new Date(Date.parse(c.start) + 20 * 86_400_000), 'sandbox')).toBe(false);
      }
      // Without past_due_at: from the start of the unpaid period.
      const { state } = await read([subscription({ status: 'past_due', recurring_interval: c.interval, current_period_start: c.start, current_period_end: c.end, past_due_at: null })]);
      expect(state).toMatchObject({ periodEnd: c.start, graceUntil: new Date(Date.parse(c.start) + 7 * 86_400_000).toISOString() });
    }
    // An active subscription keeps its own period end and no grace.
    expect((await read([subscription()])).state).toMatchObject({ periodEnd: '2026-12-01T10:00:00.000Z', graceUntil: null });
  });
  it('P7: a read lists by the customer id only when the list by external id did not find that customer', async () => {
    const polar = fakePolar({ subs: [subscription()], orders: { [SUB_A]: [order()] } });
    await createPolarProvider(options(polar.fetch)).readState({ userId: USER, customerId: CUSTOMER });
    expect(polar.sent.filter((s) => s.url.pathname === '/v1/subscriptions/').map((s) => [...s.url.searchParams.keys()][0])).toEqual(['external_customer_id']);
    // Nothing under our id (for example a customer whose external id was cleared): the customer id is asked too.
    const other = fakePolar({ subs: [subscription({ customer: { id: CUSTOMER, external_id: null } })], orders: { [SUB_A]: [order()] } });
    const state = await createPolarProvider(options(other.fetch)).readState({ userId: USER, customerId: CUSTOMER });
    expect(other.sent.filter((s) => s.url.pathname === '/v1/subscriptions/').map((s) => [...s.url.searchParams.keys()][0])).toEqual(['external_customer_id', 'customer_id']);
    expect(state?.subscriptionId).toBe(SUB_A);
    // cancelNow always asks both, so nothing the person holds is missed.
    const both = fakePolar({ subs: [subscription()] });
    await createPolarProvider(options(both.fetch)).cancelNow({ userId: USER, customerId: CUSTOMER, subscriptionId: null });
    expect(both.sent.filter((s) => s.method === 'GET' && s.url.pathname === '/v1/subscriptions/')).toHaveLength(2);
  });
  it('canceled (revoked now, or at the end of the period), paused and trial_ended: expired, ended at ended_at', async () => {
    for (const status of ['canceled', 'paused', 'trial_ended']) {
      const { state, polar } = await read([subscription({ status, ended_at: '2026-11-22T08:00:00Z', modified_at: '2026-11-22T08:00:00Z' })]);
      expect(state).toMatchObject({ state: 'expired', periodEnd: '2026-11-22T08:00:00.000Z', updatedAt: '2026-11-22T08:00:00.000Z' });
      expect(polar.sent).toHaveLength(1); // nothing more to read for an ended one
    }
  });
  it('a checkout that was never paid (incomplete, incomplete_expired) is no plan; a person with no subscription is null', async () => {
    expect((await read([subscription({ status: 'incomplete' })])).state).toBeNull();
    expect((await read([subscription({ status: 'incomplete_expired' })])).state).toBeNull();
    expect((await read([])).state).toBeNull();
    expect(stateFromStatus('a_status_polar_adds_later', false)).toBe('expired');
  });
  it('a full refund of the current payment: revoked, Plus ends now, although Polar still says active (https://polar.sh/docs/features/refunds.md)', async () => {
    const { state } = await read([subscription()], { orders: { [SUB_A]: [order({ status: 'refunded', refunded_amount: 399, refundable_amount: 0, modified_at: '2026-11-21T00:00:00Z' })] } });
    expect(state).toMatchObject({ state: 'revoked', updatedAt: '2026-11-21T00:00:00.000Z' });
    expect(activePlan([row(state!)], NOW, 'sandbox')).toBeNull();
  });
  it('a partial refund changes nothing', async () => {
    const { state } = await read([subscription()], { orders: { [SUB_A]: [order({ status: 'partially_refunded', refunded_amount: 100, refundable_amount: 299 })] } });
    expect(state?.state).toBe('active');
  });
  it('a chargeback opened or lost: revoked; won or an early warning: no change', async () => {
    for (const status of ['needs_response', 'under_review', 'lost']) {
      expect((await read([subscription()], { disputes: { [ORDER_A]: [dispute({ status })] } })).state?.state).toBe('revoked');
    }
    for (const status of ['won', 'early_warning']) {
      expect((await read([subscription()], { disputes: { [ORDER_A]: [dispute({ status })] } })).state?.state).toBe('active');
    }
  });
  it('the payment checked is the newest paid one, not a pending renewal', async () => {
    const pending = order({ id: ORDER_B, status: 'pending', paid: false, created_at: '2026-12-01T10:00:01Z', billing_reason: 'subscription_cycle' });
    const { polar } = await read([subscription({ status: 'past_due' })], { orders: { [SUB_A]: [pending, order()] } });
    expect(polar.sent[2].url.searchParams.get('order_id')).toBe(ORDER_A);
  });
  it('two live subscriptions for one person: keeps the one that started last, revokes the other and refunds its payment', async () => {
    const older = subscription({ id: SUB_A, started_at: '2026-11-01T10:00:00Z' });
    const newer = subscription({ id: SUB_B, product_id: YEAR, recurring_interval: 'year', started_at: '2026-11-01T10:05:00Z', created_at: '2026-11-01T10:05:00Z' });
    const { state, polar } = await read([older, newer], { orders: { [SUB_A]: [order()], [SUB_B]: [order({ id: ORDER_B, subscription_id: SUB_B, total_amount: 2999, net_amount: 2999, refundable_amount: 2999 })] } });
    expect(state).toMatchObject({ subscriptionId: SUB_B, period: 'year', state: 'active' });
    const writes = polar.sent.filter((s) => s.method !== 'GET');
    expect(writes.map((s) => `${s.method} ${s.url.pathname}`)).toEqual([`DELETE /v1/subscriptions/${SUB_A}`, 'POST /v1/refunds/']);
    expect(writes[1].body).toMatchObject({ order_id: ORDER_A, reason: 'duplicate', amount: 399 });
    expect(polar.subs.find((s) => s.id === SUB_A)?.status).toBe('canceled');
  });
  it('by the customer id when the person is gone (userId null)', async () => {
    const polar = fakePolar({ subs: [subscription()], orders: { [SUB_A]: [order()] } });
    const state = await createPolarProvider(options(polar.fetch)).readState({ userId: null, customerId: CUSTOMER });
    expect(state?.subscriptionId).toBe(SUB_A);
    expect(polar.sent[0].url.searchParams.get('customer_id')).toBe(CUSTOMER);
    expect(polar.sent[0].url.searchParams.has('external_customer_id')).toBe(false);
  });
});

// ------------------------------------------------------------- checkout, portal, cancel

describe('checkout and portal', () => {
  it('a checkout for the offer\'s product, with our user id as the external customer id, the email, the return address and a back button', async () => {
    const polar = fakePolar({});
    const offer = { id: YEAR, plan: 'plus' as const, period: 'year' as const, amount: 2999, currency: 'USD', taxIncluded: false };
    const { url } = await createPolarProvider(options(polar.fetch)).createCheckout({ userId: USER, email: 'person@example.com', offer, returnUrl: 'healthcal://settings/plan?checkout=done' });
    expect(url).toMatch(/^https:\/\//);
    expect(polar.sent[0].method).toBe('POST');
    expect(polar.sent[0].url.pathname).toBe('/v1/checkouts/');
    expect(polar.sent[0].headers['content-type']).toBe('application/json');
    expect(polar.sent[0].body).toEqual({
      products: [YEAR],
      external_customer_id: USER,
      customer_email: 'person@example.com',
      success_url: 'healthcal://settings/plan?checkout=done',
      return_url: 'healthcal://settings/plan',
      metadata: { healthcal_user_id: USER },
    });
  });
  it('without an email, none is sent; a checkout answer without an https url is an error', async () => {
    const polar = fakePolar({});
    const offer = { id: MONTH, plan: 'plus' as const, period: 'month' as const, amount: 399, currency: 'USD', taxIncluded: false };
    await createPolarProvider(options(polar.fetch)).createCheckout({ userId: USER, email: null, offer, returnUrl: 'https://healthcal.expo.app/settings/plan?checkout=done' });
    expect(polar.sent[0].body).not.toHaveProperty('customer_email');
    const odd = fakePolar({}, () => ({ status: 201, json: { url: 'javascript:alert(1)' } }));
    await expect(createPolarProvider(options(odd.fetch)).createCheckout({ userId: USER, email: null, offer, returnUrl: 'https://healthcal.expo.app/settings/plan' })).rejects.toMatchObject({ kind: 'bad_answer' });
  });
  it('the portal: a customer session by Polar\'s customer id (else our id), and its customer_portal_url', async () => {
    const polar = fakePolar({});
    const provider = createPolarProvider(options(polar.fetch));
    expect(await provider.portalUrl({ userId: USER, customerId: CUSTOMER, returnUrl: 'https://healthcal.expo.app/settings/plan' })).toMatch(/^https:\/\/sandbox\.polar\.sh\//);
    expect(polar.sent[0].body).toEqual({ customer_id: CUSTOMER, return_url: 'https://healthcal.expo.app/settings/plan' });
    await provider.portalUrl({ userId: USER, customerId: null, returnUrl: 'https://healthcal.expo.app/settings/plan' });
    expect(polar.sent[1].body).toEqual({ external_customer_id: USER, return_url: 'https://healthcal.expo.app/settings/plan' });
  });
});

describe('cancelNow: ends every subscription Polar holds for the person', () => {
  it('before a delete: revokes each one still running, paused and unpaid checkouts included, with no refund', async () => {
    const subs = [
      subscription({ id: SUB_A, status: 'active', cancel_at_period_end: true }),
      subscription({ id: SUB_B, status: 'paused' }),
      subscription({ id: 'bbbbbbbb-0000-4000-8000-00000000000c', status: 'canceled' }),
    ];
    const polar = fakePolar({ subs });
    await createPolarProvider(options(polar.fetch)).cancelNow({ userId: USER, customerId: CUSTOMER, subscriptionId: SUB_A });
    const writes = polar.sent.filter((s) => s.method !== 'GET').map((s) => `${s.method} ${s.url.pathname}`);
    expect(writes).toEqual([`DELETE /v1/subscriptions/${SUB_A}`, `DELETE /v1/subscriptions/${SUB_B}`]);
    expect(subs.every((s) => s.status === 'canceled')).toBe(true);
  });
  it('for a person who no longer exists (userId null): by the customer id, and refunds the payment', async () => {
    const polar = fakePolar({ subs: [subscription()], orders: { [SUB_A]: [order()] } });
    await createPolarProvider(options(polar.fetch)).cancelNow({ userId: null, customerId: CUSTOMER, subscriptionId: null });
    const writes = polar.sent.filter((s) => s.method !== 'GET');
    expect(writes.map((s) => `${s.method} ${s.url.pathname}`)).toEqual([`DELETE /v1/subscriptions/${SUB_A}`, 'POST /v1/refunds/']);
    expect(writes[1].body).toMatchObject({ order_id: ORDER_A, reason: 'other', amount: 399 });
  });
  it('refund: true refunds although the user id is known; an order already refunded is not refunded again', async () => {
    const polar = fakePolar({ subs: [subscription()], orders: { [SUB_A]: [order({ status: 'refunded', refundable_amount: 0 })] } });
    await createPolarProvider(options(polar.fetch)).cancelNow({ userId: GONE, customerId: CUSTOMER, subscriptionId: null, refund: true });
    expect(polar.sent.filter((s) => s.method === 'POST')).toHaveLength(0);
  });
  it('already revoked (403) or unknown (404) is not an error; a subscription the lists did not show is revoked by its id', async () => {
    const polar = fakePolar({ subs: [] });
    await createPolarProvider(options(polar.fetch)).cancelNow({ userId: USER, customerId: null, subscriptionId: SUB_A });
    expect(polar.sent.map((s) => `${s.method} ${s.url.pathname}`)).toEqual(['GET /v1/subscriptions/', `DELETE /v1/subscriptions/${SUB_A}`]);
    const done = fakePolar({}, (s) => (s.method === 'DELETE' ? { status: 403, json: { error: 'AlreadyCanceledSubscription' } } : s.method === 'GET' ? { status: 200, json: page([subscription()]) } : undefined));
    await expect(createPolarProvider(options(done.fetch)).cancelNow({ userId: USER, customerId: null, subscriptionId: null })).resolves.toBeUndefined();
  });
});

// ------------------------------------------------------------- failures

describe('every failure is a thrown PolarError and changes no row', () => {
  const cases: [string, (s: Sent) => Reply | undefined, Partial<PolarError>][] = [
    ['a network failure', () => 'network', { kind: 'network' }],
    ['no answer in time', () => 'hang', { kind: 'timeout' }],
    ['a 500', () => ({ status: 500, json: { error: 'Internal' } }), { kind: 'http', status: 500 }],
    ['a 401 (wrong token or the other environment\'s token)', () => ({ status: 401, json: { error: 'Unauthorized' } }), { kind: 'http', status: 401 }],
    ['a 429 with Retry-After', () => ({ status: 429, headers: { 'retry-after': '30' } }), { kind: 'http', status: 429, retryAfter: '30' }],
    ['a 422', () => ({ status: 422, json: { detail: [] } }), { kind: 'http', status: 422 }],
    ['a body that is not JSON', () => ({ status: 200, json: undefined }), { kind: 'bad_answer' }],
    ['a list without items', () => ({ status: 200, json: { data: [] } }), { kind: 'bad_answer' }],
    ['a subscription without an id', () => ({ status: 200, json: page([{ status: 'active' }]) }), { kind: 'bad_answer' }],
  ];
  for (const [name, reply, expected] of cases) {
    it(`${name}: readState throws, and refresh answers 502 with the row unchanged`, async () => {
      const polar = fakePolar({}, reply);
      const provider = createPolarProvider(options(polar.fetch));
      const error = await provider.readState({ userId: USER, customerId: null }).then(() => null, (e: unknown) => e);
      expect(error).toBeInstanceOf(PolarError);
      expect(error).toMatchObject(expected);
      expect(String((error as Error).message)).not.toContain(TOKEN);

      const store = createMemoryStore([USER], () => NOW);
      const before = { entitlement: 'plus', source: 'polar' as const, provider_customer_id: CUSTOMER, provider_subscription_id: SUB_A, product_id: MONTH, period: 'month' as const, state: 'active' as const, period_end: '2026-12-01T10:00:00.000Z', grace_until: null, cancel_at_period_end: false, environment: 'sandbox' as const, started_at: '2026-11-01T10:00:00.000Z', provider_updated_at: '2026-11-01T10:00:05.000Z' };
      await store.write(USER, before);
      const ctx: BillingContext = { caller: { id: USER, email: null, createdAt: null }, provider, store, config: planConfigFrom((n) => ({ PLANS: 'on', BILLING_ENVIRONMENT: 'sandbox' })[n]), returnRules: { siteUrl: null, allowLocalhost: false }, now: NOW };
      const answer = await handleAction({ action: 'refresh' }, ctx);
      expect(answer.status).toBe(502);
      expect(await store.rows(USER)).toEqual([before]);
    });
  }
  it('cancelNow, checkout and the portal throw on a non-2xx answer too', async () => {
    const polar = fakePolar({}, (s) => (s.method === 'GET' ? undefined : { status: 502 }));
    const provider = createPolarProvider(options(polar.fetch));
    const offer = { id: MONTH, plan: 'plus' as const, period: 'month' as const, amount: 399, currency: 'USD', taxIncluded: false };
    await expect(provider.createCheckout({ userId: USER, email: null, offer, returnUrl: 'https://healthcal.expo.app/settings/plan' })).rejects.toMatchObject({ kind: 'http', status: 502 });
    await expect(provider.portalUrl({ userId: USER, customerId: CUSTOMER, returnUrl: 'https://healthcal.expo.app/settings/plan' })).rejects.toMatchObject({ kind: 'http', status: 502 });
    await expect(provider.cancelNow({ userId: USER, customerId: null, subscriptionId: SUB_A })).rejects.toMatchObject({ kind: 'http', status: 502 });
  });
});

// ------------------------------------------------------------- with the billing function

describe('with the billing function (billing.ts)', () => {
  const signedEvent = async (data: unknown, id: string, type = 'subscription.updated') => {
    const raw = JSON.stringify({ type, timestamp: NOW.toISOString(), api_version: '2026-10', data });
    const h = await signPolarWebhook({ id, rawBody: raw, secret: SECRET, at: NOW });
    return { raw, headers: headersOf(h) };
  };
  it('a signed subscription.updated: the person\'s row is written from a fresh read; a repeat is a duplicate', async () => {
    const polar = fakePolar({ subs: [subscription()], orders: { [SUB_A]: [order()] } });
    const provider = createPolarProvider(options(polar.fetch));
    const store = createMemoryStore([USER], () => NOW);
    const { raw, headers } = await signedEvent(subscription(), 'msg_a');
    expect(await handleWebhook({ provider, store, headers, readBody: async () => raw, now: NOW })).toEqual({ status: 200, body: { received: true } });
    expect((await store.rows(USER))[0]).toMatchObject({ source: 'polar', state: 'active', environment: 'sandbox', provider_customer_id: CUSTOMER });
    expect(await handleWebhook({ provider, store, headers, readBody: async () => raw, now: NOW })).toEqual({ status: 200, body: { received: true, duplicate: true } });
  });
  it('a subscription whose person no longer exists is revoked at Polar at once and a tombstone kept', async () => {
    const live = subscription({ customer: { id: CUSTOMER, external_id: GONE } });
    const polar = fakePolar({ subs: [live], orders: { [SUB_A]: [order()] } });
    const provider = createPolarProvider(options(polar.fetch));
    const store = createMemoryStore([USER], () => NOW);
    const { raw, headers } = await signedEvent(live, 'msg_b');
    expect(await handleWebhook({ provider, store, headers, readBody: async () => raw, now: NOW })).toEqual({ status: 200, body: { received: true, ignored: 'unknown_person', ended: true } });
    expect(polar.sent.some((s) => s.method === 'DELETE' && s.url.pathname === `/v1/subscriptions/${SUB_A}`)).toBe(true);
    // P2: although the event still carries the deleted person's id, the last payment is refunded.
    const refunds = polar.sent.filter((s) => s.method === 'POST' && s.url.pathname === '/v1/refunds/');
    expect(refunds.map((s) => s.body)).toEqual([expect.objectContaining({ order_id: ORDER_A, reason: 'other', amount: 399 })]);
    expect(store.releases).toEqual([{ provider: 'polar', kind: 'orphan_ended', customerId: CUSTOMER, subscriptionId: SUB_A, userId: null }]);
  });
  it('P4: a subscription with no external id (a checkout link made in Polar\'s dashboard) is recorded and left alone', async () => {
    const dashboard = subscription({ customer: { id: CUSTOMER, external_id: null as unknown as string } });
    const polar = fakePolar({ subs: [dashboard], orders: { [SUB_A]: [order()] } });
    const provider = createPolarProvider(options(polar.fetch));
    const store = createMemoryStore([USER], () => NOW);
    const { raw, headers } = await signedEvent(dashboard, 'msg_dash');
    expect(await handleWebhook({ provider, store, headers, readBody: async () => raw, now: NOW })).toEqual({ status: 200, body: { received: true, ignored: 'unknown_person' } });
    expect(polar.sent.filter((s) => s.method !== 'GET')).toEqual([]);
    expect(store.releases).toEqual([{ provider: 'polar', kind: 'unmatched', customerId: CUSTOMER, subscriptionId: SUB_A, userId: null }]);
  });
  it('P3: cancel-now for a deletion also deletes the customer at Polar by our id, anonymised', async () => {
    const polar = fakePolar({ subs: [subscription()], orders: { [SUB_A]: [order()] } });
    const provider = createPolarProvider(options(polar.fetch));
    const store = createMemoryStore([USER], () => NOW);
    const ctx: BillingContext = { caller: { id: USER, email: null, createdAt: null }, provider, store, config: planConfigFrom((n) => ({ PLANS: 'on', BILLING_ENVIRONMENT: 'sandbox' })[n]), returnRules: { siteUrl: null, allowLocalhost: false }, now: NOW };
    expect(await handleAction({ action: 'cancel-now', force: false }, ctx)).toEqual({ status: 200, body: { cancelled: true, released: true, ended: true, customerRemoved: true } });
    const writes = polar.sent.filter((s) => s.method !== 'GET').map((s) => `${s.method} ${s.url.pathname}${s.url.search}`);
    // The subscription is ended first, then the customer is removed.
    expect(writes).toEqual([`DELETE /v1/subscriptions/${SUB_A}`, `DELETE /v1/customers/external/${USER}?anonymize=true`]);
    // Nothing at Polar (404) is not an error.
    const none = fakePolar({ subs: [] });
    await expect(createPolarProvider(options(none.fetch)).forgetCustomer({ userId: USER, customerId: null })).resolves.toBeUndefined();
  });
  it('P3: a failed customer delete does not stop the account deletion: recorded, and the answer says so', async () => {
    const polar = fakePolar({ subs: [subscription()], orders: { [SUB_A]: [order()] } }, (s) => (s.method === 'DELETE' && s.url.pathname.startsWith('/v1/customers/') ? { status: 500 } : undefined));
    const provider = createPolarProvider(options(polar.fetch));
    const store = createMemoryStore([USER], () => NOW);
    const ctx: BillingContext = { caller: { id: USER, email: null, createdAt: null }, provider, store, config: planConfigFrom((n) => ({ PLANS: 'on', BILLING_ENVIRONMENT: 'sandbox' })[n]), returnRules: { siteUrl: null, allowLocalhost: false }, now: NOW };
    expect(await handleAction({ action: 'cancel-now', force: false }, ctx)).toEqual({ status: 200, body: { cancelled: true, released: true, ended: true, customerRemoved: false } });
    expect(store.releases).toEqual([{ provider: 'polar', kind: 'customer_kept', customerId: CUSTOMER, subscriptionId: null, userId: USER }]);
    expect((await store.rows(USER))[0]).toMatchObject({ state: 'expired' });
  });
  it('cancel-now before a delete: revoked at Polar, read again, row closed, cancelled:true', async () => {
    const polar = fakePolar({ subs: [subscription()], orders: { [SUB_A]: [order()] } });
    const provider = createPolarProvider(options(polar.fetch));
    const store = createMemoryStore([USER], () => NOW);
    const ctx: BillingContext = { caller: { id: USER, email: null, createdAt: null }, provider, store, config: planConfigFrom((n) => ({ PLANS: 'on', BILLING_ENVIRONMENT: 'sandbox' })[n]), returnRules: { siteUrl: null, allowLocalhost: false }, now: NOW };
    expect(await handleAction({ action: 'cancel-now', force: false }, ctx)).toEqual({ status: 200, body: { cancelled: true, released: true, ended: true, customerRemoved: true } });
    expect((await store.rows(USER))[0]).toMatchObject({ state: 'expired' });
  });
});
