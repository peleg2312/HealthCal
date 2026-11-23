import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  ACTION_CAP_BYTES,
  type BillingContext,
  BillingError,
  type BillingProvider,
  BILLING_MESSAGES,
  checkProviderState,
  createMemoryStore,
  handleAction,
  handleWebhook,
  isAllowedReturnUrl,
  parseAction,
  type ProviderState,
  readCappedText,
  type ReturnRules,
  rowFrom,
  statusFor,
  WEBHOOK_CAP_BYTES,
} from './billing';
import { planConfigFrom } from './plans';
import { providerFrom } from './providers';
import { createTestMemory, createTestProvider, signTestWebhook, TEST_OFFERS, TEST_SIGNATURE_HEADER, TEST_WEBHOOK_SECRET, verifyTestSignature } from './testProvider';

const NOW = new Date('2026-11-23T12:00:00Z');
const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const enc = (s: string) => new TextEncoder().encode(s);
const streamOf = (chunks: Uint8Array[]) => {
  let cancelled = false;
  let i = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(c) {
      if (i < chunks.length) c.enqueue(chunks[i++]);
      else c.close();
    },
    cancel() {
      cancelled = true;
    },
  });
  return { stream, cancelled: () => cancelled };
};
const headers = (h: Record<string, string>) => ({ get: (n: string) => h[n.toLowerCase()] ?? null });

const RULES: ReturnRules = { siteUrl: 'https://cal.example.org', allowLocalhost: false };
/** The secrets that switch plans on here: the test provider, which runs only in a sandbox. */
const TEST_ENV: Record<string, string> = { PLANS: 'on', BILLING_PROVIDER: 'test', BILLING_TEST_SECRET: TEST_WEBHOOK_SECRET, BILLING_ENVIRONMENT: 'sandbox' };
const ON = planConfigFrom((n) => TEST_ENV[n]);
const OFF = planConfigFrom((n) => ({ ...TEST_ENV, PLANS: 'off' })[n]);

const plusState = (over: Partial<ProviderState> = {}): ProviderState => ({
  source: 'test',
  customerId: 'cus_1',
  subscriptionId: 'sub_1',
  productId: 'test-plus-month',
  period: 'month',
  state: 'active',
  periodEnd: '2026-12-23T12:00:00.000Z',
  graceUntil: null,
  cancelAtPeriodEnd: false,
  environment: 'sandbox',
  startedAt: '2026-11-20T09:00:00.000Z',
  updatedAt: '2026-11-23T11:59:00.000Z',
  ...over,
});

function setup(config = ON) {
  const clock = { now: NOW };
  const store = createMemoryStore([USER, OTHER], () => clock.now);
  let n = 0;
  const provider = createTestProvider({ secret: TEST_WEBHOOK_SECRET, checkoutUrl: 'http://localhost:9999/__checkout', portalUrl: 'http://localhost:9999/__portal', newId: () => `s${++n}` });
  const ctx = (over: Partial<BillingContext> = {}): BillingContext => ({
    caller: { id: USER, email: 'a@example.com', createdAt: '2026-11-20T00:00:00Z' },
    provider,
    store,
    config,
    returnRules: RULES,
    now: NOW,
    ...over,
  });
  return { store, provider, ctx, clock };
}
const later = (ms: number) => new Date(NOW.getTime() + ms);
/** A provider that counts its reads and cancels. */
const counting = (provider: BillingProvider) => {
  const counts = { reads: 0, cancels: 0 };
  const p: BillingProvider = {
    ...provider,
    readState: (i) => (counts.reads++, provider.readState(i)),
    cancelNow: (i) => (counts.cancels++, provider.cancelNow(i)),
  };
  return { p, counts };
};

async function signed(body: unknown, at = NOW, secret = TEST_WEBHOOK_SECRET) {
  const raw = JSON.stringify(body);
  return { raw, headers: headers({ [TEST_SIGNATURE_HEADER]: await signTestWebhook(raw, secret, at) }) };
}

// ------------------------------------------------------------------ the body
describe('readCappedText', () => {
  it('returns the body exactly as sent, in several chunks', async () => {
    const { stream } = streamOf([enc('{"a":'), enc('"שלום"}')]);
    expect(await readCappedText(stream, 100)).toBe('{"a":"שלום"}');
  });
  it('refuses before reading when content-length says more than the cap', async () => {
    const { stream, cancelled } = streamOf([enc('x')]);
    await expect(readCappedText(stream, 10, '11')).rejects.toMatchObject({ code: 'body_too_large', status: 413 });
    expect(cancelled()).toBe(true);
    await expect(readCappedText(streamOf([]).stream, 10, 'lots')).rejects.toMatchObject({ code: 'body_too_large' });
  });
  it('stops a chunked body as soon as it passes the cap', async () => {
    const { stream, cancelled } = streamOf([enc('12345'), enc('67890'), enc('x')]);
    await expect(readCappedText(stream, 10)).rejects.toMatchObject({ code: 'body_too_large' });
    expect(cancelled()).toBe(true);
  });
  it('refuses bytes that are not UTF-8; no body is an empty string', async () => {
    await expect(readCappedText(streamOf([new Uint8Array([0xff, 0xfe])]).stream, 10)).rejects.toMatchObject({ code: 'bad_body', status: 400 });
    expect(await readCappedText(null, 10)).toBe('');
  });
  it('the caps: 4 KB for an action, 64 KB for a webhook', () => {
    expect([ACTION_CAP_BYTES, WEBHOOK_CAP_BYTES]).toEqual([4096, 65536]);
  });
});

// --------------------------------------------------------------- the actions
describe('parseAction', () => {
  const code = (text: string) => {
    try {
      parseAction(text);
      return 'ok';
    } catch (e) {
      return `${(e as BillingError).status} ${(e as BillingError).code}`;
    }
  };
  it('an empty body or no action is status', () => {
    expect(parseAction('')).toEqual({ action: 'status' });
    expect(parseAction('{}')).toEqual({ action: 'status' });
    expect(parseAction('{"action":"refresh","userId":"someone else"}')).toEqual({ action: 'refresh' });
  });
  it('refuses what is not a JSON object, and actions it does not know', () => {
    for (const t of ['nope', '[]', 'null', '"status"', '5']) expect(code(t)).toBe('400 bad_body');
    for (const a of ['delete', 'STATUS', 5, null]) expect(code(JSON.stringify({ action: a }))).toBe('400 unknown_action');
  });
  it('checkout: an offer id and a return address, both checked', () => {
    expect(parseAction(JSON.stringify({ action: 'checkout', offerId: 'test-plus-year', returnUrl: 'healthcal://settings/plan?checkout=done' }))).toEqual({
      action: 'checkout',
      offerId: 'test-plus-year',
      returnUrl: 'healthcal://settings/plan?checkout=done',
    });
    // A missing or malformed offer id is kept as null and refused by the action (after plans_off and not_configured, R13).
    for (const offerId of [undefined, 'a b', 'x'.repeat(65), 5]) {
      expect(parseAction(JSON.stringify({ action: 'checkout', offerId, returnUrl: 'healthcal://x' }))).toEqual({ action: 'checkout', offerId: null, returnUrl: 'healthcal://x' });
    }
    expect(code(JSON.stringify({ action: 'checkout', offerId: 'o' }))).toBe('400 return_url_invalid');
    expect(code(JSON.stringify({ action: 'checkout', offerId: 'o', returnUrl: 'healthcal://' + 'x'.repeat(600) }))).toBe('400 return_url_invalid');
  });
  it('portal: a return address; cancel-now: only force', () => {
    expect(parseAction('{"action":"portal","returnUrl":"https://healthcal.expo.app/settings/plan"}')).toEqual({ action: 'portal', returnUrl: 'https://healthcal.expo.app/settings/plan' });
    expect(code('{"action":"portal"}')).toBe('400 return_url_invalid');
    expect(parseAction('{"action":"cancel-now"}')).toEqual({ action: 'cancel-now', force: false });
  });
});

