/**
 * Exercise energy from MET values (Compendium of Physical Activities).
 *
 * Two numbers matter and most apps blur them:
 *  - gross: everything burned during the session, resting metabolism included
 *  - net:   what the session burned on top of what the daily budget already
 *           assumes for that time. Only this is added back to the budget,
 *           otherwise the resting share would be counted twice.
 */
import type { Intensity } from '@/types';

/** Oxygen cost of 1 MET, ml O2 per kg per minute. */
const ML_O2_PER_KG_MIN = 3.5;
/** Energy per litre of oxygen consumed. */
const KCAL_PER_L_O2 = 5;

/** Standard Compendium conversion: kcal/min = MET x 3.5 x kg / 200. */
export function grossKcal(met: number, weightKg: number, minutes: number): number {
  return (met * ML_O2_PER_KG_MIN * weightKg * KCAL_PER_L_O2 * minutes) / 1000;
}

/**
 * Calories above the day's baseline for the same minutes.
 * `baselineKcalPerDay` is the non-exercise expenditure the budget is built on
 * (BMR x activity factor), so its per-minute share is removed from the session.
 */
export function netKcal(met: number, weightKg: number, minutes: number, baselineKcalPerDay: number): number {
  const baseline = (baselineKcalPerDay / 1440) * minutes;
  return Math.max(0, grossKcal(met, weightKg, minutes) - baseline);
}

/**
 * Honest uncertainty band. MET tables describe an average adult; individual
 * cost for the same activity commonly differs by around a fifth either way.
 */
export function kcalRange(kcal: number): [number, number] {
  return [Math.round(kcal * 0.8), Math.round(kcal * 1.2)];
}

export const INTENSITY_LABELS: Record<Intensity, { title: string; hint: string }> = {
  light: { title: 'Easy', hint: 'Can talk and sing' },
  moderate: { title: 'Moderate', hint: 'Can talk, not sing' },
  vigorous: { title: 'Hard', hint: 'Only a few words at a time' },
};

/** Running/walking MET from speed where distance was entered, falling back to the table value. */
export function paceKmh(distanceKm: number | undefined, minutes: number): number | null {
  if (!distanceKm || distanceKm <= 0 || minutes <= 0) return null;
  return distanceKm / (minutes / 60);
}

/** Total volume lifted in a strength session, kg. */
export function strengthVolumeKg(exercises: { sets: { reps: number; weightKg: number }[] }[]): number {
  return exercises.reduce(
    (sum, ex) => sum + ex.sets.reduce((s, set) => s + set.reps * set.weightKg, 0),
    0,
  );
}

/** Epley one-rep-max estimate. */
export function estimateOneRepMax(weightKg: number, reps: number): number {
  if (reps <= 0 || weightKg <= 0) return 0;
  if (reps === 1) return weightKg;
  return weightKg * (1 + reps / 30);
}
