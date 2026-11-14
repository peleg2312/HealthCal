/**
 * One workout recorded by two apps is one workout.
 *
 * A watch and the phone in a pocket often record the same run, and each app
 * writes its own session to the health store. Sessions from different apps
 * that cover the same time (half or more of the shorter one) are taken as one
 * workout, and one reading is kept:
 *   1. the one with measured calories,
 *   2. Garmin Connect, when both have them (or neither),
 *   3. the one the diary already has, so two equal readings never keep replacing each other,
 *   4. the longer one, then the earlier one, so the choice never depends on the order read.
 *
 * Sessions from the same app are left alone here: the file import's own
 * duplicate rules deal with those.
 */
import { workoutSpan, type WorkoutSpan } from './convert';
import { isGarminOrigin } from './origins';
import type { HealthWorkout } from './types';

/** Same threshold as the file import's "covers the same time". */
const OVERLAP_SHARE = 0.5;

export interface ReadingQuality {
  /** It carries a device's own calories (as read now, or as the diary holds it). */
  measured: boolean;
  /** The diary already has this reading. */
  stored: boolean;
}

export interface MergedOrigins {
  /** One reading per workout, oldest first. */
  kept: HealthWorkout[];
  /** Readings left out, each with the reading kept instead. */
  dropped: { workout: HealthWorkout; keptInstead: HealthWorkout }[];
}

function overlapShare(a: WorkoutSpan, b: WorkoutSpan): number {
  const shorter = Math.min(a.endMs - a.startMs, b.endMs - b.startMs);
  if (shorter <= 0) return 0;
  return Math.max(0, Math.min(a.endMs, b.endMs) - Math.max(a.startMs, b.startMs)) / shorter;
}

/** Workouts whose times cannot be used are not passed on at all (plan.ts counts them). */
export function mergeOrigins(workouts: HealthWorkout[], quality: (w: HealthWorkout) => ReadingQuality): MergedOrigins {
  const rows = workouts
    .map((workout) => ({ workout, span: workoutSpan(workout) }))
    .filter((r): r is { workout: HealthWorkout; span: WorkoutSpan } => r.span !== null)
    .map((r) => ({ ...r, ...quality(r.workout), garmin: isGarminOrigin(r.workout.origin) }));

  const best = [...rows].sort(
    (a, b) =>
      Number(b.measured) - Number(a.measured) ||
      Number(b.garmin) - Number(a.garmin) ||
      Number(b.stored) - Number(a.stored) ||
      b.span.durationSec - a.span.durationSec ||
      a.span.startMs - b.span.startMs ||
      a.workout.origin.localeCompare(b.workout.origin) ||
      a.workout.id.localeCompare(b.workout.id),
  );

  const kept: typeof rows = [];
  const dropped: MergedOrigins['dropped'] = [];
  for (const r of best) {
    const twin = kept.find((k) => k.workout.origin !== r.workout.origin && overlapShare(k.span, r.span) >= OVERLAP_SHARE);
    if (twin) dropped.push({ workout: r.workout, keptInstead: twin.workout });
    else kept.push(r);
  }
  kept.sort((a, b) => a.span.startMs - b.span.startMs || a.workout.id.localeCompare(b.workout.id));
  return { kept: kept.map((k) => k.workout), dropped };
}
