/**
 * One story for a goal weight's date. Two dates can be shown, and each says which one it is:
 *
 * - the plan's date: at the pace the plan gives (Goals, and the plan reveal in onboarding), as the
 *   same loose range the plan reveal draws ("between late January and mid March 2027"), from
 *   `projectTo` and `rangeText` in `@/features/onboarding/projection`;
 * - the trend's date: at the weight trend's current rate (Weight, Progress), as a month
 *   ("around May 2027 at your current trend").
 *
 * Neither is ever a day: a projection is not that precise. A rate is said with one decimal and
 * "a week" ("−0.2 kg a week"). Pure: no React, no storage, no clock (the day comes in).
 */
import { projectTo, rangeText } from '@/features/onboarding/projection';
import { weightText } from '@/features/trackers/helpers';
import { weightValue } from '@/lib/units';
import type { UnitSystem } from '@/types';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "May 2027": the month a trend reaches the goal, never a day. */
export function trendMonth(d: Date): string {
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "May" and "2027" for a figure whose year is drawn as its unit ("Sep" for the long months). */
export function trendMonthParts(d: Date): { month: string; year: string } {
  return { month: SHORT[d.getMonth()], year: String(d.getFullYear()) };
}

/** "−0.2 kg a week", "+0.4 lb a week", "0 kg a week": a measured rate, one decimal. */
export function weeklyRateText(kgSigned: number, units: UnitSystem): string {
  const v = weightValue(kgSigned, units);
  const r = Math.round(v * 10) / 10;
  const unit = units === 'imperial' ? 'lb' : 'kg';
  if (r === 0) return `0 ${unit} a week`;
  return `${r > 0 ? '+' : '−'}${Math.abs(r).toFixed(1)} ${unit} a week`;
}

/** "Goal, around May 2027": the trend's date where a label is short. */
export function trendGoalLabel(eta: Date): string {
  return `Goal, around ${trendMonth(eta)}`;
}

/** "74.0 kg around May 2027 at your current trend." A weight always has its one decimal. */
export function trendGoalLine(targetKg: number, eta: Date, units: UnitSystem): string {
  return `${weightText(targetKg, units)} around ${trendMonth(eta)} at your current trend.`;
}

/**
 * The plan's date in Goals: "On this plan, 74.0 kg between late January and mid March 2027." With
 * `paceDiffers` (the calorie minimum or a target set by hand decides the pace, not the stepper) the
 * pace is said too: "On this plan, about 0.3 kg a week: 74.0 kg around mid March 2027." Null when the
 * plan does not move toward the goal (the caller says so in its own words).
 */
export function planGoalLine(
  startKg: number,
  targetKg: number | undefined,
  weeklyKgSigned: number,
  units: UnitSystem,
  now: Date,
  paceDiffers = false,
): string | null {
  if (targetKg === undefined) return null;
  if (Math.abs(targetKg - startKg) < 0.5) return `You are within ${units === 'imperial' ? 'a pound' : 'half a kilo'} of ${weightText(targetKg, units)}.`;
  const p = projectTo(startKg, targetKg, weeklyKgSigned, now);
  if (!p) return null;
  const pace = paceDiffers ? `, about ${weeklyRateText(Math.abs(weeklyKgSigned), units).replace('+', '')}:` : ',';
  return `On this plan${pace} ${weightText(targetKg, units)} ${rangeText(p, now)}.`;
}
