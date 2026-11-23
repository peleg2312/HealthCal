/**
 * POST /functions/v1/billing           the app's plan actions (signed-in, confirmed accounts)
 *   Body: { action: 'status' | 'refresh' | 'checkout' | 'portal' | 'cancel-now', offerId?, returnUrl? }
 * POST /functions/v1/billing/webhook   the payment provider's events (signed by the provider)
 *
 * Every rule is in billing.ts and plans.ts and tested there; this file only wires them to HTTP,
 * Supabase (service role) and the provider chosen by BILLING_PROVIDER (providers.ts). The contract is
 * docs/plans-and-payments.md. Nothing of a body is logged: errors by name only.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import {
  ACTION_CAP_BYTES,
  type BillingStore,
  CALL_RULES,
  BillingError,
  errorBody,
  handleAction,
  handleWebhook,
  parseAction,
  readCappedText,
  WEBHOOK_CAP_BYTES,
} from './billing.ts';
import { ENTITLEMENT_COLUMNS, type EntitlementRow, planConfigFrom } from './plans.ts';
import { providerFrom } from './providers.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}
const refuse = (e: BillingError) => json(e.status, errorBody(e));

const logError = (where: string, error: unknown) => {
  const e = error as { name?: string; status?: number; code?: string };
  console.error(where, e?.name ?? typeof error, e?.status ?? e?.code ?? '');
};

/** The tables through the service role. Every failure throws; billing.ts turns it into an answer. */
function supabaseStore(admin: SupabaseClient): BillingStore {
  return {
    async rows(userId) {
      const { data, error } = await admin.from('billing_entitlements').select(ENTITLEMENT_COLUMNS).eq('user_id', userId);
      if (error) throw error;
      return (data ?? []) as unknown as EntitlementRow[];
    },
    async write(userId, row) {
      const { error } = await admin.rpc('billing_put_entitlement', { p_user: userId, p_row: row });
      if (error) throw error;
    },
    async recordEvent({ provider, eventId, type, userId }) {
      const { data, error } = await admin.rpc('billing_record_event', { p_provider: provider, p_event_id: eventId, p_type: type, p_user: userId });
      if (error) throw error;
      return data === true;
    },
    async recordRelease({ provider, kind, customerId, subscriptionId, userId }) {
      const { error } = await admin.rpc('billing_record_release', { p_provider: provider, p_kind: kind, p_customer: customerId, p_subscription: subscriptionId, p_user: userId });
      if (error) throw error;
    },
    async takeCall(userId, kind) {
      const rule = CALL_RULES[kind];
      const { data, error } = await admin.rpc('billing_take_call', { p_user: userId, p_kind: kind, p_gap_ms: rule.gapMs, p_per_hour: rule.perHour });
      if (error) throw error;
      return data === true;
    },
    async forgetEvent(provider, eventId) {
      const { error } = await admin.from('billing_events').delete().eq('provider', provider).eq('event_id', eventId);
      if (error) throw error;
    },
    async userExists(userId) {
      if (!/^[0-9a-f-]{36}$/i.test(userId)) return false;
      const { data, error } = await admin.auth.admin.getUserById(userId);
      if (!error) return !!data?.user;
      // Only a definite "no such user" counts as gone: a subscription is ended for a person who is
      // gone, so an outage must never look like one (it throws, and the provider retries).
      const e = error as { status?: number; code?: string };
      if (e.status === 404 || e.code === 'user_not_found') return false;
      throw error;
    },
    async userForCustomer(source, customerId) {
      const { data, error } = await admin.from('billing_entitlements').select('user_id').eq('source', source).eq('provider_customer_id', customerId).limit(1).maybeSingle();
      if (error) throw error;
      return (data as { user_id?: string } | null)?.user_id ?? null;
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return refuse(new BillingError('method_not_allowed', 405));

  const env = (name: string) => Deno.env.get(name);
  const supabaseUrl = env('SUPABASE_URL');
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return refuse(new BillingError('not_configured', 503));
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const store = supabaseStore(admin);
  const provider = providerFrom(env);
  const now = new Date();

  // ---------------------------------------------------------- the webhook
  // verify_jwt is off for this function (supabase/config.toml): the provider signs, it sends no token.
  if (/\/webhook\/?$/.test(new URL(req.url).pathname)) {
    const answer = await handleWebhook({
      provider,
      store,
      headers: req.headers,
      readBody: () => readCappedText(req.body, WEBHOOK_CAP_BYTES, req.headers.get('content-length')),
      now,
    });
    if (answer.status >= 500) logError('billing webhook', { name: (answer.body as { error?: string }).error, status: answer.status });
    return json(answer.status, answer.body);
  }

  // ---------------------------------------------------------- the actions
  // The caller is whoever the token says, checked here as analyze-food and coach-chat check it.
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) return refuse(new BillingError('unauthorized', 401));
  const user = userData.user;
  if (user.is_anonymous || !user.email_confirmed_at) return refuse(new BillingError('unconfirmed', 403));

  let action;
  try {
    action = parseAction(await readCappedText(req.body, ACTION_CAP_BYTES, req.headers.get('content-length')));
  } catch (error) {
    if (error instanceof BillingError) return refuse(error);
    logError('billing body', error);
    return refuse(new BillingError('bad_body', 400));
  }

  const answer = await handleAction(action, {
    caller: { id: user.id, email: user.email ?? null, createdAt: user.created_at ?? null },
    provider,
    store,
    config: planConfigFrom(env),
    returnRules: { siteUrl: env('BILLING_SITE_URL')?.trim() || null, allowLocalhost: (env('BILLING_ALLOW_LOCALHOST') ?? '').trim().toLowerCase() === 'on' || provider?.id === 'test' },
    now,
  });
  if (answer.status >= 500) logError(`billing ${action.action}`, { name: (answer.body as { error?: string }).error, status: answer.status });
  return json(answer.status, answer.body);
});
