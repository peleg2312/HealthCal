import { describe, expect, it } from 'vitest';

import { offSearchQuery as fnQuery, usableHit } from '../../supabase/functions/food-search/query';
import { offSearchQuery } from './offQuery';
import { offToFood } from './openFoodFacts';

const clause = (w: string) => `(product_name.main:${w}* OR product_name.en:${w}* OR brands:${w}*)`;
const field = (...words: string[]) => ({ q: words.map(clause).join(' AND '), sortBy: '-popularity_key' });

/** Every character the specification names as reserved (6.1.5), and the geresh forms. */
const RESERVED = ['+', '-', '&', '|', '!', '(', ')', '{', '}', '[', ']', '^', '"', '~', '*', '?', ':', '\\', '/', '=', '<', '>', '%', "'", '׳', '״', '’', '`'];

/** The queries both copies must agree on: Hebrew, Latin, mixed, every reserved character, and the named edge cases. */
const QUERIES = [
  'במבה',
  'חלב 3%',
  'חומוס עם טחינה',
  'ו חומוס',
  'ב',
  "קוטג'",
  'קוטג׳ 5%',
  'תפו"א',
  'שוקולד פרה',
  'קפה עלית',
  'לחם אחיד פרוס דק מלא שיפון עם',
  'אחת שתיים שלוש ארבע חמש שש שבע',
  'חוּמוּס',
  'שׁניצל',
  'יוגורט AND דנונה',
  'במבה OR ביסלי NOT',
  'cottage קוטג',
  'פתיתים',
  'חטיף 50 גרם',
  'װופל',
  'greek yogurt',
  'cottage cheese (5%',
  'bamba',
  'Crème brûlée',
  'coke zero',
  'a',
  '',
  '   ',
  ...RESERVED.map((c) => `שוקו${c}לד`),
];

describe('offSearchQuery: queries without a Hebrew letter are unchanged', () => {
  it.each(['greek yogurt', 'cottage cheese (5%', 'bamba', 'Crème brûlée', 'title:x OR *', 'a', '', '   '])('%j', (q) => {
    expect(offSearchQuery(q)).toEqual({ q });
  });
});

describe('offSearchQuery: a Hebrew letter makes a field query from whitelisted words', () => {
  it('one word, with a prefix wildcard and the popularity order', () => {
    expect(offSearchQuery('במבה')).toEqual(field('במבה'));
  });
  it('a percent sign and a lone digit only separate: "חלב 3%"', () => {
    expect(offSearchQuery('חלב 3%')).toEqual(field('חלב'));
  });
  it('a stop word is dropped: "חומוס עם טחינה"', () => {
    expect(offSearchQuery('חומוס עם טחינה')).toEqual(field('חומוס', 'טחינה'));
  });
  it('את and של are stop words too', () => {
    expect(offSearchQuery('שוקולד של עלית את')).toEqual(field('שוקולד', 'עלית'));
  });
  it('a stray one-letter word is dropped: "ו חומוס"', () => {
    expect(offSearchQuery('ו חומוס')).toEqual(field('חומוס'));
  });
  it('a lone ב leaves nothing, so the free-text form is returned', () => {
    expect(offSearchQuery('ב')).toEqual({ q: 'ב' });
  });
  it('empty after cleaning returns the free-text form unchanged', () => {
    expect(offSearchQuery('ב ו % ?')).toEqual({ q: 'ב ו % ?' });
    expect(offSearchQuery('עם של')).toEqual({ q: 'עם של' });
  });
  it('at most six words', () => {
    expect(offSearchQuery('אחת שתיים שלוש ארבע חמש שש שבע')).toEqual(field('אחת', 'שתיים', 'שלוש', 'ארבע', 'חמש', 'שש'));
  });
  it('a repeated word is sent once', () => {
    expect(offSearchQuery('במבה במבה')).toEqual(field('במבה'));
  });
  it('final letters stay as typed, since product names use them', () => {
    expect(offSearchQuery('פתיתים')).toEqual(field('פתיתים'));
  });
  it('the geresh separates, so the prefix still finds every spelling', () => {
    expect(offSearchQuery("קוטג'")).toEqual(field('קוטג'));
    expect(offSearchQuery('קוטג׳ 5%')).toEqual(field('קוטג'));
  });
  it('gershayim splits an abbreviation into its parts, and a one-letter part is dropped', () => {
    expect(offSearchQuery('תפו"א')).toEqual(field('תפו'));
  });
  it('vowel points are removed, and a pointed presentation form becomes its letter', () => {
    expect(offSearchQuery('חוּמוּס')).toEqual(field('חומוס'));
    expect(offSearchQuery('שׁניצל')).toEqual(field('שניצל'));
  });
  it('a Yiddish ligature is spelled out', () => {
    expect(offSearchQuery('װופל')).toEqual(field('ווופל'));
  });
  it('Latin words in a Hebrew query are lower-cased and kept; AND, OR and NOT as words are dropped', () => {
    expect(offSearchQuery('יוגורט AND דנונה')).toEqual(field('יוגורט', 'דנונה'));
    expect(offSearchQuery('במבה OR ביסלי NOT')).toEqual(field('במבה', 'ביסלי'));
    expect(offSearchQuery('Cottage קוטג')).toEqual(field('cottage', 'קוטג'));
    expect(offSearchQuery('חטיף 50 גרם')).toEqual(field('חטיף', '50', 'גרם'));
  });
  it.each(RESERVED)('the reserved character %j only separates words', (c) => {
    expect(offSearchQuery(`שוקו${c}לד`)).toEqual(field('שוקו', 'לד'));
  });
  it('no built query holds anything but the clause syntax and whitelisted words', () => {
    for (const q of QUERIES) {
      const built = offSearchQuery(q);
      if (!built.sortBy) continue;
      const rest = built.q
        .split(' AND ')
        .map((c) => c.replace(/^\(product_name\.main:([א-תa-z0-9]+)\* OR product_name\.en:\1\* OR brands:\1\*\)$/, ''));
      expect(rest.every((r) => r === ''), q).toBe(true);
      expect(built.q.includes(':*'), q).toBe(false);
    }
  });
});

