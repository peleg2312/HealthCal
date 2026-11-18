/**
 * A synced workout's heart rate: the average and highest, in beats per minute,
 * from the workout's own time (Health Connect's HeartRate aggregate over the
 * session, from the workout's own app; HealthKit's workout statistic, else the
 * samples inside the workout). Kept on the activity record and shown on that
 * workout only: never added to calories, never sent to the AI functions or to
 * friends. Pure and tested (heart.test.ts).
 */

/** An average outside this is not a person's heart rate during exercise. */
export const MIN_AVG_BPM = 30;
export const MAX_AVG_BPM = 230;
/** The highest is kept only up to this, and never below the average. */
export const MAX_BPM = 240;

export interface HeartFigures {
  avg: number;
  /** Null when the store gave none, or one that cannot be (below the average, above 240). */
  max: number | null;
}

/**
 * The figures to keep, whole beats per minute, or null when there is no usable
 * average (`count` 0: the store measured nothing; Health Connect answers 0.0 then).
 */
export function heartFigures(avg: number | null | undefined, max: number | null | undefined, count?: number | null): HeartFigures | null {
  if (count === 0) return null;
  if (typeof avg !== 'number' || !Number.isFinite(avg) || avg < MIN_AVG_BPM || avg > MAX_AVG_BPM) return null;
  const keepMax = typeof max === 'number' && Number.isFinite(max) && max >= avg && max <= MAX_BPM;
  return { avg: Math.round(avg), max: keepMax ? Math.round(max) : null };
}
