import { describe, expect, it } from 'vitest';

import { BUILTIN_FOODS } from '@/data/foods';
import type { SavedMeal } from '@/types';

import { buildSharedSavedMeal } from './savedShare';

const salad = BUILTIN_FOODS.find((f) => f.id === 'b_israeli_salad')!;

const meal: SavedMeal = {
  id: 'saved-record-id',
  updatedAt: '2026-11-25T12:00:00.000Z',
  name: 'Lunch box',
  servings: 2,
  items: [
    { name: salad.name, emoji: '🥗', servingLabel: '1 large serving', quantity: 1, grams: 150, nutrients: { kcal: 75.4, protein: 1.2, carbs: 5.7, fat: 6 }, food: salad, source: 'builtin', verified: true },
    { name: 'Lentil soup', servingLabel: '1 bowl', quantity: 1, grams: 300, nutrients: { kcal: 310, protein: 18, carbs: 40, fat: 6 }, source: 'ai', verified: false, kcalRange: [380, 250] },
    { name: 'Nothing', servingLabel: '1', quantity: 0, grams: 0, nutrients: { kcal: 0, protein: 0, carbs: 0, fat: 0 }, source: 'custom', verified: false },
  ],
};

describe('buildSharedSavedMeal', () => {
  it('sends the name, the servings and the foods as friends see them: never an id, macros or a total', () => {
    const out = buildSharedSavedMeal({ meal, showKcal: false });
    expect(out.name).toBe('Lunch box');
    expect(out.servings).toBe(2);
    expect(out.items).toEqual([
      { name: salad.name, emoji: '🥗', portion: '1 large serving · 150 g', source: 'builtin', foodId: 'b_israeli_salad', serving: '1 large serving', quantity: 1, grams: 150 },
      { name: 'Lentil soup', portion: '1 bowl · 300 g', source: 'ai', serving: '1 bowl', quantity: 1, grams: 300 },
    ]);
    const text = JSON.stringify(out);
    for (const never of ['saved-record-id', 'protein', 'carbs', 'fat', 'kcal', 'updatedAt', '2026-11-25']) expect(text).not.toContain(never);
  });

  it('adds calories only when switched on, keeping an estimate’s range in order', () => {
    const [a, b] = buildSharedSavedMeal({ meal, showKcal: true }).items;
    expect(a.kcal).toBe(75);
    expect(b).toMatchObject({ kcal: 310, kcalLow: 250, kcalHigh: 380 });
  });

  it('leaves out one serving and keeps at most 15 foods', () => {
    const one = buildSharedSavedMeal({ meal: { ...meal, servings: 1 }, showKcal: false });
    expect(one.servings).toBeNull();
    const many = buildSharedSavedMeal({ meal: { ...meal, items: Array.from({ length: 20 }, () => meal.items[0]) }, showKcal: false });
    expect(many.items).toHaveLength(15);
  });
});
