import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it, vi } from 'vitest';

import { AnalyzeError, analyzeFood, costOf, FAST_MODEL, mailboxOf, parseAnswer, parseLines, PRECISE_MODEL, sanitizeItems, validateInput } from './analyze';

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
  it('fast mode: haiku, effort low, plain-lines answer (no schema sent), image block before text', async () => {
    const { client, make, beta } = fakeClient(msg());
    await analyzeFood(client, { image: 'QUJD', mediaType: 'image/png', text: 'large plate' });
    expect(beta).not.toHaveBeenCalled();
    expect(make).toHaveBeenCalledTimes(1);
    const req = (make.mock.calls[0] as unknown as [Record<string, any>])[0];
    expect(req.model).toBe(FAST_MODEL);
    expect(req.max_tokens).toBe(2000);
    // The schema is most of a request's input tokens: it is sent only on the second try.
    expect(req.output_config).toEqual({ effort: 'low' });
    expect('thinking' in req).toBe(false);
    expect(typeof req.system).toBe('string');
    expect(req.system).toContain('I <item name> | <grams> | <kcal>');
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
    expect(req.output_config).toEqual({ effort: 'medium' });
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

describe('the plain-lines answer', () => {
  const lines = ['D Rice bowl', 'I Rice | 200 | 260 | 5 | 56 | 0.5 | 1 | 0.8', 'I Fried egg | 50 | 100 | 6.5 | 0.5 | 8 | 0 | 0.9', 'Q Was it cooked in oil?', 'N No scale reference'].join('\n');
  it('reads the dish, every item, the question and the note', () => {
    expect(parseLines(lines)).toEqual({
      dish: 'Rice bowl',
      items: [
        { name: 'Rice', grams: 200, kcal: 260, protein: 5, carbs: 56, fat: 0.5, fiber: 1, confidence: 0.8 },
        { name: 'Fried egg', grams: 50, kcal: 100, protein: 6.5, carbs: 0.5, fat: 8, fiber: 0, confidence: 0.9 },
      ],
      hidden_fat_question: 'Was it cooked in oil?',
      note: 'No scale reference',
    });
  });
  it('takes the question and the note as absent when their lines are left out or dashed', () => {
    expect(parseLines('D Banana\nI Banana | 118 | 105 | 1.3 | 27 | 0.4 | 3.1 | 0.9')).toMatchObject({ hidden_fat_question: null, note: null });
    expect(parseLines('D Banana\nI Banana | 118 | 105 | 1.3 | 27 | 0.4 | 3.1 | 0.9\nQ -\nN none')).toMatchObject({ hidden_fat_question: null, note: null });
  });
  it('reads numbers however they were written: units, a decimal comma, grouped thousands, a colon after the letter', () => {
    const a = parseLines('D: Pizza\nI: Whole pizza | 850 g | 2,150 kcal | 95,5 | 240 | 88 | 12 | 0,7');
    expect(a?.dish).toBe('Pizza');
    expect(a?.items[0]).toEqual({ name: 'Whole pizza', grams: 850, kcal: 2150, protein: 95.5, carbs: 240, fat: 88, fiber: 12, confidence: 0.7 });
  });
  it('fills columns that are missing: no macros is zero, no confidence is a coin toss', () => {
    expect(parseLines('I Cola | 330 | 139')?.items[0]).toEqual({ name: 'Cola', grams: 330, kcal: 139, protein: 0, carbs: 0, fat: 0, fiber: 0, confidence: 0.5 });
  });
  it('keeps names in any script and a zero-calorie drink', () => {
    const a = parseLines('D ביצים קשות וסלט\nI ביצה קשה | 100 | 155 | 13 | 1 | 11 | 0 | 0.9\nI מים | 250 | 0 | 0 | 0 | 0 | 0 | 0.9');
    expect(a?.items.map((i) => (i as { name: string }).name)).toEqual(['ביצה קשה', 'מים']);
  });
  it('ignores a stray line of prose around the form', () => {
    expect(parseLines(`Here is the estimate:\n${lines}\nHope that helps.`)?.items).toHaveLength(2);
  });
  it('no item and a note is a "no food here" answer', () => {
    expect(parseLines('N No food or drink in the photo, only a set of keys.')).toEqual({ dish: null, items: [], hidden_fat_question: null, note: 'No food or drink in the photo, only a set of keys.' });
  });
  it('does not guess from an answer that did not keep the form', () => {
    expect(parseLines('The meal looks like about 500 calories of rice and chicken.')).toBeNull();
    expect(parseLines('')).toBeNull();
    // An item without its weight and calories.
    expect(parseLines('D Rice bowl\nI Rice')).toBeNull();
    expect(parseLines('D Rice bowl\nI Rice | about a cup | 260')).toBeNull();
    // A sentence that happens to start with the letter I.
    expect(parseLines('I think this is a rice bowl.')).toBeNull();
    // A dish and nothing else.
    expect(parseLines('D Rice bowl')).toBeNull();
  });
  it('parseAnswer reads either form', () => {
    expect(parseAnswer(lines)?.items).toHaveLength(2);
    expect(parseAnswer(JSON.stringify(goodJson))).toEqual({ dish: 'Rice bowl', items: goodJson.items, hidden_fat_question: 'Was it cooked in oil?', note: 'No scale reference' });
    expect(parseAnswer('{"dish": "x", "items": [')).toBeNull();
    expect(parseAnswer('[1, 2]')).toBeNull();
  });

  const text = (t: string, usage = { input_tokens: 500, output_tokens: 90 }) => msg({ content: [{ type: 'text', text: t }], usage });
  it('an answer in lines is one request', async () => {
    const { client, make } = fakeClient(text(lines));
    const out = await analyzeFood(client, { text: 'rice bowl with a fried egg' });
    expect(make).toHaveBeenCalledTimes(1);
    expect(out.dish).toBe('Rice bowl');
    expect(out.items.map((i) => i.name)).toEqual(['Rice', 'Fried egg']);
    expect(out.hiddenFatQuestion).toBe('Was it cooked in oil?');
    expect(out.usage).toEqual({ inputTokens: 500, outputTokens: 90 });
  });
  it('an answer that did not keep the form is asked for again as schema-checked JSON, and both requests are counted', async () => {
    const replies = [text('It looks like a rice bowl, roughly 500 kcal.'), msg()];
    const { client, make } = fakeClient(() => replies.shift());
    const out = await analyzeFood(client, { text: 'rice bowl' });
    expect(make).toHaveBeenCalledTimes(2);
    const second = (make.mock.calls[1] as unknown as [Record<string, any>])[0];
    expect(second.output_config.format.type).toBe('json_schema');
    expect(second.output_config.format.schema.required).toEqual(['dish', 'items', 'hidden_fat_question', 'note']);
    expect(second.output_config.format.schema.additionalProperties).toBe(false);
    expect(second.system).toContain('hidden_fat_question');
    expect(out.items[0].name).toBe('Rice');
    // 500 + 90 for the first try, 800 + 200 for the second: all of it was billed.
    expect(out.usage).toEqual({ inputTokens: 1300, outputTokens: 290 });
  });
  it('gives up, with everything it used, when the second try does not parse either', async () => {
    const replies = [text('no idea'), text('still no idea')];
    const { client } = fakeClient(() => replies.shift());
    const e = (await analyzeFood(client, { text: 'x' }).catch((x: unknown) => x)) as AnalyzeError;
    expect(e).toBeInstanceOf(AnalyzeError);
    expect(e.code).toBe('upstream');
    expect(e.usage).toEqual({ inputTokens: 1000, outputTokens: 180 });
  });
  it('a note and no item is "not food", in one request', async () => {
    const { client, make } = fakeClient(text('N No food or drink here, only a set of keys.'));
    const e = (await analyzeFood(client, { text: 'my keys' }).catch((x: unknown) => x)) as AnalyzeError;
    expect(make).toHaveBeenCalledTimes(1);
    expect(e.code).toBe('not_food');
    expect(e.message).toBe('No food or drink here, only a set of keys.');
  });
  it("format 'json' skips the lines and sends the schema at once", async () => {
    const { client, make } = fakeClient(msg());
    await analyzeFood(client, { text: 'rice' }, { format: 'json' });
    expect(make).toHaveBeenCalledTimes(1);
    expect((make.mock.calls[0] as unknown as [Record<string, any>])[0].output_config.format.type).toBe('json_schema');
  });
  it("thinking 'off' reaches the small model only", async () => {
    const f = fakeClient(text(lines));
    await analyzeFood(f.client, { text: 'rice' }, { thinking: 'off' });
    expect((f.make.mock.calls[0] as unknown as [Record<string, any>])[0].thinking).toEqual({ type: 'disabled' });
    const p = fakeClient(text(lines));
    await analyzeFood(p.client, { text: 'rice', precise: true }, { thinking: 'off' });
    expect('thinking' in (p.beta.mock.calls[0] as unknown as [Record<string, any>])[0]).toBe(false);
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

describe('cost and billing of failed analyses', () => {
  const ok = { content: [{ type: 'text', text: '{"dish":"x","items":[],"hidden_fat_question":null,"note":"no food here"}' }], stop_reason: 'end_turn', model: 'claude-haiku-5-5', usage: { input_tokens: 700, output_tokens: 40 } };
  const client = (response: unknown) => ({ messages: { create: async () => response }, beta: { messages: { create: async () => response } } }) as never;

  it('a careful analysis weighs five fast ones', () => {
    expect(costOf({})).toBe(1);
    expect(costOf({ precise: false })).toBe(1);
    expect(costOf({ precise: true })).toBe(5);
  });

  it('errors raised after the model answered carry the tokens that were billed', async () => {
    const cases: [unknown, string][] = [
      [ok, 'not_food'],
      [{ ...ok, stop_reason: 'max_tokens', usage: { input_tokens: 900, output_tokens: 2000 } }, 'truncated'],
      [{ ...ok, stop_reason: 'refusal' }, 'declined'],
      [{ ...ok, content: [{ type: 'text', text: 'not json' }] }, 'upstream'],
      [{ ...ok, content: [{ type: 'text', text: 'null' }] }, 'upstream'],
    ];
    for (const [response, code] of cases) {
      const err = await analyzeFood(client(response), { text: 'toast' }).catch((e) => e);
      expect(err).toBeInstanceOf(AnalyzeError);
      expect(err.code).toBe(code);
      expect(err.usage).toBeTruthy();
      expect(err.unbilled).toBe(false);
    }
    const truncated = await analyzeFood(client({ ...ok, stop_reason: 'max_tokens', usage: { input_tokens: 900, output_tokens: 2000 } }), { text: 'toast' }).catch((e) => e);
    expect(truncated.usage).toEqual({ inputTokens: 900, outputTokens: 2000 });
  });

  it('errors raised before any output are marked unbilled, so the analysis can be given back', () => {
    expect(new AnalyzeError('rate_limited', 'busy', 429).unbilled).toBe(true);
    expect(new AnalyzeError('upstream', 'down', 502).unbilled).toBe(true);
    // The same code with usage attached means the model did answer.
    expect(new AnalyzeError('upstream', 'bad json', 502, { inputTokens: 1, outputTokens: 1 }).unbilled).toBe(false);
    expect(new AnalyzeError('bad_request', 'no', 400).unbilled).toBe(false);
  });
});

describe('mailboxOf', () => {
  it('gives one identity to the aliases of one inbox', () => {
    expect(mailboxOf(' Alex@Gmail.com ')).toBe('alex@gmail.com');
    expect(mailboxOf('alex+1@gmail.com')).toBe('alex@gmail.com');
    expect(mailboxOf('a.l.e.x+food@googlemail.com')).toBe('alex@gmail.com');
    expect(mailboxOf('dana+test@example.org')).toBe('dana@example.org');
  });
  it('keeps dots outside Gmail and leaves odd input alone', () => {
    expect(mailboxOf('first.last@example.org')).toBe('first.last@example.org');
    expect(mailboxOf('not-an-email')).toBe('not-an-email');
  });
});
