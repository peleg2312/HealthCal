import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { BUILTIN_FOODS } from '@/data/foods';
import type { FoodEntry } from '@/types';

import { mealOfCheer, sharedMealRef as mealRef } from '@/services/friendsWire';

import { buildSharedMeal, entryPortion, MAX_SHARED_ITEMS, ownMealsByRef, sameItems } from './meals';

const TODAY = '2026-11-25';
const KEY = '5f1d0c6e2b7a49c8a1e3d4f5061728394a5b6c7d8e9f00112233445566778899';
const salad = BUILTIN_FOODS.find((f) => f.id === 'b_israeli_salad')!;
const typical = BUILTIN_FOODS.find((f) => !f.verified)!;

let n = 0;
const entry = (patch: Partial<FoodEntry> = {}): FoodEntry => ({
  id: `e${++n}`,
  updatedAt: '2026-11-25T12:00:00.000Z',
  date: TODAY,
  meal: 'lunch',
  name: salad.name,
  emoji: '🥗',
  foodId: salad.id,
  food: salad,
  source: 'builtin',
  verified: true,
  servingLabel: '1 large serving',
  quantity: 1,
  grams: 150,
  nutrients: { kcal: 75, protein: 1.2, carbs: 5.7, fat: 6 },
  loggedAt: `2026-11-25T12:${String(n).padStart(2, '0')}:00.000Z`,
  ...patch,
});
const build = (entries: FoodEntry[], showKcal = false) => buildSharedMeal({ entries, day: TODAY, meal: 'lunch', showKcal });

describe('buildSharedMeal', () => {
  it('sends the foods, portions and sources: never an id, the time, macros, notes or a total', () => {
    const e = entry({ id: 'record-entry-id' });
    const out = build([e]);
    expect(out).toEqual([{ name: salad.name, emoji: '🥗', portion: '1 large serving · 150 g', source: 'builtin', foodId: 'b_israeli_salad', serving: '1 large serving', quantity: 1, grams: 150 }]);
    const text = JSON.stringify(out);
    for (const never of [e.id, e.loggedAt, '12:', 'protein', 'carbs', 'fat', 'kcal', 'nutrients', 'updatedAt', 'budget', 'total', 'date', TODAY]) expect(text).not.toContain(never);
  });

  it('adds calories only when switched on, keeping an estimate’s range', () => {
    const ai = entry({ name: 'Lentil soup', source: 'ai', foodId: undefined, food: undefined, servingLabel: '1 bowl', grams: 300, nutrients: { kcal: 310.4, protein: 18, carbs: 40, fat: 6 }, kcalRange: [250, 380], confidence: 0.6 });
    const [off] = build([ai]);
    expect(off).not.toHaveProperty('kcal');
    expect(off).not.toHaveProperty('kcalLow');
    const [on] = build([ai], true);
    expect(on).toMatchObject({ source: 'ai', kcal: 310, kcalLow: 250, kcalHigh: 380 });
    expect(on).not.toHaveProperty('foodId');
    // A bundled food matched after an estimate is still an estimate: its range wins, and no bundled id goes.
    const [matched] = build([entry({ kcalRange: [60, 90] })], true);
    expect(matched).toMatchObject({ source: 'ai', kcal: 75, kcalLow: 60, kcalHigh: 90 });
    expect(matched).not.toHaveProperty('foodId');
  });

  it('leaves out drinks from Water, deleted entries, other meals and other days, oldest first', () => {
    const entries = [
      entry({ name: 'Milk', via: 'water' }),
      entry({ name: 'Gone', deleted: true }),
      entry({ name: 'Dinner food', meal: 'dinner' }),
      entry({ name: 'Yesterday food', date: '2026-11-24' }),
      entry({ name: 'Second', loggedAt: '2026-11-25T13:00:00.000Z' }),
      entry({ name: 'First', loggedAt: '2026-11-25T11:00:00.000Z' }),
    ];
    expect(build(entries, true).map((i) => i.name)).toEqual(['First', 'Second']);
    expect(build([entry({ via: 'water' })])).toEqual([]);
  });

  it('keeps at most 15 foods and cuts long names and portions', () => {
    const out = build(Array.from({ length: 20 }, () => entry({ name: 'x'.repeat(90), servingLabel: 'y'.repeat(70) })));
    expect(out).toHaveLength(MAX_SHARED_ITEMS);
    expect(out[0].name).toHaveLength(60);
    expect(out[0].portion.length).toBeLessThanOrEqual(40);
    expect(out[0].serving!.length).toBeLessThanOrEqual(40);
  });

  it('names its source as the diary does: typical values, own food, a product with its barcode', () => {
    const t = entry({ name: typical.name, food: typical, foodId: typical.id });
    const own = entry({ name: 'Maya’s tahini dressing', source: 'custom', foodId: 'c1', food: undefined, servingLabel: '2 tbsp', grams: 30 });
    const off = entry({ name: 'Granola bar', source: 'openfoodfacts', foodId: 'off_7290000000001', food: { ...salad, id: 'off_7290000000001', source: 'openfoodfacts', barcode: '7290000000001' }, servingLabel: '1 bar', grams: 40 });
    expect(build([t, own, off]).map((i) => [i.source, i.foodId ?? null, i.barcode ?? null])).toEqual([
      ['typical', typical.id, null],
      ['custom', null, null],
      ['openfoodfacts', null, '7290000000001'],
    ]);
  });

  it('tells a change friends would see from one they would not', () => {
    expect(sameItems(build([entry({ id: 'x1' })]), build([entry({ id: 'x2' })]))).toBe(true);
    expect(sameItems(build([entry()]), build([entry({ quantity: 2, grams: 300 })]))).toBe(false);
    expect(sameItems(build([entry()]), build([entry()], true))).toBe(false);
  });
});

describe('entryPortion', () => {
  it('draws the portion as the diary row does', () => {
    expect(entryPortion({ servingLabel: '1 oz', quantity: 1, grams: 28 })).toBe('1 oz · 28 g');
    expect(entryPortion({ servingLabel: '250 ml', quantity: 1, grams: 258 })).toBe('250 ml');
    expect(entryPortion({ servingLabel: '1 g', quantity: 150, grams: 150 })).toBe('150 g');
  });
});

describe('naming a cheer for one of my meals', () => {
  it('works the reference out as the server makes it, and holds neither the day nor an id in clear', () => {
    const ref = mealRef(KEY, TODAY, 'lunch');
    expect(ref).toBe(createHash('sha256').update(`${KEY}:meal:${TODAY}:lunch`).digest('hex').slice(0, 32));
    expect(ref).not.toContain('2026');
    expect(mealRef(KEY, TODAY, 'dinner')).not.toBe(ref);
  });

  it('maps a meal cheer back to the day and meal', () => {
    const ref = mealRef(KEY, '2026-11-23', 'dinner');
    expect(mealOfCheer(`meal:${ref}`)).toBe(ref);
    expect(mealOfCheer('day:2026-11-23')).toBeNull();
    expect(mealOfCheer('meal:XYZ')).toBeNull();
    expect(ownMealsByRef(KEY, TODAY).get(ref)).toEqual({ day: '2026-11-23', meal: 'dinner' });
    expect(ownMealsByRef(null, TODAY).size).toBe(0);
  });
});
