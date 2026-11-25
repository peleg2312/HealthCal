/**
 * Quick add's soft check (rubric D8-04, error prevention): calories above what one plausible entry holds
 * (`QUICK_KCAL_CHECK`) are added only on a second press of Add. The first press adds nothing: a line tied to
 * the calories field (its hint) says why it waits, the button names the amount it will add, and the line is
 * spoken without moving the focus. Any other amount asks again; the hard limit (`QUICK_KCAL_LIMIT`, under
 * `quickKcalError`) is unchanged. Pure, so the screen only places the words (src/app/food/quick.tsx).
 */
import { formatNumber } from '@/lib/units';
import { MEAL_LABEL } from '@/lib/nutrition';
import type { MealType } from '@/types';

import { QUICK_KCAL_LIMIT } from './helpers';

/**
 * Above this many calories one quick add asks once more. A day's target is set between 800 and 6,000 kcal
 * (Goals) and most are near 2,000; a single meal above 3,000 is rare enough that a slip of a digit (5,000 for
 * 500) is the likelier reading, and rare enough that the second press costs little when it is right.
 */
export const QUICK_KCAL_CHECK = 3000;

/** Whether quick add's calories wait for a second press: above `QUICK_KCAL_CHECK` and under the hard limit. */
export function quickKcalAsks(kcal: number | null): boolean {
  return kcal !== null && kcal > QUICK_KCAL_CHECK && kcal < QUICK_KCAL_LIMIT;
}

/**
 * What a press of Add does with these calories: 'add', or 'ask' for a large amount the last press did not ask
 * about (`askedFor`, the amount it asked about, or null). A press on the amount just asked about adds it.
 */
export function quickAddPress(kcal: number, askedFor: number | null): 'add' | 'ask' {
  return quickKcalAsks(kcal) && askedFor !== kcal ? 'ask' : 'add';
}

/** Whether the screen is waiting for the second press: the last press asked about the amount on screen now. */
export function quickAddWaiting(kcal: number | null, askedFor: number | null): boolean {
  return kcal !== null && askedFor === kcal && quickKcalAsks(kcal);
}

/** The line tied to the calories field while Add waits for its second press (one sentence, neutral). */
export const QUICK_KCAL_ASK = 'More than most meals: press Add again if the number is right.';

/** The Add button: "Add to lunch", and while it waits for the second press, the amount it will add ("Add 5,000 kcal to lunch"). */
export function quickAddTitle(meal: MealType, waitingFor: number | null): string {
  const where = MEAL_LABEL[meal].toLowerCase();
  return waitingFor === null ? `Add to ${where}` : `Add ${formatNumber(Math.round(waitingFor))} kcal to ${where}`;
}
