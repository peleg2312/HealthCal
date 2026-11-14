/**
 * Automatic workout sync: shapes shared by the adapters (one per platform) and
 * the rules (pure, the same on every platform).
 *
 * An adapter only answers four questions about the phone's health store: is it
 * there, what may this app read, please ask, and "which workouts are in this
 * time range". Everything else (calories, duplicates, which app activity it is,
 * what is saved) is decided in the rules, so a second adapter (Apple Health)
 * adds no rule of its own.
 */

/** The phone's health store a workout was read from. */
export type HealthStore = 'health-connect' | 'apple-health';

/** One workout as the health store holds it, before any rule is applied. */
export interface HealthWorkout {
  store: HealthStore;
  /** The record's id in the health store. */
  id: string;
  /** The app that wrote it: Android package name ('com.garmin.android.apps.connectmobile') or iOS bundle id. */
  origin: string;
  /** That app's own name when the platform gives it (Apple Health does, Health Connect does not). */
  originName?: string | null;
  /** The store's exercise type code (Health Connect: ExerciseSessionRecord.exerciseType). */
  exerciseType: number;
  /** ISO 8601 instants. */
  startTime: string;
  endTime: string;
  /** Seconds east of UTC where the workout started, when the record states it. */
  zoneOffsetSec?: number | null;
  /** The name the origin app gave the workout ('Morning run'). */
  title?: string | null;
  /**
   * Energy above resting, written by the same app, inside this workout's own
   * interval. Null when that app wrote none there, or when it may not be read.
   */
  activeKcal: number | null;
  /** All energy burned in the interval, resting included; same scope as `activeKcal`. */
  totalKcal: number | null;
  /** Metres; same scope. */
  distanceM: number | null;
  /** 'Garmin Forerunner 265' when the record names the device. Shown on the sync screen, never saved. */
  device?: string | null;
}

/**
 * 'available': ready to ask and read.
 * 'update-required': the health store is installed but too old (Android 13 and lower).
 * 'not-installed': this phone could have it but does not (Android 13 and lower without the Health Connect app).
 * 'unsupported': there is no health store this build can read (web, and iPhone until its adapter exists).
 */
export type HealthAvailability = 'available' | 'update-required' | 'not-installed' | 'unsupported';

/** What the person has allowed this app to read. */
export interface HealthAccess {
  workouts: boolean;
  activeEnergy: boolean;
  totalEnergy: boolean;
  distance: boolean;
}

export const NO_ACCESS: HealthAccess = { workouts: false, activeEnergy: false, totalEnergy: false, distance: false };

/**
 * 'permission': the health store refused a read (access was never given, or was taken away).
 * 'unavailable': the health store is missing, too old or not answering.
 * 'timeout': it did not answer in time.
 * 'failed': anything else.
 */
export type HealthErrorCode = 'permission' | 'unavailable' | 'timeout' | 'failed';

export class HealthError extends Error {
  readonly code: HealthErrorCode;
  constructor(code: HealthErrorCode, message: string) {
    super(message);
    this.name = 'HealthError';
    this.code = code;
  }
}

export interface ReadOptions {
  needsDetail?: (workout: Pick<HealthWorkout, 'id' | 'origin' | 'startTime' | 'endTime'>) => boolean;
}

export interface HealthAdapter {
  /** The health store this build reads; null where there is none (web). */
  readonly store: HealthStore | null;
  availability(): Promise<HealthAvailability>;
  /** What may be read right now. Never shows anything to the person. */
  access(): Promise<HealthAccess>;
  /** Show the system's permission sheet and report what was allowed. */
  requestAccess(): Promise<HealthAccess>;
  /**
   * Every workout in the range, from every app, each with the energy and
   * distance its own app wrote inside its interval. `access` is what may be
   * read (from `access()`): types that are not allowed are left null instead of
   * being asked for. `needsDetail` lets the caller skip the energy and distance
   * questions for workouts where the answer cannot change anything (they come
   * back with those fields null). Throws HealthError.
   */
  readWorkouts(range: { from: string; to: string }, access: HealthAccess, options?: ReadOptions): Promise<HealthWorkout[]>;
  /** Open the health store's own settings, where access is given and taken away. */
  openSettings(): void;
  /** Open the store page that installs or updates the health store. */
  openInstall(): void;
}

/** What the person calls the health store. */
export function storeName(store: HealthStore | null): string {
  return store === 'apple-health' ? 'Apple Health' : 'Health Connect';
}
