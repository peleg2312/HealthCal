import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it, vi } from 'vitest';

import { analyzeFood, AnalyzeError, FAST_MODEL, PRECISE_MODEL, sanitizeItems, validateInput } from './analyze';

const err = (fn: () => unknown): AnalyzeError => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(AnalyzeError);
    return e as AnalyzeError;
  }
  throw new Error('did not throw');
};
const errAsync = async (p: Promise<unknown>): Promise<AnalyzeError> => {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(AnalyzeError);
    return e as AnalyzeError;
  }
  throw new Error('did not throw');
};

describe('validateInput', () => {
  it.each([undefined, null, 'str', 5])('rejects a non-object body (%s) with 400', (b) => {
    const e = err(() => validateInput(b));
    expect(e.status).toBe(400);
    expect(e.code).toBe('bad_request');
  });
  it('rejects an empty object, empty image, and blank text', () => {
    expect(err(() => validateInput({})).status).toBe(400);
    expect(err(() => validateInput({ image: '', text: '   ' })).status).toBe(400);
    expect(err(() => validateInput({ image: 5, text: 5 })).status).toBe(400);
  });
  it('text only', () => {
    expect(validateInput({ text: '  two eggs ' })).toEqual({ image: undefined, mediaType: 'image/jpeg', text: 'two eggs', precise: false });
  });
  it('image only, with default media type', () => {
    const v = validateInput({ image: 'QUJD' });
    expect(v.image).toBe('QUJD');
    expect(v.text).toBeUndefined();
    expect(v.mediaType).toBe('image/jpeg');
  });
  it('both, with png and precise', () => {
    const v = validateInput({ image: 'QUJD', text: 'large plate', mediaType: 'image/png', precise: true });
    expect(v).toEqual({ image: 'QUJD', mediaType: 'image/png', text: 'large plate', precise: true });
  });
  it('unknown media type falls back to jpeg; precise must be exactly true', () => {
    expect(validateInput({ image: 'QUJD', mediaType: 'image/gif' }).mediaType).toBe('image/jpeg');
    expect(validateInput({ text: 'x', precise: 'true' }).precise).toBe(false);
    expect(validateInput({ image: 'QUJD', mediaType: 'image/webp' }).mediaType).toBe('image/webp');
  });
  it('image over the size limit -> 413; at the limit it passes', () => {
    expect(err(() => validateInput({ image: 'A'.repeat(1_400_001) })).status).toBe(413);
    expect(validateInput({ image: 'A'.repeat(1_400_000) }).image).toHaveLength(1_400_000);
  });
  it('oversize image is rejected even when text is present', () => {
    expect(err(() => validateInput({ image: 'A'.repeat(1_400_001), text: 'hi' })).status).toBe(413);
  });
  it('image with a data: prefix -> 400', () => {
    expect(err(() => validateInput({ image: 'data:image/jpeg;base64,AAAA' })).status).toBe(400);
  });
  it('text is truncated to 500 characters', () => {
    expect(validateInput({ text: 'a'.repeat(900) }).text).toHaveLength(500);
  });
  it('blank text alongside an image is dropped', () => {
    expect(validateInput({ image: 'QUJD', text: '   ' }).text).toBeUndefined();
  });
});

