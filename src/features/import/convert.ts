/**
 * Turning an imported workout into an ActivityEntry.
 *
 * Garmin's calories are the total burned during the activity, resting
 * included (research-garmin.md, section 5). They become the entry's
 * kcalGross; kcalNet is that minus the app's own baseline for the same
 * minutes, floored at zero, exactly as netKcal does for a hand-logged session.
 * Only kcalNet is added to the day, so nothing is counted twice.
 */
import { grossKcal, netKcal } from '@/lib/exercise';
import { stableId } from '@/lib/hash';
import type { ActivityDef, ActivityEntry, Intensity } from '@/types';

import { speedIntensity } from './effort';
import { recordedWallTime } from './time';
import type { ImportedWorkout } from './types';

export interface ConvertContext {
  /** Current body weight, kg (used for the implied MET, and for estimates when the file has no calories). */
  weightKg: number;
  /** Non-exercise daily expenditure the budget is built on (the same value a hand-logged session uses). */
  baselineKcalPerDay: number;
  /** Effort to estimate with when the file has no calories (GPX). Default 'moderate'. */
  estimateIntensity?: Intensity;
}

/** A ready-to-save entry: pass it to `useStore.getState().upsert('activities', entry)` (or upsertMany). */
export type ImportedEntry = Omit<ActivityEntry, 'updatedAt'> & {
  id: string;
  source: 'garmin';
  externalId: string;
  startedAt: string;
};

/**
 * The workout's identity, the same whichever file it came from: Garmin and
 * its start instant to the second. A FIT file, its TCX and its CSV row give
 * the same id when the CSV was read in the right time zone. Legs of a
 * multisport file are marked, because the first leg starts at the same second
 * as the CSV's single summary row for the whole event.
 */
export function garminExternalId(w: Pick<ImportedWorkout, 'startUtc' | 'leg'>): string {
  return `garmin:${w.startUtc}${w.leg ? '/leg' : ''}`;
}

/**
 * Record id derived from the external id, so the same workout imported on two
 * devices is one record after sync (as weights are one per date).
 */
export function importedEntryId(externalId: string): string {
  return stableId('activities', externalId);
}

/** MET the measured calories imply for this body weight and duration. */
export function impliedMet(kcalGross: number, weightKg: number, minutes: number): number {
  const perMet = grossKcal(1, weightKg, minutes);
  return perMet > 0 ? kcalGross / perMet : 0;
}

const INTENSITIES: Intensity[] = ['light', 'moderate', 'vigorous'];

/** The effort level whose MET for this activity is nearest the given MET (the easier level on a tie). */
export function nearestIntensity(activity: Pick<ActivityDef, 'met'>, met: number): Intensity {
  let best: Intensity = 'light';
  let bestGap = Infinity;
  for (const i of INTENSITIES) {
    const gap = Math.abs(activity.met[i] - met);
    if (gap < bestGap - 1e-9) {
      best = i;
      bestGap = gap;
    }
  }
  return best;
}

const sameWords = (a: string, b: string) => a.toLowerCase().replace(/[^a-z0-9]+/g, '') === b.toLowerCase().replace(/[^a-z0-9]+/g, '');

/** Build the entry for a workout and the activity it was matched to. */
export function toActivityEntry(w: ImportedWorkout, activity: ActivityDef, ctx: ConvertContext): ImportedEntry {
  const exactMinutes = w.durationSec / 60;
  const durationMin = Math.max(1, Math.round(exactMinutes));
  const startMs = Date.parse(w.startUtc);
  const endMs = startMs + (w.elapsedSec ?? w.durationSec) * 1000;
  const externalId = garminExternalId(w);
  const { weightKg, baselineKcalPerDay } = ctx;

  // For activities whose effort levels are described by speed, the speed decides
  // the level, so the label matches the pace shown beside it (effort.ts).
  const bySpeed = speedIntensity(activity, w);
  let intensity: Intensity;
  let kcalGross: number;
  let kcalNet: number;
  let measured = false;
  if (w.kcal !== null && w.kcal > 0) {
    // Measured: Garmin's total is gross and is kept exactly. Without a speed to go
    // by, the effort level is the one whose table MET is nearest what the calories imply.
    intensity = bySpeed ?? nearestIntensity(activity, impliedMet(w.kcal, weightKg, Math.max(exactMinutes, 1 / 60)));
    kcalGross = w.kcal;
    kcalNet = Math.max(0, w.kcal - (baselineKcalPerDay / 1440) * durationMin);
    measured = true;
  } else {
    // No calories in the file (GPX): estimate exactly as a hand-logged session does,
    // at the effort the speed gives, else the one the person chose for estimates.
    intensity = bySpeed ?? ctx.estimateIntensity ?? 'moderate';
    const met = activity.met[intensity];
    kcalGross = grossKcal(met, weightKg, durationMin);
    kcalNet = netKcal(met, weightKg, durationMin, baselineKcalPerDay);
  }

  const entry: ImportedEntry = {
    id: importedEntryId(externalId),
    // The day where the workout was done (the file's own offset when it states one).
    date: recordedWallTime(w).date,
    activityId: activity.id,
    name: activity.name,
    emoji: activity.emoji,
    category: activity.category,
    intensity,
    durationMin,
    met: activity.met[intensity],
    kcalGross,
    kcalNet,
    weightKg,
    baselineKcalPerDay,
    source: 'garmin',
    externalId,
    startedAt: w.startUtc,
    loggedAt: new Date(endMs).toISOString(),
  };
  if (measured) entry.measured = true;
  if (w.avgHeartRate !== null && w.avgHeartRate > 0) entry.avgHeartRate = Math.round(w.avgHeartRate);
  if (activity.tracksDistance && w.distanceM !== null && w.distanceM > 0) entry.distanceKm = Math.round(w.distanceM) / 1000;
  const title = w.title?.trim();
  if (title && !sameWords(title, activity.name) && !sameWords(title, w.sport)) entry.notes = title;
  return entry;
}
