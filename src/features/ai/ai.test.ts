import { describe, expect, it, vi } from 'vitest';

import { BUILTIN_FOODS } from '@/data/foods';
import type { AiFoodItem } from '@/types';

import { AiError, buildAnalyzeRequest, errorFromResponse, parseAnalyzeBody, postAnalyze, stripDataPrefix } from './api';
import { barcodeKey, checkBarcode, expandUpcE, findLocalByBarcode, hasValidCheckDigit, lookupCode, sameBarcode } from './barcode';
import { availability, demoResult } from './demo';
import {
  addedFatItem,
  applyAddedFat,
  calorieRange,
  confidenceLevel,
  formatKcalRange,
  gramStep,
  itemRange,
  itemSpread,
  makeRow,
  overallConfidence,
  PHOTO_SPREAD,
  rangeWord,
  rescaleItem,
  aiFoodDefinition,
  renameRow,
  rowsFromResult,
  rowsToLogItems,
  rowWiden,
  setRowGrams,
  swapRow,
  totals,
  unswapRow,
  withCorrection,
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
  it('a photo answer gets a band one and a half times as wide, only on what the model read', () => {
    // chicken spread 0.15 x 1.5 = 0.225: 192.2 .. 303.8
    expect(calorieRange([chicken], [PHOTO_SPREAD])).toEqual([190, 310]);
    // never past 90 %: rice at confidence 0 would be 0.45 x 1.5 = 0.675, still inside
    expect(itemSpread(0, 3)).toBe(0.9);
    expect(rowWiden(makeRow(rice, 'detected'), true)).toBe(PHOTO_SPREAD);
    expect(rowWiden(makeRow(rice, 'added'), true)).toBe(1);
    expect(rowWiden(makeRow(rice, 'fat'), true)).toBe(1);
    expect(rowWiden(makeRow(rice, 'detected'), false)).toBe(1);
    // The words: a quick photo answer is rough; a typed one and the careful pass stay likely.
    expect(formatKcalRange([190, 310], rangeWord(true, false))).toBe('rough 190 to 310');
    expect(formatKcalRange([190, 310], rangeWord(true, true))).toBe('likely 190 to 310');
    expect(formatKcalRange([190, 310], rangeWord(false, false))).toBe('likely 190 to 310');
    expect(formatKcalRange([190, 310])).toBe('likely 190 to 310');
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
    // A typed UPC-E is accepted and looked up by its full code.
    expect(checkBarcode('0425 2614')).toEqual({ ok: true, code: '042100005264' });
  });
  it('expands UPC-E to UPC-A by all four rules', () => {
    expect(expandUpcE('04252614')).toBe('042100005264');
    expect(expandUpcE('01234505')).toBe('012000003455');
    // last data digit 3, 4 and 5-9
    expect(expandUpcE('0123453' + checkOf('01230000045'))).toBe('01230000045' + checkOf('01230000045'));
    expect(expandUpcE('0123454' + checkOf('01234000005'))).toBe('01234000005' + checkOf('01234000005'));
    expect(expandUpcE('0123457' + checkOf('01234500007'))).toBe('01234500007' + checkOf('01234500007'));
    expect(expandUpcE('04252615')).toBeNull();
    expect(expandUpcE('24252614')).toBeNull();
    expect(expandUpcE('5000159484695')).toBeNull();
  });
  it('looks UPC-E scans up by their expanded code and leaves EAN-8 alone', () => {
    expect(lookupCode('04252614', 'upc_e')).toBe('042100005264');
    expect(lookupCode('04252614', 'UPC_E')).toBe('042100005264');
    // A valid EAN-8 stays as it is unless the scanner says UPC-E.
    expect(lookupCode('96385074', 'ean8')).toBe('96385074');
    expect(lookupCode('5000159484695', 'ean13')).toBe('5000159484695');
  });
  it('matches UPC-A, EAN-13 and GTIN-14 forms of one product', () => {
    expect(barcodeKey('0737628064502')).toBe('737628064502');
    expect(sameBarcode('737628064502', '0737628064502')).toBe(true);
    expect(sameBarcode('00737628064502', '737628064502')).toBe(true);
    expect(sameBarcode('04252614', '0042100005264')).toBe(true);
    expect(sameBarcode('042100005264', '04252614')).toBe(true);
    expect(sameBarcode('737628064502', '737628064519')).toBe(false);
    expect(sameBarcode('', '')).toBe(false);
  });
  it('finds own foods first, then recents, then the newest diary entry', () => {
    const f = (id: string, barcode?: string, deleted?: boolean) => ({ id, barcode, deleted });
    const sources = {
      custom: [f('c-old', '0737628064502', true), f('c1', '5000159484695')],
      recent: [f('r1', '737628064502')],
      entries: [
        { food: f('e-old', '96385074'), loggedAt: '2026-01-01T08:00:00Z' },
        { food: f('e-new', '96385074'), loggedAt: '2026-02-01T08:00:00Z' },
        { food: f('e-del', '12345670'), loggedAt: '2026-03-01T08:00:00Z', deleted: true },
      ],
    };
    expect(findLocalByBarcode('5000159484695', sources)).toMatchObject({ from: 'custom', food: { id: 'c1' } });
    // The deleted custom food is skipped; the recent one with the same product matches.
    expect(findLocalByBarcode('0737628064502', sources)).toMatchObject({ from: 'recent', food: { id: 'r1' } });
    expect(findLocalByBarcode('96385074', sources)).toMatchObject({ from: 'diary', food: { id: 'e-new' } });
    expect(findLocalByBarcode('12345670', sources)).toBeNull();
    expect(findLocalByBarcode('123', sources)).toBeNull();
  });
});