describe('isAllowedReturnUrl: only the app’s own addresses', () => {
  const ok = (u: string, rules = RULES) => isAllowedReturnUrl(u, rules);
  it('the web app, the configured site and the app scheme', () => {
    expect(ok('https://healthcal.expo.app/settings/plan?checkout=done')).toBe(true);
    expect(ok('https://cal.example.org/settings/plan')).toBe(true);
    expect(ok('healthcal://settings/plan?checkout=done')).toBe(true);
  });
  it('nothing else', () => {
    for (const u of [
      'http://healthcal.expo.app/settings/plan',
      'https://healthcal.expo.app.evil.com/x',
      'https://evil.com/?https://healthcal.expo.app',
      'https://user:pw@healthcal.expo.app/x',
      'https://healthcal.expo.app:8443/x',
      'javascript:alert(1)',
      'healthcal:/settings',
      'otherapp://settings',
      'https://cal.example.org.evil.com/',
      'https://healthcal.expo.app/x y',
      'https://healthcal.expo.app\\@evil.com',
      'http://localhost:8081/settings/plan',
      '',
      '/settings/plan',
    ]) {
      expect([u, ok(u)]).toEqual([u, false]);
    }
  });
  it('localhost and 127.0.0.1 only in development', () => {
    const dev = { siteUrl: null, allowLocalhost: true };
    expect(ok('http://localhost:8081/settings/plan', dev)).toBe(true);
    expect(ok('http://127.0.0.1:8200/settings/plan', dev)).toBe(true);
    expect(ok('http://localhost.evil.com/x', dev)).toBe(false);
    expect(ok('https://cal.example.org/x', dev)).toBe(false);
  });
  it('a configured site that is not https is ignored', () => {
    expect(ok('http://cal.example.org/x', { siteUrl: 'http://cal.example.org', allowLocalhost: false })).toBe(false);
    expect(ok('https://cal.example.org/x', { siteUrl: 'not a url', allowLocalhost: false })).toBe(false);
  });
});

describe('status', () => {
  it('plans off: plansOn false, free, today’s limits, nothing to buy, and the provider is not asked', async () => {
    const { ctx, provider } = setup(OFF);
    let asked = 0;
    const spy: BillingProvider = { ...provider, offers: async () => (asked++, TEST_OFFERS.slice()) };
    expect(await handleAction({ action: 'status' }, ctx({ provider: spy }))).toEqual({
      status: 200,
      body: {
        plansOn: false,
        plan: 'free',
        state: 'none',
        periodEnd: null,
        cancelAtPeriodEnd: false,
        source: null,
        period: null,
        startedAt: null,
        graceUntil: null,
        paymentGraceUntil: null,
        limits: { estimates: 40, questions: 30, memoryPairs: 3 },
        // P8: the two cards' numbers as plans would give them, sent with plans off too.
        planLimits: { free: { estimates: 5, questions: 5, memoryPairs: 3 }, plus: { estimates: 40, questions: 30, memoryPairs: 6 } },
        offers: [],
        canCheckout: false,
        canManage: false,
      },
    });
    expect(asked).toBe(0);
  });
  it('P8: planLimits are the configured free and Plus numbers, whatever the person\'s plan or grace', async () => {
    const config = planConfigFrom((n) => ({ ...TEST_ENV, AI_DAILY_LIMIT: '60', AI_FREE_DAILY_LIMIT: '3', COACH_DAILY_LIMIT: '25', COACH_FREE_DAILY_LIMIT: '2', PLANS_GRACE_BEFORE: '2026-11-24', PLANS_GRACE_UNTIL: '2027-01-31' })[n]);
    const expected = { free: { estimates: 3, questions: 2, memoryPairs: 3 }, plus: { estimates: 60, questions: 25, memoryPairs: 6 } };
    const { ctx, store } = setup(config);
    // In the earlier-account grace (created 2026-11-20): its own limits are Plus's numbers, the cards still the plans'.
    expect(await statusFor(ctx())).toMatchObject({ limits: { estimates: 60, questions: 25, memoryPairs: 3 }, planLimits: expected });
    await store.write(USER, rowFrom(plusState()));
    expect((await statusFor(ctx())).planLimits).toEqual(expected);
    const off = planConfigFrom((n) => ({ ...TEST_ENV, PLANS: 'off', AI_DAILY_LIMIT: '60', AI_FREE_DAILY_LIMIT: '3', COACH_DAILY_LIMIT: '25', COACH_FREE_DAILY_LIMIT: '2' })[n]);
    expect((await statusFor(setup(off).ctx())).planLimits).toEqual(expected);
  });
  it('P5: canManage and the portal use only rows of the configured environment', async () => {
    const live = planConfigFrom((n) => ({ ...TEST_ENV, BILLING_ENVIRONMENT: 'live' })[n]);
    const { ctx, store } = setup(live);
    await store.write(USER, rowFrom(plusState({ environment: 'sandbox' })));
    expect(await statusFor(ctx())).toMatchObject({ canManage: false });
    expect(await handleAction({ action: 'portal', returnUrl: 'https://healthcal.expo.app/settings/plan' }, ctx())).toMatchObject({ status: 404, body: { error: 'nothing_to_manage' } });
    await store.write(USER, rowFrom(plusState({ source: 'test', environment: 'live', customerId: 'cus_live', updatedAt: '2026-11-23T11:59:59.000Z' })));
    expect(await statusFor(ctx())).toMatchObject({ canManage: true });
  });
  it('free with plans on: the offers from the provider, and a checkout is possible', async () => {
    const { ctx } = setup();
    const { body } = await handleAction({ action: 'status' }, ctx());
    expect(body).toMatchObject({ plansOn: true, plan: 'free', limits: { estimates: 5, questions: 5, memoryPairs: 3 }, canCheckout: true, canManage: false });
    expect((body as { offers: unknown }).offers).toEqual([
      { id: 'test-plus-month', plan: 'plus', period: 'month', amount: 399, currency: 'USD', taxIncluded: false },
      { id: 'test-plus-year', plan: 'plus', period: 'year', amount: 2999, currency: 'USD', taxIncluded: false },
    ]);
  });
  it('R1: PLANS=on with no provider (or one missing its secrets) is plans off: the old limits, nothing to buy', async () => {
    const extras: Record<string, string>[] = [{ BILLING_PROVIDER: '' }, { BILLING_PROVIDER: 'polar' }, { BILLING_TEST_SECRET: '' }, { BILLING_ENVIRONMENT: 'live' }];
    for (const extra of extras) {
      const config = planConfigFrom((n) => ({ ...TEST_ENV, ...extra })[n]);
      const { ctx } = setup(config);
      expect(await statusFor(ctx({ provider: null }))).toMatchObject({ plansOn: false, limits: { estimates: 40, questions: 30 }, offers: [], canCheckout: false });
    }
  });
  it('R2: a sandbox row on a live setting is not Plus (and a live row is not Plus in a sandbox)', async () => {
    const live = planConfigFrom((n) => ({ ...TEST_ENV, BILLING_ENVIRONMENT: 'live' })[n]);
    const { ctx, store } = setup(live);
    await store.write(USER, rowFrom(plusState({ environment: 'sandbox' })));
    expect(await statusFor(ctx())).toMatchObject({ plan: 'free', state: 'none', source: null });
    const s2 = setup();
    await s2.store.write(USER, rowFrom(plusState({ environment: 'live' })));
    expect(await statusFor(s2.ctx())).toMatchObject({ plan: 'free' });
  });
  it('R11: when the subscription started', async () => {
    const { ctx, store } = setup();
    await store.write(USER, rowFrom(plusState()));
    expect(await statusFor(ctx())).toMatchObject({ plan: 'plus', startedAt: '2026-11-20T09:00:00.000Z' });
  });
  it('R8: a failed renewal with no grace from the provider: Plus, with period end + 7 days', async () => {
    const { ctx, store } = setup();
    await store.write(USER, rowFrom(plusState({ state: 'past_due', periodEnd: '2026-11-20T00:00:00.000Z', graceUntil: null })));
    expect(await statusFor(ctx())).toMatchObject({ plan: 'plus', state: 'past_due', paymentGraceUntil: '2026-11-27T00:00:00.000Z' });
    expect(await statusFor(ctx({ now: new Date('2026-11-27T00:00:00Z') }))).toMatchObject({ plan: 'free', state: 'past_due' });
  });
  it('plus: the plan, its end, the source, manageable, no checkout', async () => {
    const { ctx, store } = setup();
    await store.write(USER, rowFrom(plusState({ state: 'canceling', cancelAtPeriodEnd: true, period: 'year' })));
    expect((await handleAction({ action: 'status' }, ctx())).body).toMatchObject({
      plan: 'plus',
      state: 'canceling',
      periodEnd: '2026-12-23T12:00:00.000Z',
      cancelAtPeriodEnd: true,
      source: 'test',
      period: 'year',
      limits: { estimates: 40, questions: 30, memoryPairs: 6 },
      canCheckout: false,
      canManage: true,
    });
  });
  it('a failed renewal in grace: still plus, with the payment grace end', async () => {
    const { ctx, store } = setup();
    await store.write(USER, rowFrom(plusState({ state: 'past_due', periodEnd: '2026-11-20T00:00:00.000Z', graceUntil: '2026-11-27T00:00:00.000Z' })));
    expect((await statusFor(ctx()))).toMatchObject({ plan: 'plus', state: 'past_due', paymentGraceUntil: '2026-11-27T00:00:00.000Z' });
  });
  it('an expired plan shows as free with its last state', async () => {
    const { ctx, store } = setup();
    await store.write(USER, rowFrom(plusState({ state: 'expired', periodEnd: '2026-11-01T00:00:00.000Z' })));
    expect(await statusFor(ctx())).toMatchObject({ plan: 'free', state: 'expired', canCheckout: true, canManage: true });
  });
  it('the earlier-account grace is reported while it applies', async () => {
    const config = planConfigFrom((n) => ({ ...TEST_ENV, PLANS_GRACE_BEFORE: '2026-11-24', PLANS_GRACE_UNTIL: '2027-01-31' })[n]);
    const { ctx } = setup(config);
    expect(await statusFor(ctx())).toMatchObject({ plan: 'free', graceUntil: '2027-01-31T00:00:00.000Z', limits: { estimates: 40, questions: 30, memoryPairs: 3 } });
    expect(await statusFor(ctx({ caller: { id: USER, email: null, createdAt: '2026-11-25T00:00:00Z' } }))).toMatchObject({ graceUntil: null, limits: { estimates: 5 } });
  });
  it('no provider: nothing to buy; a provider that fails: no offers, no checkout', async () => {
    const { ctx, provider } = setup();
    expect(await statusFor(ctx({ provider: null }))).toMatchObject({ plansOn: true, offers: [], canCheckout: false });
    const broken: BillingProvider = { ...provider, offers: async () => Promise.reject(new Error('down')) };
    expect(await statusFor(ctx({ provider: broken }))).toMatchObject({ offers: [], canCheckout: false });
  });
  it('a store that cannot be read is a 500', async () => {
    const { ctx, store } = setup();
    const answer = await handleAction({ action: 'status' }, ctx({ store: { ...store, rows: () => Promise.reject(new Error('db')) } }));
    expect(answer).toEqual({ status: 500, body: { error: 'store_failed', message: BILLING_MESSAGES.store_failed } });
  });
});

