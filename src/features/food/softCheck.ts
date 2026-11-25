/**
 * The soft check of an amount for one entry (rubric D8-04, error prevention): an amount above what one plausible
 * entry holds is stored only on a second press of the screen's Add (or Save). The first press stores nothing: a
 * question tied to the field, in Water's words ("Is 5,000 kcal right for one entry? Tap Add again to add it."),
 * drawn as reading text by `AskLine` (./AskLine.tsx), the button names the amount it will store, and the question
 * is spoken, units in full, without moving the focus. Any other amount asks again; an amount below the check, or
 * one already stored, never asks. The hard limits are unchanged (quick add's `QUICK_KCAL_LIMIT`, the grams
 * field's 20,000 g). Pure, so the screens only place the words: quick add (src/app/food/quick.tsx) and food detail
 * (src/app/food/detail.tsx, its portion's question drawn by `AmountEditor`).
 */
import { formatNumber } from '@/lib/units';
import { MEAL_LABEL } from '@/lib/nutrition';
import type { Food, MealType } from '@/types';

import { QUICK_KCAL_LIMIT } from './helpers';

/**
 * Above this many calories one entry asks once more. A day's target is set between 800 and 6,000 kcal (Goals)
 * and most are near 2,000: a single entry above 3,000 is rare enough that a slip of a digit (5,000 for 500) is
 * the likelier reading, and rare enough that the second press costs little when it is right.
 */
export const ENTRY_KCAL_CHECK = 3000;

/** What a press of Add does: 'add', or 'ask' when the amount asks and the last press did not ask about this one. */
export function pressFor(asks: boolean, amount: number, askedFor: number | null): 'add' | 'ask' {
  return asks && askedFor !== amount ? 'ask' : 'add';
}

/** Whether the screen waits for the second press: the last press asked about the amount on screen now. */
export function waitsFor(asks: boolean, amount: number | null, askedFor: number | null): boolean {
  return asks && amount !== null && askedFor === amount;
}

// ---------------------------------------------------------------- quick add's calories

/** Whether quick add's calories ask: above `ENTRY_KCAL_CHECK` and under the hard limit (which is the field's error). */
export function quickKcalAsks(kcal: number | null): boolean {
  return kcal !== null && kcal > ENTRY_KCAL_CHECK && kcal < QUICK_KCAL_LIMIT;
}

/**
 * The question under a field while its Add (or Save) waits for the second press, in Water's words for one voice
 * across the app (`drinkAmountCheck`: "Is 2.5 L right for one drink? Tap Add again to add it."): the amount as typed,
 * then what the second press does. Two sentences: drawn as reading text (body, textSecondary) by `AskLine`.
 */
function askLine(amount: string, edit: boolean): string {
  return `Is ${amount} right for one entry? Tap ${edit ? 'Save again to save it' : 'Add again to add it'}.`;
}

/** Calories: "Is 5,000 kcal right for one entry? Tap Add again to add it." (Save, editing an entry's own numbers). */
export function kcalAsk(kcal: number, edit: boolean): string {
  return askLine(`${formatNumber(Math.round(kcal))} kcal`, edit);
}

/**
 * Whether calories typed into an entry's own numbers (Edit entry of a quick add or an AI estimate) ask before
 * Save: above `ENTRY_KCAL_CHECK` and not the calories it already holds.
 */
export function editedKcalAsks(kcal: number | null, stored: number): boolean {
  return kcal !== null && kcal > ENTRY_KCAL_CHECK && Math.round(kcal) !== Math.round(stored);
}

/** That editor's Save while it waits: "Save 5,000 kcal". */
export function kcalSaveTitle(kcal: number): string {
  return `Save ${formatNumber(Math.round(kcal))} kcal`;
}

/** The Add button: "Add to lunch", and while it waits for the second press, the amount it will add ("Add 5,000 kcal to lunch"). */
export function quickAddTitle(meal: MealType, waitingFor: number | null): string {
  const where = MEAL_LABEL[meal].toLowerCase();
  return waitingFor === null ? `Add to ${where}` : `Add ${formatNumber(Math.round(waitingFor))} kcal to ${where}`;
}

// ---------------------------------------------------------------- food detail's portion

/** A portion asks above this many times the food's largest household measure ... */
export const PORTION_CHECK_TIMES = 5;
/** ... and never at or under this many grams, so a food measured in spoonfuls or crackers does not ask at 60 g. */
export const PORTION_CHECK_FLOOR = 500;

/**
 * The grams above which one portion of this food asks: five times its largest household measure (a food
 * weighed only in grams counts 100 g), at least 500 g. 1,500 g of banana (largest measure 136 g) asks; a
 * 1,430 g plate of watermelon wedges does not.
 */
export function portionCheckGrams(food: Pick<Food, 'servings'>): number {
  const own = food.servings.filter((s) => s.grams > 0).map((s) => s.grams);
  const largest = own.length ? Math.max(...own) : 100;
  return Math.max(PORTION_CHECK_FLOOR, PORTION_CHECK_TIMES * largest);
}

/**
 * Whether a portion asks before it is stored: above `portionCheckGrams`, or above `ENTRY_KCAL_CHECK`, and not
 * the amount the entry already holds (`storedGrams`: an edit of the meal or the day never asks again).
 */
export function portionAsks(food: Pick<Food, 'servings'>, grams: number, kcal: number, storedGrams?: number): boolean {
  if (!(grams > 0)) return false;
  if (storedGrams !== undefined && Math.abs(storedGrams - grams) < 0.05) return false;
  return grams > portionCheckGrams(food) || kcal > ENTRY_KCAL_CHECK;
}

/** A portion: "Is 1,500 g right for one entry? Tap Add again to add it." (Save in Edit entry). */
export function portionAsk(grams: number, edit: boolean): string {
  return askLine(`${formatNumber(Math.round(grams))} g`, edit);
}

/** Food detail's button while it waits: the amount it will store ("Add 1,500 g to lunch", "Save 1,500 g"). */
export function portionTitle(edit: boolean, meal: MealType, grams: number): string {
  const amount = `${formatNumber(Math.round(grams))} g`;
  return edit ? `Save ${amount}` : `Add ${amount} to ${MEAL_LABEL[meal].toLowerCase()}`;
}
