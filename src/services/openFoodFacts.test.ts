import { afterEach, describe, expect, it, vi } from 'vitest';

import { lookupBarcode, offToFood, searchProductsWithStatus, searchRequestUrl } from './openFoodFacts';

// openFoodFacts.ts imports only @/lib/nutrition and types, so nothing needs mocking.
const good = {
  code: '123456789012',
  product_name: '  Choc Bar ',
  brands: 'Acme, Other',
  nutriments: {
    'energy-kcal_100g': 520,
    proteins_100g: 6,
    carbohydrates_100g: 58,
    fat_100g: 29,
    fiber_100g: 3,
    sugars_100g: 50,
    'saturated-fat_100g': 17,
    sodium_100g: 0.08,
  },
  serving_size: '40 g',
  serving_quantity: 40,
};
const withN = (n: Record<string, number | string | undefined>, rest: object = {}) => ({
  ...good,
  ...rest,
  nutriments: { ...good.nutriments, ...n },
});

describe('offToFood mapping', () => {
  it('maps a complete product', () => {
    const f = offToFood(good)!;
    expect(f.id).toBe('off_123456789012');
    expect(f.name).toBe('Choc Bar');
    expect(f.brand).toBe('Acme');
    expect(f.barcode).toBe('123456789012');
    expect(f.source).toBe('openfoodfacts');
    expect(f.verified).toBe(false);
    expect(f.per100g).toEqual({ kcal: 520, protein: 6, carbs: 58, fat: 29, fiber: 3, sugar: 50, satFat: 17, sodium: 80 });
    expect(f.servings).toEqual([{ label: '1 serving (40 g)', grams: 40 }]);
  });
  it('sodium is grams on the label, milligrams in the app: 0.08 g -> 80 mg, 1.2 g -> 1200 mg', () => {
    expect(offToFood(good)!.per100g.sodium).toBe(80);
    expect(offToFood(withN({ sodium_100g: 1.2 }))!.per100g.sodium).toBe(1200);
  });
  it('missing sodium stays undefined, not 0', () => {
    expect(offToFood(withN({ sodium_100g: undefined }))!.per100g.sodium).toBeUndefined();
  });
  it('accepts numeric strings', () => {
    const f = offToFood(withN({ 'energy-kcal_100g': '520', proteins_100g: '6' }))!;
    expect(f.per100g.kcal).toBe(520);
    expect(f.per100g.protein).toBe(6);
  });
  it('falls back to the English name', () => {
    expect(offToFood({ ...good, product_name: '', product_name_en: 'Bar' })!.name).toBe('Bar');
  });
  it('serving label without serving_size, and absurd serving sizes ignored', () => {
    expect(offToFood({ ...good, serving_size: undefined })!.servings[0].label).toBe('1 serving');
    expect(offToFood({ ...good, serving_quantity: 5000 })!.servings).toEqual([]);
    expect(offToFood({ ...good, serving_quantity: 0 })!.servings).toEqual([]);
    expect(offToFood({ ...good, serving_quantity: '30' })!.servings[0].grams).toBe(30);
  });
});

describe('kJ fallback', () => {
  it('uses energy_100g (kJ) / 4.184 when kcal is absent: 2175 kJ -> 519.9 -> 520', () => {
    const f = offToFood(withN({ 'energy-kcal_100g': undefined, energy_100g: 2175 }))!;
    expect(f.per100g.kcal).toBe(520);
  });
  it('prefers kcal when both are present', () => {
    expect(offToFood(withN({ energy_100g: 100 }))!.per100g.kcal).toBe(520);
  });
  it('a kcal of 0 is a real value, not a missing one', () => {
    const f = offToFood(withN({ 'energy-kcal_100g': 0, energy_100g: 2175, proteins_100g: 0, carbohydrates_100g: 0, fat_100g: 0 }));
    expect(f!.per100g.kcal).toBe(0);
  });
  it('neither present -> null', () => {
    expect(offToFood(withN({ 'energy-kcal_100g': undefined }))).toBeNull();
  });
});

