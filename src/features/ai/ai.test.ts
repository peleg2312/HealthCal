import { describe, expect, it, vi } from 'vitest';

import { BUILTIN_FOODS } from '@/data/foods';
import type { AiFoodItem } from '@/types';

import { AiError, buildAnalyzeRequest, errorFromResponse, parseAnalyzeBody, postAnalyze, stripDataPrefix } from './api';
import { checkBarcode, hasValidCheckDigit } from './barcode';
import { availability, demoResult } from './demo';
import {
  addedFatItem,
  applyAddedFat,
  calorieRange,
  confidenceLevel,
  gramStep,
  makeRow,
  overallConfidence,
  rescaleItem,
  rowsFromResult,
  setRowGrams,
  totals,
} from './estimate';
import { fitWithin, IMAGE_EDGE, visionTokens } from './image';
import { foodToItem, matchFoods, parseAmount } from './localMatch';

const rice: AiFoodItem = { name: 'Rice', grams: 200, kcal: 260, protein: 5.4, carbs: 56.4, fat: 0.6, fiber: 0.8, confidence: 0.7 };
const chicken: AiFoodItem = { name: 'Chicken', grams: 150, kcal: 248, protein: 46.5, carbs: 0, fat: 5.4, fiber: 0, confidence: 1 };

describe('rescaleItem', () => {
  it('scales calories and macros proportionally', () => {
    const r = rescaleItem(rice, 300);
    expect(r).toMatchObject({ grams: 300, kcal: 390, protein: 8.1, carbs: 84.6, fat: 0.9, fiber: 1.2 });
    expect(r.name).toBe('Rice');
    expect(r.confidence).toBe(0.7);
  });
  it('handles zero and nonsense input', () => {
    expect(rescaleItem(rice, 0)).toMatchObject({ grams: 0, kcal: 0, protein: 0 });
    expect(rescaleItem(rice, Number.NaN).grams).toBe(0);
    expect(rescaleItem(rice, -10).grams).toBe(0);
  });
  it('does not drift over repeated edits because rows scale from the origin', () => {
    let row = makeRow(rice, 'detected');
    for (const g of [137, 33, 271, 200]) row = setRowGrams(row, g);
    expect(row.item).toEqual(rice);
  });
});

describe('totals and range', () => {
  it('adds items', () => {
    expect(totals([rice, chicken])).toEqual({ kcal: 508, protein: 51.9, carbs: 56.4, fat: 6, fiber: 0.8 });
    expect(totals([])).toEqual({ kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 });
  });
  it('gives a 15 % band for a certain item, rounded outward to 10 kcal', () => {
    expect(calorieRange([chicken])).toEqual([210, 290]); // 210.8 .. 285.2
  });
  it('widens the band with lower confidence and sums item ranges', () => {
    const [lo, hi] = calorieRange([rice, chicken]);
    // rice spread 0.24: 197.6..322.4; chicken 210.8..285.2
    expect(lo).toBe(400);
    expect(hi).toBe(610);
    const [lo2, hi2] = calorieRange([{ ...rice, confidence: 0 }]);
    expect(lo2).toBe(140); // 260 * 0.55 = 143
    expect(hi2).toBe(380); // 260 * 1.45 = 377
  });
  it('words for confidence', () => {
    expect(confidenceLevel(0.9)).toBe('high');
    expect(confidenceLevel(0.6)).toBe('medium');
    expect(confidenceLevel(0.3)).toBe('low');
    expect(overallConfidence([rice, chicken])).toBeCloseTo((0.7 * 260 + 248) / 508, 5);
    expect(overallConfidence([])).toBe(0);
  });
});

describe('added fat', () => {
  it('1 tsp is about 4.5 g fat and 40 kcal', () => {
    expect(addedFatItem('tsp')).toMatchObject({ name: 'Added oil or butter', fat: 4.5, kcal: 40, protein: 0, carbs: 0 });
    expect(addedFatItem('tbsp')).toMatchObject({ fat: 13.5, kcal: 120 });
    expect(addedFatItem('2tbsp')).toMatchObject({ fat: 27, kcal: 240 });
    expect(addedFatItem('none')).toBeNull();
  });
  it('replaces rather than stacks the fat row', () => {
    let rows = rowsFromResult(demoResult());
    const n = rows.length;
    rows = applyAddedFat(rows, 'tsp');
    rows = applyAddedFat(rows, 'tbsp');
    expect(rows).toHaveLength(n + 1);
    expect(rows.filter((r) => r.kind === 'fat')[0].item.kcal).toBe(120);
    expect(applyAddedFat(rows, 'none')).toHaveLength(n);
  });
  it('steps grams in proportion to the portion', () => {
    expect(gramStep(10)).toBe(5);
    expect(gramStep(100)).toBe(10);
    expect(gramStep(200)).toBe(25);
    expect(gramStep(600)).toBe(50);
  });
});

