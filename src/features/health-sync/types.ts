/**
 * Automatic workout sync: shapes shared by the adapters (one per platform) and
 * the rules (pure, the same on every platform).
 *
 * An adapter only answers a few plain questions about the phone's health store: is it
 * there, what may this app read, please ask, "which workouts are in this time
 * range" (with each one's heart rate), "how many steps on each day of it",
 * "which sleep samples are in it", "which weight and body-fat readings" and
 * "how many calories were burned on each day of it".
 * Everything else (calories, duplicates, which app activity it is, what is saved,
 * which days of steps are kept, which night a day had) is decided
 * in the rules, so Health Connect and Apple Health share every rule.
 */

import type { ISODate, SleepStore } from '@/types';

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
  /** Beats per minute inside this workout's own time, through heartFigures (heart.ts); absent or null when not read. */
  avgHeartRate?: number | null;
  maxHeartRate?: number | null;
}

/**
 * 'available': ready to ask and read.
 * 'update-required': the health store is installed but too old (Android 13 and lower).
 * 'not-installed': this phone could have it but does not (Android 13 and lower without the Health Connect app).
 * 'unsupported': there is no health store this build can read (the browser, an iPad without Apple Health).
 * 'not-entitled': the health store is there but this install of the app may not use it at all (an
 *   iPhone app signed without Apple's HealthKit permission, as a copy sideloaded with AltStore or Sideloadly is).
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
  /**
   * Sleep: nights for the sleep log (sleep.ts). Asked for on its own on an iPhone
   * (HealthKit's sleep type is not in READ_TYPES), so a phone that allowed the
   * five above before sleep existed reads false here until the person allows it.
   */
  sleep: boolean;
  /**
   * Weigh-ins (Health Connect Weight; HealthKit BodyMass) and body fat with
   * them (BodyFat; BodyFatPercentage), for the synced weights collection
   * (body.ts). Asked apart from the types above, so a phone that allowed sync
   * before reads false here until the person allows them on the Weight row.
   */
  weight: boolean;
  bodyFat: boolean;
  /**
   * The day's calories burned, kept on this phone and shown on Progress as the
   * watch's estimate (dayEnergy.ts). Health Connect: total and active calories
   * (already asked for workouts); HealthKit: active plus basal energy.
   */
  dayEnergy: boolean;
  /** A synced workout's average and highest heart rate (heart.ts), shown on the workout only. */
  heartRate: boolean;
}

export const NO_ACCESS: HealthAccess = {
  workouts: false,
  activeEnergy: false,
  totalEnergy: false,
  distance: false,
  steps: false,
  sleep: false,
  weight: false,
  bodyFat: false,
  dayEnergy: false,
  heartRate: false,
};

/**
 * What one stretch of a sleep sample was, as the store recorded it.
 * 'asleep': asleep with no stage given (Health Connect's STAGE_TYPE_SLEEPING, a
 * session without stages; HealthKit's asleepUnspecified). 'light' is HealthKit's
 * "core". 'awake' includes Health Connect's out-of-bed and awake-in-bed stages.
 * Only asleep, light, deep and rem count as sleep (sleep.ts).
 */
export type SleepStage = 'asleep' | 'light' | 'deep' | 'rem' | 'awake' | 'inBed' | 'unknown';

/** What kind of device wrote a sample: a watch's nights rank above a phone's or an app's (sleep.ts). */
export type SleepSourceKind = 'watch' | 'phone' | 'other';

/**
 * One stretch of one sleep stage, as a health store or the Health export holds
 * it, before any rule is applied. A Health Connect session is listed as one
 * sample per stage (or one 'asleep' sample for a session without stages); a
 * HealthKit sleep-analysis sample is one sample.
 */
