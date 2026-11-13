import { describe, expect, it } from 'vitest';

import { offToFood } from './openFoodFacts';

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