describe('sanitizeItems', () => {
  const item = (o: object = {}) => ({ name: 'Rice', grams: 200, kcal: 260, protein: 5, carbs: 56, fat: 0.5, fiber: 1, confidence: 0.8, ...o });

  it('passes a consistent item through (atwater 20+224+4.5 = 248.5; 260 is within 25)', () => {
    expect(sanitizeItems([item()])).toEqual([{ name: 'Rice', grams: 200, kcal: 260, protein: 5, carbs: 56, fat: 0.5, fiber: 1, confidence: 0.8 }]);
  });
  it.each([undefined, null, 'x', 5, {}, { items: [] }])('non-array input (%s) -> []', (v) => expect(sanitizeItems(v)).toEqual([]));
  it('skips garbage entries and nameless or weightless items', () => {
    const out = sanitizeItems([null, 'x', 5, [], item({ name: '' }), item({ name: '   ' }), item({ name: 42 }), item({ grams: 0 }), item({ grams: -3 }), item({ grams: 'x' }), item()]);
    expect(out).toHaveLength(1);
  });
  it('caps at 15 items', () => {
    expect(sanitizeItems(Array.from({ length: 40 }, () => item()))).toHaveLength(15);
  });
  it('trims and truncates names to 80 characters', () => {
    expect(sanitizeItems([item({ name: '  Rice  ' })])[0].name).toBe('Rice');
    expect(sanitizeItems([item({ name: 'x'.repeat(200) })])[0].name).toHaveLength(80);
  });
  it('clamps grams to 3000 and rounds', () => {
    expect(sanitizeItems([item({ grams: 99999, kcal: 0, protein: 0, carbs: 0, fat: 0 })])).toHaveLength(1);
    expect(sanitizeItems([item({ grams: 99999 })])[0].grams).toBe(3000);
    expect(sanitizeItems([item({ grams: 150.6 })])[0].grams).toBe(151);
  });
  it('clamps confidence to 0..1 and 2 decimals', () => {
    expect(sanitizeItems([item({ confidence: 7 })])[0].confidence).toBe(1);
    expect(sanitizeItems([item({ confidence: -2 })])[0].confidence).toBe(0);
    expect(sanitizeItems([item({ confidence: 0.8765 })])[0].confidence).toBe(0.88);
    expect(sanitizeItems([item({ confidence: 'high' })])[0].confidence).toBe(0);
  });
  it('NaN, Infinity and strings become 0 for numeric fields', () => {
    const o = sanitizeItems([item({ protein: NaN, carbs: Infinity, fat: '9', fiber: undefined, kcal: 'lots' })])[0];
    expect(o.protein).toBe(0);
    expect(o.carbs).toBe(0);
    expect(o.fat).toBe(0);
    expect(o.fiber).toBe(0);
    expect(o.kcal).toBe(0);
  });
  it('negative macros become 0', () => {
    const o = sanitizeItems([item({ protein: -5, carbs: -1, fat: -1, kcal: -50 })])[0];
    expect([o.protein, o.carbs, o.fat, o.kcal]).toEqual([0, 0, 0, 0]);
  });
  it('macros that weigh more than the food are scaled down to the weight', () => {
    // 100 g food claiming 60 + 60 + 60 g macros -> sum 180 -> factor 100/180 -> each 33.3 g
    const o = sanitizeItems([item({ grams: 100, protein: 60, carbs: 60, fat: 60, kcal: 100 })])[0];
    expect(o.protein + o.carbs + o.fat).toBeCloseTo(100, 0);
    expect(o.protein).toBeCloseTo(33.3, 1);
    // calories were inconsistent with the (scaled) macros, so they fall back to atwater: 33.33*4*2 + 33.33*9 = 566.7
    expect(o.kcal).toBe(567);
  });
  it('a single macro above the weight is clamped first: 50 g food with 80 g fat', () => {
    const o = sanitizeItems([item({ grams: 50, protein: 0, carbs: 0, fat: 80, kcal: 450 })])[0];
    expect(o.fat).toBe(50);
    expect(o.kcal).toBe(450); // 50*9 = 450 consistent
  });
  it('fibre cannot exceed carbs or weight', () => {
    expect(sanitizeItems([item({ carbs: 10, fiber: 30 })])[0].fiber).toBe(10);
    expect(sanitizeItems([item({ grams: 20, carbs: 5, protein: 0, fat: 0, fiber: 50 })])[0].fiber).toBe(5);
  });
  it('calories that disagree with the macros are replaced by the macro value', () => {
    // 30 g protein + 40 g carbs + 10 g fat = 120 + 160 + 90 = 370 ; model says 900
    expect(sanitizeItems([item({ grams: 300, protein: 30, carbs: 40, fat: 10, kcal: 900 })])[0].kcal).toBe(370);
    // model says 100
    expect(sanitizeItems([item({ grams: 300, protein: 30, carbs: 40, fat: 10, kcal: 100 })])[0].kcal).toBe(370);
  });
  it('tolerance is max(25, 25%): atwater 370 allows +-92.5', () => {
    const base = { grams: 300, protein: 30, carbs: 40, fat: 10 };
    expect(sanitizeItems([item({ ...base, kcal: 460 })])[0].kcal).toBe(460); // +90
    expect(sanitizeItems([item({ ...base, kcal: 463 })])[0].kcal).toBe(370); // +93
    expect(sanitizeItems([item({ ...base, kcal: 280 })])[0].kcal).toBe(280); // -90
  });
  it('small gaps are kept for low-calorie items: atwater 20 allows +-25', () => {
    const o = sanitizeItems([item({ grams: 100, protein: 5, carbs: 0, fat: 0, kcal: 44 })])[0];
    expect(o.kcal).toBe(44);
    expect(sanitizeItems([item({ grams: 100, protein: 5, carbs: 0, fat: 0, kcal: 46 })])[0].kcal).toBe(20);
  });
  it('zero kcal with macros uses the macros; zero macros keep the model kcal (alcohol, oil-free?)', () => {
    expect(sanitizeItems([item({ kcal: 0, protein: 10, carbs: 0, fat: 0 })])[0].kcal).toBe(40);
    // macros all zero: atwater 0, no cross-check possible, the stated kcal stands (capped by 9 kcal/g)
    expect(sanitizeItems([item({ grams: 100, kcal: 70, protein: 0, carbs: 0, fat: 0, fiber: 0 })])[0].kcal).toBe(70);
  });
  it('calories are capped at 9 kcal per gram when macros are missing', () => {
    expect(sanitizeItems([item({ grams: 100, kcal: 5000, protein: 0, carbs: 0, fat: 0 })])[0].kcal).toBe(900);
  });
});

