/**
 * "Usual" foods: what this person most often logs in a given meal, from their
 * own diary. Pure, so the ranking is unit-tested and shared by every screen
 * that offers history-ranked picks.
 */
import { diffDays } from '@/lib/dates';
import type { Food, FoodEntry, ISODate, MealType } from '@/types';

export interface UsualFood {
  food: Food;
  /** The most recent entry of this food in this meal: its portion is the one to repeat. */
  last: FoodEntry;
  /** How many times it was logged in this meal within the window. */
  count: number;
  score: number;
}

export interface UsualOptions {
  limit?: number;
  /** Look-back window in days, including `today`. */
  days?: number;
  /** Fewer logged foods than this in the meal and the list stays empty (not enough history to call anything usual). */
  minEntries?: number;
  /** A log this many days old counts half as much as one from today. */
  halfLifeDays?: number;
}

/**
 * Foods ranked by how often they were logged in `meal` over the last `days`
 * days, weighted towards recent days. Each food counts at most once per day so
 * three eggs logged as three lines do not outrank a daily habit.
 */
export function usualFoods(entries: FoodEntry[], meal: MealType, today: ISODate, opts: UsualOptions = {}): UsualFood[] {
  const { limit = 6, days = 30, minEntries = 3, halfLifeDays = 14 } = opts;
  const byFood = new Map<string, { last: FoodEntry; dates: Set<ISODate>; score: number }>();
  let total = 0;
  for (const e of entries) {
    if (e.deleted || e.meal !== meal || !e.foodId || !e.food) continue;
    const age = diffDays(e.date, today);
    if (age < 0 || age >= days) continue;
    total++;
    const cur = byFood.get(e.foodId) ?? { last: e, dates: new Set<ISODate>(), score: 0 };
    if (!cur.dates.has(e.date)) {
      cur.dates.add(e.date);
      cur.score += 0.5 ** (age / halfLifeDays);
    }
    if (e.date > cur.last.date || (e.date === cur.last.date && e.loggedAt > cur.last.loggedAt)) cur.last = e;
    byFood.set(e.foodId, cur);
  }
  if (total < minEntries) return [];
  return [...byFood.values()]
    .map((v) => ({ food: v.last.food!, last: v.last, count: v.dates.size, score: v.score }))
    .sort((a, b) => b.score - a.score || b.last.loggedAt.localeCompare(a.last.loggedAt))
    .slice(0, limit);
}
