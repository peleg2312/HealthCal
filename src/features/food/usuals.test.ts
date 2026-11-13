import { describe, expect, it } from 'vitest';

import type { Food, FoodEntry, MealType } from '@/types';

import { usualFoods, usualLabel } from './usuals';

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
    expect(out.map((u) => u.key)).toEqual(['rice', 'salmon']);
    expect(out[0].count).toBe(3);
  });

  it('weights recent days: one log yesterday beats one log four weeks ago', () => {
    const es = [entry('old', '2026-10-17'), entry('new', '2026-11-12'), entry('filler', '2026-11-01')];
    expect(usualFoods(es, 'dinner', TODAY)[0].key).toBe('new');
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
    expect(usualFoods(es, 'dinner', TODAY).map((u) => u.key)).toEqual(['a']);
  });

  it('counts a food once per day so several lines of it do not outrank a habit', () => {
    const es = [entry('egg', '2026-11-12'), entry('egg', '2026-11-12'), entry('egg', '2026-11-12'), entry('toast', '2026-11-12'), entry('toast', '2026-11-11')];
    expect(usualFoods(es, 'dinner', TODAY)[0].key).toBe('toast');
  });

  it('returns the latest entry so its portion can be repeated', () => {
    const es = [entry('rice', '2026-11-10', 'dinner', { quantity: 1 }), entry('rice', '2026-11-12', 'dinner', { quantity: 2 }), entry('rice', '2026-11-11', 'dinner', { quantity: 3 })];
    expect(usualFoods(es, 'dinner', TODAY)[0].last.quantity).toBe(2);
  });

  it('stays empty until the meal has enough history; withFood skips entries without a food definition', () => {
    expect(usualFoods([entry('a', '2026-11-12'), entry('b', '2026-11-11')], 'dinner', TODAY)).toEqual([]);
    const quick = { ...entry('q', '2026-11-12'), foodId: undefined, food: undefined };
    const list = [entry('a', '2026-11-12'), entry('b', '2026-11-11'), quick];
    expect(usualFoods(list, 'dinner', TODAY, { withFood: true })).toEqual([]);
    expect(usualFoods(list, 'dinner', TODAY).map((u) => u.key)).toContain('q|');
  });

  it('leaves today out, so the order holds while several are logged in a row', () => {
    const es = [entry('a', '2026-11-12'), entry('a', '2026-11-11'), entry('b', '2026-11-12'), entry('b', TODAY), entry('b', TODAY), entry('c', TODAY)];
    const out = usualFoods(es, 'dinner', TODAY);
    expect(out.map((u) => u.key)).toEqual(['a', 'b']);
    expect(out[1].last.date).toBe('2026-11-12');
  });

  it('respects the limit', () => {
    const es = ['a', 'b', 'c', 'd', 'e'].map((id) => entry(id, '2026-11-12'));
    expect(usualFoods(es, 'dinner', TODAY, { limit: 2 })).toHaveLength(2);
  });
});

let seq = 0;
function e(name: string, date: string, meal: FoodEntry['meal'] = 'dinner', patch: Partial<FoodEntry> = {}): FoodEntry {
  seq += 1;
  return {
    id: `e${seq}`,
    updatedAt: '',
    date,
    meal,
    name,
    foodId: `food-${name}`,
    source: 'reference',
    verified: true,
    servingLabel: '1 cup',
    quantity: 1,
    grams: 150,
    nutrients: { kcal: 205, protein: 4, carbs: 45, fat: 0 },
    loggedAt: `${date}T19:00:${String(seq % 60).padStart(2, '0')}.000Z`,
    ...patch,
  } as FoodEntry;
}


describe('usualFoods for the quick-log sheet', () => {
  it('returns nothing until the slot has three entries', () => {
    expect(usualFoods([e('rice', '2026-11-12'), e('beans', '2026-11-11')], 'dinner', TODAY)).toEqual([]);
  });

  it('ranks by frequency in the slot, weighting recent days', () => {
    const list = [
      e('rice', '2026-11-12'),
      e('rice', '2026-11-10'),
      e('rice', '2026-11-08'),
      e('salmon', '2026-11-12'),
      e('salmon', '2026-11-11'),
      e('pasta', '2026-10-20'),
      e('pasta', '2026-10-19'),
      e('oats', '2026-11-12', 'breakfast'),
      e('oats', '2026-11-11', 'breakfast'),
      e('oats', '2026-11-10', 'breakfast'),
      e('oats', '2026-11-09', 'breakfast'),
    ];
    const out = usualFoods(list, 'dinner', TODAY);
    expect(out.map((u) => u.key)).toEqual(['food-rice', 'food-salmon', 'food-pasta']);
    expect(out[0].count).toBe(3);
  });

  it('prefers recent over old at equal counts', () => {
    const list = [e('old', '2026-10-16'), e('old', '2026-10-17'), e('new', '2026-11-12'), e('new', '2026-11-11')];
    expect(usualFoods(list, 'dinner', TODAY)[0].key).toBe('food-new');
  });

  it('ignores entries older than 30 days, from today on, or deleted', () => {
    const list = [
      e('rice', '2026-10-13'),
      e('rice', '2026-11-13'),
      e('rice', '2026-11-14'),
      e('rice', '2026-11-12', 'dinner', { deleted: true }),
      e('beans', '2026-11-12'),
      e('beans', '2026-11-11'),
      e('beans', '2026-10-15'),
    ];
    expect(usualFoods(list, 'dinner', TODAY).map((u) => u.key)).toEqual(['food-beans']);
  });

  it('keeps the latest portion and groups foods without ids by name and brand', () => {
    const list = [
      e('Toast', '2026-11-10', 'dinner', { foodId: undefined, quantity: 1 }),
      e('toast ', '2026-11-12', 'dinner', {
        foodId: undefined,
        quantity: 2,
        servingLabel: 'slice',
        nutrients: { kcal: 160, protein: 6, carbs: 28, fat: 2 },
      }),
      e('Toast', '2026-11-11', 'dinner', {
        foodId: undefined,
        brand: 'Bakery',
      }),
    ];
    const out = usualFoods(list, 'dinner', TODAY);
    expect(out[0].count).toBe(2);
    expect(out[0].last.quantity).toBe(2);
    expect(usualLabel(out[0])).toBe('2 × slice, 160 kcal');
    expect(usualLabel(out[1])).toBe('1 cup, 205 kcal');
  });
});
