/**
 * Automatic workout sync: shapes shared by the adapters (one per platform) and
 * the rules (pure, the same on every platform).
 *
 * An adapter only answers five questions about the phone's health store: is it
 * there, what may this app read, please ask, "which workouts are in this time
 * range" and "how many steps on each day of it". Everything else (calories,
 * duplicates, which app activity it is, what is saved, which days of steps are kept) is decided
 * in the rules, so Health Connect and Apple Health share every rule.
 */

import type { ISODate } from '@/types';

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
  /**
   * The store's exercise type code: Health Connect's ExerciseSessionRecord.exerciseType, or
   * HealthKit's HKWorkoutActivityType raw value (with its indoor and open-water variants, appleHealthTypes.ts).
   */
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
 * 'unsupported': there is no health store this build can read (the browser, an iPad without Apple Health).
 * 'not-entitled': the health store is there but this install of the app may not use it at all (an
 *   iPhone app signed without Apple's HealthKit permission, as a free Apple ID's sideloaded copy is).
 */
export type HealthAvailability = 'available' | 'update-required' | 'not-installed' | 'unsupported' | 'not-entitled';

/** What the person has allowed this app to read. */
export interface HealthAccess {
  workouts: boolean;
  activeEnergy: boolean;
  totalEnergy: boolean;
  distance: boolean;
  /** Daily steps: shown on Train, never added to the calorie budget (steps.ts). */
  steps: boolean;
}

export const NO_ACCESS: HealthAccess = { workouts: false, activeEnergy: false, totalEnergy: false, distance: false, steps: false };

/**
 * The steps of one local calendar day, as the health store itself totals them:
 * Health Connect's aggregate and HealthKit's statistics keep one count where
 * apps overlap (the phone and the watch), by the store's own source priority,
 * so the figure is the one the store's own app shows for that day.
 */
export interface StepDayTotal {
  /** The phone's local calendar day, 'YYYY-MM-DD'. */
  day: ISODate;
  count: number;
}

/**
 * What one steps read covers: from the local midnight that starts `fromDay`
 * up to now (`to`), as ISO instants, and the same as days (for the in-memory store).
 */
export interface StepsRange {
  from: string;
  to: string;
  fromDay: ISODate;
  toDay: ISODate;
}

/**
 * 'permission': the health store refused a read (access was never given, or was taken away).
 * 'unavailable': the health store is missing, too old or not answering.
 * 'timeout': it did not answer in time.
 * 'not-entitled': this install of the app may not use the health store (see HealthAvailability).
 * 'failed': anything else.
 */
export type HealthErrorCode = 'permission' | 'unavailable' | 'timeout' | 'not-entitled' | 'failed';

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
  /**
   * Steps per local calendar day in the range, as the store totals them (one
   * count where apps overlap, decided by the store: see StepDayTotal). Days
   * without steps may be left out. Empty when steps may not be read. Throws HealthError.
   */
  readStepDays(range: StepsRange, access: HealthAccess): Promise<StepDayTotal[]>;
  /** Open the health store's own settings, where access is given and taken away. */
  openSettings(): void;
  /** Open the store page that installs or updates the health store. */
  openInstall(): void;
}

/** What the person calls the health store. */
export function storeName(store: HealthStore | null): string {
  return store === 'apple-health' ? 'Apple Health' : 'Health Connect';
}
