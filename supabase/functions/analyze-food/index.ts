/**
 * POST /functions/v1/analyze-food
 * Body: { image?: base64, mediaType?: string, text?: string, precise?: boolean }
 *
 * The Anthropic API key lives only here, as a Supabase secret. The app sends
 * the signed-in user's token; each user gets a daily request allowance so one
 * account cannot run up the bill.
 */
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

import { AnalyzeError, analyzeFood, validateInput } from './analyze.ts';

const DAILY_LIMIT = Number(Deno.env.get('AI_DAILY_LIMIT') ?? '40');

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
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
  const userId = userData.user.id;

  try {
    const input = validateInput(await req.json().catch(() => null));

    const { data: count, error: quotaError } = await admin.rpc('bump_ai_usage', { p_user: userId, p_limit: DAILY_LIMIT });
    if (quotaError) return json(500, { error: 'quota_check_failed', message: 'Could not check your daily allowance.' });
    if (count === -1) {
      return json(429, {
        error: 'daily_limit',
        message: `You have used today's ${DAILY_LIMIT} AI analyses. They reset at midnight UTC.`,
        remaining: 0,
      });
    }

    const client = new Anthropic({ apiKey });
    const result = await analyzeFood(client, input, {
      fastModel: Deno.env.get('FOOD_MODEL') ?? undefined,
      preciseModel: Deno.env.get('FOOD_MODEL_PRECISE') ?? undefined,
    });

    await admin.rpc('add_ai_tokens', { p_user: userId, p_input: result.usage.inputTokens, p_output: result.usage.outputTokens });
    return json(200, { ...result, remaining: Math.max(0, DAILY_LIMIT - (count as number)) });
  } catch (error) {
    if (error instanceof AnalyzeError) return json(error.status, { error: error.code, message: error.message });
    console.error('analyze-food failed', error);
    return json(500, { error: 'internal', message: 'Something went wrong analysing that. Try again.' });
  }
});
