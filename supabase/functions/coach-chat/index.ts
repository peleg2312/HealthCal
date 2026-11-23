/**
 * POST /functions/v1/coach-chat
 * Body: { message, history?, note?, consentVersion }   (coach.ts `checkRequest`; the contract is in the README)
 * Answer: { text, remaining, truncated?, refer? }, or { error, message, remaining? }
 *
 * Signed-in, confirmed accounts of 18 and over only. Everything that decides is in coach.ts and
 * tested there; this file only wires it to HTTP, the database and the model. Nothing of the
 * messages is ever logged: only token counts are recorded, and errors by name and status.
 */
import Anthropic from '@anthropic-ai/sdk';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import {
  ageVerdict,
  askCoach,
  BODY_CAP_BYTES,
  checkRequest,
  coachIdentityOf,
  CoachError,
  dailyLimitMessage,
  failureResponse,
  historyFor,
  MESSAGES,
  readCapped,
  refundsUnit,
  settingsFrom,
  type Usage,
} from './coach.ts';
import { ENTITLEMENT_COLUMNS, type EntitlementRow, type Limits, limitFields, planConfigFrom, resolveLimits } from './plans.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}
const fail = (status: number, error: keyof typeof MESSAGES, extra?: Record<string, unknown>) => json(status, { error, message: MESSAGES[error], ...extra });

/** An error by its name and status only: never its message, which could quote the request. */
const logError = (where: string, error: unknown) => {
  const e = error as { name?: string; status?: number; code?: string };
  console.error(where, e?.name ?? typeof error, e?.status ?? e?.code ?? '');
};

async function recordTokens(admin: SupabaseClient, userId: string, usage: Usage): Promise<void> {
  const { error } = await admin.rpc('add_ai_tokens', { p_user: userId, p_input: usage.inputTokens, p_output: usage.outputTokens });
  if (error) logError('add_ai_tokens failed', error);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return fail(405, 'method_not_allowed');

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !serviceKey || !anonKey) return fail(500, 'not_configured');

  // Auth exactly as analyze-food does it, with the chat's own code for an unconfirmed email.
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) return fail(401, 'unauthorized');
  const user = userData.user;
  if (user.is_anonymous || !user.email_confirmed_at) return fail(403, 'unconfirmed');
  // Only someone who may use the feature is told whether it is set up.
  if (!apiKey) return fail(500, 'not_configured');
  const settings = settingsFrom((name) => Deno.env.get(name));

  // The body, capped, and every check, before a unit is taken.
  let input;
  try {
    input = checkRequest(await readCapped(req.body, BODY_CAP_BYTES, req.headers.get('content-length')));
  } catch (error) {
    if (error instanceof CoachError) return fail(error.status, error.code);
    logError('coach-chat body', error);
    return fail(400, 'bad_body');
  }

  // The date of birth, read with the caller's own token (row-level security: their own row only).
  const asCaller = createClient(supabaseUrl, anonKey, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
  const profile = await asCaller.from('profiles').select('data').eq('user_id', user.id).maybeSingle();
  if (profile.error) {
    logError('profile read failed', profile.error);
    return fail(500, 'profile_check_failed');
  }
  const today = new Date().toISOString().slice(0, 10);
  if (ageVerdict(profile.data as { data: unknown } | null, today) === 'under_18') return fail(403, 'under_18');

  // The limits by plan (plans.ts): with plans off (PLANS unset, or no known BILLING_PROVIDER),
  // COACH_DAILY_LIMIT and COACH_GLOBAL_LIMIT for every account and 3 pairs of memory, as before plans;
  // with plans on, by the caller's plan, a Plus question's ceiling above what free calls can reach.
  const now = new Date();
  let limits: Limits;
  try {
    limits = await resolveLimits({
      read: async (id) => {
        const { data, error } = await admin.from('billing_entitlements').select(ENTITLEMENT_COLUMNS).eq('user_id', id);
        return { rows: (data ?? null) as unknown as EntitlementRow[] | null, error };
      },
      userId: user.id,
      createdAt: user.created_at,
      now,
      config: planConfigFrom((name) => Deno.env.get(name)),
    });
  } catch (error) {
    logError('entitlements read failed', error);
    return fail(500, 'quota_check_failed');
  }

  const identity = await coachIdentityOf(user.email, user.id);
  const { data: left, error: quotaError } = await admin.rpc('bump_ai_usage', {
    p_user: user.id,
    p_identity: identity,
    p_cost: 1,
    p_limit: limits.questions,
    p_global_limit: limits.questionsGlobal,
  });
  if (quotaError) {
    logError('bump_ai_usage failed', quotaError);
    return fail(500, 'quota_check_failed');
  }
  if (left === -1) return json(429, { error: 'daily_limit', message: dailyLimitMessage(limits.questions), remaining: 0, ...limitFields(limits, 'questions', now, 1) });
  if (left === -2) return fail(429, 'shared_limit', { remaining: 0, ...limitFields(limits, 'questions', now, 1) });
  const remaining = Math.max(0, left as number);

  let outcome;
  try {
    outcome = await askCoach(new Anthropic({ apiKey }), { ...input, history: historyFor(input.history, limits.memoryPairs) }, settings);
  } catch (error) {
    // Not an Anthropic error, so whether the model was reached is unknown: the unit is kept.
    logError('coach-chat failed', error);
    return fail(500, 'internal');
  }

  if (refundsUnit(outcome)) {
    const { error: refundError } = await admin.rpc('refund_ai_usage', { p_user: user.id, p_identity: identity, p_cost: 1 });
    if (refundError) logError('refund_ai_usage failed', refundError);
  }
  if (outcome.kind === 'failed') logError('coach-chat model call', { name: outcome.reason });
  else await recordTokens(admin, user.id, outcome.usage);

  if (outcome.kind === 'answer') {
    return json(200, { text: outcome.text, remaining, ...(outcome.truncated ? { truncated: true } : null), ...(outcome.refer ? { refer: true } : null) });
  }
  const { status, error } = failureResponse(outcome);
  const back = refundsUnit(outcome) ? remaining + 1 : remaining;
  return fail(status, error, { remaining: back });
});