describe('checkout', () => {
  const buy = { action: 'checkout' as const, offerId: 'test-plus-year', returnUrl: 'healthcal://settings/plan?checkout=done' };
  it('makes a hosted checkout for the caller, whatever the body says, and returns its URL', async () => {
    const { ctx, provider } = setup();
    const answer = await handleAction(buy, ctx());
    expect(answer).toEqual({ status: 200, body: { url: 'http://localhost:9999/__checkout?session=s1' } });
    expect(provider.memory.sessions.get('s1')).toEqual({ userId: USER, offerId: 'test-plus-year', returnUrl: 'healthcal://settings/plan?checkout=done' });
  });
  it('refuses with plans off, without a provider, when already on Plus, for an unknown offer or a foreign return', async () => {
    const { ctx, store } = setup();
    expect((await handleAction(buy, setup(OFF).ctx())).status).toBe(409);
    expect((await handleAction(buy, setup(OFF).ctx())).body).toMatchObject({ error: 'plans_off' });
    expect(await handleAction(buy, ctx({ provider: null }))).toMatchObject({ status: 503, body: { error: 'not_configured' } });
    expect(await handleAction({ ...buy, offerId: 'gold' }, ctx())).toMatchObject({ status: 400, body: { error: 'offer_unknown' } });
    expect(await handleAction({ ...buy, returnUrl: 'https://evil.com/' }, ctx())).toMatchObject({ status: 400, body: { error: 'return_url_invalid' } });
    await store.write(USER, rowFrom(plusState()));
    expect(await handleAction(buy, ctx())).toMatchObject({ status: 409, body: { error: 'already_subscribed' } });
  });
  it('a provider that fails is a 502', async () => {
    const { ctx, provider } = setup();
    const broken: BillingProvider = { ...provider, createCheckout: () => Promise.reject(new Error('down')) };
    expect(await handleAction(buy, ctx({ provider: broken }))).toMatchObject({ status: 502, body: { error: 'provider_failed' } });
  });
  it('R13: a malformed offer id is answered after plans_off and not_configured', async () => {
    const bad = { action: 'checkout' as const, offerId: null, returnUrl: buy.returnUrl };
    expect(parseAction(JSON.stringify({ action: 'checkout', offerId: 'no spaces allowed', returnUrl: buy.returnUrl }))).toEqual(bad);
    expect(await handleAction(bad, setup(OFF).ctx())).toMatchObject({ status: 409, body: { error: 'plans_off' } });
    expect(await handleAction(bad, setup().ctx({ provider: null }))).toMatchObject({ status: 503, body: { error: 'not_configured' } });
    expect(await handleAction(bad, setup().ctx())).toMatchObject({ status: 400, body: { error: 'offer_unknown' } });
    // ...and before anything else is looked at or counted.
    const { ctx, store } = setup();
    expect(await handleAction({ ...bad, returnUrl: 'https://evil.com/' }, ctx())).toMatchObject({ status: 400, body: { error: 'offer_unknown' } });
    expect(store.calls.size).toBe(0);
  });
  it('R10: at most 10 payment pages an hour per person, counted by the store', async () => {
    const { ctx, clock } = setup();
    for (let i = 0; i < 10; i += 1) {
      clock.now = later(i * 60_000);
      expect((await handleAction(buy, ctx())).status).toBe(200);
    }
    clock.now = later(10 * 60_000);
    expect(await handleAction(buy, ctx())).toMatchObject({ status: 429, body: { error: 'checkout_limit', message: BILLING_MESSAGES.checkout_limit } });
    // Another person is counted apart; an hour after the first, one more is allowed.
    expect((await handleAction(buy, ctx({ caller: { id: OTHER, email: null, createdAt: null } }))).status).toBe(200);
    clock.now = later(60 * 60_000 + 1);
    expect((await handleAction(buy, ctx())).status).toBe(200);
  });
  it('a refused checkout (a foreign return address) is not counted', async () => {
    const { ctx, store } = setup();
    for (let i = 0; i < 12; i += 1) await handleAction({ ...buy, returnUrl: 'https://evil.com/' }, ctx());
    expect(store.calls.get(`${USER}|checkout`) ?? []).toHaveLength(0);
  });
});

