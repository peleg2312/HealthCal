/**
 * The lab route's refusals, without the network:
 *   node --experimental-transform-types --test scripts/ops/food-ai-lab/function/lab.test.ts
 * (Kept out of vitest's include on purpose: the route is a temporary ops tool, not the app.)
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { analyzeFood } from '../../../../supabase/functions/analyze-food/analyze.ts';
import { LAB_MAX_IMAGES, LAB_MAX_TEXT_CHARS, LAB_MAX_TOKENS, checkLabRequest, labCaller, labOpen } from './lab.ts';

const image = { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'AAAA' } };
const fast = {
  model: 'claude-haiku-5-5',
  max_tokens: 2000,
  system: 'You estimate nutrition.',
  messages: [{ role: 'user', content: [image, { type: 'text', text: 'Estimate this meal.' }] }],
  output_config: { effort: 'low', format: { type: 'json_schema', schema: { type: 'object' } } },
};

test('the requests the analyze code sends are accepted', () => {
  assert.equal(checkLabRequest(fast).ok, true);
  assert.equal(checkLabRequest({ ...fast, max_tokens: 900, thinking: { type: 'disabled' } }).ok, true);
  const careful = { ...fast, model: 'claude-sonnet-5-5', betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' };
  const r = checkLabRequest(careful);
  assert.equal(r.ok, true);
  assert.equal(r.ok && r.beta, true);
  assert.equal(checkLabRequest({ ...fast, model: 'claude-opus-5-5', system: [{ type: 'text', text: 'table', cache_control: { type: 'ephemeral' } }, { type: 'text', text: 'rules' }] }).ok, true);
});

test('models outside the list and large max_tokens are refused', () => {
  for (const model of ['claude-opus-4-8', 'claude-fable-5-2', 'claude-haiku-4-5', 'gpt-5', '']) assert.equal(checkLabRequest({ ...fast, model }).ok, false, model);
  assert.equal(checkLabRequest({ ...fast, max_tokens: LAB_MAX_TOKENS + 1 }).ok, false);
  assert.equal(checkLabRequest({ ...fast, max_tokens: 0 }).ok, false);
  assert.equal(checkLabRequest({ ...fast, max_tokens: 10.5 }).ok, false);
});

test('anything that is not the analyze request is refused', () => {
  const bad: unknown[] = [
    null,
    [],
    'hello',
    { hello: 'world' },
    { ...fast, tools: [{ name: 'x' }] },
    { ...fast, stream: true },
    { ...fast, metadata: { user_id: 'x' } },
    { ...fast, messages: [] },
    { ...fast, messages: [{ role: 'system', content: 'x' }] },
    { ...fast, messages: [{ role: 'assistant', content: 'x' }] },
    { ...fast, messages: [{ role: 'user', content: [{ type: 'document', source: {} }] }] },
    { ...fast, messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'url', url: 'https://example.com/a.jpg' } }] }] },
    { ...fast, betas: ['code-execution-2025-08-25'] },
    { ...fast, fallbacks: 'default' },
    { ...fast, fallbacks: [{ model: 'claude-opus-4-8' }], betas: ['server-side-fallback-2026-07-01'] },
    { ...fast, output_config: { effort: 'huge' } },
    { ...fast, output_config: { task_budget: { type: 'tokens', total: 1 } } },
    { ...fast, thinking: { type: 'enabled', budget_tokens: 1024 } },
    { ...fast, system: [{ type: 'text', text: 'x', cache_control: { type: 'ephemeral', ttl: '1h' } }] },
  ];
  for (const b of bad) assert.equal(checkLabRequest(b).ok, false, JSON.stringify(b)?.slice(0, 80));
});

test('the route is closed without a time, after its time, and for anyone but the lab account', () => {
  const now = Date.parse('2026-11-18T10:00:00Z');
  assert.equal(labOpen(undefined, now), false);
  assert.equal(labOpen('not a date', now), false);
  assert.equal(labOpen('2026-11-18T09:59:59Z', now), false);
  assert.equal(labOpen('2026-11-18T16:00:00Z', now), true);
  assert.equal(labCaller('a', undefined), false);
  assert.equal(labCaller(undefined, 'a'), false);
  assert.equal(labCaller('b', 'a'), false);
  assert.equal(labCaller('a', 'a'), true);
});

test('input size is capped: text across system, messages and schema, and the number of images', () => {
  const long = 'x'.repeat(LAB_MAX_TEXT_CHARS + 1);
  assert.equal(checkLabRequest({ ...fast, system: long }).ok, false);
  assert.equal(checkLabRequest({ ...fast, messages: [{ role: 'user', content: long }] }).ok, false);
  const half = 'x'.repeat(LAB_MAX_TEXT_CHARS / 2);
  assert.equal(checkLabRequest({ ...fast, system: [{ type: 'text', text: half }, { type: 'text', text: half }] }).ok, false, 'summed over blocks');
  assert.equal(checkLabRequest({ ...fast, messages: [{ role: 'user', content: half }, { role: 'assistant', content: 'ok' }, { role: 'user', content: half }] }).ok, false, 'summed over turns');
  const bigSchema = { type: 'object', description: long };
  assert.equal(checkLabRequest({ ...fast, output_config: { format: { type: 'json_schema', schema: bigSchema } } }).ok, false, 'the schema counts');
  const images = Array.from({ length: LAB_MAX_IMAGES + 1 }, () => image);
  assert.equal(checkLabRequest({ ...fast, messages: [{ role: 'user', content: [...images, { type: 'text', text: 'x' }] }] }).ok, false);
  assert.equal(checkLabRequest({ ...fast, messages: [{ role: 'user', content: [image, image, { type: 'text', text: 'x' }] }] }).ok, true);
});

test('every request the real analyze code builds stays well inside the caps', async () => {
  const sent: Record<string, unknown>[] = [];
  const create = async (params: Record<string, unknown>) => {
    sent.push(params);
    // Lines the plain form cannot read, so the code also builds its second try.
    return { content: [{ type: 'text', text: 'no' }], usage: { input_tokens: 0, output_tokens: 0 }, stop_reason: 'end_turn', model: params.model };
  };
  const client = { messages: { create }, beta: { messages: { create } } } as never;
  for (const input of [
    { image: 'A'.repeat(400_000), text: 'a large plate, cooked in butter' },
    { image: 'A'.repeat(400_000), precise: true },
    { text: 'two fried eggs, 2 slices of rye bread with butter, a latte' },
  ]) {
    await analyzeFood(client, input).catch(() => null);
  }
  assert.ok(sent.length >= 3);
  for (const p of sent) {
    const r = checkLabRequest(JSON.parse(JSON.stringify(p)));
    assert.equal(r.ok, true, JSON.stringify(r));
    const chars = JSON.stringify({ system: p.system, messages: p.messages, format: (p.output_config as { format?: unknown } | undefined)?.format }).replace(/A{1000,}/g, '').length;
    assert.ok(chars < LAB_MAX_TEXT_CHARS / 4, `analyze sends about ${chars} characters`);
  }
});