describe('the edge function builds the same query (supabase/functions/food-search/query.ts)', () => {
  it(`agrees on all ${QUERIES.length} queries`, () => {
    expect(QUERIES.length).toBeGreaterThanOrEqual(40);
    for (const q of QUERIES) expect(fnQuery(q), q).toEqual(offSearchQuery(q));
  });
});

describe("usableHit (the function's fallback test) agrees with offToFood", () => {
  const base = {
    code: '7290000066318',
    product_name: 'במבה',
    nutriments: { 'energy-kcal_100g': 543, proteins_100g: 16, carbohydrates_100g: 51, fat_100g: 30 } as Record<string, number | string | undefined>,
  };
  const names = [
    {},
    { product_name: '' },
    { product_name: '  ', product_name_he: 'טורטית' },
    { product_name: '', product_name_en: 'Bamba' },
    { product_name: '', generic_name: 'חטיף בוטנים' },
    { product_name: undefined },
    { code: undefined },
  ];
  const nutriments: Record<string, number | string | undefined>[] = [
    {},
    { 'energy-kcal_100g': undefined },
    { 'energy-kcal_100g': undefined, energy_100g: 2272 },
    { 'energy-kcal_100g': '543', proteins_100g: '16' },
    { proteins_100g: undefined },
    { carbohydrates_100g: -1 },
    { fat_100g: 'abc' },
    { proteins_100g: 50, carbohydrates_100g: 50, fat_100g: 2 },
    { 'energy-kcal_100g': 906, proteins_100g: 0, carbohydrates_100g: 0, fat_100g: 100 },
    { 'energy-kcal_100g': 200 },
    { 'energy-kcal_100g': 1000 },
    { 'energy-kcal_100g': 531, carbohydrates_100g: 0.5 },
    { 'energy-kcal_100g': 90, proteins_100g: 1, carbohydrates_100g: 2, fat_100g: 0.2 },
  ];
  it(`on ${names.length * nutriments.length} products`, () => {
    for (const nm of names) {
      for (const nu of nutriments) {
        const p = { ...base, ...nm, nutriments: { ...base.nutriments, ...nu } };
        expect(usableHit(p), JSON.stringify(p)).toBe(offToFood(p) !== null);
      }
    }
  });
  it('anything that is not an object is not usable', () => {
    expect(usableHit(null)).toBe(false);
    expect(usableHit('x')).toBe(false);
  });
});
