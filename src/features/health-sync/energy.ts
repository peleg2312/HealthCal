/**
 * The calories of a synced workout, honestly.
 *
 * The day's budget takes only what a session burned above the app's own
 * resting baseline (net: the same baseline every hand-logged and imported
 * session is priced against); the total (gross) is kept beside it, so nothing
 * is counted twice. One workout gets one net figure whichever way it arrives:
 * Health Connect, a FIT file or a CSV row.
 *
 * A health store's "active" figure is energy above the device's own BMR, not
 * above the app's baseline (BMR times the everyday activity factor). Crediting
 * it as net would count the gap between the two twice: the budget already
 * holds it for those minutes. So the total decides, as for a file:
 *
 *   total (with or without active)   gross = total, net = total minus the resting
 *                                    share of those minutes (exactly the file import's rule)
 *   only active                      gross = active plus the resting rate (BMR) for
 *                                    those minutes, which is what the device's own
 *                                    total would be; net as above
 *   neither                          no measurement: the app's own estimate, labelled as one
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

/** What the energy rules need to know about the person. */
export interface EnergyContext {
  weightKg: number;
  /** Non-exercise daily expenditure the budget is built on (formulaTdee). */
  baselineKcalPerDay: number;
  /**
   * Resting rate (BMR), kcal per day: what a device adds to its active figure
   * to make its total. Unset: taken as the baseline, so an active figure counts as net as it is.
   */
  bmrKcalPerDay?: number;
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

export function workoutEnergy(w: { activeKcal: number | null; totalKcal: number | null }, durationSec: number, ctx: EnergyContext): WorkoutEnergy {
  const resting = restingShareKcal(ctx.baselineKcalPerDay, durationSec);
  const active = positive(w.activeKcal);
  let total = positive(w.totalKcal);
  if (total !== null && active !== null && total <= active) total = null;
  if (total !== null && active === null && impliedMet(total, ctx.weightKg, Math.max(durationSec / 60, 1 / 60)) < SEDENTARY_MET) total = null;

  const net = (gross: number) => Math.max(0, gross - resting);
  if (total !== null) return { basis: active !== null ? 'active-and-total' : 'total', kcalGross: total, kcalNet: net(total) };
  if (active !== null) {
    const bmr = ctx.bmrKcalPerDay !== undefined && ctx.bmrKcalPerDay > 0 ? ctx.bmrKcalPerDay : null;
    // Without a resting rate the device's total cannot be rebuilt: the active figure stands as the net.
    if (bmr === null) return { basis: 'active', kcalGross: active + resting, kcalNet: active };
    const gross = Math.round((active + (bmr / 86_400) * durationSec) * 10) / 10;
    return { basis: 'active', kcalGross: gross, kcalNet: net(gross) };
  }
  return { basis: 'none', kcalGross: null, kcalNet: null };
}
