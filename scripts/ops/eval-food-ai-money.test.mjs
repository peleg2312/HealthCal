/**
 * The measuring script's money rules, without the network:
 *   node --test scripts/ops/eval-food-ai-money.test.mjs
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { RATES, ceilingOf, costOf, mayReserve, maybeBilled, priceOf } from './eval-food-ai-money.mjs';

const photo = (model, max_tokens = 2000, extra = {}) => ({
  model,
  max_tokens,
  system: 'x'.repeat(5_000),
  messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'A'.repeat(300_000) } }, { type: 'text', text: 'Estimate.' }] }],
  output_config: { effort: 'low', format: { type: 'json_schema', schema: { type: 'object' } } },
  ...extra,
});

test('a request is reserved at what it can cost on its own model, not at --expect', () => {
  const haiku = ceilingOf(photo('claude-haiku-5-5'));
  const opus = ceilingOf(photo('claude-opus-5-5', 3000));
  // Output alone: 3000 tokens at $20 per million is $0.06 on Opus.
  assert.ok(opus >= 0.06, `opus ceiling ${opus}`);
  assert.ok(haiku < 0.002 && haiku >= 0.001, `haiku ceiling ${haiku}`);
  // The image is counted by its tokens, not its base64 length.
  assert.ok(ceilingOf(photo('claude-haiku-5-5')) < ceilingOf({ ...photo('claude-haiku-5-5'), system: 'x'.repeat(50_000) }));
  // A request that may fall back to a second model is counted twice.
  assert.equal(ceilingOf(photo('claude-sonnet-5-5', 2000, { fallbacks: 'default' })), 2 * ceilingOf(photo('claude-sonnet-5-5')));
  // An unknown model is reserved at the dearest rate.
  assert.equal(ceilingOf(photo('claude-unknown')), ceilingOf(photo('claude-opus-5-5')));
});

test('the ledger, the requests on their way and this one must fit under the limit', () => {
  // The review's case: $2.466 of $2.50, three Opus requests on their way.
  const opus = ceilingOf(photo('claude-opus-5-5', 3000));
  assert.equal(mayReserve(2.466, 0, opus, 2.5), false);
  // About $0.078 each: room for three at $2.25, not for a fourth.
  assert.equal(mayReserve(2.25, 2 * opus, opus, 2.5), true);
  assert.equal(mayReserve(2.25, 3 * opus, opus, 2.5), false);
  const haiku = ceilingOf(photo('claude-haiku-5-5'));
  assert.equal(mayReserve(2.466, 2 * haiku, haiku, 2.5), true);
});

test('a lost answer is booked unless the route refused it or the model turned it away', () => {
  assert.equal(maybeBilled(502, { type: 'error', error: { type: 'lab_unreachable' } }), true);
  assert.equal(maybeBilled(500, null), true, 'a 5xx with no body of ours (the platform cut the function off)');
  assert.equal(maybeBilled(529, { type: 'error', error: { type: 'overloaded_error' } }), true);
  assert.equal(maybeBilled(500, { lab: 'refused', reason: 'not configured' }), false);
  assert.equal(maybeBilled(429, { type: 'error' }), false);
  assert.equal(maybeBilled(400, { type: 'error' }), false);
});

test('prices come from the usage, cache writes and reads included', () => {
  assert.deepEqual(Object.keys(RATES).sort(), ['claude-haiku-5-5', 'claude-opus-5-5', 'claude-sonnet-5-5']);
  const usd = priceOf('claude-sonnet-5-5', { input_tokens: 1000, output_tokens: 100, cache_creation_input_tokens: 2000, cache_read_input_tokens: 5000 });
  assert.ok(Math.abs(usd - (1000 * 2 + 100 * 10 + 2000 * 2.5 + 5000 * 0.1) / 1e6) < 1e-12);
  const fell = costOf('claude-sonnet-5-5', {
    model: 'claude-sonnet-5',
    usage: { iterations: [{ model: 'claude-sonnet-5-5', input_tokens: 100, output_tokens: 10 }, { input_tokens: 100, output_tokens: 10 }] },
  });
  assert.ok(fell > 0);
});
