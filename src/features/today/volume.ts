/**
 * Water amounts as they are printed, so the parts on screen add up: "1.23 L
 * drunk" and "2.07 L left" make the "3.3 L" goal shown beside them, in metric
 * and in imperial. Pure, unit-tested.
 */
import { formatVolume, ML_PER_FLOZ as ML_PER_FL_OZ } from '@/lib/units';
import type { UnitSystem } from '@/types';

/**
 * The amount in ml that `formatVolume` prints for `ml` (what the reader sees,
 * back in ml). Read from the printed text itself, so it rounds exactly as the
 * screen does (3,425 ml prints "3.42 L", not 3.43).
 */
export function shownMl(ml: number, units: UnitSystem): number {
  const text = formatVolume(Math.max(0, ml), units);
  const n = Number(text.slice(0, text.indexOf(' ')));
  if (units === 'imperial') return n * ML_PER_FL_OZ;
  return text.endsWith(' L') ? Math.round(n * 1000) : n;
}

function trim(n: number, decimals: number): string {
  return String(Number(n.toFixed(decimals)));
}

/**
 * What is left to drink, worked out from the goal and the amount as shown, so
 * the two printed parts sum to the printed goal. Never below zero.
 */
export function waterLeftMl(drunkMl: number, goalMl: number, units: UnitSystem): number {
  return Math.max(0, shownMl(goalMl, units) - shownMl(drunkMl, units));
}

/** `waterLeftMl` printed. In metric a left-over litre keeps the third decimal it needs to add up (995 ml + 1.605 L = 2.6 L). */
export function formatWaterLeft(drunkMl: number, goalMl: number, units: UnitSystem): string {
  const left = waterLeftMl(drunkMl, goalMl, units);
  if (units === 'metric' && left >= 1000) return `${trim(left / 1000, leftLitreDecimals(left))} L`;
  return formatVolume(left, units);
}

/**
 * The number part of a volume while it ticks toward `finalMl`, always in the
 * unit the final value is printed in ("0.98" on the way to "1.23 L", never
 * "980" beside an "L").
 */
export function volumeNumber(ml: number, finalMl: number, units: UnitSystem, litreDecimals = 2): string {
  const v = Math.max(0, ml);
  if (units === 'imperial') {
    const finalOz = Math.max(0, finalMl) / ML_PER_FL_OZ;
    const oz = v / ML_PER_FL_OZ;
    return finalOz < 10 ? trim(oz, 1) : String(Math.round(oz));
  }
  return finalMl >= 1000 ? trim(v / 1000, litreDecimals) : String(Math.round(v));
}

/** Litre decimals `formatWaterLeft` uses for `leftMl`: 2, or 3 when the sum needs it. */
export function leftLitreDecimals(leftMl: number): number {
  return Math.round(leftMl) % 10 === 0 ? 2 : 3;
}

/** The unit `formatVolume` prints for `ml`: "L", "ml" or "fl oz". */
export function volumeUnitFor(ml: number, units: UnitSystem): string {
  if (units === 'imperial') return 'fl oz';
  return ml >= 1000 ? 'L' : 'ml';
}

/** True when adding `ml` to `beforeMl` reaches a goal that was not reached yet. */
export function crossesGoal(beforeMl: number, ml: number, goalMl: number): boolean {
  return goalMl > 0 && ml > 0 && beforeMl < goalMl && beforeMl + ml >= goalMl;
}

/**
 * The day's water against its goal as Today's water row prints it: "1.48 of 3.3 L", the unit said
 * once when both amounts share it, else "250 ml of 2.55 L"; "40 of 112 fl oz" in imperial.
 */
export function waterOfGoal(ml: number, goalMl: number, units: UnitSystem): string {
  const amount = formatVolume(Math.max(0, ml), units);
  const goal = formatVolume(Math.max(0, goalMl), units);
  const [n, unit] = [amount.slice(0, amount.indexOf(' ')), amount.slice(amount.indexOf(' ') + 1)];
  return goal.endsWith(` ${unit}`) ? `${n} of ${goal}` : `${amount} of ${goal}`;
}

/** The glass size a one-tap glass logs (Today's water row, the home-screen widget): the second smallest preset (250 ml by default). */
export function defaultGlass(presets: number[]): number {
  const sorted = [...presets].filter((p) => p > 0).sort((a, b) => a - b);
  return sorted[1] ?? sorted[0] ?? 250;
}
