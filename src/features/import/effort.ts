/**
 * The effort level of an imported workout, from its speed.
 *
 * The log screen describes each effort level of these activities by a speed
 * ("Jog, about 8 km/h", "About 10 km/h", "About 12 km/h or faster"). An
 * imported workout that has a distance is given the level its average speed
 * falls in, so the label never contradicts the pace shown beside it. The
 * thresholds sit halfway between the speeds the hints name; effort.test.ts
 * checks them against the hints so the two cannot drift apart.
 *
 * Activities whose hints give no speed (hiking, swimming, trail running...)
 * and workouts without a distance keep the level the calories imply.
 */
import type { ActivityDef, Intensity } from '@/types';

import type { ImportedWorkout } from './types';

export interface SpeedBand {
  /** km/h from which the moderate level applies. */
  moderateFrom: number;
  /** km/h from which the vigorous level applies; null when the activity has no faster band. */
  vigorousFrom: number | null;
}

export const SPEED_BANDS: Record<string, SpeedBand> = {
  // Hints: about 3.5 / about 5 / about 6.5 km/h.
  walking: { moderateFrom: 4.25, vigorousFrom: 5.75 },
  // Hints: about 4.5 / about 6 / about 7 km/h.
  treadmill_walking: { moderateFrom: 5.25, vigorousFrom: 6.5 },
  // Hints: about 8 / about 10 / 12 km/h or faster.
  running: { moderateFrom: 9, vigorousFrom: 11 },
  // Hints: under 16 / about 20 / about 24 km/h.
  cycling: { moderateFrom: 18, vigorousFrom: 22 },
  // Hints: about 14 / about 18 / about 21 km/h.
  inline_skating: { moderateFrom: 16, vigorousFrom: 19.5 },
  // Hints: about 4 / 6.5-8 / 8-12 km/h.
  cross_country_skiing: { moderateFrom: 5.25, vigorousFrom: 8 },
  // Hints: 3-6 / 6.5-9.5 km/h (the Compendium has no faster row).
  canoeing: { moderateFrom: 6.25, vigorousFrom: null },
};

/** Distances under this are GPS noise, not a speed worth trusting. */
const MIN_DISTANCE_M = 100;

/** The effort level the workout's average speed falls in, or null when speed cannot decide it. */
export function speedIntensity(activity: Pick<ActivityDef, 'id'>, w: Pick<ImportedWorkout, 'distanceM' | 'durationSec'>): Intensity | null {
  const band = SPEED_BANDS[activity.id];
  if (!band || w.distanceM === null || w.distanceM < MIN_DISTANCE_M || w.durationSec <= 0) return null;
  // A hair added so a speed exactly on a threshold is not lost to floating point.
  const kmh = (w.distanceM * 3.6) / w.durationSec + 1e-9;
  if (band.vigorousFrom !== null && kmh >= band.vigorousFrom) return 'vigorous';
  return kmh >= band.moderateFrom ? 'moderate' : 'light';
}
