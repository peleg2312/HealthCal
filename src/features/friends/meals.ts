/**
 * A meal shown to friends: the one door for food (as `buildFriendSummary` is for the week).
 *
 * Someone shows one meal of one day, on purpose, to the friends they pick, for 7 days. What leaves the
 * phone is each food's name, emoji, portion and where its numbers come from, and its calories only when
 * the person switched them on (a range kept for an estimate). Never the day's total, the budget, macros,
 * weight, notes, the time it was eaten or a record id. A drink logged on the Water screen is left out, as
 * it is for "logged" everywhere else. The server keeps the same short list of keys (`social_clean_meal`)
 * whatever a device sends, and makes the meal's reference itself.
 *
 * Pure: no React, no storage, no clock.
 */
import { isWaterDrinkEntry } from '@/features/drinks/via';
import { portionLabel, sourceKindOf } from '@/features/food/helpers';
import { addDays } from '@/lib/dates';
import { sharedMealRef } from '@/services/friendsWire';
import type { FoodEntry, ISODate, MealType } from '@/types';

import type { SharedFoodSource, SharedMealItem } from './contract';

export const MEAL_TYPES: readonly MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];
/** How long a shown meal stays in friends' feeds. */
export const SHOWN_DAYS = 7;
/** The most foods one shown meal holds. */
export const MAX_SHARED_ITEMS = 15;
export const NAME_MAX = 60;
export const PORTION_MAX = 40;
const EMOJI_MAX = 8;

const cut = (s: string, max: number) => {
  const t = s.replace(/\s+/g, ' ').trim();
  const chars = Array.from(t);
  return chars.length > max ? chars.slice(0, max).join('').trim() : t;
};

/** The portion line as the diary's row draws it: "1 oz · 28 g", "250 ml", "150 g". */
export function entryPortion(e: Pick<FoodEntry, 'servingLabel' | 'quantity' | 'grams'>): string {
  const volume = /(ml|fl oz)$/.test(e.servingLabel.trim());
  return e.grams > 0 && !volume && e.servingLabel !== `${Math.round(e.grams)} g` && !/^\d+(\.\d+)?\s*g$/.test(e.servingLabel.trim())
    ? `${portionLabel(e.servingLabel, e.quantity)} · ${Math.round(e.grams)} g`
    : portionLabel(e.servingLabel, e.quantity);
}

/** The entries a shown meal holds: live, of that day and meal, logged in the diary (not a drink from Water), oldest first. */
export function mealEntries(entries: readonly FoodEntry[], day: ISODate, meal: MealType): FoodEntry[] {
  return entries
    .filter((e) => !e.deleted && e.date === day && e.meal === meal && !isWaterDrinkEntry(e) && e.quantity > 0)
    .sort((a, b) => a.loggedAt.localeCompare(b.loggedAt));
}

/** One entry as friends may see it. */
function sharedItem(e: FoodEntry, showKcal: boolean): SharedMealItem {
  // An entry with a range is an estimate, whatever food it was matched to afterwards (as the diary reads it).
  const source: SharedFoodSource = e.kcalRange ? 'ai' : sourceKindOf(e);
  const bundledId = source === 'builtin' || source === 'typical' || source === 'usda' ? (e.food?.id ?? e.foodId) : undefined;
  const barcode = source === 'openfoodfacts' ? (e.food?.barcode ?? '').replace(/\D/g, '') : '';
  const item: SharedMealItem = {
    name: cut(e.name, NAME_MAX) || 'Food',
    ...(e.emoji ? { emoji: Array.from(e.emoji).slice(0, EMOJI_MAX).join('') } : null),
    portion: cut(entryPortion(e), PORTION_MAX),
    source,
    ...(bundledId && /^b_/.test(bundledId) ? { foodId: bundledId } : null),
    ...(barcode.length >= 6 && barcode.length <= 14 ? { barcode } : null),
    serving: cut(e.servingLabel, PORTION_MAX),
    quantity: Math.round(e.quantity * 100) / 100,
    ...(e.grams > 0 ? { grams: Math.round(e.grams * 10) / 10 } : null),
  };
  if (showKcal) {
    item.kcal = Math.max(0, Math.round(e.nutrients.kcal));
    if (e.kcalRange) {
      item.kcalLow = Math.max(0, Math.round(Math.min(e.kcalRange[0], e.kcalRange[1])));
      item.kcalHigh = Math.max(0, Math.round(Math.max(e.kcalRange[0], e.kcalRange[1])));
    }
  }
  return item;
}

/**
 * The meal as friends will see it, built from the diary: the one door for food. `entries` may hold the
 * whole diary; only the live entries of `day` and `meal` logged in the diary go in, at most 15, oldest
 * first. Empty when nothing is left to show.
 */
export function buildSharedMeal(input: { entries: readonly FoodEntry[]; day: ISODate; meal: MealType; showKcal: boolean }): SharedMealItem[] {
  return mealEntries(input.entries, input.day, input.meal)
    .slice(0, MAX_SHARED_ITEMS)
    .map((e) => sharedItem(e, input.showKcal));
}

/**
 * The user's own meals of the last weeks by the reference friends see (`sharedMealRef`, as the server makes
 * it), to name a cheer ("your lunch") after the meal is no longer shown. Tomorrow back `days` days, every meal type. Empty without a share key.
 */
export function ownMealsByRef(shareKey: string | null | undefined, today: ISODate, days = 15): Map<string, { day: ISODate; meal: MealType }> {
  const out = new Map<string, { day: ISODate; meal: MealType }>();
  if (!shareKey) return out;
  for (let i = -1; i < days; i++) {
    const day = addDays(today, -i);
    for (const meal of MEAL_TYPES) out.set(sharedMealRef(shareKey, day, meal), { day, meal });
  }
  return out;
}

/** Whether two lists of foods would look the same to friends (to skip a send that changes nothing). */
export function sameItems(a: readonly SharedMealItem[], b: readonly SharedMealItem[]): boolean {
  const key = (i: SharedMealItem) => [i.name, i.emoji ?? '', i.portion, i.source, i.foodId ?? '', i.barcode ?? '', i.serving ?? '', i.quantity ?? null, i.grams ?? null, i.kcal ?? null, i.kcalLow ?? null, i.kcalHigh ?? null];
  return JSON.stringify(a.map(key)) === JSON.stringify(b.map(key));
}
