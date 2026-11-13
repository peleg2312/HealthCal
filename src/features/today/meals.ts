/**
 * Summary line for a meal row on Today. Pure and unit-tested.
 */
import type { FoodEntry } from '@/types';

export interface MealLine {
  kcal: number;
  protein: number;
  count: number;
  /** True when any item is an AI estimate, so the total is shown with '~'. */
  approx: boolean;
  /** Up to four item emojis, most recently logged last, with a fallback for items without one. */
  emojis: string[];
  /** "3 items, 31 g protein". */
  detail: string;
}

export const isEstimate = (e: Pick<FoodEntry, 'source' | 'kcalRange'>) => e.source === 'ai' || !!e.kcalRange;

export function mealLine(entries: FoodEntry[]): MealLine {
  const kcal = entries.reduce((s, e) => s + e.nutrients.kcal, 0);
  const protein = entries.reduce((s, e) => s + e.nutrients.protein, 0);
  const count = entries.length;
  const items = count === 1 ? entries[0].name : `${count} items`;
  return {
    kcal,
    protein,
    count,
    approx: entries.some(isEstimate),
    emojis: entries.slice(0, 4).map((e) => e.emoji || '🍽️'),
    detail: `${items}, ${Math.round(protein)} g protein`,
  };
}
