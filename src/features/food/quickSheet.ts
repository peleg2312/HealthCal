/**
 * The + sheet's words and its one rule of what it shows (`src/components/QuickLogSheet.tsx`), as pure functions
 * (quickSheet.test.ts). The sheet is one view at 360 x 740, 390 x 844 and 320 x 640: a title that names the meal,
 * one line with the day and what is left of its budget, four small ways in, Search food with Scan, Repeat, the
 * three most likely foods or meals and Water's glasses. Sentence case, no exclamation mark, a day over its budget
 * is "above" it (never "over").
 */
import { AI_TILE_HINT } from '@/features/ai/words';
import { saveRowDay } from '@/features/food/favoriteWords';
import { formatNumber } from '@/lib/units';
import type { ISODate } from '@/types';

/** How many likely foods or meals the sheet shows as rows; "See all N" opens food search for the rest. */
export const QUICK_ROWS = 3;

/**
 * The title: where the food goes. "Add to dinner", and on another day the day too, so a log meant for today
 * never quietly goes to the day the screen behind shows: "Add to dinner, yesterday", "Add to lunch, Sat, Nov 14".
 */
export function quickSheetTitle(meal: string, date: ISODate, today: ISODate): string {
  return date === today ? `Add to ${meal}` : `Add to ${meal}, ${saveRowDay(date, today)}`;
}

/**
 * The one line under the title: the day (only for today: another day is in the title, so it is said once) and
 * what is left of that day's budget, in food search's header words: "Today · 941 kcal left", "130 kcal above budget".
 */
export function quickSheetLine(date: ISODate, today: ISODate, remaining: number): string {
  const n = Math.round(remaining);
  const left = `${formatNumber(Math.abs(n))} kcal ${n < 0 ? 'above budget' : 'left'}`;
  return date === today ? `Today · ${left}` : left;
}

/**
 * The likely foods and meals, in the sheet's order (the meal's first usual food, the favourite meals, the favourite
 * foods, the other usual foods, the meal changed last): the first `QUICK_ROWS` are rows, and "See all N" shows
 * only when there are more than that, N being all of them.
 */
export function likelyRows<T>(all: readonly T[], max: number = QUICK_ROWS): { shown: T[]; total: number; more: boolean } {
  return { shown: all.slice(0, max), total: all.length, more: all.length > max };
}

/** The way to the rest of the likely foods: "See all 7" (it opens food search, where they are one tap each). */
export function seeAllLabel(total: number): string {
  return `See all ${total}`;
}

/** Its name for a screen reader, the drawn words first (label in name). */
export function seeAllSpoken(total: number, meal: string): string {
  return `See all ${total}, usual foods and favourites for ${meal} in food search`;
}

/**
 * The overline over the rows, naming the groups among the rows shown, in their order. The title already names the
 * meal, so a line that must fit beside "See all N" at 320 px says it only when it is short: "Usual for lunch",
 * "Usual and favourites", "Favourites", "Favourites and saved meals", "Saved meal".
 */
export function quickRowTitle(o: { meal: string; favourites: boolean; usual: boolean; saved: boolean }): string {
  if (o.usual) return o.favourites ? 'Usual and favourites' : `Usual for ${o.meal}`;
  if (o.favourites) return o.saved ? 'Favourites and saved meals' : 'Favourites';
  return 'Saved meal';
}

export type QuickWayId = 'photo' | 'describe' | 'activity' | 'weight' | 'scan';

/**
 * The ways in: one word under an icon on the sheet (Scan at the end of the Search row), the full name for a screen
 * reader, which starts with the drawn word (label in name), and the hint drawn under the name where every way in is a
 * whole row (large text). The two AI ways say "AI estimate", as their small "AI" tag does, with "AI" right after the
 * word: the tile's text reads "Photo AI" (the tag follows the word in the page's order), so the name holds the drawn
 * words in order (label in name).
 */
export const QUICK_WAYS: Record<QuickWayId, { label: string; wide: string; hint: string; spoken: string }> = {
  photo: { label: 'Photo', wide: 'Snap a meal', hint: AI_TILE_HINT.photo, spoken: 'Photo, AI estimate' },
  describe: { label: 'Describe', wide: 'Describe it', hint: AI_TILE_HINT.describe, spoken: 'Describe, AI estimate from what you type' },
  activity: { label: 'Activity', wide: 'Log activity', hint: 'Sport, gym, walk', spoken: 'Activity, log sport, gym or a walk' },
  weight: { label: 'Weigh in', wide: 'Weigh in', hint: 'Weight and body fat', spoken: 'Weigh in, weight and body fat' },
  scan: { label: 'Scan', wide: 'Scan barcode', hint: 'Packaged products', spoken: 'Scan barcode, packaged products' },
};

/** The words of a row with its hint (large text): the drawn name, then the hint, as before. */
export function wideWaySpoken(id: QuickWayId): string {
  const w = QUICK_WAYS[id];
  return `${w.wide}, ${w.hint}`;
}

/** The small tag on the two AI ways in. */
export const AI_TAG = 'AI';