describe('rejection of unusable or inconsistent data', () => {
  it.each([
    ['no name', { product_name: '   ', product_name_en: undefined }],
    ['no code', { code: undefined }],
  ])('%s -> null', (_n, rest) => expect(offToFood({ ...good, ...rest })).toBeNull());

  it.each(['proteins_100g', 'carbohydrates_100g', 'fat_100g'])('missing %s -> null', (k) => {
    expect(offToFood(withN({ [k]: undefined }))).toBeNull();
  });
  it('negative or non-numeric values count as missing', () => {
    expect(offToFood(withN({ proteins_100g: -1 }))).toBeNull();
    expect(offToFood(withN({ fat_100g: 'abc' }))).toBeNull();
    expect(offToFood(withN({ carbohydrates_100g: NaN }))).toBeNull();
  });
  it('macros over 101 g per 100 g are impossible -> null', () => {
    expect(offToFood(withN({ proteins_100g: 50, carbohydrates_100g: 50, fat_100g: 2 }))).toBeNull(); // 102
    // 101 exactly is tolerated (rounding on labels); kcal 4*50+4*50+9*1 = 409
    expect(offToFood(withN({ 'energy-kcal_100g': 409, proteins_100g: 50, carbohydrates_100g: 50, fat_100g: 1 }))).not.toBeNull();
  });
  it('more than 905 kcal per 100 g exceeds pure fat -> null', () => {
    expect(offToFood(withN({ 'energy-kcal_100g': 906, proteins_100g: 0, carbohydrates_100g: 0, fat_100g: 100 }))).toBeNull();
    expect(offToFood(withN({ 'energy-kcal_100g': 900, proteins_100g: 0, carbohydrates_100g: 0, fat_100g: 100 }))).not.toBeNull();
  });
  it('kcal far below the Atwater value is rejected: macros imply 520, label says 200 (< 55%)', () => {
    // 6*4 + 58*4 + 29*9 = 24+232+261 = 517
    expect(offToFood(withN({ 'energy-kcal_100g': 200 }))).toBeNull();
    expect(offToFood(withN({ 'energy-kcal_100g': 284 }))).toBeNull(); // 517*0.55 = 284.35
    expect(offToFood(withN({ 'energy-kcal_100g': 285 }))).not.toBeNull();
  });
  it('kcal far above the Atwater value is rejected (> 160%)', () => {
    // 517 * 1.6 = 827.2
    expect(offToFood(withN({ 'energy-kcal_100g': 828 }))).toBeNull();
    expect(offToFood(withN({ 'energy-kcal_100g': 827 }))).not.toBeNull();
  });
  it('the consistency check is skipped when the macros imply 40 kcal or less (water, diet drinks)', () => {
    const f = offToFood(withN({ 'energy-kcal_100g': 90, proteins_100g: 1, carbohydrates_100g: 2, fat_100g: 0.2 }));
    // implied 4+8+1.8 = 13.8 kcal; the label says 90, which is not checked
    expect(f).not.toBeNull();
  });
  it('alcohol-style products (kcal above macros) pass up to 1.6x', () => {
    // beer-like: macros imply 3*4 + 0 = 12 (skipped); wine-ish: 0.1+2.6*4 = ~10; use spirits-ish with some carbs
    const f = offToFood(withN({ 'energy-kcal_100g': 150, proteins_100g: 0, carbohydrates_100g: 10, fat_100g: 0 }));
    // implied 40 -> not above the 40 threshold, so accepted
    expect(f).not.toBeNull();
  });
});

describe('search service response shape', () => {
  it('accepts brands as a list, which is how the search service returns them', () => {
    const food = offToFood({ ...good, brands: ['Acme', 'Other'] });
    expect(food?.brand).toBe('Acme');
  });
});

describe('name fallback order: product_name, product_name_he, product_name_en, generic_name', () => {
  const all = { product_name: 'Main', product_name_he: 'עברית', product_name_en: 'English', generic_name: 'Generic' };
  it('takes the first one present', () => {
    expect(offToFood({ ...good, ...all })!.name).toBe('Main');
    expect(offToFood({ ...good, ...all, product_name: '' })!.name).toBe('עברית');
    expect(offToFood({ ...good, ...all, product_name: '', product_name_he: '' })!.name).toBe('English');
    expect(offToFood({ ...good, ...all, product_name: '', product_name_he: '', product_name_en: '' })!.name).toBe('Generic');
  });
  it('a product with only product_name_he (main language en, Hebrew name only) is found', () => {
    const f = offToFood({ ...good, product_name: '', product_name_he: ' טורטית ', brands: 'עלית' })!;
    expect(f.name).toBe('טורטית');
    expect(f.brand).toBe('עלית');
  });
  it('a product without a Hebrew name keeps the English fallback it had', () => {
    expect(offToFood({ ...good, product_name: '', product_name_en: 'Bar', generic_name: 'Chocolate bar' })!.name).toBe('Bar');
  });
  it('a product with only a generic name is found by it', () => {
    expect(offToFood({ ...good, product_name: undefined, generic_name: 'חטיף בוטנים' })!.name).toBe('חטיף בוטנים');
  });
});