describe('portal', () => {
  const open = { action: 'portal' as const, returnUrl: 'https://healthcal.expo.app/settings/plan' };
  it('opens the provider portal for the caller’s own customer', async () => {
    const { ctx, store } = setup();
    await store.write(USER, rowFrom(plusState()));
    expect(await handleAction(open, ctx())).toEqual({ status: 200, body: { url: 'http://localhost:9999/__portal?customer=cus_1' } });
  });
  it('nothing to manage without a row from this provider; a store purchase says where', async () => {
    const { ctx, store } = setup();
    expect(await handleAction(open, ctx())).toMatchObject({ status: 404, body: { error: 'nothing_to_manage' } });
    await store.write(USER, rowFrom(plusState({ source: 'play_store' })));
    expect(await handleAction(open, ctx())).toMatchObject({ status: 409, body: { error: 'cancel_elsewhere', source: 'play_store' } });
    expect(await handleAction({ ...open, returnUrl: 'https://evil.com' }, ctx())).toMatchObject({ status: 400, body: { error: 'return_url_invalid' } });
  });
});

describe('refresh', () => {
  it('re-reads the provider and writes the row, then answers the status', async () => {
    const { ctx, provider, store } = setup();
    provider.memory.states.set(USER, plusState());
    const answer = await handleAction({ action: 'refresh' }, ctx());
    expect(answer.body).toMatchObject({ plan: 'plus', state: 'active' });
    expect(store.entitlements.get(`${USER}|plus|test`)?.provider_subscription_id).toBe('sub_1');
  });
  it('R7: nothing at the provider any more: the open row is marked expired at its own provider time, not the server clock', async () => {
    const { ctx, store } = setup();
    await store.write(USER, rowFrom(plusState()));
    const answer = await handleAction({ action: 'refresh' }, ctx());
    expect(answer.body).toMatchObject({ plan: 'free', state: 'expired' });
    expect(store.entitlements.get(`${USER}|plus|test`)?.provider_updated_at).toBe('2026-11-23T11:59:00.000Z');
    // So a provider event stamped a moment before the server's clock is still applied.
    await store.write(USER, rowFrom(plusState({ state: 'active', updatedAt: '2026-11-23T11:59:30.000Z' })));
    expect(store.entitlements.get(`${USER}|plus|test`)?.state).toBe('active');
  });
  it('R7: a read that throws changes nothing', async () => {
    const { ctx, provider, store } = setup();
    await store.write(USER, rowFrom(plusState()));
    const before = structuredClone([...store.entitlements]);
    const broken: BillingProvider = { ...provider, readState: () => Promise.reject(new Error('down')) };
    expect((await handleAction({ action: 'refresh' }, ctx({ provider: broken }))).status).toBe(502);
    expect([...store.entitlements]).toEqual(before);
  });
  it('R3: rows from two sources live side by side; a refresh touches only its own', async () => {
    const { ctx, store } = setup();
    await store.write(USER, rowFrom(plusState({ source: 'promotional', periodEnd: '2027-01-01T00:00:00.000Z' })));
    await store.write(USER, rowFrom(plusState()));
    expect(store.entitlements.size).toBe(2);
    await handleAction({ action: 'refresh' }, ctx());
    expect(store.entitlements.get(`${USER}|plus|test`)?.state).toBe('expired');
    expect(store.entitlements.get(`${USER}|plus|promotional`)?.state).toBe('active');
    expect(await statusFor(ctx())).toMatchObject({ plan: 'plus', source: 'promotional' });
  });
  it('R10: the provider is read at most once every 2 s and 60 times an hour; otherwise the table answers', async () => {
    const { ctx, provider, store, clock } = setup();
    const { p, counts } = counting(provider);
    provider.memory.states.set(USER, plusState());
    expect((await handleAction({ action: 'refresh' }, ctx({ provider: p }))).body).toMatchObject({ plan: 'plus' });
    clock.now = later(1999);
    provider.memory.states.set(USER, plusState({ state: 'canceling', cancelAtPeriodEnd: true, updatedAt: '2026-11-23T11:59:30.000Z' }));
    expect((await handleAction({ action: 'refresh' }, ctx({ provider: p }))).body).toMatchObject({ state: 'active' });
    expect(counts.reads).toBe(1);
    clock.now = later(2000);
    expect((await handleAction({ action: 'refresh' }, ctx({ provider: p }))).body).toMatchObject({ state: 'canceling' });
    expect(counts.reads).toBe(2);
    for (let i = 2; i <= 70; i += 1) {
      clock.now = later(2000 * i);
      await handleAction({ action: 'refresh' }, ctx({ provider: p }));
    }
    expect(counts.reads).toBe(60);
    expect(store.calls.get(`${USER}|refresh`)).toHaveLength(60);
    // A store that cannot count answers from the table, without asking the provider.
    const failing = { ...store, takeCall: () => Promise.reject(new Error('db')) };
    clock.now = later(3 * 60 * 60_000);
    expect((await handleAction({ action: 'refresh' }, ctx({ provider: p, store: failing }))).status).toBe(200);
    expect(counts.reads).toBe(60);
  });
  it('R6: a live subscription whose person is gone by the time it is written is ended at the provider and recorded', async () => {
    const { ctx, provider, store } = setup();
    provider.memory.states.set(USER, plusState());
    store.users.delete(USER);
    const answer = await handleAction({ action: 'refresh' }, ctx());
    expect(answer.status).toBe(200);
    expect(provider.memory.states.get(USER)?.state).toBe('expired');
    expect(store.releases).toEqual([{ provider: 'test', kind: 'orphan_ended', customerId: 'cus_1', subscriptionId: 'sub_1', userId: null }]);
  });
  it('a provider that fails is a 502; no provider is just the status', async () => {
    const { ctx, provider } = setup();
    const broken: BillingProvider = { ...provider, readState: () => Promise.reject(new Error('down')) };
    expect(await handleAction({ action: 'refresh' }, ctx({ provider: broken }))).toMatchObject({ status: 502, body: { error: 'provider_failed' } });
    expect(await handleAction({ action: 'refresh' }, ctx({ provider: null }))).toMatchObject({ status: 200, body: { plan: 'free' } });
  });
});

