/**
 * The test payment provider (BILLING_PROVIDER=test): no company, no money, a real HMAC signature.
 * It is the reference for a real provider's file and what the unit tests and the stand-in backend
 * (scripts/dev/mock-backend.cjs) run. Never use it on a live project: anyone who knows its secret can
 * grant Plus. The deployed function accepts it only with BILLING_TEST_SECRET set (no default there)
 * and BILLING_ENVIRONMENT=sandbox (plans.ts `providerNameFrom`), and its rows count only there.
 *
 * Its "dashboard" is memory: `memory.states` holds each person's subscription, `memory.sessions`
 * the open checkouts. Having no API of its own, it learns a state from its own signed events: an
 * event may carry `state`, which is stored for its person once the signature verifies, and is then
 * what `readState` returns, so the billing function's rule (verify, record, re-read, overwrite) runs
 * exactly as for a real provider.
 *
 * Signature: header `healthcal-test-signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">`
 * with the secret, accepted within 300 seconds either way (Stripe's and RevenueCat's scheme).
 * Event body: { "id": string, "type": string, "userId": string | null, "customerId"?: string,
 * "state"?: ProviderState }.
 */
import { type BillingProvider, checkProviderState, type HeaderReader, type Offer, type ProviderState, type WebhookEvent } from './billing.ts';

/** The fixed secret the unit tests and the stand-in backend sign with. Not a production secret. */
export const TEST_WEBHOOK_SECRET = 'healthcal-test-webhook-secret-not-for-production';
export const TEST_SIGNATURE_HEADER = 'healthcal-test-signature';
export const TEST_TOLERANCE_SECONDS = 300;

/**
 * The test provider's offers. Test data only, mirroring the owner's starting prices; a real provider
 * reads its offers from its own catalogue, so no real price is written in the code.
 */
export const TEST_OFFERS: readonly Offer[] = [
  { id: 'test-plus-month', plan: 'plus', period: 'month', amount: 399, currency: 'USD', taxIncluded: false },
  { id: 'test-plus-year', plan: 'plus', period: 'year', amount: 2999, currency: 'USD', taxIncluded: false },
];

export interface TestCheckoutSession {
  userId: string;
  offerId: string;
  returnUrl: string;
}

export interface TestProviderMemory {
  states: Map<string, ProviderState>;
  sessions: Map<string, TestCheckoutSession>;
  /** The subscription ids refunded by `cancelNow({ refund: true })`, in order (a real provider posts a refund). */
  refunds: string[];
  /** The user ids whose customer record `forgetCustomer` removed. */
  forgotten: string[];
}

export const createTestMemory = (): TestProviderMemory => ({ states: new Map(), sessions: new Map(), refunds: [], forgotten: [] });

const hex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (s: string): Uint8Array<ArrayBuffer> | null => {
  if (!/^(?:[0-9a-f]{2})+$/i.test(s)) return null;
  const out = new Uint8Array(new ArrayBuffer(s.length / 2));
  for (let i = 0; i < out.length; i += 1) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return out;
};
const hmacKey = (secret: string, use: 'sign' | 'verify') =>
  crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [use]);

/** The header value for a body signed at `at` (seconds are whole). */
export async function signTestWebhook(rawBody: string, secret: string, at: Date): Promise<string> {
  const t = Math.floor(at.getTime() / 1000);
  const mac = await crypto.subtle.sign('HMAC', await hmacKey(secret, 'sign'), new TextEncoder().encode(`${t}.${rawBody}`));
  return `t=${t},v1=${hex(mac)}`;
}

/** Whether the header signs this body with this secret within the tolerance. Compared in constant time by WebCrypto. */
export async function verifyTestSignature(rawBody: string, header: string | null, secret: string, now: Date, tolerance = TEST_TOLERANCE_SECONDS): Promise<boolean> {
  if (!header || header.length > 300) return false;
  const parts = Object.fromEntries(
    header.split(',').map((p) => {
      const i = p.indexOf('=');
      return i > 0 ? [p.slice(0, i).trim(), p.slice(i + 1).trim()] : ['', ''];
    }),
  );
  if (!/^\d{1,12}$/.test(parts.t ?? '')) return false;
  const t = Number(parts.t);
  if (Math.abs(now.getTime() / 1000 - t) > tolerance) return false;
  const mac = fromHex(parts.v1 ?? '');
  if (!mac || mac.length !== 32) return false;
  return crypto.subtle.verify('HMAC', await hmacKey(secret, 'verify'), mac, new TextEncoder().encode(`${t}.${rawBody}`));
}

