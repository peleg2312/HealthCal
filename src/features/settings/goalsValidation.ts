/**
 * Validation for the Goals screen. Pure, so the same rules as
 * onboarding can be tested without rendering the form.
 */
import { defaultRateKg, LIMITS } from '@/features/onboarding/model';
import { ageFromBirthDate, fromISODate, toISODate } from '@/lib/dates';
import { maxWeeklyRateKg } from '@/lib/energy';
import { formatWeight } from '@/lib/units';
import type { GoalType, UnitSystem } from '@/types';

/** Height range accepted on this screen, cm (3'4" to 8'2"). */
export const HEIGHT_CM: readonly [number, number] = [100, 250];
/** Smallest gap between current and target weight, kg (as in onboarding). */
export const TARGET_MARGIN_KG = 0.2;

/** Null when `text` is a real calendar date, not in the future, for an age onboarding accepts. */
export function birthDateError(text: string, now: Date = new Date()): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return 'Use the format YYYY-MM-DD, for example 1990-04-21.';
  const d = fromISODate(text);
  if (Number.isNaN(d.getTime()) || toISODate(d) !== text) return 'That date does not exist. Check the month and day.';
  if (text > toISODate(now)) return 'The birth date cannot be in the future.';
  const age = ageFromBirthDate(text, now);
  if (age < LIMITS.age[0]) return `HealthCal's equations are designed for people aged ${LIMITS.age[0]} and over.`;
  if (age > LIMITS.age[1]) return `Check the year: that is over ${LIMITS.age[1]} years ago.`;
  return null;
}

/** Null when the target weight fits the goal; undefined target is allowed (no projection). */
export function targetWeightError(goal: GoalType, weightKg: number, targetKg: number | undefined, units: UnitSystem): string | null {
  if (goal === 'maintain' || targetKg === undefined) return null;
  const [lo, hi] = LIMITS.weightKg;
  if (targetKg < lo || targetKg > hi) return `Enter a weight between ${formatWeight(lo, units, 0)} and ${formatWeight(hi, units, 0)}.`;
  if (goal === 'lose' && targetKg > weightKg - TARGET_MARGIN_KG) return 'Choose a weight below your current weight.';
  if (goal === 'gain' && targetKg < weightKg + TARGET_MARGIN_KG) return 'Choose a weight above your current weight.';
  return null;
}

export interface CustomSplit {
  protein: number;
  carbs: number;
  fat: number;
}

/** Null when each part is a whole percentage from 0 to 100, protein at least 10, and the three add up to 100. */
export function customSplitError(s: CustomSplit): string | null {
  const parts = [s.protein, s.carbs, s.fat];
  if (parts.some((p) => !Number.isFinite(p) || p < 0 || p > 100)) return 'Each value needs to be between 0 and 100%.';
  if (s.protein < 10) return 'Keep protein at 10% or more.';
  const total = parts.reduce((a, b) => a + b, 0);
  if (total !== 100) return `Total ${total}%, ${total > 100 ? 'remove' : 'add'} ${Math.abs(100 - total)} to reach 100%.`;
  return null;
}

/**
 * Weekly pace to keep when the goal changes: the current pace if it is set and
 * within the new goal's safe maximum, otherwise the onboarding default.
 */
export function rateForGoal(goal: GoalType, currentRateKg: number, weightKg: number): number {
  if (goal === 'maintain') return currentRateKg;
  const max = maxWeeklyRateKg(goal, weightKg);
  if (currentRateKg > 0) return Math.min(currentRateKg, max);
  return defaultRateKg(goal, weightKg);
}

/** Null when a height in cm is in range; the message is written in the user's units. */
export function heightError(heightCm: number, units: UnitSystem): string | null {
  if (heightCm >= HEIGHT_CM[0] && heightCm <= HEIGHT_CM[1]) return null;
  return units === 'imperial' ? 'Enter a height between 3\'4" and 8\'2".' : `Enter a height between ${HEIGHT_CM[0]} and ${HEIGHT_CM[1]} cm.`;
}
