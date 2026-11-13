import { describe, expect, it } from 'vitest';

import type { Food, FoodEntry, MealType } from '@/types';

import { usualFoods } from './usuals';

const food = (id: string): Food => ({ id, name: id, per100g: { kcal: 100, protein: 1, carbs: 1, fat: 1 }, servings: [], source: 'builtin', verified: true });
let n = 0;
const entry = (foodId: string, date: string, meal: MealType = 'dinner', extra: Partial<FoodEntry> = {}): FoodEntry => ({
  id: `e${n++}`,
  updatedAt: '2026-11-13T00:00:00.000Z',
  date,
  meal,
  name: foodId,
  foodId,
  food: food(foodId),
  source: 'builtin',
  verified: true,
  servingLabel: '100 g',
  quantity: 1,
  grams: 100,
  nutrients: { kcal: 100, protein: 1, carbs: 1, fat: 1 },
  loggedAt: `${date}T19:00:00.000Z`,
  ...extra,
});

const TODAY = '2026-11-13';

describe('usualFoods', () => {
  it('ranks by how often a food was logged in that meal, ignoring other meals', () => {
    const es = [
      entry('rice', '2026-11-12'),
      entry('rice', '2026-11-11'),
      entry('rice', '2026-11-10'),
      entry('salmon', '2026-11-12'),
      entry('oats', '2026-11-12', 'breakfast'),
      entry('oats', '2026-11-11', 'breakfast'),
      entry('oats', '2026-11-10', 'breakfast'),
      entry('oats', '2026-11-09', 'breakfast'),
    ];
    const out = usualFoods(es, 'dinner', TODAY);
    expect(out.map((u) => u.food.id)).toEqual(['rice', 'salmon']);
    expect(out[0].count).toBe(3);
  });

  it('weights recent days: one log yesterday beats one log four weeks ago', () => {
    const es = [entry('old', '2026-10-17'), entry('new', '2026-11-12'), entry('filler', '2026-11-01')];
    expect(usualFoods(es, 'dinner', TODAY)[0].food.id).toBe('new');
  });

  it('drops logs outside the window, from the future, and deleted ones', () => {
    const es = [
      entry('a', '2026-11-12'),
      entry('a', '2026-11-11'),
      entry('a', '2026-11-10'),
      entry('ancient', '2026-10-01'),
      entry('future', '2026-11-20'),
      entry('gone', '2026-11-12', 'dinner', { deleted: true }),
    ];
    expect(usualFoods(es, 'dinner', TODAY).map((u) => u.food.id)).toEqual(['a']);
  });

  it('counts a food once per day so several lines of it do not outrank a habit', () => {
    const es = [entry('egg', '2026-11-12'), entry('egg', '2026-11-12'), entry('egg', '2026-11-12'), entry('toast', '2026-11-12'), entry('toast', '2026-11-11')];
    expect(usualFoods(es, 'dinner', TODAY)[0].food.id).toBe('toast');
  });

  it('returns the latest entry so its portion can be repeated', () => {
    const es = [entry('rice', '2026-11-10', 'dinner', { quantity: 1 }), entry('rice', '2026-11-12', 'dinner', { quantity: 2 }), entry('rice', '2026-11-11', 'dinner', { quantity: 3 })];
    expect(usualFoods(es, 'dinner', TODAY)[0].last.quantity).toBe(2);
  });

  it('stays empty until the meal has enough history, and skips entries without a food definition', () => {
    expect(usualFoods([entry('a', '2026-11-12'), entry('b', '2026-11-11')], 'dinner', TODAY)).toEqual([]);
    const quick = { ...entry('q', '2026-11-12'), foodId: undefined, food: undefined };
    expect(usualFoods([entry('a', '2026-11-12'), entry('b', '2026-11-11'), quick], 'dinner', TODAY)).toEqual([]);
  });

  it('respects the limit', () => {
    const es = ['a', 'b', 'c', 'd', 'e'].map((id) => entry(id, '2026-11-12'));
    expect(usualFoods(es, 'dinner', TODAY, { limit: 2 })).toHaveLength(2);
  });
});
