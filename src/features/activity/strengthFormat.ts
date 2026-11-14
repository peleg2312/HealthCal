import { formatNumber, round, weightUnit, weightValue } from '@/lib/units';
import type { UnitSystem } from '@/types';

/** A weight in the user's units, one decimal at most ("60", "132.5"). */
export function formatLiftWeight(kg: number, units: UnitSystem): string {
  return formatNumber(round(weightValue(kg, units), 1), 1).replace(/\.0$/, '');
}

/**
 * The "Last time" line of an exercise: each set as its weight with the unit, then
 * the reps ("60 kg × 8"), a bodyweight set as its reps ("10 reps"), at most five
 * sets and then how many more ("+2").
 */
export function formatPreviousSets(sets: { weightKg: number; reps: number }[], units: UnitSystem, limit = 5): string {
  const unit = weightUnit(units);
  const shown = sets
    .slice(0, limit)
    .map((s) => (s.weightKg > 0 ? `${formatLiftWeight(s.weightKg, units)} ${unit} × ${s.reps}` : `${s.reps} reps`));
  return shown.join(', ') + (sets.length > limit ? ` +${sets.length - limit} more` : '');
}
