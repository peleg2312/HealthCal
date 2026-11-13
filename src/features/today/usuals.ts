/**
 * "Usual for dinner": the foods a person logs most often in a meal slot,
 * ranked from their own history. Pure and unit-tested.
 */
import { addDays, diffDays } from '@/lib/dates';
import { formatNumber } from '@/lib/units';
import type { FoodEntry, ISODate, MealType } from '@/types';

export interface UsualFood {
  key: string;
  /** The most recent entry of this food in the slot: re-logging repeats this portion. */
  last: FoodEntry;
  /** Times logged in the slot over the window. */
  count: number;
  score: number;
}

export const USUAL_WINDOW_DAYS = 30;
/** Entries in the slot needed before the row is worth showing. */
export const USUAL_MIN_ENTRIES = 3;

export function foodKey(e: Pick<FoodEntry, 'foodId' | 'name' | 'brand'>): string {
  return e.foodId ?? `${e.name.trim().toLowerCase()}|${(e.brand ?? '').trim().toLowerCase()}`;
}

/**
 * Rank foods logged in `meal` over the 30 days before today. Today is left out
 * so the order stays put while the user taps several tiles in a row. Each log
 * counts once, weighted from about 1 (yesterday) down to 0.5 (30 days ago), so a food
 * eaten often lately beats one eaten often a month ago. Ties go to the most
 * recently logged. Returns nothing until the slot has at least 3 entries.
 */
export function usualFoods(entries: FoodEntry[], meal: MealType, today: ISODate, limit = 4): UsualFood[] {
  const floor = addDays(today, -USUAL_WINDOW_DAYS);
  const inSlot = entries.filter((e) => !e.deleted && e.meal === meal && e.date >= floor && e.date < today && e.quantity > 0);
  if (inSlot.length < USUAL_MIN_ENTRIES) return [];
  const map = new Map<string, UsualFood>();
  for (const e of inSlot) {
    const age = Math.max(0, diffDays(e.date, today));
    const weight = 1 - (0.5 * age) / USUAL_WINDOW_DAYS;
    const key = foodKey(e);
    const prev = map.get(key);
    if (!prev) map.set(key, { key, last: e, count: 1, score: weight });
    else {
      prev.count += 1;
      prev.score += weight;
      if (e.loggedAt > prev.last.loggedAt) prev.last = e;
    }
  }
  return [...map.values()].sort((a, b) => b.score - a.score || b.last.loggedAt.localeCompare(a.last.loggedAt)).slice(0, limit);
}

/** "1 cup, 205 kcal" for a tile. */
export function usualLabel(u: UsualFood): string {
  const q = u.last.quantity;
  const portion = q === 1 ? u.last.servingLabel : `${Number.isInteger(q) ? q : q.toFixed(1)} × ${u.last.servingLabel}`;
  return `${portion}, ${formatNumber(u.last.nutrients.kcal)} kcal`;
}
