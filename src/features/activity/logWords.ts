/**
 * The run log's two numbers, each with its own words, so neither reads as the other: what the session burned
 * ("~487 kcal burned", the whole burn, resting included) and what reaches the budget, which is only the part
 * above resting and only by the budget rule of the session's day (`exercisePlaced`, `@/lib/exerciseBudget`):
 * "~423 kcal added to your budget" on the day, "~423 kcal added to your budget over 7 days" spread over a week,
 * "~423 kcal not added to your budget" when adding is off. One name for that second number everywhere: "added"
 * ("not added"), always with "~" or "about", because the part above resting is an estimate even when a device
 * measured the burn; "burned" names only the whole burn. Train's history rows say the same, shorter
 * (`budgetAddsShort`: "~423 kcal added"). Pure.
 */
import type { ExerciseRule } from '@/lib/exerciseBudget';
import { formatNumber } from '@/lib/units';

/** The unit beside the burn: one word says what the number is. */
export const BURN_UNIT = 'kcal burned';

/** The overline over the burn: where it comes from. */
export function burnSource(measuredBy: string | null): string {
  return measuredBy ? `Measured by ${measuredBy}` : 'Estimate';
}

/** The line under the burn: the estimate's range, or what a device's total holds. */
export function burnCaption(range: readonly [number, number] | null): string {
  return range ? `likely ${formatNumber(range[0])}–${formatNumber(range[1])} kcal` : 'total, resting included';
}

/** The second number: what the budget gains, by the day's rule. */
export function budgetAdds(rule: ExerciseRule, net: number): { figure: string; words: string; spoken: string } {
  const n = formatNumber(net);
  const words = rule === 'off' ? 'not added to your budget' : rule === 'week' ? 'added to your budget over 7 days' : 'added to your budget';
  return { figure: `~${n}`, words, spoken: `about ${n} kilocalories ${words}` };
}

/**
 * The same words cut to a history row's few, after "~290 kcal": `budgetAdds` less "to your budget"
 * ("added", "added over 7 days", "not added"), so the row and the run log never disagree.
 */
export function budgetAddsShort(rule: ExerciseRule): string {
  return rule === 'off' ? 'not added' : rule === 'week' ? 'added over 7 days' : 'added';
}

/**
 * What the run log's greyed next-day arrow says to a screen reader: the date stops at today because a burn is
 * logged once it happened (food can be planned a week ahead; a workout cannot).
 */
export const NEXT_DAY_HINT = 'Workouts are logged once done';