/** A fetch stand-in that answers each call from the list in turn and records the URLs. */
function fakeFetch(answers: (object | number | 'offline')[]) {
  const urls: string[] = [];
  const fn = vi.fn(async (url: string) => {
    urls.push(url);
    const a = answers[urls.length - 1] ?? { hits: [] };
    if (a === 'offline') throw new TypeError('Network request failed');
    if (typeof a === 'number') return { ok: false, status: a, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => a };
  });
  vi.stubGlobal('fetch', fn);
  return urls;
}
afterEach(() => vi.unstubAllGlobals());

const TODAY_FIELDS = 'code,product_name,product_name_en,brands,nutriments,serving_size,serving_quantity,quantity';
const NEW_FIELDS = `${TODAY_FIELDS},product_name_he,generic_name`;

describe('the incomplete message of the scanner uses the same names', () => {
  const noKcal = { ...good, nutriments: { proteins_100g: 1 } };
  it.each([
    [{ product_name: 'שוקו' }, 'שוקו'],
    [{ product_name: '', product_name_he: 'ממרח סויה' }, 'ממרח סויה'],
    [{ product_name: undefined, product_name_en: 'Choco' }, 'Choco'],
    [{ product_name: undefined, generic_name: 'Cocoa drink' }, 'Cocoa drink'],
    [{ product_name: undefined }, 'This product'],
  ])('%j -> %s', async (names, name) => {
    const urls = fakeFetch([{ status: 1, product: { ...noKcal, ...names } }]);
    expect(await lookupBarcode('7290001648285')).toEqual({ status: 'incomplete', name });
    expect(urls).toEqual([`https://world.openfoodfacts.org/api/v2/product/7290001648285.json?fields=${NEW_FIELDS}`]);
  });
  it('a product found only through product_name_he', async () => {
    fakeFetch([{ status: 1, product: { ...good, code: undefined, product_name: '', product_name_he: 'טורטית' } }]);
    const r = await lookupBarcode('7290106658479');
    expect(r.status).toBe('found');
    expect(r.status === 'found' && r.food.name).toBe('טורטית');
  });
});

describe('the search request a phone sends', () => {
  it('a query without a Hebrew letter is byte for byte the request sent before Hebrew support', () => {
    // Literally the URL built by the previous code: `${SEARCH}?q=${encodeURIComponent(q)}&page_size=${limit}&fields=${FIELDS}`.
    expect(searchRequestUrl('greek yogurt', 24)).toBe(`https://search.openfoodfacts.org/search?q=greek%20yogurt&page_size=24&fields=${TODAY_FIELDS}`);
    for (const q of ['cottage cheese (5%', 'Crème brûlée', 'coke', 'title:x OR *', '100% juice']) {
      expect(searchRequestUrl(q, 24)).toBe(`https://search.openfoodfacts.org/search?q=${encodeURIComponent(q)}&page_size=24&fields=${TODAY_FIELDS}`);
    }
  });
  it('a Hebrew query is a field query sorted by popularity, with the name fallbacks', () => {
    const q = '(product_name.main:במבה* OR product_name.en:במבה* OR brands:במבה*)';
    expect(searchRequestUrl('במבה', 24)).toBe(`https://search.openfoodfacts.org/search?q=${encodeURIComponent(q)}&page_size=24&fields=${NEW_FIELDS}&sort_by=-popularity_key`);
  });
  it("the fallback is today's free-text form of the plain query", () => {
    expect(searchRequestUrl('קרמבו', 24, true)).toBe(`https://search.openfoodfacts.org/search?q=${encodeURIComponent('קרמבו')}&page_size=24&fields=${TODAY_FIELDS}`);
  });
  it('a Hebrew query that leaves no word is sent as free text', () => {
    expect(searchRequestUrl('ב ו', 24)).toBe(`https://search.openfoodfacts.org/search?q=${encodeURIComponent('ב ו')}&page_size=24&fields=${TODAY_FIELDS}`);
  });
});