function checkOf(body: string): string {
  for (let d = 0; d <= 9; d++) if (hasValidCheckDigit(body + d)) return String(d);
  return 'x';
}

describe('local match for a missed item', () => {
  it('parses amounts', () => {
    expect(parseAmount('150 g rice')).toEqual({ count: null, grams: 150, rest: 'rice' });
    expect(parseAmount('2 eggs')).toEqual({ count: 2, grams: null, rest: 'eggs' });
    expect(parseAmount('banana')).toEqual({ count: null, grams: null, rest: 'banana' });
    expect(parseAmount('100g oats')).toEqual({ count: null, grams: 100, rest: 'oats' });
    expect(parseAmount('1,5 bananas')).toEqual({ count: 1.5, grams: null, rest: 'bananas' });
  });
  it('reads fractions as fractions, not as the first digit', () => {
    expect(parseAmount('1/2 avocado')).toEqual({ count: 0.5, grams: null, rest: 'avocado' });
    expect(parseAmount('½ avocado')).toEqual({ count: 0.5, grams: null, rest: 'avocado' });
    expect(parseAmount('¾ cup rice').count).toBe(0.75);
    expect(parseAmount('1 1/2 bananas')).toEqual({ count: 1.5, grams: null, rest: 'bananas' });
    expect(parseAmount('1½ bananas').count).toBe(1.5);
    expect(parseAmount('1/0 avocado')).toEqual({ count: null, grams: null, rest: '1/0 avocado' });
    const avocado = matchFoods('1/2 avocado', BUILTIN_FOODS)[0];
    expect(avocado.name.toLowerCase()).toContain('avocado');
    const half = foodToItem(avocado, '1/2 avocado');
    const whole = foodToItem(avocado, '1 avocado');
    expect(half.grams).toBe(Math.round(whole.grams / 2));
    // The bundled avocado's first serving is already half a fruit; a count is of whole fruit.
    expect(whole.grams).toBe(201);
    expect(half).toMatchObject({ grams: 101, kcal: Math.round(avocado.per100g.kcal * 1.01) });
  });
  it('finds bundled foods and scales to the typed amount', () => {
    const hits = matchFoods('banana', BUILTIN_FOODS);
    expect(hits[0]?.name.toLowerCase()).toContain('banana');
    const item = foodToItem(hits[0], '200 g banana');
    expect(item.grams).toBe(200);
    expect(item.kcal).toBe(Math.round(hits[0].per100g.kcal * 2));
    expect(matchFoods('   ', BUILTIN_FOODS)).toEqual([]);
    // A state word alone does not make a match.
    expect(matchFoods('raw', BUILTIN_FOODS)).toEqual([]);
  });

  it('offers the cooked reference food first for a cooked item, and the raw one for a raw item', () => {
    const grilled = matchFoods('Grilled chicken breast', BUILTIN_FOODS);
    expect(grilled[0].name).toMatch(/COOKED/i);
    const raw = matchFoods('raw chicken breast', BUILTIN_FOODS);
    expect(raw[0].name).toMatch(/RAW/i);
    const rice = matchFoods('White rice, cooked', BUILTIN_FOODS);
    expect(rice[0].name).toMatch(/cooked/i);
    expect(rice.slice(0, 2).every((f) => !/DRY|uncooked/i.test(f.name))).toBe(true);
    expect(matchFoods('avocado', BUILTIN_FOODS).some((f) => /apple/i.test(f.name))).toBe(false);
  });
});

