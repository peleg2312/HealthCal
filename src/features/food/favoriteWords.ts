/**
 * The words of favourites and of saved estimates, as pure functions (favoriteWords.test.ts): sentence
 * case, no exclamation mark, none of the morning page's banned words. A screen passes `isolateRtl(name)`
 * into a toast and keeps the raw name in a label (`withoutMarks`).
 */
import { addDays, formatShortDate, weekdayShort } from '@/lib/dates';
import { formatNumber } from '@/lib/units';
import type { ISODate } from '@/types';

export type FavoriteKind = 'food' | 'meal';

/**
 * The verb first, so a food name with commas never reads as a list: "Added to favourites: Banana, raw",
 * "Removed from favourites: \"Usual breakfast\"" (meals are quoted, as Saved "…" is).
 */
export function favoriteToast(name: string, on: boolean, kind: FavoriteKind): string {
  const who = kind === 'meal' ? `"${name}"` : name;
  return `${on ? 'Added to' : 'Removed from'} favourites: ${who}`;
}

/** The star's label: what a tap does. */
export function favoriteLabel(name: string, on: boolean): string {
  return on ? `Remove ${name} from favourites` : `Add ${name} to favourites`;
}

/** A saved-meal row's "+" (search's Saved meals and Favourites): "Log Usual breakfast" (it opens the log sheet). */
export function logMealLabel(name: string): string {
  return `Log ${name}`;
}

/** The named accessibility action on a row that a long press stars (same words on both platforms). */
export const FAVOURITE_ACTION = { name: 'favorite', add: 'Add to favourites', remove: 'Remove from favourites' } as const;

export function favoriteActionLabel(on: boolean): string {
  return on ? FAVOURITE_ACTION.remove : FAVOURITE_ACTION.add;
}

export const FAVOURITES_EMPTY = {
  title: 'No favourites yet',
  message: 'Tap the star on a food or a saved meal, or press and hold it in search or the diary.',
} as const;

/** The overlines over the two groups of the Favourites tab (drawn only when both are there). */
export const FAVOURITE_GROUPS = { meals: 'Meals', foods: 'Foods' } as const;

/**
 * The + sheet's overline over its row of one-tap tiles, naming the groups in the order they are drawn.
 * Favourite tiles (meals, then foods) always lead the row, so a row with one reads "Favourites and usual
 * for lunch"; "Usual for lunch" as before when no favourite is in the row; never "usual" for a row
 * without usual foods.
 */
export function quickRowTitle(o: { meal: string; favourites: boolean; usual: boolean; saved: boolean }): string {
  if (o.favourites) return o.usual ? `Favourites and usual for ${o.meal}` : o.saved ? 'Favourites and saved meals' : 'Favourites';
  if (o.usual) return `Usual for ${o.meal}`;
  return 'Saved meal';
}

/**
 * A calorie figure that is an estimate (a saved AI meal, an idea whose items carry a range) never shows
 * an exact number: "~473". Exact figures are unchanged: "473".
 */
export function approxKcal(kcal: number, estimate: boolean): string {
  return `${estimate ? '~' : ''}${formatNumber(Math.round(kcal))}`;
}

/** The same for a screen reader: "about 473 kilocalories". */
export function approxKcalSpoken(kcal: number, estimate: boolean): string {
  return `${estimate ? 'about ' : ''}${Math.round(kcal)} kilocalories`;
}

/** Does any item carry a range (an AI estimate kept as one)? */
export function hasEstimate(items: readonly { kcalRange?: unknown }[]): boolean {
  return items.some((it) => Array.isArray(it.kcalRange));
}

/** Is a favourite food an estimate: an AI food, or one whose last entry carries a range? */
export function isEstimateFood(food: { source?: string }, last?: { kcalRange?: unknown } | null): boolean {
  return food.source === 'ai' || Array.isArray(last?.kcalRange);
}

/**
 * The + sheet's favourite food tile: its caption ("150 g, ~248 kcal" for an estimate, "1 medium, 105 kcal"
 * otherwise) and its label ("Add favourite Grilled chicken, 150 g, about 248 kilocalories, to lunch").
 */
export function favoriteFoodTile(o: { name: string; portion: string; kcal: number; estimate: boolean; meal: string }): { caption: string; label: string } {
  return {
    caption: `${o.portion}, ${approxKcal(o.kcal, o.estimate)} kcal`,
    label: `Add favourite ${o.name}, ${o.portion}, ${approxKcalSpoken(o.kcal, o.estimate)}, to ${o.meal}`,
  };
}

/**
 * The day in "Save lunch as a meal" (its count line, "3 items, yesterday"), from the day the screen holds
 * (`useToday()`), never from the clock while rendering: "today", "yesterday", "tomorrow", else "Sat, Nov 14".
 */
export function saveRowDay(date: ISODate, today: ISODate): string {
  if (date === today) return 'today';
  if (date === addDays(today, -1)) return 'yesterday';
  if (date === addDays(today, 1)) return 'tomorrow';
  return `${weekdayShort(date)}, ${formatShortDate(date)}`;
}

/** The + sheet's caption for a saved meal tile: "3 items, ~640 kcal", "1 of 4 servings, 520 kcal". */
export function savedTileCaption(o: { items: number; servings: number; servingsText: string; kcal: number; estimate: boolean }): string {
  const k = `${approxKcal(o.kcal, o.estimate)} kcal`;
  return o.servings > 1 ? `1 of ${o.servingsText} servings, ${k}` : `${o.items} ${o.items === 1 ? 'item' : 'items'}, ${k}`;
}

/** The search's saved-meal row caption: "2 items · ~332 kcal", "~410 kcal per serving · makes 4". */
export function savedRowCaption(o: { items: number; servings: number; servingsText: string; kcal: number; estimate: boolean }): string {
  const k = approxKcal(o.kcal, o.estimate);
  return o.servings > 1 ? `${k} kcal per serving · makes ${o.servingsText}` : `${o.items} ${o.items === 1 ? 'item' : 'items'} · ${k} kcal`;
}
