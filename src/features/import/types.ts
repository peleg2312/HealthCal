/**
 * Shared shapes for importing workouts from files exported by Garmin Connect
 * (FIT, TCX, GPX, the Activities list CSV, and ZIP archives of these).
 *
 * Everything in this folder is pure: functions take bytes or text and return
 * plain objects, so they run in unit tests and on iOS, Android and web alike.
 */

/** 'apple': a workout from the Health app's export file (export.zip or export.xml; health-sync/exportFile.ts). */
export type ImportFormat = 'fit' | 'tcx' | 'gpx' | 'csv' | 'apple';

/** One workout as read from a file, before it is matched to an app activity. */
export interface ImportedWorkout {
  format: ImportFormat;
  /** The file it came from. Inside a ZIP: 'archive.zip/folder/123.fit'. */
  fileName: string;
  /** Position inside that file: FIT session number, TCX/GPX activity or track number, CSV data row (1 = first row after the header). */
  index: number;
  /** Start as an instant, ISO 8601 UTC with whole seconds ('2024-09-19T11:05:15Z'). */
  startUtc: string;
  /**
   * True when the file did not hold a real UTC start and it was worked out from
   * local wall time (every CSV row, and FIT files whose clock was never set).
   * The screen should show the time so the person can check it.
   */
  startFromLocalTime: boolean;
  /**
   * Minutes east of UTC where the workout was recorded, when the file says
   * (a FIT file with both timestamp and local_timestamp) or the person chose a
   * zone for a CSV. The entry's day and the time shown use it, so a run done in
   * New York lands on the New York day whatever zone the phone is in now.
   * Absent: the phone's own zone is used.
   */
  utcOffsetMin?: number;
  /** Moving (timer) time in seconds, pauses excluded. For GPX this is the elapsed span, see `durationIncludesPauses`. */
  durationSec: number;
  /** Start to finish including pauses, seconds, when the file says. */
  elapsedSec: number | null;
  /** True when no timer time existed and `durationSec` includes pauses (GPX, some CSV rows). */
  durationIncludesPauses: boolean;
  /** Metres. Null when the file has none (not the same as 0, which an indoor session can legitimately report). */
  distanceM: number | null;
  /** Calories Garmin reports for the activity: total burned, resting included. Null when the file has none (GPX). */
  kcal: number | null;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
  /** The sport exactly as the file names it: FIT profile name ('running'), TCX attribute ('Running'), GPX type ('street_running'), CSV activity type ('Pool Swim', 'Laufen'). */
  sport: string;
  /** FIT sub sport name ('treadmill', 'indoor_rowing'); null elsewhere. */
  subSport: string | null;
  /** Name the file gives the workout (CSV title, TCX notes, GPX track name, FIT sport name). */
  title: string | null;
  /** Recording device when the file says ('Forerunner 265S', 'garmin fenix5'). */
  device: string | null;
  /** Set for each leg of a multisport FIT or TCX file. */
  leg?: { number: number; of: number };
  /** True for a multisport transition leg (changing between sports). */
  transition?: boolean;
  /**
   * Apple Health export only: HKWorkoutActivityType's number (with the indoor
   * and open-water variants, appleHealthTypes.ts), which decides the activity.
   */
  appleType?: number;
  /**
   * Apple Health export only: the identity the record is saved with, in the
   * scheme a synced workout uses ('health:com.apple.health.watch:<start>', or
   * 'garmin:<start>' for Garmin Connect; origins.ts), so it reads "From Apple
   * Watch" however it arrived. The record id still comes from the start instant.
   */
  externalId?: string;
}

/** Something a person should know about a file that was still read. */
export interface ImportWarning {
  code: ImportWarningCode;
  message: string;
  /** File the warning is about. */
  file: string;
}

export type ImportWarningCode =
  | 'fit-crc'
  | 'fit-truncated'
  | 'fit-no-session'
  | 'fit-system-time'
  | 'fit-no-start'
  | 'fit-no-timer'
  | 'tcx-no-laps'
  | 'gpx-no-timer'
  | 'gpx-no-time'
  | 'csv-skipped-no-duration'
  | 'csv-skipped-no-date'
  | 'csv-skipped-bad-row'
  | 'csv-elapsed-time'
  | 'csv-date-order'
  | 'zip-skipped-files'
  | 'zip-nested-depth'
  | 'apple-steps'
  | 'apple-sleep'
  | 'apple-merged'
  | 'apple-not-exercise';

export type ImportErrorCode =
  | 'empty'
  | 'unknown-format'
  | 'not-fit'
  | 'fit-not-activity'
  | 'fit-no-workouts'
  | 'not-tcx'
  | 'tcx-no-workouts'
  | 'not-gpx'
  | 'gpx-no-workouts'
  | 'not-csv'
  | 'csv-no-workouts'
  | 'csv-options-needed'
  | 'bad-time-zone'
  | 'not-zip'
  | 'zip-empty'
  | 'apple-not-export'
  | 'apple-damaged';

/** A file that cannot be read. `message` is written for the person, not the developer. */
export class ImportError extends Error {
  readonly code: ImportErrorCode;
  readonly file: string;
  constructor(code: ImportErrorCode, message: string, file: string) {
    super(message);
    this.name = 'ImportError';
    this.code = code;
    this.file = file;
  }
}

/** What one reader returns. */
export interface ReadResult {
  workouts: ImportedWorkout[];
  warnings: ImportWarning[];
}

/** Options for the Activities CSV, which states neither its units nor its time zone. */
export interface CsvOptions {
  /** The account's distance unit when the CSV was exported (Garmin Connect, Settings, Units). */
  distanceUnit: 'km' | 'mi';
  /**
   * IANA time zone the CSV's dates are wall-clock time in, e.g. 'Europe/Amsterdam'.
   * Omit (or 'device') to use the phone's own zone, the right answer for most people.
   */
  timeZone?: string;
  /** Pool and open water swim distances: metres or yards. Default 'm' for km accounts, 'yd' for mile accounts. */
  swimUnit?: 'm' | 'yd';
  /** Decimal mark in numbers. Default: worked out from the file (German and Italian exports use a comma). */
  decimalSeparator?: '.' | ',';
  /** Only for dates a spreadsheet rewrote as 07/11/2025. Default: worked out from the file, else day first. */
  dateOrder?: 'dmy' | 'mdy';
}

export interface ReadOptions {
  /** Required to read an Activities CSV (alone or inside a ZIP). */
  csv?: CsvOptions;
  /**
   * Zone for FIT files whose start is device "system time" and only local wall
   * time is known. Default: the device's zone.
   */
  timeZone?: string;
}

export function warn(code: ImportWarningCode, message: string, file: string): ImportWarning {
  return { code, message, file };
}

/** "1 row" / "3 rows". */
export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}