// ---------------------------------------------------------------- analyzeFood

function fakeClient(response: unknown | (() => unknown)) {
  const make = vi.fn(async () => (typeof response === 'function' ? (response as () => unknown)() : response));
  const beta = vi.fn(async () => (typeof response === 'function' ? (response as () => unknown)() : response));
  const client = { messages: { create: make }, beta: { messages: { create: beta } } };
  return { client: client as unknown as Anthropic, make, beta };
}
const goodJson = {
  dish: 'Rice bowl',
  items: [{ name: 'Rice', grams: 200, kcal: 260, protein: 5, carbs: 56, fat: 0.5, fiber: 1, confidence: 0.8 }],
  hidden_fat_question: 'Was it cooked in oil?',
  note: 'No scale reference',
};
const msg = (over: object = {}) => ({
  id: 'msg_1',
  type: 'message',
  role: 'assistant',
  model: 'claude-haiku-5-5',
  stop_reason: 'end_turn',
  content: [{ type: 'text', text: JSON.stringify(goodJson) }],
  usage: { input_tokens: 800, output_tokens: 200 },
  ...over,
});

describe('analyzeFood request construction', () => {
  it('fast mode: haiku, effort low, json_schema output, image block before text', async () => {
    const { client, make, beta } = fakeClient(msg());
    await analyzeFood(client, { image: 'QUJD', mediaType: 'image/png', text: 'large plate' });
    expect(beta).not.toHaveBeenCalled();
    expect(make).toHaveBeenCalledTimes(1);
    const req = (make.mock.calls[0] as unknown as [Record<string, any>])[0];
    expect(req.model).toBe(FAST_MODEL);
    expect(req.max_tokens).toBe(2000);
    expect(req.output_config.effort).toBe('low');
    expect(req.output_config.format.type).toBe('json_schema');
    expect(req.output_config.format.schema.required).toEqual(['dish', 'items', 'hidden_fat_question', 'note']);
    expect(req.output_config.format.schema.additionalProperties).toBe(false);
    expect(typeof req.system).toBe('string');
    expect(req.messages).toHaveLength(1);
    expect(req.messages[0].role).toBe('user');
    const c = req.messages[0].content;
    expect(c).toHaveLength(2);
    expect(c[0]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'QUJD' } });
    expect(c[1]).toEqual({ type: 'text', text: 'Details from the user: large plate' });
    expect('betas' in req).toBe(false);
    expect('fallbacks' in req).toBe(false);
  });
  it('precise mode: sonnet through the beta endpoint with effort medium and fallback enabled', async () => {
    const { client, make, beta } = fakeClient(msg({ model: PRECISE_MODEL }));
    await analyzeFood(client, { image: 'QUJD', precise: true });
    expect(make).not.toHaveBeenCalled();
    const req = (beta.mock.calls[0] as unknown as [Record<string, any>])[0];
    expect(req.model).toBe(PRECISE_MODEL);
    expect(req.output_config.effort).toBe('medium');
    expect(req.output_config.format.type).toBe('json_schema');
    expect(req.betas).toEqual(['server-side-fallback-2026-07-01']);
    expect(req.fallbacks).toBe('default');
    expect(req.messages[0].content[0].type).toBe('image');
    expect(req.messages[0].content[1]).toEqual({ type: 'text', text: 'Estimate this meal.' });
  });
  it('defaults the media type to jpeg when none is given', async () => {
    const { client, make } = fakeClient(msg());
    await analyzeFood(client, { image: 'QUJD' });
    const req = (make.mock.calls[0] as unknown as [Record<string, any>])[0];
    expect(req.messages[0].content[0].source.media_type).toBe('image/jpeg');
  });
  it('text only: a single text block carrying the description', async () => {
    const { client, make } = fakeClient(msg());
    await analyzeFood(client, { text: 'two eggs and toast' });
    const c = (make.mock.calls[0] as unknown as [Record<string, any>])[0].messages[0].content;
    expect(c).toEqual([{ type: 'text', text: 'Estimate this meal from the description: two eggs and toast' }]);
  });
  it('model overrides from options are honoured', async () => {
    const f = fakeClient(msg());
    await analyzeFood(f.client, { text: 'x' }, { fastModel: 'fast-x' });
    expect((f.make.mock.calls[0] as unknown as [Record<string, any>])[0].model).toBe('fast-x');
    const p = fakeClient(msg());
    await analyzeFood(p.client, { text: 'x', precise: true }, { preciseModel: 'precise-x' });
    expect((p.beta.mock.calls[0] as unknown as [Record<string, any>])[0].model).toBe('precise-x');
  });
});