export interface TestProviderOptions {
  secret: string;
  /** The page that plays the provider's hosted checkout (the stand-in serves one). */
  checkoutUrl: string;
  /** The page that plays the provider's portal. */
  portalUrl: string;
  offers?: readonly Offer[];
  memory?: TestProviderMemory;
  /** Makes checkout session ids; tests pass a counter. */
  newId?: () => string;
}

const ID = /^[A-Za-z0-9_.:-]{1,100}$/;

export function createTestProvider(options: TestProviderOptions): BillingProvider & { memory: TestProviderMemory } {
  const memory = options.memory ?? createTestMemory();
  const offers = [...(options.offers ?? TEST_OFFERS)];
  const newId = options.newId ?? (() => crypto.randomUUID());
  /** Whose subscription: by the user id, else (a person who no longer exists) by the customer id. */
  const holder = (userId: string | null, customerId: string | null): string | null => {
    if (userId && memory.states.has(userId)) return userId;
    if (customerId) for (const [k, st] of memory.states) if (st.customerId === customerId) return k;
    return userId;
  };
  return {
    id: 'test',
    memory,
    async offers() {
      return offers.map((o) => ({ ...o }));
    },
    async createCheckout({ userId, offer, returnUrl }) {
      const session = newId();
      memory.sessions.set(session, { userId, offerId: offer.id, returnUrl });
      const url = new URL(options.checkoutUrl);
      url.searchParams.set('session', session);
      return { url: url.toString() };
    },
    async portalUrl({ userId, customerId }) {
      const url = new URL(options.portalUrl);
      url.searchParams.set('customer', customerId ?? `test-customer-${userId}`);
      return url.toString();
    },
    async cancelNow({ userId, customerId, refund }) {
      const key = holder(userId, customerId);
      const s = key === null ? undefined : memory.states.get(key);
      if (!s || key === null) return;
      const now = new Date().toISOString();
      if (refund && s.state !== 'expired' && s.state !== 'revoked') memory.refunds.push(s.subscriptionId ?? key);
      memory.states.set(key, { ...s, state: 'expired', periodEnd: now, graceUntil: null, cancelAtPeriodEnd: false, updatedAt: now });
    },
    async forgetCustomer({ userId }) {
      memory.forgotten.push(userId);
    },
    async readState({ userId, customerId }) {
      const key = holder(userId, customerId);
      const s = key === null ? undefined : memory.states.get(key);
      return s ? { ...s } : null;
    },
    signaturePresent(headers: HeaderReader) {
      return !!headers.get(TEST_SIGNATURE_HEADER);
    },
    async verifyWebhook(raw: string, headers: HeaderReader, now: Date): Promise<WebhookEvent | null> {
      if (!(await verifyTestSignature(raw, headers.get(TEST_SIGNATURE_HEADER), options.secret, now))) return null;
      let body: Record<string, unknown>;
      try {
        body = JSON.parse(raw);
      } catch {
        return null;
      }
      if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
      if (typeof body.id !== 'string' || !ID.test(body.id) || typeof body.type !== 'string' || !ID.test(body.type)) return null;
      const userId = typeof body.userId === 'string' && ID.test(body.userId) ? body.userId : null;
      const customerId = typeof body.customerId === 'string' && ID.test(body.customerId) ? body.customerId : null;
      if (body.state !== undefined && userId) {
        let state: ProviderState;
        try {
          state = checkProviderState(body.state);
        } catch {
          return null;
        }
        if (state.source !== 'test') return null;
        memory.states.set(userId, state);
      }
      return { id: body.id, type: body.type, userId, customerId };
    },
  };
}
