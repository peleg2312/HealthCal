/**
 * Calls to the billing function (`POST /functions/v1/billing`). `postBilling` is pure apart from the
 * fetch it is given, so every answer and refusal is tested; `billingCall` adds this device's session.
 *
 * Every refusal comes back as a code (the server's `error`, or one of the device's own: offline,
 * timeout, signed_out, no_backend, bad_answer), never as a thrown error, so a screen always has
 * words to show (`refusalLine`, ./words.ts).
 */
import { FUNCTIONS_URL, SUPABASE_ANON_KEY, supabase } from '@/services/supabase';

export type BillingAction = 'status' | 'refresh' | 'checkout' | 'portal' | 'cancel-now';

export interface BillingBody {
  action: BillingAction;
  offerId?: string;
  returnUrl?: string;
  force?: boolean;
}

export interface BillingConnection {
  functionsUrl: string;
  accessToken: string;
  anonKey: string;
  timeoutMs?: number;
}

export type BillingAnswer =
  | { ok: true; status: number; data: Record<string, unknown> }
  | { ok: false; status: number; code: string; source?: string };

export const BILLING_TIMEOUT_MS = 15_000;

/** One call. Never throws. */
export async function postBilling(fetchFn: typeof fetch, body: BillingBody, c: BillingConnection): Promise<BillingAnswer> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, c.timeoutMs ?? BILLING_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetchFn(`${c.functionsUrl.replace(/\/$/, '')}/billing`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${c.accessToken}`, apikey: c.anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    return { ok: false, status: 0, code: timedOut ? 'timeout' : 'offline' };
  } finally {
    clearTimeout(timer);
  }
  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
    parsed = null;
  }
  const obj = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  if (!res.ok) {
    const code = obj && typeof obj.error === 'string' ? obj.error : res.status === 429 ? 'rate_limited' : 'bad_answer';
    const source = obj && typeof obj.source === 'string' ? obj.source : undefined;
    return { ok: false, status: res.status, code, ...(source ? { source } : {}) };
  }
  if (!obj) return { ok: false, status: res.status, code: 'bad_answer' };
  return { ok: true, status: res.status, data: obj };
}

/** The signed-in account's id, or null. */
export async function currentUserId(): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user.id ?? null;
  } catch {
    return null;
  }
}

/** One call as the signed-in account on this device. */
export async function billingCall(body: BillingBody, fetchFn: typeof fetch = fetch): Promise<BillingAnswer & { userId: string | null }> {
  if (!supabase || !FUNCTIONS_URL) return { ok: false, status: 0, code: 'no_backend', userId: null };
  let token: string | null = null;
  let userId: string | null = null;
  try {
    const { data } = await supabase.auth.getSession();
    token = data.session?.access_token ?? null;
    userId = data.session?.user.id ?? null;
  } catch {
    token = null;
  }
  if (!token) return { ok: false, status: 401, code: 'signed_out', userId: null };
  const a = await postBilling(fetchFn, body, { functionsUrl: FUNCTIONS_URL, accessToken: token, anonKey: SUPABASE_ANON_KEY });
  return { ...a, userId };
}