describe('analyzeFood response handling', () => {
  it('returns the sanitised items, texts and usage', async () => {
    const { client } = fakeClient(msg());
    const out = await analyzeFood(client, { text: 'rice' });
    expect(out.dish).toBe('Rice bowl');
    expect(out.items).toHaveLength(1);
    expect(out.items[0]).toMatchObject({ name: 'Rice', grams: 200, kcal: 260 });
    expect(out.hiddenFatQuestion).toBe('Was it cooked in oil?');
    expect(out.note).toBe('No scale reference');
    expect(out.model).toBe('claude-haiku-5-5');
    expect(out.usage).toEqual({ inputTokens: 800, outputTokens: 200 });
  });
  it('finds the text block when a thinking block comes first', async () => {
    const { client } = fakeClient(
      msg({
        content: [
          { type: 'thinking', thinking: 'hmm {not json}', signature: 's' },
          { type: 'text', text: JSON.stringify(goodJson) },
        ],
      }),
    );
    expect((await analyzeFood(client, { text: 'rice' })).items[0].name).toBe('Rice');
  });
  it('concatenates multiple text blocks', async () => {
    const s = JSON.stringify(goodJson);
    const { client } = fakeClient(msg({ content: [{ type: 'text', text: s.slice(0, 20) }, { type: 'text', text: s.slice(20) }] }));
    expect((await analyzeFood(client, { text: 'rice' })).dish).toBe('Rice bowl');
  });
  it('null hidden-fat question and note map to null; dish falls back to the first item', async () => {
    const { client } = fakeClient(msg({ content: [{ type: 'text', text: JSON.stringify({ ...goodJson, dish: '', hidden_fat_question: null, note: '  ' }) }] }));
    const out = await analyzeFood(client, { text: 'rice' });
    expect(out.dish).toBe('Rice');
    expect(out.hiddenFatQuestion).toBeNull();
    expect(out.note).toBeNull();
  });
  it('refusal stop reason -> declined 422', async () => {
    const { client } = fakeClient(msg({ stop_reason: 'refusal', content: [] }));
    const e = await errAsync(analyzeFood(client, { text: 'x' }));
    expect([e.code, e.status]).toEqual(['declined', 422]);
  });
  it('max_tokens stop reason -> truncated 422, even if partial JSON is present', async () => {
    const { client } = fakeClient(msg({ stop_reason: 'max_tokens', content: [{ type: 'text', text: '{"dish":"a","items":[' }] }));
    const e = await errAsync(analyzeFood(client, { text: 'x' }));
    expect([e.code, e.status]).toEqual(['truncated', 422]);
  });
  it('malformed JSON -> upstream 502', async () => {
    const { client } = fakeClient(msg({ content: [{ type: 'text', text: '{"dish": "a", ' }] }));
    const e = await errAsync(analyzeFood(client, { text: 'x' }));
    expect([e.code, e.status]).toEqual(['upstream', 502]);
  });
  it('no text block at all -> upstream 502', async () => {
    const { client } = fakeClient(msg({ content: [{ type: 'thinking', thinking: 'x', signature: 's' }] }));
    const e = await errAsync(analyzeFood(client, { text: 'x' }));
    expect(e.code).toBe('upstream');
  });
  it('valid JSON that is not an object (null) -> does not crash with a TypeError', async () => {
    const { client } = fakeClient(msg({ content: [{ type: 'text', text: 'null' }] }));
    await expect(analyzeFood(client, { text: 'x' })).rejects.toBeInstanceOf(AnalyzeError);
  });
  it('empty items -> not_food 422 carrying the model note', async () => {
    const { client } = fakeClient(msg({ content: [{ type: 'text', text: JSON.stringify({ dish: '', items: [], hidden_fat_question: null, note: 'This is a photo of a dog.' }) }] }));
    const e = await errAsync(analyzeFood(client, { image: 'QUJD' }));
    expect([e.code, e.status]).toEqual(['not_food', 422]);
    expect(e.message).toBe('This is a photo of a dog.');
  });
  it('empty items without a note uses a default message', async () => {
    const { client } = fakeClient(msg({ content: [{ type: 'text', text: JSON.stringify({ items: [] }) }] }));
    const e = await errAsync(analyzeFood(client, { image: 'QUJD' }));
    expect(e.code).toBe('not_food');
    expect(e.message.length).toBeGreaterThan(10);
  });
  it('items that all fail sanitising count as empty -> not_food', async () => {
    const { client } = fakeClient(msg({ content: [{ type: 'text', text: JSON.stringify({ dish: 'x', items: [{ name: '', grams: 0 }, 'junk'], note: null }) }] }));
    expect((await errAsync(analyzeFood(client, { text: 'x' }))).code).toBe('not_food');
  });
  it('model-supplied numbers are sanitised end to end', async () => {
    const bad = { dish: 'x', items: [{ name: 'Cake', grams: 100, kcal: 5, protein: 5, carbs: 50, fat: 20, fiber: 99, confidence: 3 }], hidden_fat_question: null, note: null };
    const { client } = fakeClient(msg({ content: [{ type: 'text', text: JSON.stringify(bad) }] }));
    const it = (await analyzeFood(client, { text: 'x' })).items[0];
    expect(it.kcal).toBe(400); // 20 + 200 + 180
    expect(it.fiber).toBe(50);
    expect(it.confidence).toBe(1);
  });
});

