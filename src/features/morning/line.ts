/**
 * The words on the morning page ("Yesterday"). Pure and unit-tested; the screen only places them.
 *
 * Neutral and factual (product principle 4): going over the budget is information, so the
 * sentence names the amount in plain words and the cup's amber lip carries the colour. Never
 * "over", "failed", "cheat", praise, an exclamation mark or advice. Sleep is not in the
 * sentence: last night belongs to today, and its cup speaks for it.
 */
import { NBSP } from '@/lib/text';
import { formatNumber } from '@/lib/units';
import type { ActivityEntry } from '@/types';

export interface MorningLineInput {
  /** Calories eaten yesterday. */
  kcal: number;
  /** Yesterday's budget (its own snapshot), exercise included when eat-back is on. */
  budget: number;
  /** isCompleteDay(kcal, budget) from @/lib/trend: a fully logged day. */
  complete: boolean;
  /** Any food entry yesterday. */
  foodLogged: boolean;
  /** goalMet(protein, proteinG) */
  proteinMet: boolean;
  /** goalMet(waterMl, waterGoalMl) */
  waterMet: boolean;
}

/** A goal meant to be reached is met when there is a goal and the value is at or past it. */
export function goalMet(value: number, goal: number): boolean {
  return goal > 0 && value >= goal;
}

function caloriePart({ kcal, budget, complete, foodLogged }: MorningLineInput): string {
  if (!foodLogged) return 'No food logged';
  if (budget <= 0) return `${formatNumber(kcal)} kcal logged`;
  // Entries that add up to 0 kcal (water-only drinks, a black coffee): the cup and its number already say 0.
  if (!complete) return kcal > 0 ? `Part of the day logged, ${formatNumber(kcal)} kcal` : 'Part of the day logged';
  if (kcal <= budget) return "Within the day's budget";
  // Above is anything over the budget, as on the recap, Progress and the share card (`budgetMark`): the amount, never "within 10%".
  return `${formatNumber(kcal - budget)} kcal above the day's budget`;
}

/**
 * The one sentence at the top of the card, for example "Within the day's budget, with protein
 * and water reached." or "320 kcal above the day's budget, with water reached."
 */
export function morningLine(input: MorningLineInput): string {
  const cal = caloriePart(input);
  const goals = [input.proteinMet ? 'protein' : null, input.waterMet ? 'water' : null].filter((g): g is string => g !== null);
  if (goals.length === 0) return `${cal}.`;
  const joined = goals.join(' and ');
  // Without food only water can be met.
  return input.foodLogged ? `${cal}, with ${joined} reached.` : `${cal}; ${joined} reached.`;
}

export type MoveActivity = Pick<ActivityEntry, 'name' | 'emoji' | 'durationMin' | 'measured'>;

/** The movement line when yesterday has no activity. The screen shows it in textSecondary. */
export const NO_WORKOUT = 'No workout logged';

const round10 = (n: number) => Math.round(n / 10) * 10;

/** Device-measured calories are shown as measured; any estimate in the mix makes the total "about", to the nearest 10. */
function kcalPart(activities: MoveActivity[], exerciseNet: number, added: boolean): string {
  const measured = activities.every((a) => a.measured === true);
  // The run log's words for the part above resting (`budgetAdds`): "added", or "not added" while adding was off,
  // always "about" (a device measures the burn; the part above resting is still an estimate). "about" stays with
  // its number, so a narrow line breaks after the "·", never between the hedge and the figure.
  const n = measured ? formatNumber(Math.round(exerciseNet)) : formatNumber(round10(exerciseNet));
  return `about${NBSP}${n} kcal ${added ? 'added' : 'not added'}`;
}

/** The minutes and the "·" after them stay on one line: a break falls after the dot, before the calories. */
const SEP = `${NBSP}· `;

/**
 * Yesterday's movement in one line: "🏃 Running, 42 min · about 380 kcal added",
 * "3 sessions, 95 min · about 610 kcal added", or NO_WORKOUT. `exerciseNet` is the day's net
 * exercise calories (DaySummary.exerciseNet: above resting, never gross); `added` is false when that day
 * did not add workouts to its budget (`DaySummary.exerciseRule` 'off').
 */
export function moveLine(activities: MoveActivity[], exerciseNet: number, added = true): string {
  if (activities.length === 0) return NO_WORKOUT;
  const kcal = kcalPart(activities, exerciseNet, added);
  if (activities.length === 1) {
    const a = activities[0];
    const label = [a.emoji.trim(), a.name.trim()].filter(Boolean).join(' ');
    return `${label}, ${Math.round(a.durationMin)} min${SEP}${kcal}`;
  }
  const minutes = Math.round(activities.reduce((s, a) => s + a.durationMin, 0));
  return `${activities.length} sessions, ${minutes} min${SEP}${kcal}`;
}

/**
 * What a screen reader says for the movement row, for example "Running, 42 minutes, about
 * 380 kilocalories added to the budget. 9,210 steps. Opens Train". `stepsNote` is added after the
 * steps when they came from a Health export file (fileStepsNote).
 */
export function moveAccessibilityLabel(activities: MoveActivity[], exerciseNet: number, steps: number | null | undefined, stepsNote?: string, added = true): string {
  const parts: string[] = [];
  if (activities.length === 0) parts.push(`${NO_WORKOUT}.`);
  else {
    const measured = activities.every((a) => a.measured === true);
    const where = added ? 'added to the budget' : 'not added to the budget';
    const kcal = measured
      ? `about ${formatNumber(Math.round(exerciseNet))} kilocalories ${where}, from a measured burn`
      : `about ${formatNumber(round10(exerciseNet))} kilocalories ${where}`;
    const what =
      activities.length === 1
        ? `${activities[0].name.trim()}, ${Math.round(activities[0].durationMin)} minutes`
        : `${activities.length} sessions, ${Math.round(activities.reduce((s, a) => s + a.durationMin, 0))} minutes`;
    parts.push(`${what}, ${kcal}.`);
  }
  if (steps && steps > 0) {
    parts.push(`${formatNumber(steps)} steps.`);
    if (stepsNote) parts.push(`${stepsNote.replace(/\.$/, '')}.`);
  }
  parts.push('Opens Train');
  return parts.join(' ');
}
