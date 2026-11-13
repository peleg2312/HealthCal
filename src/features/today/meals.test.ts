import { describe, expect, it } from 'vitest';

import type { FoodEntry } from '@/types';

import { mealLine } from './meals';

const e = (name: string, kcal: number, protein: number, patch: Partial<FoodEntry> = {}) =>
  ({
    id: name,
    name,
    emoji: '🍚',
    source: 'reference',
    nutrients: { kcal, protein, carbs: 0, fat: 0 },
    ...patch,
  }) as FoodEntry;

describe('mealLine', () => {
  it('sums kcal and protein and counts items', () => {
    const line = mealLine([e('Rice', 200, 4), e('Beef', 300, 26.6), e('Beans', 120, 0.6, { emoji: undefined })]);
    expect(line).toMatchObject({
      kcal: 620,
      count: 3,
      approx: false,
      detail: '3 items, 31 g protein',
    });
    expect(line.emojis).toEqual(['🍚', '🍚', '🍽️']);
  });
  it('names a single item instead of counting it', () => {
    expect(mealLine([e('Greek yogurt', 150, 15)]).detail).toBe('Greek yogurt, 15 g protein');
  });
  it('marks the total approximate when any item is an AI estimate', () => {
    expect(mealLine([e('Rice', 200, 4), e('Curry', 500, 20, { source: 'ai' })]).approx).toBe(true);
    expect(mealLine([e('Copied curry', 500, 20, { kcalRange: [400, 600] })]).approx).toBe(true);
  });
  it('caps the emoji stack at four', () => {
    expect(mealLine([1, 2, 3, 4, 5, 6].map((i) => e(`x${i}`, 10, 1))).emojis).toHaveLength(4);
  });
});