describe('image sizing', () => {
  it('fits the long edge and never upscales', () => {
    expect(fitWithin(4032, 3024, 768)).toEqual({ width: 768, height: 576 });
    expect(fitWithin(3024, 4032, 1024)).toEqual({ width: 768, height: 1024 });
    expect(fitWithin(500, 300, 768)).toEqual({ width: 500, height: 300 });
    expect(fitWithin(0, 0, 768)).toEqual({ width: 768, height: 768 });
  });
  it('a 768 px photo costs a small fraction of a camera original', () => {
    const { width, height } = fitWithin(4032, 3024, IMAGE_EDGE.fast);
    expect(visionTokens(width, height)).toBeLessThan(800);
    expect(visionTokens(4032, 3024)).toBeGreaterThan(15_000);
  });
});

describe('request building', () => {
  it('builds the POST with token, apikey and a compact body', () => {
    const { url, init } = buildAnalyzeRequest(
      { image: 'data:image/jpeg;base64,QUJD', text: '  cooked in butter ', precise: true },
      { functionsUrl: 'https://x.supabase.co/functions/v1/', accessToken: 'tok', anonKey: 'anon' },
    );
    expect(url).toBe('https://x.supabase.co/functions/v1/analyze-food');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer tok', apikey: 'anon', 'Content-Type': 'application/json' });
    expect(JSON.parse(init.body as string)).toEqual({ image: 'QUJD', mediaType: 'image/jpeg', text: 'cooked in butter', precise: true });
  });
  it('omits empty fields and the precise flag by default', () => {
    const { init } = buildAnalyzeRequest({ text: 'two eggs on toast' }, { functionsUrl: 'u', accessToken: 't' });
    expect(JSON.parse(init.body as string)).toEqual({ text: 'two eggs on toast' });
    expect(init.headers).not.toHaveProperty('apikey');
  });
  it('strips a data URL prefix only', () => {
    expect(stripDataPrefix('data:image/png;base64,AAAA')).toBe('AAAA');
    expect(stripDataPrefix('AAAA')).toBe('AAAA');
  });
});

describe('error mapping', () => {
  const cases: [number, unknown, string, boolean][] = [
    [429, { error: 'daily_limit', message: "You have used today's 40 AI analyses.", remaining: 0 }, 'daily_limit', false],
    [422, { error: 'not_food', message: 'That looks like a cat.' }, 'not_food', false],
    [422, { error: 'declined', message: 'x' }, 'declined', false],
    [422, { error: 'truncated', message: 'The meal was too complex.' }, 'truncated', false],
    [429, { error: 'rate_limited', message: 'x' }, 'rate_limited', true],
    [401, { error: 'unauthorized', message: 'x' }, 'unauthorized', false],
    [500, { error: 'not_configured', message: 'x' }, 'not_configured', false],
    [400, { error: 'bad_request', message: 'Send a photo or a description.' }, 'bad_request', false],
    [502, { error: 'upstream', message: 'x' }, 'upstream', true],
    [500, { error: 'internal', message: 'x' }, 'unknown', true],
    [500, { error: 'quota_check_failed' }, 'unknown', true],
    [401, { code: 401, message: 'Invalid JWT' }, 'unauthorized', false],
    [404, null, 'not_configured', false],
    [413, null, 'bad_request', false],
    [503, 'gateway', 'upstream', true],
    [504, null, 'timeout', true],
    [418, null, 'unknown', true],
  ];
  it.each(cases)('%i %j -> %s', (status, body, code, retryable) => {
    const e = errorFromResponse(status, body);
    expect(e).toBeInstanceOf(AiError);
    expect(e.code).toBe(code);
    expect(e.retryable).toBe(retryable);
    expect(e.message.length).toBeGreaterThan(10);
  });
  it('keeps the specific server message for not_food and daily_limit', () => {
    expect(errorFromResponse(422, { error: 'not_food', message: 'That looks like a cat.' }).message).toBe('That looks like a cat.');
    const limit = errorFromResponse(429, { error: 'daily_limit', message: 'Used all 40.', remaining: 0 });
    expect(limit.message).toBe('Used all 40.');
    expect(limit.remaining).toBe(0);
  });
});

describe('parseAnalyzeBody', () => {
  it('reads the result and remaining allowance', () => {
    const r = parseAnalyzeBody({
      dish: 'Toast',
      items: [{ name: 'Toast', grams: 60, kcal: 160, protein: 5, carbs: 30, fat: 2, fiber: 2, confidence: 0.9 }, { name: '', grams: 10 }],
      hiddenFatQuestion: 'Buttered?',
      note: null,
      model: 'claude-haiku-5-5',
      usage: { inputTokens: 800, outputTokens: 120 },
      remaining: 37,
    });
    expect(r.remaining).toBe(37);
    expect(r.result.items).toHaveLength(1);
    expect(r.result).toMatchObject({ dish: 'Toast', hiddenFatQuestion: 'Buttered?', note: null, model: 'claude-haiku-5-5' });
    expect(r.result.demo).toBeUndefined();
  });
  it('treats no usable items as not food and a bad shape as upstream', () => {
    expect(() => parseAnalyzeBody({ items: [] })).toThrow(expect.objectContaining({ code: 'not_food' }));
    expect(() => parseAnalyzeBody('oops')).toThrow(expect.objectContaining({ code: 'upstream' }));
  });
});

