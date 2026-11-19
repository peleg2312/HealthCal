/**
 * "Usual" foods: what this person most often logs in a given meal, from their
 * own diary. Pure, so the ranking is unit-tested, and shared by every screen
 * that offers history-ranked picks (the + sheet and food search) so both show
 * the same order.
 */
import { BUILTIN_FOODS } from '@/data/foods';
import { isWaterDrinkEntry } from '@/features/drinks/via';
import { amountTotal, formatQty, matchServing } from '@/features/food/helpers';
import { diffDays } from '@/lib/dates';
import { scaleNutrients } from '@/lib/nutrition';
import { formatNumber } from '@/lib/units';
import type { Food, FoodEntry, ISODate, MealType, SavedMealItem } from '@/types';

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

const BUILTIN_BY_ID = new Map(BUILTIN_FOODS.map((f) => [f.id, f]));

/**
 * The freshest definition of a remembered food. Diary entries, recents and
 * favourites each carry a copy of the food as it was; an own food may have been
 * edited or deleted since. Returns the live own food, the bundled food, or null
 * when it was an own food that no longer exists.
 */
export function resolveFood(f: Food, customById: ReadonlyMap<string, Food>): Food | null {
  if (f.source === 'custom') return customById.get(f.id) ?? null;
  return BUILTIN_BY_ID.get(f.id) ?? f;
}

/** Index of the user's own live foods, for `resolveFood`. */
export function customFoodIndex(customFoods: readonly Food[]): Map<string, Food> {
  return new Map(customFoods.filter((f) => !(f as Food & { deleted?: boolean }).deleted).map((f) => [f.id, f]));
}

/**
 * Usual foods as they are now: a deleted own food is dropped, and an edited
 * own food or a bundled food shows and logs today's values at the remembered amount. The remembered
 * grams always stay; a label that the food now names at another weight becomes
 * the amount in grams (`matchServing`), so the chip shows what a tap logs.
 */
export function resolveUsuals(usuals: UsualFood[], customById: ReadonlyMap<string, Food>): UsualFood[] {
  const out: UsualFood[] = [];
  for (const u of usuals) {
    const stored = u.last.food ?? u.food;
    if (!stored) {
      out.push(u);
      continue;
    }
    const food = resolveFood(stored, customById);
    if (!food) continue;
    // A bundled food is always priced at today's values: after a restart the entry holds today's bundled food
    // (src/store/persistence.ts attaches it on load) while its label, grams and calories are those it was logged
    // with, so `food === stored` says nothing about whether the numbers changed. An online product's stored copy
    // and an own food that is still the same record are the truth and stay as they are.
    if (food === stored && BUILTIN_BY_ID.get(food.id) !== food) {
      out.push(u);
      continue;
    }
    const last = atFoodValues(u.last, food);
    out.push({ ...u, food, last });
  }
  return out;
}

/**
 * A remembered amount of `food` at the food's values now: the grams always stay, the label goes through
 * `matchServing` (a label the food now names at another weight becomes the amount in grams) and the nutrients
 * are the food's for those grams. The one rule behind the usual tiles (`resolveUsuals`) and every copy
 * (`currentValues`).
 */
export function atFoodValues<T extends SavedMealItem>(it: T, food: Food): T {
  const q = it.quantity;
  const servingLabel = q > 0 ? matchServing(food, it.servingLabel, it.grams / q).label : it.servingLabel;
  return { ...it, food, name: food.name, brand: food.brand, emoji: food.emoji ?? it.emoji, servingLabel, nutrients: scaleNutrients(food.per100g, it.grams) };
}

/**
 * A diary entry or saved-meal line as it is logged again (Repeat, copying a meal or a day, a reminder's
 * "Repeat yesterday's", a saved meal): a bundled food at today's values for its own grams (`atFoodValues`), so a
 * corrected value never lives on through copies. A person's own food, an online product, a quick add, an
 * estimate (it carries a range: the numbers are the person's reviewed ones) and a drink from Water come back as
 * they are. Never writes anything: the stored entry or saved meal stays as it was.
 */
export function currentValues<T extends SavedMealItem | FoodEntry>(it: T): T {
  const stored = it.food;
  if (!stored || stored.source !== 'builtin' || it.kcalRange || isWaterDrinkEntry(it as Pick<FoodEntry, 'via'>) || !(it.grams > 0)) return it;
  const food = BUILTIN_BY_ID.get(stored.id);
  return food ? atFoodValues(it, food) : it;
}

/** The calories a copy of these entries or lines stores (`currentValues`): what a row that offers the copy shows. */
export function currentKcal(items: readonly (SavedMealItem | FoodEntry)[]): number {
  return items.reduce((s, it) => s + currentValues(it).nutrients.kcal, 0);
}

export function foodKey(e: Pick<FoodEntry, 'foodId' | 'name' | 'brand'>): string {
  return e.foodId ?? `${e.name.trim().toLowerCase()}|${(e.brand ?? '').trim().toLowerCase()}`;
}

/**
 * Foods ranked by how often they were logged in `meal` over the `days` days
 * before `today`, weighted towards recent days. Today itself is left out, so
 * the order stays put while the user logs several of them in a row. A food
 * counts at most once per day, so three eggs logged as three lines do not
 * outrank a daily habit. Ties go to the most recently logged. Drinks logged on
 * the water screen are left out (they are logged there again, with their water).
 */
export function usualFoods(entries: FoodEntry[], meal: MealType, today: ISODate, opts: UsualOptions = {}): UsualFood[] {
  const { limit = 6, days = 30, minEntries = 3, halfLifeDays = 14, withFood = false } = opts;
  const byFood = new Map<string, { last: FoodEntry; dates: Set<ISODate>; score: number }>();
  let total = 0;
  for (const e of entries) {
    if (e.deleted || e.meal !== meal || !(e.quantity > 0) || isWaterDrinkEntry(e)) continue;
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

/** "1 cup, 205 kcal" for a tile; an amount in grams is said as its total ("160 g, 597 kcal", not "2 × 80 g"). */
export function usualLabel(u: UsualFood): string {
  const q = u.last.quantity;
  const label = u.last.servingLabel;
  const inGrams = /^\d+(?:\.\d+)? g$/.test(label);
  // A serving that is a volume ("500 ml", an online drink's pack) is said as the total ("1000 ml"); weights keep their own path.
  const portion = q === 1 ? label : inGrams ? `${formatQty(Math.round(u.last.grams * 10) / 10)} g` : (amountTotal(label, q) ?? `${Number.isInteger(q) ? q : q.toFixed(1)} × ${label}`);
  return `${portion}, ${formatNumber(u.last.nutrients.kcal)} kcal`;
}
