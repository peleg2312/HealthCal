import { describe, expect, it } from 'vitest';

import type { FoodEntry } from '@/types';

import { usualFoods, usualLabel } from './usuals';

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

const TODAY = '2026-11-13';

describe('usualFoods', () => {
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
