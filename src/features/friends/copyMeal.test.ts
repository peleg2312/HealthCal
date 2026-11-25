import { describe, expect, it } from 'vitest';

import { BUILTIN_FOODS } from '@/data/foods';

import { bundledFoodFor, copiedToast, copyItems, copyKcal, copyRows, findHref, firstTicked } from './copyMeal';
import type { SharedMealItem } from './contract';

const salad = BUILTIN_FOODS.find((f) => f.id === 'b_israeli_salad')!;
const tahini = BUILTIN_FOODS.find((f) => f.id === 'b_tahini')!;

const items: SharedMealItem[] = [
  { name: salad.name, emoji: '🥗', portion: '1 large serving · 150 g', source: 'builtin', foodId: salad.id, serving: '1 large serving', quantity: 1, grams: 150, kcal: 999 },
  { name: 'Maya’s tahini dressing', portion: '2 tbsp', serving: '2 tbsp', quantity: 1, grams: 30, source: 'custom' },
  { name: tahini.name, portion: '2 × 2 tbsp', serving: '2 tbsp', quantity: 2, source: 'builtin', foodId: tahini.id },
  { name: 'Lentil soup', portion: '1 bowl', serving: '1 bowl', quantity: 1, grams: 300, source: 'ai', foodId: salad.id },
  { name: 'Granola bar', portion: '1 bar', serving: '1 bar', quantity: 1, grams: 40, source: 'openfoodfacts', barcode: '7290000000001' },
  { name: 'Old food', portion: '1 cup', source: 'builtin', foodId: 'b_not_on_this_phone' },
];

describe('copying a friend’s meal', () => {
  const rows = copyRows(items);

  it('copies a bundled food in the friend’s portion with this phone’s numbers, never the friend’s', () => {
    const r = rows[0];
    expect(r.kind).toBe('copy');
    if (r.kind !== 'copy') return;
    expect(r.line).toMatchObject({ name: salad.name, servingLabel: '1 large serving', quantity: 1, grams: 150, source: 'builtin', food: salad });
    expect(r.kcal).toBeCloseTo((salad.per100g.kcal * 150) / 100, 5);
    expect(r.kcal).not.toBe(999);
  });

  it('weighs a portion sent without grams by this phone’s serving', () => {
    const r = rows[2];
    expect(r.kind).toBe('copy');
    if (r.kind !== 'copy') return;
    expect(r.line.grams).toBe(60);
    expect(r.line.quantity).toBe(2);
  });

  it('offers Find, never numbers, for an own food, a product, an estimate or a food this phone does not hold', () => {
    expect(rows.map((r) => r.kind)).toEqual(['copy', 'find', 'copy', 'find', 'find', 'find']);
    const find = rows[1];
    expect(find.kind === 'find' && find.query).toBe('Maya’s tahini dressing');
    expect(bundledFoodFor({ source: 'ai', foodId: salad.id })).toBeNull();
    expect(bundledFoodFor({ source: 'typical', foodId: salad.id })).toBe(salad);
  });

  it('ticks every bundled food first, and logs only ticked copy rows', () => {
    const ticked = firstTicked(rows);
    expect([...ticked]).toEqual([0, 2]);
    expect(copyItems(rows, ticked)).toHaveLength(2);
    expect(copyItems(rows, new Set([1, 3, 4]))).toEqual([]);
    expect(copyKcal(rows, new Set([0]))).toBeCloseTo((salad.per100g.kcal * 150) / 100, 5);
  });

  it('names what was added first in its toast', () => {
    const lines = copyItems(rows, firstTicked(rows));
    expect(copiedToast(lines, 'lunch')).toBe('Israeli salad and tahini (sesame paste) added to lunch');
    expect(copiedToast(lines.slice(0, 1), 'yesterday’s lunch')).toBe('Israeli salad added to yesterday’s lunch');
  });

  it('sends Find to food search on the meal and day picked, with the name', () => {
    expect(findHref('Maya’s tahini dressing', 'lunch', '2026-11-25')).toBe('/food/search?meal=lunch&date=2026-11-25&q=Maya%E2%80%99s+tahini+dressing');
  });
});
