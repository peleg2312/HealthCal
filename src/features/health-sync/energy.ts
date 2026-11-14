/**
 * The calories of a synced workout, honestly.
 *
 * The day's budget takes only what a session burned above resting (net); the
 * total (gross) is kept beside it, so nothing is counted twice. A health store
 * can hold either figure, both, or neither for a workout:
 *
 *   active and total   net = active, gross = total
 *   only total         gross = total, net = total minus the resting share of
 *                      those minutes (what the file import does with Garmin's total)
 *   only active        net = active, gross = active plus the resting share
 *   neither            no measurement: the app's own estimate, labelled as one
 *
 * Two readings are not taken as a measurement:
 *   - a total that is not above the active figure cannot contain the resting
 *     energy, so only the active figure is used;
 *   - a total on its own that works out below 1.5 MET, the level of sitting
 *     still. No workout burns that little; Health Connect answers a question
 *     about total energy with a resting estimate when nothing was recorded.
 */
import { impliedMet } from '@/features/import/convert';

export type EnergyBasis = 'active-and-total' | 'total' | 'active' | 'none';

export interface WorkoutEnergy {
  basis: EnergyBasis;
  /** Null when there is no measurement. */
  kcalGross: number | null;
  kcalNet: number | null;
}

/** Below this a figure describes sitting, not exercise (the usual line between sedentary and light activity). */
export const SEDENTARY_MET = 1.5;

/** The whole minutes a session is saved with (the file import rounds the same way). */
export const wholeMinutes = (durationSec: number): number => Math.max(1, Math.round(durationSec / 60));

/** What the day's budget already assumes for the session's minutes. */
export function restingShareKcal(baselineKcalPerDay: number, durationSec: number): number {
  return (baselineKcalPerDay / 1440) * wholeMinutes(durationSec);
}

const positive = (n: number | null | undefined): number | null => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.round(n * 10) / 10 : null);

export function workoutEnergy(
  w: { activeKcal: number | null; totalKcal: number | null },
  durationSec: number,
  ctx: { weightKg: number; baselineKcalPerDay: number },
): WorkoutEnergy {
  const resting = restingShareKcal(ctx.baselineKcalPerDay, durationSec);
  const active = positive(w.activeKcal);
  let total = positive(w.totalKcal);
  if (total !== null && active !== null && total <= active) total = null;
  if (total !== null && active === null && impliedMet(total, ctx.weightKg, Math.max(durationSec / 60, 1 / 60)) < SEDENTARY_MET) total = null;

  if (active !== null && total !== null) return { basis: 'active-and-total', kcalGross: total, kcalNet: active };
  if (total !== null) return { basis: 'total', kcalGross: total, kcalNet: Math.max(0, total - resting) };
  if (active !== null) return { basis: 'active', kcalGross: active + resting, kcalNet: active };
  return { basis: 'none', kcalGross: null, kcalNet: null };
}