describe('searchProductsWithStatus: one request, and one fallback only when a field query finds nothing usable', () => {
  const usable = { ...good, product_name: 'במבה' };
  const unusable = { ...good, nutriments: {} };
  it('English: one request, the URL unchanged', async () => {
    const urls = fakeFetch([{ hits: [] }]);
    const r = await searchProductsWithStatus('  greek yogurt ', 24);
    expect(r).toEqual({ foods: [], failed: false, unavailable: false });
    expect(urls).toEqual([searchRequestUrl('greek yogurt', 24)]);
  });
  it('Hebrew with a usable product: one request', async () => {
    const urls = fakeFetch([{ hits: [usable] }]);
    const r = await searchProductsWithStatus('במבה', 24);
    expect(r.foods.map((f) => f.name)).toEqual(['במבה']);
    expect(urls).toEqual([searchRequestUrl('במבה', 24)]);
  });
  it('Hebrew with nothing usable: the free-text request once more', async () => {
    const urls = fakeFetch([{ hits: [unusable] }, { hits: [usable] }]);
    const r = await searchProductsWithStatus('קרמבו', 24);
    expect(r.foods).toHaveLength(1);
    expect(urls).toEqual([searchRequestUrl('קרמבו', 24), searchRequestUrl('קרמבו', 24, true)]);
  });
  it('Hebrew with nothing at all, twice: no third request, no failure', async () => {
    const urls = fakeFetch([{ hits: [] }, { hits: [] }]);
    expect(await searchProductsWithStatus('קרמבו', 24)).toEqual({ foods: [], failed: false, unavailable: false });
    expect(urls).toHaveLength(2);
  });
  it('a field query the service refuses (HTTP 500) falls back to free text', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const urls = fakeFetch([500, { hits: [usable] }]);
    const r = await searchProductsWithStatus('במבה', 24);
    expect(r.foods).toHaveLength(1);
    expect(urls).toHaveLength(2);
  });
  it('offline: one request, reported as failed', async () => {
    const urls = fakeFetch(['offline']);
    expect(await searchProductsWithStatus('במבה', 24)).toEqual({ foods: [], failed: true, unavailable: false });
    expect(urls).toHaveLength(1);
  });
  it('English that finds nothing never asks twice', async () => {
    const urls = fakeFetch([{ hits: [unusable] }]);
    await searchProductsWithStatus('krembo', 24);
    expect(urls).toHaveLength(1);
  });
  it('under two characters asks nothing', async () => {
    const urls = fakeFetch([]);
    await searchProductsWithStatus(' ב ', 24);
    expect(urls).toHaveLength(0);
  });
});

describe("the second review's cases (lead's decision D5)", () => {
  const usable = { ...good, product_name: 'במבה' };
  it('a product named only with spaces keeps its Hebrew name, in search and at the scanner', async () => {
    expect(offToFood({ ...good, product_name: '   ', product_name_he: 'במבה' })!.name).toBe('במבה');
    expect(offToFood({ ...good, product_name: '   ', product_name_en: 'Bamba' })!.name).toBe('Bamba');
    fakeFetch([{ status: 1, product: { product_name: '  ', product_name_he: 'במבה', nutriments: {} } }]);
    expect(await lookupBarcode('7290000066318')).toEqual({ status: 'incomplete', name: 'במבה' });
  });
  it('a word with a geresh is sent whole: ג\'חנון never as חנון', () => {
    const url = decodeURIComponent(searchRequestUrl("ג'חנון", 24));
    expect(url).toContain('product_name.main:ג׳חנון*');
    expect(url).toContain('product_name.main:גחנון*');
    expect(url).not.toMatch(/:חנון\*/);
  });
  it('a long query is cut to 80 characters on the phone, as the function cuts it', () => {
    const long = 'x'.repeat(200);
    expect(searchRequestUrl(long, 24)).toBe(`https://search.openfoodfacts.org/search?q=${'x'.repeat(80)}&page_size=24&fields=${TODAY_FIELDS}`);
    expect(searchRequestUrl(`חלב ${'א'.repeat(5000)}`, 24, true).length).toBeLessThan(700);
    expect(decodeURIComponent(searchRequestUrl(`חלב ${'א'.repeat(5000)}`, 24)).length).toBeLessThan(900);
  });
  it('a first answer that leaves no time for the fallback is a failure, not "no matches"', async () => {
    let now = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    const urls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        urls.push(url);
        now += 9_500;
        return { ok: true, status: 200, json: async () => ({ hits: [] }) };
      }),
    );
    expect(await searchProductsWithStatus('קרמבו', 24)).toEqual({ foods: [], failed: true, unavailable: false });
    expect(urls).toHaveLength(1);
    vi.restoreAllMocks();
  });
  it('a body that is not JSON, null, or without a list of hits is a failure', async () => {
    for (const q of ['במבה', 'bamba']) {
      vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => JSON.parse('<html>') })));
      expect(await searchProductsWithStatus(q, 24), q).toEqual({ foods: [], failed: true, unavailable: false });
      vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => null })));
      expect(await searchProductsWithStatus(q, 24), q).toEqual({ foods: [], failed: true, unavailable: false });
      fakeFetch([{ products: [usable] }]);
      expect(await searchProductsWithStatus(q, 24), q).toEqual({ foods: [], failed: true, unavailable: false });
    }
  });
  it('an empty list of hits is still "no matches"', async () => {
    fakeFetch([{ hits: [] }]);
    expect(await searchProductsWithStatus('bamba', 24)).toEqual({ foods: [], failed: false, unavailable: false });
  });
});
