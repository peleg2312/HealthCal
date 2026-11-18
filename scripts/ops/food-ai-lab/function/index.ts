/**
 * analyze-food-lab: a TEMPORARY measuring route. Read ../README.md before deploying it.
 *
 * POST /functions/v1/analyze-food-lab
 * Body: a Messages API request, exactly as supabase/functions/analyze-food/analyze.ts builds it.
 * Answer: the model's own response (status and JSON), so usage and cache tokens are visible.
 *
 * It answers only:
 *  - before LAB_UNTIL (an ISO time; unset or past means closed, 410),
 *  - to a signed-in caller whose user id is LAB_USER_ID. That check, here (getUser against
 *    Supabase Auth, then labCaller), is the gate. verify_jwt is on, but the platform only turns
 *    away a missing or malformed token: a request with the apikey header alone reaches this code
 *    (probed 18 November 2026) and is refused below.
 *  - for a request that passes checkLabRequest (lab.ts): three models, max_tokens up to 3000,
 *    only the fields the analyze code sends, at most 60,000 characters of text and 2 images.
 * It never logs a request body. It has no allowance of its own: it is open for one account for a
 * few hours, and the measuring script keeps the money ledger (scripts/ops/eval-food-ai.mjs).
 */
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

import { LAB_MAX_BODY_BYTES, checkLabRequest, labCaller, labOpen } from './lab.ts';

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
}
const refused = (status: number, reason: string) => json(status, { lab: 'refused', reason });

Deno.serve(async (req) => {
  if (!labOpen(Deno.env.get('LAB_UNTIL'), Date.now())) return refused(410, 'closed');
  if (req.method !== 'POST') return refused(405, 'use POST');

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!supabaseUrl || !anonKey || !apiKey) return refused(500, 'not configured');

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return refused(401, 'sign in');
  const auth = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await auth.auth.getUser(token);
  if (error || !labCaller(data.user?.id, Deno.env.get('LAB_USER_ID'))) return refused(403, 'not the lab account');

  const length = Number(req.headers.get('Content-Length') ?? '0');
  if (length > LAB_MAX_BODY_BYTES) return refused(413, 'too large');
  const raw = await req.text();
  if (raw.length > LAB_MAX_BODY_BYTES) return refused(413, 'too large');
  let body: unknown = null;
  try {
    body = JSON.parse(raw);
  } catch {
    return refused(400, 'not JSON');
  }
  const checked = checkLabRequest(body);
  if (!checked.ok) return refused(checked.status, checked.reason);

  // No retries here: the measuring script decides whether to try again, and counts every try.
  const client = new Anthropic({ apiKey, maxRetries: 0, timeout: 85_000 });
  const started = Date.now();
  try {
    const params = checked.params as never;
    const response = checked.beta ? await client.beta.messages.create(params) : await client.messages.create(params);
    const ms = Date.now() - started;
    // Only the shape of the exchange, never its content.
    console.log(`lab ok model=${response.model} in=${response.usage.input_tokens} out=${response.usage.output_tokens} ms=${ms}`);
    return json(200, response, { 'x-lab-upstream-ms': String(ms) });
  } catch (e) {
    const ms = Date.now() - started;
    if (e instanceof Anthropic.APIError && e.status) {
      console.log(`lab upstream status=${e.status} ms=${ms}`);
      const retryAfter = e.headers?.get?.('retry-after');
      return json(e.status, e.error ?? { type: 'error', error: { type: 'api_error', message: e.message } }, {
        'x-lab-upstream-ms': String(ms),
        ...(retryAfter ? { 'retry-after': retryAfter } : null),
      });
    }
    console.log(`lab upstream unreachable ms=${ms}`);
    return json(502, { type: 'error', error: { type: 'lab_unreachable', message: 'The model could not be reached.' } }, { 'x-lab-upstream-ms': String(ms) });
  }
});
