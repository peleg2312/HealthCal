/**
 * The money rules of the measuring script (eval-food-ai.mjs), pure so they are tested
 * (eval-food-ai-money.test.mjs: node --test scripts/ops/eval-food-ai-money.test.mjs).
 *
 * Prices are US dollars per million tokens from the claude-api skill's model table and the pricing
 * page (cached 2026-11-03): [input, output, cache write (5 minutes), cache read]; a one-hour cache
 * write is twice the input rate.
 */
export const RATES = {
  'claude-haiku-5-5': [0.1, 0.5, 0.125, 0.01],
  'claude-sonnet-5-5': [2, 10, 2.5, 0.1],
  'claude-opus-5-5': [4, 20, 5, 0.2],
};

/** The dearest model above: what an unknown model is reserved and booked at, so the ledger never runs low. */
const DEAREST = 'claude-opus-5-5';

export function priceOf(model, u) {
  const r = RATES[model];
  if (!r) throw new Error(`No price for ${model}: add it to RATES from the claude-api skill before running it.`);
  const cc = u.cache_creation;
  const w1h = cc?.ephemeral_1h_input_tokens ?? 0;
  const w5m = cc ? (cc.ephemeral_5m_input_tokens ?? 0) : (u.cache_creation_input_tokens ?? 0);
  return ((u.input_tokens ?? 0) * r[0] + (u.output_tokens ?? 0) * r[1] + w5m * r[2] + w1h * 2 * r[0] + (u.cache_read_input_tokens ?? 0) * r[3]) / 1e6;
}

/** A response's cost: per iteration when a server-side fallback ran (each at its own model's rate), else the whole. */
export function costOf(requested, response) {
  const u = response.usage ?? {};
  const its = Array.isArray(u.iterations) ? u.iterations : null;
  if (its && its.length > 1 && its.every((i) => typeof i.input_tokens === 'number')) {
    // An iteration without a model name is priced at the dearer of the two, so the ledger never runs low.
    const dear = [requested, response.model].sort((a, b) => (RATES[b]?.[1] ?? 0) - (RATES[a]?.[1] ?? 0))[0];
    return its.reduce((s, i) => s + priceOf(i.model && RATES[i.model] ? i.model : dear, i), 0);
  }
  return priceOf(RATES[response.model] ? response.model : requested, u);
}

/** Tokens an image can cost at most (a 1568 px long side); the app's photos are 768 or 1024 px, about 600 to 1,100. */
const IMAGE_TOKENS = 1_600;
/** Characters per token, low on purpose (dense numbers and the newer tokenizers count more tokens). */
const CHARS_PER_TOKEN = 2.5;

/**
 * The most one request can cost: its input read (at the dearer of the input and cache-write rates)
 * plus max_tokens of output, for the model it names. A request that may fall back to a second model
 * (`fallbacks`) is counted twice, since both runs are billed.
 */
export function ceilingOf(params) {
  const r = RATES[params.model] ?? RATES[DEAREST];
  let chars = 0;
  let images = 0;
  const text = (v) => {
    if (typeof v === 'string') chars += v.length;
    else if (Array.isArray(v))
      for (const b of v) {
        if (b?.type === 'image') images += 1;
        else chars += String(b?.text ?? '').length;
      }
  };
  text(params.system);
  for (const m of params.messages ?? []) text(m.content);
  if (params.output_config?.format) chars += JSON.stringify(params.output_config.format).length;
  const inputTokens = Math.ceil(chars / CHARS_PER_TOKEN) + images * IMAGE_TOKENS;
  const one = (inputTokens * Math.max(r[0], r[2]) + (params.max_tokens ?? 0) * r[1]) / 1e6;
  return params.fallbacks ? 2 * one : one;
}

/** Whether a request may go: what is booked, plus the ceilings of the requests on their way, plus this one's, stays under the limit. */
export function mayReserve(totalUsd, inFlightUsd, ceilingUsd, limitUsd) {
  return totalUsd + inFlightUsd + ceilingUsd <= limitUsd;
}

/**
 * Whether a failed answer from the lab route may still have been billed by the model, so it is booked
 * at its ceiling: a server error (5xx, the route's 502 lab_unreachable, or the platform cutting the
 * function off at its own time limit, which carries no header of ours) unless the route itself refused
 * it before calling the model. A 4xx (a bad request, a rate limit) is turned away before any work and
 * is not booked.
 */
export function maybeBilled(status, body) {
  return body?.lab !== 'refused' && status >= 500;
}
