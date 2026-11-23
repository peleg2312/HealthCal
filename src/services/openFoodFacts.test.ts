import { readFileSync } from 'node:fs';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { lookupBarcode, offBeverage, offToFood, packMl, searchProductsWithStatus, searchRequestUrl, toFoods } from './openFoodFacts';

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

/** The fields a free-text search asked for before the drinks in the diary counted in Water. */
const BEFORE_FIELDS = 'code,product_name,product_name_en,brands,nutriments,serving_size,serving_quantity,quantity';
/** Both lists now end with the categories, which say whether a product is a drink (`offBeverage`). */
const TODAY_FIELDS = `${BEFORE_FIELDS},categories_tags`;
const NEW_FIELDS = `${BEFORE_FIELDS},product_name_he,generic_name,categories_tags`;

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
  it('a query without a Hebrew letter is byte for byte the request sent before Hebrew support, with categories_tags added to its fields', () => {
    // Literally the URL built by the previous code: `${SEARCH}?q=${encodeURIComponent(q)}&page_size=${limit}&fields=${FIELDS}`,
    // whose field list now ends with categories_tags (a field asked for changes what comes back, not what is found).
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

describe('the food-search function asks for the same fields as the phones', () => {
  it('its FIELDS and TEXT_FIELDS are the app\'s, categories_tags included', () => {
    const read = (f: string) => readFileSync(path.join(__dirname, f), 'utf8');
    const lists = (src: string) => ['FIELDS', 'TEXT_FIELDS'].map((k) => src.match(new RegExp(`^const ${k} = '([^']+)';$`, 'm'))?.[1]);
    const app = lists(read('openFoodFacts.ts'));
    expect(app).toEqual([NEW_FIELDS, TODAY_FIELDS]);
    expect(lists(read('../../supabase/functions/food-search/index.ts'))).toEqual(app);
  });
});

describe('offBeverage: whether a product is a drink, from its categories', () => {
  it('no categories (missing, empty, not a list): not known', () => {
    expect(offBeverage(undefined)).toBeUndefined();
    expect(offBeverage(null)).toBeUndefined();
    expect(offBeverage([])).toBeUndefined();
    expect(offBeverage('en:beverages' as never)).toBeUndefined();
    expect(offBeverage([3, null] as never)).toBeUndefined();
  });
  it.each([
    [['en:beverages', 'en:energy-drinks'], true],
    [['en:soft-drinks'], true],
    [['en:dietary-supplements', 'en:protein-shakes'], true],
    [['en:dairies', 'en:milks'], true],
    [['en:beverages', 'en:waters', 'en:mineral-waters'], true],
    [['en:beverages', 'en:teas', 'en:tea-based-beverages', 'en:iced-teas'], true],
    [['en:beverages', 'en:coffee-drinks', 'en:iced-coffees'], true],
    [['en:beverages', 'en:syrups'], false],
    [['en:beverages', 'en:coffees', 'en:instant-beverages', 'en:instant-coffees'], false],
    [['en:beverages', 'en:coffees'], false],
    [['en:beverages', 'en:teas'], false],
    [['en:protein-shakes', 'en:protein-powders'], false],
    [['en:beverages', 'en:alcoholic-beverages', 'en:beers'], false],
    [['en:beverages', 'en:wines'], false],
    [['en:beverages', 'en:spirits'], false],
    [['en:meals', 'en:soups'], false],
    [['en:condiments', 'en:sauces', 'en:soy-sauces'], false],
    [['en:desserts', 'en:ice-creams'], false],
    [['en:dairies'], false],
  ])('%j -> %s', (tags, want) => {
    expect(offBeverage(tags)).toBe(want);
  });
  it('offToFood sets beverage only from a non-empty list, and never stores the categories', () => {
    expect(offToFood(good)!).not.toHaveProperty('beverage');
    expect(offToFood({ ...good, categories_tags: [] })!).not.toHaveProperty('beverage');
    expect(offToFood({ ...good, categories_tags: ['en:snacks'] })!.beverage).toBe(false);
    const drink = offToFood({ ...good, categories_tags: ['en:beverages'] })!;
    expect(drink.beverage).toBe(true);
    expect(drink).not.toHaveProperty('categories_tags');
  });
});

describe('packMl: the one volume of a pack', () => {
  it.each([
    ['500 ml', 500],
    ['500ml', 500],
    ['0,5 l', 500],
    ['0,5L', 500],
    ['0.33l', 330],
    ['33 cl', 330],
    ['750 mL', 750],
    ['1 Liter', null],
    ['1,5 l', null],
    ['1.5l', null],
    ['2000ml', null],
    ['6 x 330 ml', null],
    ['6 x 150 ml', null],
    ['3 * 200 ml', null],
    ['4×250ml', null],
    ['16.9 fl oz', 500],
    ['12 fl oz', 355],
    ['32 FL. OZ.', null],
    ['473 ml, 16 fl oz', 473],
    ['16 OZ (473 mL)', 473],
    ['5 fl oz (148 ml)', 148],
    ['500 ml (1 l)', null],
    ['4 oz', null],
    ['250 g', null],
    ['1', null],
    ['', null],
    ['Отличное', null],
  ])('%j -> %s', (q, want) => {
    expect(packMl(q)).toBe(want);
  });
  it('not a string: none', () => {
    expect(packMl(undefined)).toBeNull();
    expect(packMl(500)).toBeNull();
  });
  it('a drink found by search with a one-person pack gets "<n> ml" at n grams; its own serving, a big pack or a non-drink gets none', () => {
    const can = { ...good, serving_size: undefined, serving_quantity: undefined, quantity: '0,5 l', categories_tags: ['en:beverages', 'en:energy-drinks'] };
    expect(offToFood(can)!.servings).toEqual([{ label: '500 ml', grams: 500 }]);
    expect(offToFood({ ...can, quantity: '1,5 l' })!.servings).toEqual([]);
    expect(offToFood({ ...can, quantity: '6 x 330 ml' })!.servings).toEqual([]);
    expect(offToFood({ ...can, categories_tags: ['en:sauces'] })!.servings).toEqual([]);
    expect(offToFood({ ...can, categories_tags: undefined })!.servings).toEqual([]);
    // A scanned drink keeps its own serving and gets no second one.
    expect(offToFood({ ...can, serving_size: '250 ml', serving_quantity: 250 })!.servings).toEqual([{ label: '1 serving (250 ml)', grams: 250 }]);
  });
});

/**
 * The real products of __fixtures__/off-drinks.tsv (the answers of Open Food Facts' own search and barcode
 * endpoints, with a hand-judged "is it a drink" column). The numbers below are measured, not hoped for:
 * a change to the rule that moves one of them must say why.
 */
describe('the drink rule on 178 real products (off-drinks.tsv)', () => {
  const rows = readFileSync(path.join(__dirname, '__fixtures__', 'off-drinks.tsv'), 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => {
      const [src, code, drink, quantity, kcal, kj, protein, carbs, fat, servingQuantity, name, tags] = l.split('\t');
      const nutriments: Record<string, string> = {};
      if (kcal) nutriments['energy-kcal_100g'] = kcal;
      if (kj) nutriments['energy_100g'] = kj;
      if (protein) nutriments.proteins_100g = protein;
      if (carbs) nutriments.carbohydrates_100g = carbs;
      if (fat) nutriments.fat_100g = fat;
      const categories_tags = tags === '(none)' ? undefined : tags === '(empty)' ? [] : tags.split(',');
      const food = offToFood({ code, product_name: name, quantity: quantity || undefined, serving_quantity: servingQuantity || undefined, nutriments, categories_tags });
      return { src, code, name, quantity, drink: drink === 'yes', food };
    });
  const shown = rows.filter((r) => r.food);
  /** The diary's cap for a food that is not bundled (src/features/drinks/diary.ts): at most 150 kcal per 100 ml. */
  const counts = (r: (typeof shown)[number]) => r.food!.beverage === true && r.food!.per100g.kcal <= 150;
  const tally = (list: typeof shown) => ({
    drinks: list.filter((r) => r.drink).length,
    caught: list.filter((r) => r.drink && r.food!.beverage === true).length,
    others: list.filter((r) => !r.drink).length,
    wrong: list.filter((r) => !r.drink && r.food!.beverage === true).length,
    wrongAfterCap: list.filter((r) => !r.drink && counts(r)).length,
  });

  it('reads every row; 141 of the 178 products are ones the app would show', () => {
    expect(rows).toHaveLength(178);
    expect(shown).toHaveLength(141);
  });

  it("the critic's 14 searches: 22 of 34 drinks caught; 2 non-drinks tagged a drink, 0 after the 150 kcal cap", () => {
    expect(tally(shown.filter((r) => r.src.startsWith('q')))).toEqual({ drinks: 34, caught: 22, others: 50, wrong: 2, wrongAfterCap: 0 });
  });

  it('all of them: 77 of 90 drinks caught; 3 of 51 non-drinks tagged a drink, 0 after the cap', () => {
    expect(tally(shown)).toEqual({ drinks: 90, caught: 77, others: 51, wrong: 3, wrongAfterCap: 0 });
  });

  it('names every product on the wrong side', () => {
    // Drinks the rule misses: 12 have no categories at all (4 Israeli milks, 7 drinking yogurts, 1 Monster
    // can), and one iced tea is tagged only as tea (en:teas, without en:iced-teas), like tea bags.
    expect(shown.filter((r) => r.drink && r.food!.beverage !== true).map((r) => `${r.code} ${r.name} (${r.food!.beverage})`)).toEqual([
      '0070847000303 Monster Energy (undefined)',
      '7290000042435 חלב טרי (undefined)',
      '7290110328887 חלב תנובה 3% (undefined)',
      '7290110327033 חלב סויה מועשר בחלבון (undefined)',
      '7290000051352 חלב בטעם של פעם 3.8 אחוז (undefined)',
      '4971777296919 Drinking Yogurt (undefined)',
      '6923644287412 Drinking Yogurt (undefined)',
      '4893318070515 Drinking Yogurt (undefined)',
      '8718166007307 Yoggi drinking yogurt (undefined)',
      '5901939103259 Skyr drinking yogurt (undefined)',
      '4710088432933 Original Drinking Yogurt (undefined)',
      '5710326020655 Protein drinking yogurt (undefined)',
      '0613008725693 Arizona iced tea (false)',
    ]);
    // Not drinks the categories call one: two protein powders and an iced tea mix, all far above 150 kcal per 100 g.
    expect(shown.filter((r) => !r.drink && r.food!.beverage === true).map((r) => `${r.code} ${r.name} ${r.food!.per100g.kcal}`)).toEqual([
      '0000390204071 Isagenix 403',
      '390204071 Isagenix 403',
      '0041303056608 Iced tea 407',
    ]);
  });

  it('which drinks get a serving from the pack, and which do not', () => {
    const withPack = shown.filter((r) => r.food!.servings.some((s) => / ml$/.test(s.label)));
    expect(withPack.map((r) => `${r.code} ${r.food!.servings[0].label}`)).toEqual([
      '0070847891857 473 ml', // Monster Ultra, "473 ml, 16 fl oz"
      '5060947543607 355 ml', // Monster, "355ml"
      '57045399 500 ml',
      '0049000004632 355 ml',
      '4890008101306 330 ml',
      '3948764012273 750 ml', // the largest pack that still counts
      '6415600567220 330 ml',
      '8850389301012 180 ml',
      '4000349860125 275 ml',
      '9310232953618 600 ml',
      '9342584072280 600 ml',
      '9310199080839 750 ml',
      '9311336030069 500 ml',
      '5056379505863 330 ml',
      '0888849008100 325 ml',
      '0643843717157 340 ml', // "11.5 fl oz"
      '0020601407893 473 ml', // "16 OZ (473 mL)"
      '0012000142451 500 ml', // "16.9 fl oz"
      '5285000327356 320 ml',
      '0012000112454 500 ml',
      '01275900 355 ml', // "12 fl oz"
      '0613008730697 500 ml',
      '5038862100304 330 ml',
      '0067311020110 300 ml',
      '2000000139590 200 ml',
      '0077484030100 118 ml',
      '20384739 500 ml', // "0,5 l"
      '0041508800129 750 ml',
      '07478545 750 ml',
    ]);
    // Only drinks ever get one, and never a product with a serving of its own.
    expect(withPack.every((r) => r.food!.beverage === true && r.food!.servings.length === 1)).toBe(true);
    const none = shown.filter((r) => r.food!.beverage === true && !r.food!.servings.length);
    // Drinks left to be logged by weight: 20 name no pack size at all, and these name one that is not one drink
    // (above 750 ml, a multipack, a weight, or no unit).
    expect(none.filter((r) => !r.quantity)).toHaveLength(20);
    expect(none.filter((r) => r.quantity).map((r) => r.quantity)).toEqual([
      '1',
      '1.5 L',
      '1.8l',
      '2.2 oz',
      '2.2 oz',
      '250 g',
      '375 g',
      '64 Fl Oz (2QT.) 1.89 L',
      '6 x 150 ml',
      '1 Gal (3.78 L)',
      '1/2 Gallon 64 fl oz.',
      '1 l',
      '1.75 L',
      '1.75L',
      '64 Fl Oz (2QT.) 1.89 L',
      '4 oz',
      '12',
      '11.5 oz',
      '1l',
      '1 Litre',
      '64 fl oz',
      '1,5 l',
      '28 fl oz',
      '6L',
      '1.5l',
      '1.5 l',
      'Отличное',
      '2000ml',
    ]);
  });
});

describe('toFoods: one per name and brand, the one filed under beverages kept', () => {
  const product = (code: string, name: string, beverage?: boolean) => ({
    ...good,
    code,
    product_name: name,
    brands: 'Monster',
    serving_size: undefined,
    serving_quantity: undefined,
    nutriments: { 'energy-kcal_100g': 45, proteins_100g: 0, carbohydrates_100g: 11, fat_100g: 0 },
    ...(beverage === undefined ? {} : { categories_tags: beverage ? ['en:beverages', 'en:energy-drinks'] : ['en:snacks'] }),
  });
  const ids = (foods: { id: string }[]) => foods.map((f) => f.id);

  it('an untagged product first: the tagged one later takes its place', () => {
    const got = toFoods([product('1', 'Monster'), product('2', 'Other drink', true), product('3', 'Monster', true), product('4', 'Monster', true)]);
    expect(ids(got)).toEqual(['off_3', 'off_2']);
    expect(got[0].beverage).toBe(true);
  });

  it('the tagged product first: kept, the untagged one and a "false" one after it dropped', () => {
    expect(ids(toFoods([product('3', 'Monster', true), product('2', 'Other drink', true), product('1', 'Monster'), product('5', 'MONSTER', false)]))).toEqual(['off_3', 'off_2']);
  });

  it('a "false" product first gives way to a tagged one; among equals the first is kept', () => {
    expect(ids(toFoods([product('5', 'Monster', false), product('3', 'Monster', true)]))).toEqual(['off_3']);
    expect(ids(toFoods([product('1', 'Monster'), product('5', 'Monster', false)]))).toEqual(['off_1']);
    expect(ids(toFoods([product('3', 'Monster', true), product('4', 'Monster', true)]))).toEqual(['off_3']);
  });

  it('a list with no collisions is unchanged, in its order', () => {
    const list = [product('1', 'A'), product('2', 'B', true), product('3', 'C', false), product('4', 'D')];
    expect(toFoods(list)).toEqual(list.map((p) => offToFood(p)));
  });
});
