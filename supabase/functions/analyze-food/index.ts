/**
 * POST /functions/v1/analyze-food
 * Body: { image?: base64, mediaType?: string, text?: string, precise?: boolean }
 *
 * The Anthropic API key lives only here, as a Supabase secret. The app sends
 * the signed-in user's token; each user gets a daily request allowance so one
 * account cannot run up the bill.
 */
import Anthropic from '@anthropic-ai/sdk';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { AnalyzeError, analyzeFood, costOf, validateInput } from './analyze.ts';

/** Units per person per day. A fast analysis uses 1, a careful one 5. */
const DAILY_LIMIT = Number(Deno.env.get('AI_DAILY_LIMIT') ?? '40');
/** Units per day across every user: a hard ceiling on what the project can spend. */
const GLOBAL_DAILY_LIMIT = Number(Deno.env.get('AI_GLOBAL_DAILY_LIMIT') ?? '3000');

/** Stable identity for the allowance: survives deleting the account and signing up again. */
async function identityOf(email: string | undefined, userId: string): Promise<string> {
  if (!email) return `id:${userId}`;
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(email.trim().toLowerCase())));
  return `user:${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

async function recordTokens(admin: SupabaseClient, userId: string, usage: { inputTokens: number; outputTokens: number }): Promise<void> {
  const { error } = await admin.rpc('add_ai_tokens', { p_user: userId, p_input: usage.inputTokens, p_output: usage.outputTokens });
  if (error) console.error('add_ai_tokens failed', error.message);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed', message: 'Use POST.' });

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!apiKey || !supabaseUrl || !serviceKey) {
    return json(500, { error: 'not_configured', message: 'Food analysis is not set up on the server yet.' });
  }

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) return json(401, { error: 'unauthorized', message: 'Sign in to analyse food.' });
  const user = userData.user;
  // Throwaway accounts are the cheap way to drain the allowance: require a confirmed email.
  if (user.is_anonymous || !user.email_confirmed_at) {
    return json(403, { error: 'unauthorized', message: 'Confirm your email address to use food analysis.' });
  }
  const userId = user.id;
  const identity = await identityOf(user.email, userId);
  let cost = 0;

  try {
    const input = validateInput(await req.json().catch(() => null));
    cost = costOf(input);

    const { data: left, error: quotaError } = await admin.rpc('bump_ai_usage', {
      p_user: userId,
      p_identity: identity,
      p_cost: cost,
      p_limit: DAILY_LIMIT,
      p_global_limit: GLOBAL_DAILY_LIMIT,
    });
    if (quotaError) {
      cost = 0;
      return json(500, { error: 'quota_check_failed', message: 'Could not check your daily allowance.' });
    }
    if (left === -1) {
      cost = 0;
      return json(429, { error: 'daily_limit', message: "You have used today's AI analyses. They reset at midnight UTC.", remaining: 0 });
    }
    if (left === -2) {
      cost = 0;
      return json(429, { error: 'daily_limit', message: 'Food analysis has reached its shared limit for today. Search or scan instead, and try again tomorrow.', remaining: 0 });
    }

    const client = new Anthropic({ apiKey });
    const result = await analyzeFood(client, input, {
      fastModel: Deno.env.get('FOOD_MODEL') ?? undefined,
      preciseModel: Deno.env.get('FOOD_MODEL_PRECISE') ?? undefined,
    });

    await recordTokens(admin, userId, result.usage);
    return json(200, { ...result, remaining: Math.max(0, left as number) });
  } catch (error) {
    if (error instanceof AnalyzeError) {
      // The model answered (and was billed) before this failed: keep the count and record the tokens.
      if (error.usage) await recordTokens(admin, userId, error.usage);
      // The provider was never reached: give the analysis back.
      else if (error.unbilled && cost > 0) {
        const { error: refundError } = await admin.rpc('refund_ai_usage', { p_user: userId, p_identity: identity, p_cost: cost });
        if (refundError) console.error('refund_ai_usage failed', refundError.message);
      }
      return json(error.status, { error: error.code, message: error.message });
    }
    console.error('analyze-food failed', error);
    return json(500, { error: 'internal', message: 'Something went wrong analysing that. Try again.' });
  }
});
