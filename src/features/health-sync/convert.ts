/**
 * A health-store workout in the file import's own shapes.
 *
 * `toImportedWorkout` turns a HealthWorkout into the ImportedWorkout the file
 * readers produce, so it runs through the same pipeline (prepareImport,
 * entriesToSave, the duplicate rules). `finishEntry` then marks the entry the
 * pipeline built as coming from the health store and gives it the calories the
 * health store's figures allow (energy.ts).
 *
 * One workout is one record wherever it arrives from: the record id is the one
 * the file import derives from the start instant, so a FIT file, a CSV row and
 * Health Connect on any of the person's phones all write the same record.
 */
import { garminExternalId, importedEntryId, type ConvertContext, type ImportedEntry } from '@/features/import/convert';
import { isoSeconds, plausibleOffsetMin } from '@/features/import/time';
import type { ImportedWorkout } from '@/features/import/types';
import type { ActivityEntry, ActivitySource } from '@/types';

import { workoutEnergy, type WorkoutEnergy } from './energy';
import { healthConnectSport, type HealthSport } from './exerciseTypes';
import { healthExternalId, originName } from './origins';
import type { HealthWorkout } from './types';

/** An entry ready for `upsertMany('activities', ...)`: the file import's entry, from the health store. */
export type HealthEntry = Omit<ImportedEntry, 'source'> & { source: ActivitySource };

/** A session longer than this is a recording that was never stopped, not a workout. */
const MAX_DURATION_SEC = 24 * 3600;

export interface WorkoutSpan {
  startMs: number;
  endMs: number;
  durationSec: number;
  /** Start as the file import writes it: whole seconds, 'Z'. */
  startUtc: string;
}

/** The workout's interval, or null when its times cannot be used (unreadable, not after the start, longer than a day). */
export function workoutSpan(w: Pick<HealthWorkout, 'startTime' | 'endTime'>): WorkoutSpan | null {
  const startMs = Date.parse(w.startTime);
  const endMs = Date.parse(w.endTime);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
  const durationSec = Math.round((endMs - startMs) / 1000);
  if (durationSec <= 0 || durationSec > MAX_DURATION_SEC) return null;
  return { startMs, endMs, durationSec, startUtc: isoSeconds(startMs) };
}

/** The app activity for a workout's exercise type. Apple Health's own table joins here when its adapter exists. */
export function sportOf(w: Pick<HealthWorkout, 'store' | 'exerciseType'>): HealthSport {
  if (w.store === 'health-connect') return healthConnectSport(w.exerciseType);
  return { name: 'Workout', activityId: null, alternatives: [] };
}

/** The record id this workout is saved under: the file import's id for the same start instant. */
export function recordIdFor(startUtc: string): string {
  return importedEntryId(garminExternalId({ startUtc }));
}

/**
 * The workout as the file import reads one. Null when its times cannot be used.
 *
 * `format` has no value for a health store, and the pipeline needs one of its
 * own: 'tcx' is used because the file import guesses nothing from a TCX sport
 * except Running and Biking, so the activity is decided by this feature's own
 * table (plan.ts sets it) and not by Garmin's file vocabulary.
 */
export function toImportedWorkout(w: HealthWorkout, index: number, ctx: Pick<ConvertContext, 'weightKg' | 'baselineKcalPerDay'>): ImportedWorkout | null {
  const span = workoutSpan(w);
  if (!span) return null;
  const offsetMin = typeof w.zoneOffsetSec === 'number' ? w.zoneOffsetSec / 60 : Number.NaN;
  const out: ImportedWorkout = {
    format: 'tcx',
    fileName: originName(w.origin, w.originName),
    index,
    startUtc: span.startUtc,
    startFromLocalTime: false,
    // A health-store session has a start and an end, not a timer: pauses are inside it.
    durationSec: span.durationSec,
    elapsedSec: span.durationSec,
    durationIncludesPauses: true,
    distanceM: typeof w.distanceM === 'number' && w.distanceM > 0 ? w.distanceM : null,
    // The pipeline's calories are a total, resting included.
    kcal: workoutEnergy(w, span.durationSec, ctx).kcalGross,
    avgHeartRate: null,
    maxHeartRate: null,
    sport: sportOf(w).name,
    subSport: null,
    title: w.title?.trim() || null,
    device: w.device?.trim() || null,
  };
  if (plausibleOffsetMin(offsetMin)) out.utcOffsetMin = offsetMin;
  return out;
}

/**
 * The pipeline's entry as a health-store entry.
 *  - New workout: source 'health', the origin kept in `externalId` (origins.ts).
 *  - A better reading of a stored workout (`stored`): the record keeps where it
 *    first came from, so a workout imported from a Garmin file stays that.
 *  - Calories: the health store's own figures where it has them (energy.ts).
 */
export function finishEntry(entry: ImportedEntry, w: HealthWorkout, ctx: Pick<ConvertContext, 'weightKg' | 'baselineKcalPerDay'>, stored?: ActivityEntry | null): HealthEntry {
  const span = workoutSpan(w);
  const energy: WorkoutEnergy = span ? workoutEnergy(w, span.durationSec, ctx) : { basis: 'none', kcalGross: null, kcalNet: null };
  const out: HealthEntry = {
    ...entry,
    source: stored?.source ?? 'health',
    externalId: stored?.externalId ?? healthExternalId(w.origin, entry.startedAt),
  };
  if (energy.kcalGross !== null && energy.kcalNet !== null) {
    out.kcalGross = energy.kcalGross;
    out.kcalNet = energy.kcalNet;
    out.measured = true;
  }
  return out;
}
