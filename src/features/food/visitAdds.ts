/**
 * Adding several foods in a row from food search (src/app/food/search.tsx): what this visit added, the words of
 * the "Added in this search" sheet that lists them with one Undo each, and where the focus goes after a one-tap
 * add. Pure (the press handler reads the clock and the focus, never a render), so it is tested.
 */
import { isWaterDrinkEntry } from '@/features/drinks/via';
import { MEAL_LABEL } from '@/lib/nutrition';
import type { FoodEntry, ISODate, MealType } from '@/types';

import { displayFoodName } from './displayName';
import { kcal, portionLabel } from './helpers';

/** One food this visit added; `removed` once it was taken back (its Undo here, the toast's, or elsewhere). */
export interface VisitAdd {
  entry: FoodEntry;
  removed: boolean;
}

/**
 * What search added on this visit to the day it shows, newest first: every entry dated that day that did not exist
 * when the screen opened (`existing`, by id, never by time: a clock that was wrong must not count old entries),
 * removed ones kept in their place so the list never moves under the finger. Drinks logged on Water are left out.
 */
export function visitAdds(entries: Readonly<Record<string, FoodEntry>>, existing: ReadonlySet<string>, date: ISODate): VisitAdd[] {
  return Object.values(entries)
    .filter((e) => e.date === date && !existing.has(e.id) && !isWaterDrinkEntry(e))
    .sort((a, b) => (a.loggedAt === b.loggedAt ? (a.id < b.id ? 1 : -1) : a.loggedAt < b.loggedAt ? 1 : -1))
    .map((entry) => ({ entry, removed: !!entry.deleted }));
}

/** The sheet's title: what it lists. */
export const VISIT_ADDS_TITLE = 'Added in this search';

/**
 * A row's line under its name: the portion and calories ("1 large · 90 kcal"), and the meal only when it is not the
 * one search is adding to now (the meal can be changed mid-visit): "1 cup · 205 kcal · Dinner".
 */
export function visitAddCaption(entry: Pick<FoodEntry, 'servingLabel' | 'quantity' | 'nutrients' | 'meal'>, meal: MealType): string {
  const where = entry.meal === meal ? '' : ` · ${MEAL_LABEL[entry.meal]}`;
  return `${portionLabel(entry.servingLabel, entry.quantity)} · ${kcal(entry.nutrients.kcal)} kcal${where}`;
}

/** A row's Undo, named with what it takes back, its visible word first: "Undo, Egg, fried, 1 large, 90 kcal, lunch". */
export function undoAddLabel(entry: Pick<FoodEntry, 'name' | 'source' | 'servingLabel' | 'quantity' | 'nutrients' | 'meal'>): string {
  return `Undo, ${displayFoodName(entry)}, ${portionLabel(entry.servingLabel, entry.quantity)}, ${kcal(entry.nutrients.kcal)} kcal, ${MEAL_LABEL[entry.meal].toLowerCase()}`;
}

/** How long after the field lost the focus a one-tap add still counts as made while typing (the tap's own blur, web). */
export const FIELD_BLUR_WINDOW_MS = 600;

/**
 * Whether a one-tap add in search (a row's "+", the best match's Add) puts the focus back in the search field, with
 * its words selected so the next letter typed starts the next search. The words stay rather than clear: the row just
 * added keeps its amount control in view, the best match's done mark stays where the finger is (so the second tap of a
 * double tap never lands on Close search above it), and one letter replaces them all.
 *
 * - Pressed with a keyboard (web): always back to the field, else the focus would be lost with the "+" it was on.
 * - Words typed and the field had the focus (still has it, or lost it to this very tap): back to it, so the phone's
 *   keyboard stays up for the next food.
 * - Otherwise (a tap in Usual, Recent, ... with nothing typed, or after the keyboard was put away): left where it is,
 *   so the keyboard never jumps up over a list being browsed.
 */
export function refocusAfterAdd(s: { typed: boolean; fieldFocused: boolean; blurredMsAgo: number; byKeyboard: boolean }): boolean {
  if (s.byKeyboard) return true;
  return s.typed && (s.fieldFocused || s.blurredMsAgo <= FIELD_BLUR_WINDOW_MS);
}