describe('cancel-now (before deleting an account), R4', () => {
  const cancel = { action: 'cancel-now' as const, force: false };
  const force = { action: 'cancel-now' as const, force: true };

  it('parses force only when it is exactly true', () => {
    expect(parseAction('{"action":"cancel-now"}')).toEqual(cancel);
    expect(parseAction('{"action":"cancel-now","force":true}')).toEqual(force);
    expect(parseAction('{"action":"cancel-now","force":"yes"}')).toEqual(cancel);
  });
  it('nothing paid anywhere: cancelled (nothing keeps running), nothing ended; the provider is still asked', async () => {
    const { ctx, provider } = setup();
    const { p, counts } = counting(provider);
    expect(await handleAction(cancel, ctx({ provider: p }))).toEqual({ status: 200, body: { cancelled: true, released: true, ended: false, customerRemoved: true } });
    expect([counts.reads, counts.cancels]).toEqual([1, 0]);
    expect(await handleAction(cancel, ctx({ provider: null }))).toEqual({ status: 200, body: { cancelled: true, released: true, ended: false, customerRemoved: null } });
  });
  it('asks the provider first: a subscription it holds that the table never heard of (a checkout paid moments ago) is ended', async () => {
    const { ctx, provider, store } = setup();
    provider.memory.states.set(USER, plusState());
    const answer = await handleAction(cancel, ctx({ now: new Date() }));
    expect(answer).toEqual({ status: 200, body: { cancelled: true, released: true, ended: true, customerRemoved: true } });
    expect(provider.memory.states.get(USER)?.state).toBe('expired');
    expect(store.entitlements.get(`${USER}|plus|test`)?.state).toBe('expired');
  });
  it('ends an open row of this provider whatever its dates say (a past_due row long lapsed), and closes it', async () => {
    const { ctx, provider, store } = setup();
    await store.write(USER, rowFrom(plusState({ state: 'past_due', periodEnd: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' })));
    const { p, counts } = counting(provider);
    expect(await handleAction(cancel, ctx({ provider: p }))).toEqual({ status: 200, body: { cancelled: true, released: true, ended: true, customerRemoved: true } });
    expect(counts.cancels).toBe(1);
    // Closed at its own provider time, never the server's clock.
    expect(store.entitlements.get(`${USER}|plus|test`)).toMatchObject({ state: 'expired', provider_updated_at: '2026-01-01T00:00:00.000Z' });
  });
  it('the answer is decided on what was cancelled: a re-read that fails after the provider ended it still closes the row', async () => {
    const { ctx, provider, store } = setup();
    provider.memory.states.set(USER, plusState());
    await store.write(USER, rowFrom(plusState()));
    let reads = 0;
    const flaky: BillingProvider = { ...provider, readState: (i) => (++reads === 1 ? provider.readState(i) : Promise.reject(new Error('down'))) };
    expect(await handleAction(cancel, ctx({ provider: flaky, now: new Date() }))).toEqual({ status: 200, body: { cancelled: true, released: true, ended: true, customerRemoved: true } });
    expect(store.entitlements.get(`${USER}|plus|test`)?.state).toBe('expired');
  });
  it('a subscription the provider still shows open after cancelling is a failure, and nothing is closed', async () => {
    const { ctx, provider, store } = setup();
    provider.memory.states.set(USER, plusState());
    await store.write(USER, rowFrom(plusState()));
    const stubborn: BillingProvider = { ...provider, cancelNow: async () => undefined };
    expect(await handleAction(cancel, ctx({ provider: stubborn }))).toMatchObject({ status: 502, body: { error: 'provider_failed' } });
    expect(store.entitlements.get(`${USER}|plus|test`)?.state).toBe('active');
  });
  it('a provider that cannot be read or cannot cancel: 502, nothing changed; with force the plan is released with a tombstone', async () => {
    for (const broken of ['readState', 'cancelNow'] as const) {
      const { ctx, provider, store } = setup();
      await store.write(USER, rowFrom(plusState()));
      const p: BillingProvider = { ...provider, [broken]: () => Promise.reject(new Error('down')) };
      expect(await handleAction(cancel, ctx({ provider: p }))).toMatchObject({ status: 502, body: { error: 'provider_failed' } });
      expect(store.entitlements.get(`${USER}|plus|test`)?.state).toBe('active');
      expect(store.releases).toHaveLength(0);
      expect(await handleAction(force, ctx({ provider: p }))).toEqual({ status: 200, body: { cancelled: false, released: true, ended: false, customerRemoved: null } });
      expect(store.entitlements.get(`${USER}|plus|test`)?.state).toBe('revoked');
      expect(store.releases).toEqual([{ provider: 'test', kind: 'released', customerId: 'cus_1', subscriptionId: 'sub_1', userId: USER }]);
    }
  });
  it('a store purchase, or no provider configured: refused without force; with force released and recorded', async () => {
    const { ctx, store } = setup();
    await store.write(USER, rowFrom(plusState({ source: 'app_store', customerId: 'apple_1', subscriptionId: 'orig_1' })));
    expect(await handleAction(cancel, ctx())).toMatchObject({ status: 409, body: { error: 'cancel_elsewhere', source: 'app_store' } });
    expect(await handleAction(cancel, ctx({ provider: null }))).toMatchObject({ status: 503, body: { error: 'not_configured' } });
    expect(await handleAction(force, ctx({ provider: null }))).toEqual({ status: 200, body: { cancelled: false, released: true, ended: false, customerRemoved: null } });
    expect(store.entitlements.get(`${USER}|plus|app_store`)?.state).toBe('revoked');
    expect(store.releases).toEqual([{ provider: 'app_store', kind: 'released', customerId: 'apple_1', subscriptionId: 'orig_1', userId: USER }]);
  });
  it('a promotional grant goes with the account and is never ended or released', async () => {
    const { ctx, store } = setup();
    await store.write(USER, rowFrom(plusState({ source: 'promotional' })));
    expect(await handleAction(cancel, ctx())).toEqual({ status: 200, body: { cancelled: true, released: true, ended: false, customerRemoved: true } });
    expect(await handleAction(force, ctx({ provider: null }))).toEqual({ status: 200, body: { cancelled: true, released: true, ended: false, customerRemoved: null } });
    expect(store.entitlements.get(`${USER}|plus|promotional`)?.state).toBe('active');
    expect(store.releases).toHaveLength(0);
  });
  it('force never hides a store failure', async () => {
    const { ctx, provider, store } = setup();
    await store.write(USER, rowFrom(plusState()));
    const p: BillingProvider = { ...provider, readState: () => Promise.reject(new Error('down')) };
    const broken = { ...store, write: () => Promise.reject(new Error('db')) };
    expect(await handleAction(force, ctx({ provider: p, store: broken }))).toMatchObject({ status: 500, body: { error: 'store_failed' } });
  });
});

// ----------------------------------------------------------- the signature
describe('the test provider’s signature', () => {
  it('signs and verifies "<t>.<raw body>" with HMAC-SHA256', async () => {
    const h = await signTestWebhook('{"a":1}', 'secret-secret-secret', NOW);
    expect(h).toMatch(/^t=1795435200,v1=[0-9a-f]{64}$/);
    expect(await verifyTestSignature('{"a":1}', h, 'secret-secret-secret', NOW)).toBe(true);
  });
  it('a changed body, another secret, a wrong or missing header fail', async () => {
    const h = await signTestWebhook('{"a":1}', 'secret-secret-secret', NOW);
    expect(await verifyTestSignature('{"a":2}', h, 'secret-secret-secret', NOW)).toBe(false);
    expect(await verifyTestSignature('{"a":1} ', h, 'secret-secret-secret', NOW)).toBe(false);
    expect(await verifyTestSignature('{"a":1}', h, 'another-secret-x', NOW)).toBe(false);
    expect(await verifyTestSignature('{"a":1}', null, 'secret-secret-secret', NOW)).toBe(false);
    expect(await verifyTestSignature('{"a":1}', 'v1=00', 'secret-secret-secret', NOW)).toBe(false);
    expect(await verifyTestSignature('{"a":1}', h.replace(/.$/, (c) => (c === '0' ? '1' : '0')), 'secret-secret-secret', NOW)).toBe(false);
    expect(await verifyTestSignature('{"a":1}', h.replace('v1=', 'v1=zz'), 'secret-secret-secret', NOW)).toBe(false);
  });
  it('300 seconds either way, not one more', async () => {
    const h = await signTestWebhook('{}', 'secret-secret-secret', NOW);
    const at = (s: number) => new Date(NOW.getTime() + s * 1000);
    expect(await verifyTestSignature('{}', h, 'secret-secret-secret', at(300))).toBe(true);
    expect(await verifyTestSignature('{}', h, 'secret-secret-secret', at(-300))).toBe(true);
    expect(await verifyTestSignature('{}', h, 'secret-secret-secret', at(301))).toBe(false);
    expect(await verifyTestSignature('{}', h, 'secret-secret-secret', at(-301))).toBe(false);
  });
});

// ------------------------------------------------------------- the webhook
describe('the webhook', () => {
  const event = (over: Record<string, unknown> = {}) => ({ id: 'evt_1', type: 'subscription.updated', userId: USER, state: plusState(), ...over });

  it('no provider: refused before the body is read', async () => {
    const { store } = setup();
    let read = 0;
    const answer = await handleWebhook({ provider: null, store, headers: headers({}), readBody: async () => (read++, '{}'), now: NOW });
    expect([answer.status, (answer.body as { error: string }).error, read]).toEqual([503, 'not_configured', 0]);
  });
  it('no signature header: refused before the body is read', async () => {
    const { store, provider } = setup();
    let read = 0;
    const answer = await handleWebhook({ provider, store, headers: headers({}), readBody: async () => (read++, '{}'), now: NOW });
    expect([answer.status, (answer.body as { error: string }).error, read]).toEqual([401, 'bad_signature', 0]);
  });
  it('a bad signature changes nothing', async () => {
    const { store, provider } = setup();
    const { raw } = await signed(event());
    const forged = await signTestWebhook(raw, 'not-the-secret-at-all', NOW);
    const answer = await handleWebhook({ provider, store, headers: headers({ [TEST_SIGNATURE_HEADER]: forged }), readBody: async () => raw, now: NOW });
    expect(answer.status).toBe(401);
    expect([store.entitlements.size, store.events.size, provider.memory.states.size]).toEqual([0, 0, 0]);
  });
  it('a body over the cap is a 413', async () => {
    const { store, provider } = setup();
    const answer = await handleWebhook({ provider, store, headers: headers({ [TEST_SIGNATURE_HEADER]: 't=1,v1=00' }), readBody: () => Promise.reject(new BillingError('body_too_large', 413)), now: NOW });
    expect(answer.status).toBe(413);
  });
  it('a good event: recorded, the state re-read, the row written', async () => {
    const { store, provider } = setup();
    const { raw, headers: h } = await signed(event());
    const answer = await handleWebhook({ provider, store, headers: h, readBody: async () => raw, now: NOW });
    expect(answer).toEqual({ status: 200, body: { received: true } });
    expect(store.events.has('test|evt_1')).toBe(true);
    expect(store.entitlements.get(`${USER}|plus|test`)).toMatchObject({ source: 'test', state: 'active', period_end: '2026-12-23T12:00:00.000Z', provider_customer_id: 'cus_1' });
  });
  it('the same event again is acknowledged and does nothing', async () => {
    const { store, provider } = setup();
    const { raw, headers: h } = await signed(event());
    await handleWebhook({ provider, store, headers: h, readBody: async () => raw, now: NOW });
    store.entitlements.clear();
    const again = await handleWebhook({ provider, store, headers: h, readBody: async () => raw, now: NOW });
    expect(again).toEqual({ status: 200, body: { received: true, duplicate: true } });
    expect(store.entitlements.size).toBe(0);
  });
  it('order does not matter: the row is always the provider’s current state', async () => {
    const { store, provider } = setup();
    // The provider moved on to canceling; the older "active" event arrives last.
    provider.memory.states.set(USER, plusState({ state: 'canceling', cancelAtPeriodEnd: true, updatedAt: '2026-11-23T11:59:30.000Z' }));
    const late = await signed({ id: 'evt_old', type: 'subscription.created', userId: USER });
    await handleWebhook({ provider, store, headers: late.headers, readBody: async () => late.raw, now: NOW });
    expect(store.entitlements.get(`${USER}|plus|test`)?.state).toBe('canceling');
  });
  it('an older state never overwrites a newer stored one', async () => {
    const { store } = setup();
    await store.write(USER, rowFrom(plusState({ state: 'canceling', updatedAt: '2026-11-23T11:59:30.000Z' })));
    await store.write(USER, rowFrom(plusState({ state: 'active', updatedAt: '2026-11-23T11:00:00.000Z' })));
    expect(store.entitlements.get(`${USER}|plus|test`)?.state).toBe('canceling');
  });
  it('an unknown person with nothing open at the provider is acknowledged and dropped', async () => {
    const { store, provider } = setup();
    const stranger = '33333333-3333-4333-8333-333333333333';
    const { raw, headers: h } = await signed(event({ userId: stranger, customerId: 'cus_nobody', state: plusState({ state: 'expired' }) }));
    const answer = await handleWebhook({ provider, store, headers: h, readBody: async () => raw, now: NOW });
    expect(answer).toEqual({ status: 200, body: { received: true, ignored: 'unknown_person' } });
    expect([store.entitlements.size, store.releases.length]).toEqual([0, 0]);
    // An event naming nobody at all is dropped without a trace.
    const none = await signed({ id: 'evt_none', type: 'x', userId: null });
    expect((await handleWebhook({ provider, store, headers: none.headers, readBody: async () => none.raw, now: NOW })).body).toEqual({ received: true, ignored: 'unknown_person' });
    expect(store.events.has('test|evt_none')).toBe(false);
  });
  it('R6: a live subscription whose person no longer exists (deleted during checkout) is ended at once and recorded', async () => {
    const { store, provider } = setup();
    const gone = '44444444-4444-4444-8444-444444444444';
    const { raw, headers: h } = await signed(event({ id: 'evt_paid', userId: gone, state: plusState({ customerId: 'cus_gone', subscriptionId: 'sub_gone' }) }));
    const answer = await handleWebhook({ provider, store, headers: h, readBody: async () => raw, now: NOW });
    expect(answer).toEqual({ status: 200, body: { received: true, ignored: 'unknown_person', ended: true } });
    expect(provider.memory.states.get(gone)?.state).toBe('expired');
    expect(store.releases).toEqual([{ provider: 'test', kind: 'orphan_ended', customerId: 'cus_gone', subscriptionId: 'sub_gone', userId: null }]);
    expect(store.entitlements.size).toBe(0);
    // The same event again does nothing more.
    expect((await handleWebhook({ provider, store, headers: h, readBody: async () => raw, now: NOW })).body).toEqual({ received: true, duplicate: true });
    expect(store.releases).toHaveLength(1);
  });
  it('R6/P2: the orphan\'s last payment is refunded (endOrphan asks for it); a provider that fails is retried, nothing recorded', async () => {
    const { store, provider } = setup();
    const gone = '55555555-5555-4555-8555-555555555555';
    provider.memory.states.set(gone, plusState({ customerId: 'cus_lost', subscriptionId: 'sub_lost' }));
    const { raw, headers: h } = await signed({ id: 'evt_c2', type: 'subscription.renewed', userId: gone, customerId: 'cus_lost' });
    const broken: BillingProvider = { ...provider, cancelNow: () => Promise.reject(new Error('down')) };
    expect((await handleWebhook({ provider: broken, store, headers: h, readBody: async () => raw, now: NOW })).status).toBe(502);
    expect([store.events.size, store.releases.length, provider.memory.refunds.length]).toEqual([0, 0, 0]);
    expect((await handleWebhook({ provider, store, headers: h, readBody: async () => raw, now: NOW })).body).toEqual({ received: true, ignored: 'unknown_person', ended: true });
    expect(store.releases[0]).toMatchObject({ kind: 'orphan_ended', customerId: 'cus_lost' });
    expect(provider.memory.refunds).toEqual(['sub_lost']);
  });
  it('R6/P2: the refresh path refunds the orphan too', async () => {
    const { ctx, provider, store } = setup();
    provider.memory.states.set(USER, plusState());
    store.users.delete(USER);
    await handleAction({ action: 'refresh' }, ctx());
    expect(provider.memory.refunds).toEqual(['sub_1']);
  });
  it('P4: no external id (a checkout link made in the provider\'s dashboard): recorded with what is known, never ended', async () => {
    const { store, provider } = setup();
    provider.memory.states.set('someone-else', plusState({ customerId: 'cus_lost', subscriptionId: 'sub_dash' }));
    const { p, counts } = counting(provider);
    const { raw, headers: h } = await signed({ id: 'evt_c3', type: 'subscription.created', userId: null, customerId: 'cus_lost' });
    expect(await handleWebhook({ provider: p, store, headers: h, readBody: async () => raw, now: NOW })).toEqual({ status: 200, body: { received: true, ignored: 'unknown_person' } });
    expect(counts.cancels).toBe(0);
    expect(provider.memory.states.get('someone-else')?.state).toBe('active');
    expect(store.events.has('test|evt_c3')).toBe(true);
    expect(store.releases).toEqual([{ provider: 'test', kind: 'unmatched', customerId: 'cus_lost', subscriptionId: 'sub_dash', userId: null }]);
  });
  it('P4: an external id that is not a UUID is never ended, even when the store calls it gone', async () => {
    const { store, provider } = setup();
    const { p, counts } = counting(provider);
    const { raw, headers: h } = await signed(event({ id: 'evt_u', userId: 'usr_1337', state: plusState({ customerId: 'cus_x', subscriptionId: 'sub_x' }) }));
    expect((await handleWebhook({ provider: p, store, headers: h, readBody: async () => raw, now: NOW })).body).toEqual({ received: true, ignored: 'unknown_person' });
    expect(counts.cancels).toBe(0);
    expect(provider.memory.states.get('usr_1337')?.state).toBe('active');
    expect(store.releases).toEqual([{ provider: 'test', kind: 'unmatched', customerId: 'cus_x', subscriptionId: 'sub_x', userId: null }]);
  });
  it('P4: when it cannot be told whether the person exists, nothing is ended: the row is written when the person is there, else recorded', async () => {
    const unsureOf = (store: ReturnType<typeof setup>['store']) => ({ ...store, userExists: () => Promise.reject(new Error('auth down')) });
    // A person who does exist: their row is written as for anyone.
    {
      const { store, provider } = setup();
      const { raw, headers: h } = await signed(event({ id: 'evt_e1' }));
      expect(await handleWebhook({ provider, store: unsureOf(store), headers: h, readBody: async () => raw, now: NOW })).toEqual({ status: 200, body: { received: true } });
      expect(store.entitlements.get(`${USER}|plus|test`)?.state).toBe('active');
    }
    // A person the store does not hold: left alone, recorded.
    {
      const { store, provider } = setup();
      const { p, counts } = counting(provider);
      const unknown = '66666666-6666-4666-8666-666666666666';
      const { raw, headers: h } = await signed(event({ id: 'evt_e2', userId: unknown }));
      expect(await handleWebhook({ provider: p, store: unsureOf(store), headers: h, readBody: async () => raw, now: NOW })).toEqual({ status: 200, body: { received: true, ignored: 'unknown_person' } });
      expect(counts.cancels).toBe(0);
      expect(provider.memory.states.get(unknown)?.state).toBe('active');
      expect(store.releases).toEqual([{ provider: 'test', kind: 'unmatched', customerId: 'cus_1', subscriptionId: 'sub_1', userId: null }]);
    }
  });

  it('an event naming only the customer finds the person from the stored row', async () => {
    const { store, provider } = setup();
    await store.write(USER, rowFrom(plusState()));
    provider.memory.states.set(USER, plusState({ state: 'past_due', graceUntil: '2026-12-30T00:00:00.000Z', updatedAt: '2026-11-23T11:59:59.000Z' }));
    const { raw, headers: h } = await signed({ id: 'evt_c', type: 'subscription.past_due', userId: null, customerId: 'cus_1' });
    expect((await handleWebhook({ provider, store, headers: h, readBody: async () => raw, now: NOW })).status).toBe(200);
    expect(store.entitlements.get(`${USER}|plus|test`)).toMatchObject({ state: 'past_due', grace_until: '2026-12-30T00:00:00.000Z' });
  });
  it('a failed re-read forgets the event, so the provider’s retry is handled', async () => {
    const { store, provider } = setup();
    const { raw, headers: h } = await signed(event({ state: undefined }));
    const broken: BillingProvider = { ...provider, verifyWebhook: provider.verifyWebhook, readState: () => Promise.reject(new Error('down')) };
    const first = await handleWebhook({ provider: broken, store, headers: h, readBody: async () => raw, now: NOW });
    expect(first.status).toBe(502);
    expect(store.events.size).toBe(0);
    provider.memory.states.set(USER, plusState());
    expect((await handleWebhook({ provider, store, headers: h, readBody: async () => raw, now: NOW })).body).toEqual({ received: true });
    expect(store.entitlements.get(`${USER}|plus|test`)?.state).toBe('active');
  });
  it('the test provider takes only its own source, and a state it can read', async () => {
    const { store, provider } = setup();
    for (const bad of [plusState({ source: 'polar' }), { ...plusState(), state: 'gold' }, { ...plusState(), updatedAt: 'later' }]) {
      const { raw, headers: h } = await signed(event({ state: bad }));
      expect((await handleWebhook({ provider, store, headers: h, readBody: async () => raw, now: NOW })).status).toBe(401);
    }
    expect(store.entitlements.size).toBe(0);
  });
  it('an expired signature is refused', async () => {
    const { store, provider } = setup();
    const { raw, headers: h } = await signed(event(), new Date(NOW.getTime() - 301_000));
    expect((await handleWebhook({ provider, store, headers: h, readBody: async () => raw, now: NOW })).status).toBe(401);
  });
});

describe('a whole purchase with the test provider', () => {
  it('status free, checkout, the provider’s signed event, refresh: Plus with its limits', async () => {
    const { ctx, provider, store } = setup();
    expect(await statusFor(ctx())).toMatchObject({ plan: 'free', canCheckout: true });
    const { body } = await handleAction({ action: 'checkout', offerId: 'test-plus-month', returnUrl: 'healthcal://settings/plan?checkout=done' }, ctx());
    const session = new URL((body as { url: string }).url).searchParams.get('session')!;
    const paid = provider.memory.sessions.get(session)!;
    // What the stand-in's "Pay" button does: sign an event that carries the new state.
    const { raw, headers: h } = await signed({ id: `evt_${session}`, type: 'checkout.paid', userId: paid.userId, state: plusState({ productId: paid.offerId }) });
    expect((await handleWebhook({ provider, store, headers: h, readBody: async () => raw, now: NOW })).status).toBe(200);
    expect((await handleAction({ action: 'refresh' }, ctx())).body).toMatchObject({ plan: 'plus', limits: { estimates: 40, questions: 30, memoryPairs: 6 }, canManage: true, startedAt: '2026-11-20T09:00:00.000Z' });
  });
});

describe('providerFrom', () => {
  it('none unless BILLING_PROVIDER names one; test needs its own secret and a sandbox on a deployed function', () => {
    expect(providerFrom(() => undefined)).toBeNull();
    expect(providerFrom((n) => ({ BILLING_PROVIDER: 'test', BILLING_ENVIRONMENT: 'sandbox' })[n])).toBeNull();
    expect(providerFrom((n) => ({ BILLING_PROVIDER: 'test', BILLING_TEST_SECRET: 'short', BILLING_ENVIRONMENT: 'sandbox' })[n])).toBeNull();
    expect(providerFrom((n) => ({ BILLING_PROVIDER: 'test', BILLING_TEST_SECRET: 'a-long-enough-secret' })[n])).toBeNull();
    expect(providerFrom((n) => ({ BILLING_PROVIDER: 'test', BILLING_TEST_SECRET: 'a-long-enough-secret', BILLING_ENVIRONMENT: 'sandbox' })[n])?.id).toBe('test');
  });
  it('R1: the billing function builds a provider exactly when plans.ts says plans may be on', () => {
    const cases: Record<string, string>[] = [{}, { BILLING_PROVIDER: 'polar' }, { BILLING_PROVIDER: 'test' }, { BILLING_PROVIDER: 'test', BILLING_TEST_SECRET: 'a-long-enough-secret' }, TEST_ENV];
    for (const c of cases) {
      const e = (n: string) => ({ ...c, PLANS: 'on' })[n];
      expect(providerFrom(e) !== null).toBe(planConfigFrom(e).plansOn);
    }
  });
});

describe('checkProviderState', () => {
  it('normalises times and fills the defaults', () => {
    expect(checkProviderState({ source: 'test', state: 'active', updatedAt: '2026-11-23T12:00:00+02:00', periodEnd: '2026-12-23T00:00:00Z' })).toEqual({
      source: 'test',
      customerId: null,
      subscriptionId: null,
      productId: null,
      period: null,
      state: 'active',
      periodEnd: '2026-12-23T00:00:00.000Z',
      graceUntil: null,
      cancelAtPeriodEnd: false,
      environment: 'sandbox',
      startedAt: null,
      updatedAt: '2026-11-23T10:00:00.000Z',
    });
  });
  it('refuses unknown values', () => {
    for (const bad of [null, [], { source: 'x', state: 'active', updatedAt: NOW.toISOString() }, { source: 'test', state: 'active' }, { source: 'test', state: 'active', updatedAt: NOW.toISOString(), period: 'week' }, { source: 'test', state: 'active', updatedAt: NOW.toISOString(), customerId: 'x'.repeat(201) }]) {
      expect(() => checkProviderState(bad)).toThrow();
    }
  });
});

// ------------------------------------------------------------- the words
// The morning page's banned list, as coach-chat/coach.test.ts copies it.
const BANNED =
  /\b(bad|fail|failed|failure|cheat|cheated|should|guilty|lazy|great|amazing|well done|keep it up|too much|missed your|goal missed|over budget|make up|only|unfortunately|oops|sorry)\b/i;
describe('every message a person can read', () => {
  it('passes the no-shame list, with no exclamation mark, in sentence case', () => {
    const strings = Object.values(BILLING_MESSAGES);
    expect(strings.filter((s) => BANNED.test(s) || s.includes('!'))).toEqual([]);
    expect(strings.filter((s) => !/^[A-Z]/.test(s))).toEqual([]);
  });
});

// ---------------------------------------------------------------- wiring
describe('the AI functions take their limits from plans.ts, and keep their words', () => {
  const src = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
  it('analyze-food', () => {
    const s = src('analyze-food/index.ts');
    expect(s).toMatch(/p_limit: limits\.estimates,/);
    expect(s).toMatch(/p_global_limit: limits\.estimatesGlobal,/);
    expect(s).toContain(`message: "You have used today's AI analyses. They reset at midnight UTC.", remaining: 0, ...limitFields(limits, 'estimates', now, needed)`);
    expect(s).toContain(`message: 'Food analysis has reached its shared limit for today. Search or scan instead, and try again tomorrow.', remaining: 0, shared: true, ...limitFields(limits, 'estimates', now, needed)`);
    // R11: the units the refused call needed, taken before the count is zeroed for the refund rule.
    expect(s).toMatch(/const needed = cost;\n\s+if \(left === -1\)/);
  });
  it('coach-chat', () => {
    const s = src('coach-chat/index.ts');
    expect(s).toMatch(/p_limit: limits\.questions,/);
    expect(s).toMatch(/p_global_limit: limits\.questionsGlobal,/);
    expect(s).toContain(`message: dailyLimitMessage(limits.questions), remaining: 0, ...limitFields(limits, 'questions', now, 1)`);
    expect(s).toContain(`fail(429, 'shared_limit', { remaining: 0, ...limitFields(limits, 'questions', now, 1) })`);
    expect(s).toContain('history: historyFor(input.history, limits.memoryPairs)');
  });
  it('the billing function is deployed with verify_jwt off, and says why', () => {
    const toml = readFileSync(join(__dirname, '..', '..', 'config.toml'), 'utf8');
    expect(toml).toMatch(/\[functions\.billing\]\n(?:#.*\n)+verify_jwt = false/);
  });
  it('a test provider is never chosen without BILLING_TEST_SECRET, and the fixed test secret is not used by the deployed code', () => {
    expect(src('billing/providers.ts')).not.toContain('TEST_WEBHOOK_SECRET');
    expect(src('billing/index.ts')).not.toContain('TEST_WEBHOOK_SECRET');
  });
  it('R13: the provisioning script allows sign-in links to localhost only with --dev', () => {
    const ops = readFileSync(join(__dirname, '..', '..', '..', 'scripts', 'ops', 'provision-supabase.mjs'), 'utf8');
    expect(ops).toContain("const DEV = args.dev === 'true';");
    expect(ops).toContain("...(DEV ? ['http://localhost:8081/**'] : [])");
    expect(ops.match(/http:\/\/localhost:8081\/\*\*/g)).toHaveLength(1);
    expect(ops).toContain('have.filter((u) => DEV || !isLocal(u))');
  });
  it('the live check warns when plans are on with no offers or no grace for earlier accounts', () => {
    const ops = readFileSync(join(__dirname, '..', '..', '..', 'scripts', 'ops', 'verify-backend.mjs'), 'utf8');
    expect(ops).toContain('statusBody.offers.length === 0');
    expect(ops).toMatch(/PLANS_GRACE_BEFORE'\) && names\.has\('PLANS_GRACE_UNTIL'/);
  });
  it('a fresh test memory is empty', () => {
    expect(createTestMemory()).toEqual({ states: new Map(), sessions: new Map(), refunds: [], forgotten: [] });
  });
});
