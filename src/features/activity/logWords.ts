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
 * "Where this number comes from" on the run log: how the two figures above it come about, without saying either
 * of them again (a figure is said once in a view: the burn in the hero, what is added in its tile). `how` says how
 * the burn was found (the MET formula, or the device's own total); `resting` what the day already assumes for
 * resting and where the part above it goes by the day's rule (the week rule's daily share is a figure of its own);
 * `note` the estimate's margin, or what an edit does to a measured figure. Pure.
 */
export function sourceWords(o: {
  /** The device's or app's name when it measured the burn; null for an estimate. */
  measuredBy: string | null;
  /** The estimate's MET formula: the MET value, the weight as written ("78.8 kg") and the minutes. */
  formula: { met: number; weight: string; minutes: number } | null;
  /** What the day assumes for resting and daily life, and its share in these minutes, in kcal. */
  restingDay: number;
  restingShare: number;
  rule: ExerciseRule;
  /** The week rule's share a day (`dailyShare`), in kcal. */
  dayShare: number;
  /** "today's", "yesterday's", "Tue, Nov 10's". */
  dayWord: string;
}): { how: string; resting: string; note: string } {
  const how = o.measuredBy
    ? `The burn above is the total ${o.measuredBy} measured for this session, resting included.`
    : o.formula
      ? `${o.formula.met} MET × 3.5 ml O₂ per kg per minute × ${o.formula.weight} × ${o.formula.minutes} min ÷ 200 gives the burn above.`
      : 'The burn above is an estimate.';
  const where =
    o.rule === 'week'
      ? `The part above that is spread over 7 days: about ${formatNumber(o.dayShare)} kcal a day is added to ${o.dayWord} budget and each of the next six days.`
      : o.rule === 'day'
        ? `The part above that is added to ${o.dayWord} budget.`
        : 'The part above that would be added, but adding exercise calories back is turned off in your goals, so your budget stays the same.';
  const resting = `Your day already assumes ${formatNumber(o.restingDay)} kcal for resting and daily life, ${formatNumber(o.restingShare)} kcal of it in these minutes. ${where}`;
  const note = o.measuredBy
    ? 'Changing the activity, the effort or the duration replaces the measured figure with an estimate.'
    : 'MET values describe an average adult, so the range allows about 20% either way.';
  return { how, resting, note };
}

/**
 * What the run log's greyed next-day arrow says to a screen reader: the date stops at today because a burn is
 * logged once it happened (food can be planned a week ahead; a workout cannot).
 */
export const NEXT_DAY_HINT = 'Workouts are logged once done';