export interface SleepSample {
  /** Where it was read: Health Connect, Apple Health, or the Health app's export file. */
  store: SleepStore;
  /**
   * The app that wrote it: a package name, a bundle id, or appleOrigin()'s
   * 'com.apple.health.watch' / 'com.apple.health.iphone'; from the export file
   * one of those two or 'file:other'. Never a device's or a person's name.
   */
  origin: string;
  /** From the origin (sleep.ts, sleepKindOf), or Health Connect's device type when the record states one. */
  kind: SleepSourceKind;
  /** ISO 8601 instants. */
  start: string;
  end: string;
  /** Seconds east of UTC at the end of the sample, when the record states it; null: the phone's own zone is used. */
  zoneOffsetSec: number | null;
  stage: SleepStage;
  /** The store's id of the session the sample belongs to (Health Connect's metadata.id), when there is one. */
  sessionId?: string;
}

/**
 * One weight or body-fat reading as a health store holds it, before any rule
 * (body.ts) is applied. Weight in kilograms; body fat in percent, or as a
 * fraction (HealthKit's percent unit: 0.25 is 25 %), which body.ts turns into percent.
 */
export interface BodySample {
  store: SleepStore;
  /** The app that wrote it: a package name, a bundle id, or appleOrigin()'s com.apple.health.watch/iphone/device. */
  origin: string;
  /** The reading's instant, ISO 8601. */
  time: string;
  /** Seconds east of UTC where it was measured, when the record states it; null: the phone's calendar decides the day. */
  zoneOffsetSec: number | null;
  kind: 'weight' | 'bodyFat';
  value: number;
}

/**
 * One local calendar day's calories burned as the store totals it (dayEnergy.ts):
 * `kcal` all energy, resting included; `activeKcal` the part above resting;
 * `origins` the apps whose records went into either figure.
 */
export interface DayEnergyDay {
  day: ISODate;
  kcal: number;
  activeKcal: number;
  origins: string[];
}

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

/** What a permission request asks for (HealthAdapter.requestAccess). */
export type AccessRequest = 'all' | 'steps' | 'sleep' | 'weight' | 'dayEnergy' | 'heartRate';

export interface HealthAdapter {
  /** The health store this build reads; null where there is none (web). */
  readonly store: HealthStore | null;
  availability(): Promise<HealthAvailability>;
  /** What may be read right now. Never shows anything to the person. */
  access(): Promise<HealthAccess>;
  /**
   * Show the system's permission sheet and report what was allowed. 'all' (the
   * default, turning sync on) asks for everything that is read; 'sleep' (the
   * sync screen's "Allow" on the Sleep row) asks for sleep alone where the
   * store can ask for one type (Apple Health); Health Connect asks its whole
   * list again, as for steps, and shows only what is not allowed yet.
   * 'weight', 'dayEnergy' and 'heartRate' (the rows added after sleep) ask for
   * that row's types alone on both stores, so a phone that allowed sync before
   * is shown only what the row reads.
   */
  requestAccess(what?: AccessRequest): Promise<HealthAccess>;
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
  /**
   * Every sleep sample overlapping the range (ISO instants), from every app,
   * as raw stages: the nights are made from them by the rules in sleep.ts.
   * Empty when sleep may not be read (`access.sleep` false). Throws HealthError.
   */
  readSleep(range: { from: string; to: string }, access: HealthAccess): Promise<SleepSample[]>;
  /**
   * Every weight reading in the range (ISO instants), from every app, and the
   * body-fat readings beside them when `access.bodyFat`, as raw samples: the
   * one weigh-in a day is chosen by the rules in body.ts. Empty when weight
   * may not be read (`access.weight` false). Throws HealthError.
   */
  readWeighIns(range: { from: string; to: string }, access: HealthAccess): Promise<BodySample[]>;
  /**
   * The calories burned on each local calendar day of the range, as the store
   * totals them (all energy and the part above resting, with the apps behind
   * them): the watch's own estimate, kept on the phone and shown on Progress
   * only (dayEnergy.ts). Empty when `access.dayEnergy` is false. Throws HealthError.
   */
  readDayEnergy(range: StepsRange, access: HealthAccess): Promise<DayEnergyDay[]>;
  /** Open the health store's own settings, where access is given and taken away. */
  openSettings(): void;
  /** Open the store page that installs or updates the health store. */
  openInstall(): void;
}

/** What the person calls the health store. */
export function storeName(store: HealthStore | null): string {
  return store === 'apple-health' ? 'Apple Health' : 'Health Connect';
}