describe('postAnalyze with a mocked fetch', () => {
  const opts = { functionsUrl: 'https://x/functions/v1', accessToken: 'tok' };
  const ok = { dish: 'Soup', items: [{ name: 'Soup', grams: 300, kcal: 180, protein: 9, carbs: 20, fat: 6, fiber: 3, confidence: 0.8 }], hiddenFatQuestion: null, note: null, model: 'm', remaining: 12 };
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  it('sends the request and returns result plus remaining', async () => {
    const fetchFn = vi.fn(async () => json(200, ok));
    const r = await postAnalyze(fetchFn as unknown as typeof fetch, { text: 'soup' }, opts);
    expect(r.remaining).toBe(12);
    expect(r.result.items[0].kcal).toBe(180);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://x/functions/v1/analyze-food');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect(init.signal).toBeDefined();
  });
  it('maps an error response', async () => {
    const fetchFn = vi.fn(async () => json(429, { error: 'daily_limit', message: 'Done for today.', remaining: 0 }));
    await expect(postAnalyze(fetchFn as unknown as typeof fetch, { text: 'x' }, opts)).rejects.toMatchObject({ code: 'daily_limit', remaining: 0, retryable: false });
  });
  it('maps a network failure', async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(postAnalyze(fetchFn as unknown as typeof fetch, { text: 'x' }, opts)).rejects.toMatchObject({ code: 'network', retryable: true });
  });
  it('maps a timeout', async () => {
    const fetchFn = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
        }),
    );
    await expect(postAnalyze(fetchFn as unknown as typeof fetch, { text: 'x' }, { ...opts, timeoutMs: 20 })).rejects.toMatchObject({ code: 'timeout', retryable: true });
  });
  it('passes a user cancel through as an abort, not an AiError', async () => {
    const controller = new AbortController();
    const fetchFn = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
        }),
    );
    const p = postAnalyze(fetchFn as unknown as typeof fetch, { text: 'x' }, { ...opts, signal: controller.signal });
    controller.abort();
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
  });
  it('treats a non-JSON error page as upstream', async () => {
    const fetchFn = vi.fn(async () => new Response('<html>bad gateway</html>', { status: 502 }));
    await expect(postAnalyze(fetchFn as unknown as typeof fetch, { text: 'x' }, opts)).rejects.toMatchObject({ code: 'upstream' });
  });
});

describe('demo mode', () => {
  it('is used without a backend or without a session', () => {
    expect(availability(false, false)).toEqual({ live: false, reason: 'no_backend' });
    expect(availability(true, false)).toEqual({ live: false, reason: 'signed_out' });
    expect(availability(true, true)).toEqual({ live: true });
  });
  it('labels the sample as demo', () => {
    const r = demoResult();
    expect(r.demo).toBe(true);
    expect(r.items.length).toBeGreaterThan(1);
  });
});

describe('barcodes', () => {
  it('validates GS1 check digits', () => {
    expect(hasValidCheckDigit('737628064502')).toBe(true);
    expect(hasValidCheckDigit('5000159484695')).toBe(true);
    expect(hasValidCheckDigit('96385074')).toBe(true);
    expect(hasValidCheckDigit('737628064503')).toBe(false);
  });
  it('explains bad input', () => {
    expect(checkBarcode('7376 2806 4502')).toEqual({ ok: true, code: '737628064502' });
    expect(checkBarcode('')).toMatchObject({ ok: false });
    expect(checkBarcode('12345')).toMatchObject({ ok: false, message: expect.stringContaining('5') });
    expect(checkBarcode('737628064503')).toMatchObject({ ok: false, message: expect.stringContaining('typo') });
  });
});

describe('local match for a missed item', () => {
  it('parses amounts', () => {
    expect(parseAmount('150 g rice')).toEqual({ count: null, grams: 150, rest: 'rice' });
    expect(parseAmount('2 eggs')).toEqual({ count: 2, grams: null, rest: 'eggs' });
    expect(parseAmount('banana')).toEqual({ count: null, grams: null, rest: 'banana' });
  });
  it('finds bundled foods and scales to the typed amount', () => {
    const hits = matchFoods('banana', BUILTIN_FOODS);
    expect(hits[0]?.name.toLowerCase()).toContain('banana');
    const item = foodToItem(hits[0], '200 g banana');
    expect(item.grams).toBe(200);
    expect(item.kcal).toBe(Math.round(hits[0].per100g.kcal * 2));
    expect(matchFoods('   ', BUILTIN_FOODS)).toEqual([]);
  });
});
