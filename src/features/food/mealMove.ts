/**
 * Edit entry's one-tap move (`pickMeal` in src/app/food/detail.tsx). Another meal picked while the amount,
 * serving and day are as stored (and the amount on screen can be saved) saves at once and goes back to the
 * diary with the save's toast and Undo; with anything else changed the meal is only chosen, and Save writes
 * all of it. The meal is a radio, so a pick that leaves the screen is advised beforehand (WCAG 3.2.2): one
 * line under the meal choice, only in Edit entry, tied to the radiogroup (`aria-describedby` on the web, each
 * radio's `accessibilityHint` natively), says which of the two a pick does now.
 */
import type { FoodEntry, ISODate } from '@/types';

/** The entry as it is on screen: its day, its amount and serving, and whether Save could write it. */
export interface EntryOnScreen {
  date: ISODate;
  quantity: number;
  servingLabel: string;
  /** The amount is above 0 grams, its field holds a number it can take, and no paired drink refuses it. */
  savable: boolean;
}

/** Whether picking another meal in Edit entry moves the entry at once (else the meal is only chosen). */
export function pickMovesAtOnce(entry: Pick<FoodEntry, 'date' | 'quantity' | 'servingLabel'> | undefined, now: EntryOnScreen): boolean {
  return !!entry && now.savable && now.date === entry.date && now.quantity === entry.quantity && now.servingLabel === entry.servingLabel;
}

/** Said under the meal choice while a pick moves the entry at once. */
export const MEAL_PICK_MOVES = 'Picking another meal moves this entry and returns to the diary.';
/** Said there while something else has changed, so a pick only chooses and Save writes it. */
export const MEAL_PICK_CHOOSES = 'The meal you pick is saved with your other changes.';

/** The line under Edit entry's meal choice: what a pick does now. */
export function mealPickAdvice(moves: boolean): string {
  return moves ? MEAL_PICK_MOVES : MEAL_PICK_CHOOSES;
}