describe('analyzeFood error mapping', () => {
  const headers = new Headers();
  const throwing = (e: unknown) => ({
    client: {
      messages: { create: vi.fn(async () => { throw e; }) },
      beta: { messages: { create: vi.fn(async () => { throw e; }) } },
    } as unknown as Anthropic,
  });

  it('RateLimitError -> rate_limited 429', async () => {
    const e = await errAsync(analyzeFood(throwing(new Anthropic.RateLimitError(429, { type: 'error' }, 'slow', headers)).client, { text: 'x' }));
    expect([e.code, e.status]).toEqual(['rate_limited', 429]);
  });
  it('BadRequestError -> bad_request 400', async () => {
    const e = await errAsync(analyzeFood(throwing(new Anthropic.BadRequestError(400, { type: 'error' }, 'bad image', headers)).client, { text: 'x' }));
    expect([e.code, e.status]).toEqual(['bad_request', 400]);
  });
  it('other API errors (500, auth, overloaded) -> upstream 502', async () => {
    for (const make of [
      () => new Anthropic.InternalServerError(500, { type: 'error' }, 'boom', headers),
      () => new Anthropic.AuthenticationError(401, { type: 'error' }, 'key', headers),
      () => new Anthropic.APIError(529, { type: 'error' }, 'overloaded', headers),
    ]) {
      const e = await errAsync(analyzeFood(throwing(make()).client, { text: 'x' }));
      expect([e.code, e.status]).toEqual(['upstream', 502]);
    }
  });
  it('the same mapping applies on the precise (beta) path', async () => {
    const e = await errAsync(analyzeFood(throwing(new Anthropic.RateLimitError(429, { type: 'error' }, 'slow', headers)).client, { text: 'x', precise: true }));
    expect(e.code).toBe('rate_limited');
  });
  it('non-API errors propagate unchanged', async () => {
    const boom = new TypeError('network down');
    await expect(analyzeFood(throwing(boom).client, { text: 'x' })).rejects.toBe(boom);
  });
});