describe('swapping a row to a database food', () => {
  const cauli = BUILTIN_FOODS.find((f) => /cauliflower/i.test(f.name))!;
  it('uses the food per gram at the current weight and can be undone', () => {
    const row = setRowGrams(makeRow(rice, 'detected'), 150);
    const swapped = swapRow(row, cauli);
    expect(swapped.food?.id).toBe(cauli.id);
    expect(swapped.item.name).toBe(cauli.name);
    expect(swapped.item.grams).toBe(150);
    expect(swapped.item.kcal).toBe(Math.round(cauli.per100g.kcal * 1.5));
    // The portion is still a guess: confidence stays.
    expect(swapped.item.confidence).toBe(0.7);
    const heavier = setRowGrams(swapped, 300);
    expect(heavier.item.kcal).toBe(Math.round(cauli.per100g.kcal * 3));
    const back = unswapRow(heavier);
    expect(back.food).toBeUndefined();
    expect(back.item).toMatchObject({ name: 'Rice', grams: 300, kcal: 390 });
  });
  it('keeps the original estimate across repeated swaps', () => {
    const other = BUILTIN_FOODS.find((f) => /white rice|rice, white|rice/i.test(f.name) && f.id !== cauli.id)!;
    const twice = swapRow(swapRow(makeRow(rice, 'detected'), cauli), other);
    expect(twice.food?.id).toBe(other.id);
    expect(unswapRow(twice).item).toMatchObject({ name: 'Rice', kcal: 260 });
  });
  it('renaming a swapped row returns it to an estimate under the new name', () => {
    const renamed = renameRow(swapRow(makeRow(rice, 'detected'), cauli), 'Fried rice');
    expect(renamed.food).toBeUndefined();
    expect(renamed.item).toMatchObject({ name: 'Fried rice', kcal: 260, grams: 200 });
  });
});

describe('logging reviewed rows', () => {
  let n = 0;
  const id = () => `id${++n}`;
  it('gives an estimate a definition that re-scales to the same numbers', () => {
    const food = aiFoodDefinition(rice, 'ai_x');
    expect(food).toMatchObject({ id: 'ai_x', source: 'ai', verified: false, servings: [{ label: '200 g', grams: 200 }] });
    expect(food.per100g.kcal).toBe(130);
    expect(food.per100g.protein).toBe(2.7);
  });
  it('logs estimates with range and definition, matched rows with the food per gram', () => {
    const cauli = BUILTIN_FOODS.find((f) => /cauliflower/i.test(f.name))!;
    const rows = [makeRow(rice, 'detected'), swapRow(makeRow(chicken, 'detected'), cauli), makeRow({ ...rice, name: '  ' }, 'added'), makeRow({ ...rice, grams: 0 }, 'added')];
    const items = rowsToLogItems(rows, id);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ name: 'Rice', source: 'ai', servingLabel: '200 g', quantity: 1, grams: 200, nutrients: { kcal: 260 }, confidence: 0.7 });
    expect(items[0].food?.id).toMatch(/^ai_id/);
    expect(items[0].kcalRange![0]).toBeLessThan(260);
    expect(items[0].kcalRange![1]).toBeGreaterThan(260);
    expect(items[1]).toMatchObject({ name: cauli.name, source: cauli.source, servingLabel: '1 g', quantity: 150, grams: 150, confidence: 1 });
    expect(items[1].food?.id).toBe(cauli.id);
  });
  it('logs a photo answer with the wider band on what the model read, the plain one on what the person added', () => {
    const rows = [makeRow(chicken, 'detected'), makeRow(chicken, 'added')];
    const items = rowsToLogItems(rows, id, true);
    expect(items[0].kcalRange).toEqual(itemRange(chicken, PHOTO_SPREAD));
    expect(items[0].kcalRange).toEqual([192, 304]);
    expect(items[1].kcalRange).toEqual(itemRange(chicken));
    expect(rowsToLogItems(rows, id)[0].kcalRange).toEqual([211, 285]);
  });
});

describe('re-estimate with a correction', () => {
  it('adds the correction after the original text', () => {
    expect(withCorrection('large plate', 'that is cauliflower rice')).toBe('large plate\nCorrection from the person who ate it: that is cauliflower rice');
    expect(withCorrection(undefined, 'no cheese')).toBe('Correction from the person who ate it: no cheese');
    expect(withCorrection('desc', '  ')).toBe('desc');
  });
  it('fits the 500-character limit and keeps the correction whole', () => {
    const out = withCorrection('x'.repeat(500), 'it was brown rice');
    expect(out.length).toBeLessThanOrEqual(500);
    expect(out.endsWith('it was brown rice')).toBe(true);
  });
});
