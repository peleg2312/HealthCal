/**
 * The run log's two numbers, each with its own words, so neither reads as the other: what the session burned
 * ("~487 kcal burned", the whole burn, resting included) and what reaches the budget, which is only the part
 * above resting and only by the budget rule of the session's day (`exercisePlaced`, `@/lib/exerciseBudget`):
 * "+423 kcal added to your budget" on the day, "+423 kcal added to your budget over 7 days" spread over a week,
 * "423 kcal above resting, not added" when adding is off. Pure.
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
  if (rule === 'off') return { figure: n, words: 'above resting, not added to your budget', spoken: `${n} kilocalories above resting, not added to your budget` };
  const words = rule === 'week' ? 'added to your budget over 7 days' : 'added to your budget';
  return { figure: `+${n}`, words, spoken: `${n} kilocalories ${words}` };
}
