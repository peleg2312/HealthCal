/**
 * "Usual" foods: what this person most often logs in a given meal, from their
 * own diary. Pure, so the ranking is unit-tested, and shared by every screen
 * that offers history-ranked picks (the + sheet and food search) so both show
 * the same order.
 */
import { diffDays } from '@/lib/dates';
import { formatNumber } from '@/lib/units';
import type { Food, FoodEntry, ISODate, MealType } from '@/types';

export interface UsualFood {
  /** The food's id, or its name and brand for entries logged without a food (quick add, estimates). */
  key: string;
  /** The food's definition, when the entry carries one. */
  food?: Food;
  /** The most recent entry of this food in this meal: its portion is the one to repeat. */
  last: FoodEntry;
  /** On how many days it was logged in this meal within the window. */
  count: number;
  score: number;
}

export interface UsualOptions {
  limit?: number;
  /** Look-back window: this many days before `today`. */
  days?: number;
  /** Fewer logged foods than this in the meal and the list stays empty (not enough history to call anything usual). */
  minEntries?: number;
  /** A log this many days old counts half as much as one from yesterday-ish. */
  halfLifeDays?: number;
  /** Only foods that carry a definition (needed where the row opens the food's own page). */
  withFood?: boolean;
}

export function foodKey(e: Pick<FoodEntry, 'foodId' | 'name' | 'brand'>): string {
  return e.foodId ?? `${e.name.trim().toLowerCase()}|${(e.brand ?? '').trim().toLowerCase()}`;
}

/**
 * Foods ranked by how often they were logged in `meal` over the `days` days
 * before `today`, weighted towards recent days. Today itself is left out, so
 * the order stays put while the user logs several of them in a row. A food
 * counts at most once per day, so three eggs logged as three lines do not
 * outrank a daily habit. Ties go to the most recently logged.
 */
export function usualFoods(entries: FoodEntry[], meal: MealType, today: ISODate, opts: UsualOptions = {}): UsualFood[] {
  const { limit = 6, days = 30, minEntries = 3, halfLifeDays = 14, withFood = false } = opts;
  const byFood = new Map<string, { last: FoodEntry; dates: Set<ISODate>; score: number }>();
  let total = 0;
  for (const e of entries) {
    if (e.deleted || e.meal !== meal || !(e.quantity > 0)) continue;
    if (withFood && (!e.foodId || !e.food)) continue;
    const age = diffDays(e.date, today);
    if (age < 1 || age > days) continue;
    total++;
    const key = foodKey(e);
    const cur = byFood.get(key) ?? { last: e, dates: new Set<ISODate>(), score: 0 };
    if (!cur.dates.has(e.date)) {
      cur.dates.add(e.date);
      cur.score += 0.5 ** (age / halfLifeDays);
    }
    if (e.date > cur.last.date || (e.date === cur.last.date && e.loggedAt > cur.last.loggedAt)) cur.last = e;
    byFood.set(key, cur);
  }
  if (total < minEntries) return [];
  return [...byFood.entries()]
    .map(([key, v]) => ({ key, food: v.last.food, last: v.last, count: v.dates.size, score: v.score }))
    .sort((a, b) => b.score - a.score || b.last.loggedAt.localeCompare(a.last.loggedAt))
    .slice(0, limit);
}

/** "1 cup, 205 kcal" for a tile. */
export function usualLabel(u: UsualFood): string {
  const q = u.last.quantity;
  const portion = q === 1 ? u.last.servingLabel : `${Number.isInteger(q) ? q : q.toFixed(1)} × ${u.last.servingLabel}`;
  return `${portion}, ${formatNumber(u.last.nutrients.kcal)} kcal`;
}
