/**
 * The Health app's export file ("Export All Health Data", export.zip), turned
 * into this feature's own shapes. Pure and tested (exportFile.test.ts); the
 * reading itself is in exportRead.ts and the byte scanner in
 * src/features/import/appleExport.ts.
 *
 * Workouts. Each <Workout> becomes a HealthWorkout from 'apple-health', the
 * shape the HealthKit adapter produces, so it is priced and matched by the same
 * rules: the activity from appleHealthTypes.ts (by the type's name, with the
 * indoor and open-water variants from its metadata), energy by energy.ts's
 * "only active" row (Apple's workout energy is active energy), the record id
 * from its start instant. Both generations of the file are read:
 *   - older exports put duration, totalDistance and totalEnergyBurned (with
 *     their units) on the <Workout> element;
 *   - iOS 16 and later put energy and distance in <WorkoutStatistics> children
 *     (ActiveEnergyBurned, DistanceWalkingRunning, DistanceCycling,
 *     DistanceSwimming, ...), each with its unit.
 * Dates are written as '2026-11-15 10:00:00 +0200'.
 *
 * Where it came from. The file names the source by the person's own device name
 * ("Dana’s Apple Watch") and describes the device in a string that can hold a
 * serial or UUID. Neither is kept: only the kind (Apple Watch, iPhone), or the
 * app when the source is a known app (Garmin Connect, Strava), in the origin
 * scheme origins.ts already reads ('com.apple.health.watch', the app's bundle
 * id), so "From Apple Watch" reads the same whichever way the workout arrived.
 * A source that is neither is kept as 'com.apple.health.device' ("Apple
 * Health"): its name could be a person's, so it is never shown.
 *
 * Steps. The file has no day totals, only samples from every source, and an
 * iPhone and a Watch both count the same walk. The Health app keeps one count
 * by the person's own order of sources (which the file does not hold): where
 * the first source has steps, only its are counted, and a lower one fills in
 * where it has none. The rule here (`createStepTally`) does the same with an
 * order taken from the file: the sources are ranked by their steps over the
 * whole window (most first, the same order for every day); per source, each
 * sample is spread over the clock hours it covers in proportion to time; each
 * hour takes the first source in that order that has steps in it; a day is the
 * sum of its hours. An hour is never counted from two sources, so a walk that
 * two devices saw is counted once however they split it into samples. What it
 * cannot do: where two devices put the same steps in different hours (a sample
 * across an hour's edge, a watch whose clock is a minute off), the few steps
 * at that edge can be counted from both; and an hour where the first source
 * has a few steps and another has many takes the few (as the Health app does).
 * It is an approximation of what the Health app shows (which orders sources by
 * the person's choice, minute by minute), not the Health app's figure.
 *
 * Sleep. Each <Record type="HKCategoryTypeIdentifierSleepAnalysis"> is one
 * stretch of one stage from one source (in bed, asleep, awake, core, deep,
 * REM). `createSleepTally` keeps the stretches of the window per source and
 * turns them into nights by the sync's own rules (sleep.ts `nightsFrom`): per
 * source the union of its stretches, a source's main period per wake day, then
 * one source per night (stages over none, a watch over a phone, more sleep),
 * never a sum. Time awake and in bed are never sleep, so the iPhone's "in bed"
 * block beside a watch's night adds nothing. The source's name is a grouping
 * key in memory only; a night keeps the kind of device ('com.apple.health.watch',
 * 'com.apple.health.iphone'), a known app's id (Garmin Connect), or 'file:other',
 * and store 'file'.
 */
import { normalizeText } from '@/features/import/text';
import type { ImportedWorkout } from '@/features/import/types';
import { addDays } from '@/lib/dates';
import type { ISODate, SleepEntry } from '@/types';

import type { RawStat, RawWorkout, SleepRecord, StepRecord } from '@/features/import/appleExport';

import { appleExerciseType, appleTypeFromName } from './appleHealthTypes';
import { sportOf, workoutSpan } from './convert';
import { workoutEnergy, type EnergyContext } from './energy';
import { zoneOffsetSecAt } from './healthKit';
import { mergeOrigins } from './merge';
import { healthExternalId, originName } from './origins';
import type { Handled } from './plan';
import { nightsFrom, planSleep, sleepHandledKey, sleepKindOf, type SleepNight, type SleepPlan } from './sleep';
import type { StepClock, StepDays } from './steps';
import type { HealthWorkout, SleepSample, SleepStage } from './types';

// ---------------------------------------------------------------- dates and units

/** '2026-11-15 10:00:00 +0200' as an instant and the offset it was written in. Null when unreadable. */
export function parseExportDate(s: string | null | undefined): { ms: number; offsetMin: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?\s*(?:([+-])(\d{2}):?(\d{2})|Z)$/.exec((s ?? '').trim());
  if (!m) return null;
  const offsetMin = m[7] ? (m[7] === '-' ? -1 : 1) * (Number(m[8]) * 60 + Number(m[9])) : 0;
  const wall = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]));
  const ms = wall - offsetMin * 60_000;
  return Number.isFinite(ms) ? { ms, offsetMin } : null;
}

const num = (s: string | undefined | null): number | null => {
  if (s === undefined || s === null || s.trim() === '') return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
};

/**
 * Kilocalories from an export's energy figure. HealthKit's unit strings are
 * case-sensitive: 'Cal' and 'kcal' are kilocalories, 'cal' is a small calorie.
 */
export function exportKcal(value: number | null, unit: string | null | undefined): number | null {
  if (value === null || !Number.isFinite(value) || value <= 0) return null;
  switch ((unit ?? '').trim()) {
    case 'kcal':
    case 'Cal':
    case '':
      return value;
    case 'kJ':
      return value / 4.184;
    case 'J':
      return value / 4184;
    case 'cal':
      return value / 1000;
    default:
      return null;
  }
}

/** Metres from an export's distance figure ('km', 'mi', 'm', 'yd', 'ft', 'cm'). */
export function exportMetres(value: number | null, unit: string | null | undefined): number | null {
  if (value === null || !Number.isFinite(value) || value <= 0) return null;
  const factor: Record<string, number> = { km: 1000, mi: 1609.344, m: 1, yd: 0.9144, ft: 0.3048, cm: 0.01 };
  const f = factor[(unit ?? '').trim()];
  return f ? value * f : null;
}

// ---------------------------------------------------------------- where it came from

/**
 * Known apps by the name the export gives them, to the id origins.ts names
 * them by. The ids only decide a label ("From Strava"), except Garmin
 * Connect's, which is also the workout's identity (origins.ts).
 */
const APP_NAMES: Record<string, string> = {
  'garmin connect': 'com.garmin.connect.mobile',
  // Garmin Connect's iPhone app is named "Connect" on the home screen; unproven whether the export uses that name.
  connect: 'com.garmin.connect.mobile',
  strava: 'com.strava.stravaride',
  'nike run club': 'com.nike.nikeplus-gps',
  'polar flow': 'fi.polar.polarflow',
  fitbit: 'com.fitbit.FitbitMobile',
  oura: 'com.ouraring.oura',
  whoop: 'com.whoop.android',
  peloton: 'com.onepeloton.callisto',
  komoot: 'de.komoot.android',
  wahoo: 'com.wahoofitness.fitness',
  coros: 'com.yf.smart.coros.dist',
  zepp: 'com.huami.watch.hmwatchmanager',
  withings: 'com.withings.wiscale2',
  suunto: 'com.stt.android.suunto',
};

/** One field of the device string: '<<HKDevice: 0x…>, name:Apple Watch, manufacturer:Apple Inc., model:Watch, hardware:Watch6,1, software:10.1>'. */
function deviceField(device: string | null | undefined, field: string): string {
  const m = new RegExp(`(?:^|[\\s,<])${field}:([^,>]*)`).exec(device ?? '');
  return m ? m[1].trim() : '';
}

/**
 * The origin a workout is kept under: the kind of Apple device, or the app.
 * Neither the source's name nor anything from the device string but its kind survives.
 */
export function exportOrigin(sourceName: string | null | undefined, device: string | null | undefined): string {
  const hardware = deviceField(device, 'hardware').toLowerCase();
  const model = deviceField(device, 'model').toLowerCase();
  const maker = deviceField(device, 'manufacturer').toLowerCase();
  const name = normalizeText(sourceName ?? '', 'NFC').trim().toLowerCase();
  const app = APP_NAMES[name];
  if (app) return app;
  if (hardware.startsWith('watch') || model === 'watch') return 'com.apple.health.watch';
  if (hardware.startsWith('iphone') || model === 'iphone') return 'com.apple.health.iphone';
  if (!maker || maker.startsWith('apple')) {
    // An Apple device whose kind the device string does not give: its own name usually does ("Dana’s Apple Watch").
    if (/\bwatch\b/.test(name)) return 'com.apple.health.watch';
    if (/\biphone\b/.test(name)) return 'com.apple.health.iphone';
  }
  return 'com.apple.health.device';
}

/** The kind shown on the review list ('Apple Watch'), never a personal name. */
export function exportDeviceKind(origin: string): string {
  return originName(origin);
}

// ---------------------------------------------------------------- workouts

const ACTIVE = 'HKQuantityTypeIdentifierActiveEnergyBurned';
const isDistance = (t: string) => /^HKQuantityTypeIdentifierDistance/.test(t);

/** The sum of the statistics of one kind: the workout's own, else its activities' added up (a newer multisport workout). */
function statSum(stats: RawStat[], match: (type: string) => boolean, convert: (v: number | null, unit: string) => number | null): number | null {
  const own = stats.filter((s) => !s.nested && match(s.type)).map((s) => convert(s.sum, s.unit)).filter((v): v is number => v !== null);
  if (own.length) return Math.max(...own);
  const nested = stats.filter((s) => s.nested && match(s.type)).map((s) => convert(s.sum, s.unit)).filter((v): v is number => v !== null);
  return nested.length ? nested.reduce((a, b) => a + b, 0) : null;
}

/** Metadata as HealthKit's adapter sees it: booleans and numbers where the file writes '1' and '2'. */
function metadataOf(raw: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (raw.HKIndoorWorkout !== undefined) out.HKIndoorWorkout = raw.HKIndoorWorkout === '1' || raw.HKIndoorWorkout.toLowerCase() === 'true';
  if (raw.HKSwimmingLocationType !== undefined) out.HKSwimmingLocationType = Number(raw.HKSwimmingLocationType);
  if (raw.HKTimeZone !== undefined) out.HKTimeZone = raw.HKTimeZone;
  return out;
}

/** The type number of a workout whose type name the table does not know: listed as "Workout", and the review list asks. */
export const UNKNOWN_TYPE = -1;

/**
 * One <Workout> as a HealthWorkout, or null when it has no usable start and end.
 * `index` makes its id unique within the file.
 */
export function workoutFromExport(raw: RawWorkout, index: number): HealthWorkout | null {
  const a = raw.attrs;
  const start = parseExportDate(a.startDate);
  let end = parseExportDate(a.endDate);
  if (!start) return null;
  if (!end) {
    const minutes = num(a.duration);
    const unit = (a.durationUnit ?? 'min').trim();
    const sec = minutes === null ? null : unit === 'min' ? minutes * 60 : unit === 's' ? minutes : unit === 'hr' || unit === 'h' ? minutes * 3600 : null;
    if (sec === null) return null;
    end = { ms: start.ms + sec * 1000, offsetMin: start.offsetMin };
  }
  const type = appleTypeFromName(a.workoutActivityType);
  const metadata = metadataOf(raw.metadata);
  const origin = exportOrigin(a.sourceName, a.device);
  const active = statSum(raw.stats, (t) => t === ACTIVE, exportKcal) ?? exportKcal(num(a.totalEnergyBurned), a.totalEnergyBurnedUnit ?? 'kcal');
  const distance = exportMetres(num(a.totalDistance), a.totalDistanceUnit ?? 'km') ?? statSum(raw.stats, isDistance, exportMetres);
  // The zone the workout was done in: HKTimeZone when the recording app wrote it, else the offset the date was written in.
  const zone = zoneOffsetSecAt(metadata.HKTimeZone, start.ms);
  return {
    store: 'apple-health',
    id: `export:${index}`,
    origin,
    originName: null,
    exerciseType: type === null ? UNKNOWN_TYPE : appleExerciseType(type, metadata),
    startTime: new Date(start.ms).toISOString(),
    endTime: new Date(end.ms).toISOString(),
    zoneOffsetSec: zone ?? start.offsetMin * 60,
    title: null,
    activeKcal: active,
    totalKcal: null,
    distanceM: distance,
    device: exportDeviceKind(origin),
  };
}

export interface ExportWorkouts {
  workouts: ImportedWorkout[];
  /** Readings never offered: the same workout from a second source, rest and transitions, unusable times. */
  leftOut: { otherSource: number; notExercise: number; unusable: number };
}

/**
 * The export's workouts as the file import's workouts, ready for prepareImport.
 * Two sources that recorded the same session (the watch and Garmin Connect)
 * become one, by the sync's own rule (merge.ts). Calories: energy.ts's
 * "only active" row, so a workout costs the same from this file as from
 * HealthKit; the result is the pipeline's gross figure, from which it takes
 * the resting share exactly as for every other workout.
 */
export function exportWorkouts(raw: RawWorkout[], fileName: string, ctx: EnergyContext): ExportWorkouts {
  const leftOut = { otherSource: 0, notExercise: 0, unusable: 0 };
  const usable: HealthWorkout[] = [];
  raw.forEach((r, i) => {
    const w = workoutFromExport(r, i);
    if (!w || !workoutSpan(w)) leftOut.unusable += 1;
    else if (sportOf(w).ignore) leftOut.notExercise += 1;
    else usable.push(w);
  });
  const merged = mergeOrigins(usable, (w) => ({ measured: w.activeKcal !== null, stored: false }));
  leftOut.otherSource = merged.dropped.length;
  const workouts: ImportedWorkout[] = [];
  merged.kept.forEach((w, i) => {
    const span = workoutSpan(w);
    if (!span) return;
    const sport = sportOf(w);
    const out: ImportedWorkout = {
      format: 'apple',
      fileName,
      index: i + 1,
      startUtc: span.startUtc,
      startFromLocalTime: false,
      durationSec: span.durationSec,
      elapsedSec: span.durationSec,
      durationIncludesPauses: true,
      distanceM: w.distanceM,
      kcal: workoutEnergy(w, span.durationSec, ctx).kcalGross,
      avgHeartRate: null,
      maxHeartRate: null,
      sport: sport.name,
      subSport: null,
      title: null,
      device: w.device ?? null,
      appleType: w.exerciseType,
      externalId: healthExternalId(w.origin, span.startUtc),
    };
    const offsetMin = typeof w.zoneOffsetSec === 'number' ? w.zoneOffsetSec / 60 : Number.NaN;
    if (Number.isFinite(offsetMin) && offsetMin >= -720 && offsetMin <= 840 && offsetMin % 15 === 0) out.utcOffsetMin = offsetMin;
    workouts.push(out);
  });
  return { workouts, leftOut };
}

// ---------------------------------------------------------------- steps

const HOUR = 3_600_000;
/** A sample longer than this is not a step count (a day's summary written as one sample would be spread too thin to compare). */
const MAX_SAMPLE_MS = 24 * HOUR;

/**
 * Adds up step samples into days, one source per hour (see the file comment).
 * Only days from `fromDay` to `toDay` (the phone's calendar days) are kept.
 * Keeps one number per source per hour, never the samples.
 */
export function createStepTally(clock: StepClock, fromDay: ISODate, toDay: ISODate) {
  /** 'YYYY-MM-DD#hour' -> source -> steps. */
  const hours = new Map<string, Map<string, number>>();
  const midnights = new Map<ISODate, number>();
  const midnight = (day: ISODate) => {
    let m = midnights.get(day);
    if (m === undefined) {
      m = clock.midnightOf(day);
      midnights.set(day, m);
    }
    return m;
  };
  let samples = 0;

  function addTo(key: string, source: string, steps: number) {
    let bySource = hours.get(key);
    if (!bySource) hours.set(key, (bySource = new Map()));
    bySource.set(source, (bySource.get(source) ?? 0) + steps);
  }

  /** One sample: `count` steps between startMs and endMs from `source`. */
  function add(source: string, startMs: number, endMs: number, count: number) {
    if (!Number.isFinite(startMs) || !Number.isFinite(count) || count <= 0) return;
    if (!Number.isFinite(endMs) || endMs < startMs) endMs = startMs;
    if (endMs - startMs > MAX_SAMPLE_MS) return;
    samples++;
    // An instant sample goes to its hour whole.
    if (endMs === startMs) {
      const day = clock.dayOf(startMs);
      if (day < fromDay || day > toDay) return;
      addTo(`${day}#${Math.floor((startMs - midnight(day)) / HOUR)}`, source, count);
      return;
    }
    const span = endMs - startMs;
    let cur = startMs;
    while (cur < endMs) {
      const day = clock.dayOf(cur);
      const mid = midnight(day);
      const h = Math.floor((cur - mid) / HOUR);
      const next = Math.min(endMs, mid + (h + 1) * HOUR, midnight(addDays(day, 1)));
      // A day's last hour on a day that is shorter than 24 hours ends at the next midnight.
      const stop = next > cur ? next : endMs;
      if (day >= fromDay && day <= toDay) addTo(`${day}#${h}`, source, (count * (stop - cur)) / span);
      cur = stop;
    }
  }

  function addRecord(r: StepRecord, parse: (s: string) => number | null) {
    const start = parse(r.startDate);
    const end = parse(r.endDate);
    const count = Number(r.value);
    if (start === null) return;
    add(r.sourceName || '?', start, end ?? start, count);
  }

  /** The sources, most steps over the window first (ties by name, so the order never depends on the file's order). */
  function sourceOrder(): string[] {
    const totals = new Map<string, number>();
    for (const bySource of hours.values()) for (const [source, n] of bySource) totals.set(source, (totals.get(source) ?? 0) + n);
    return [...totals.keys()].sort((a, b) => totals.get(b)! - totals.get(a)! || (a < b ? -1 : a > b ? 1 : 0));
  }

  /** Steps per day: each hour from the first source in `sourceOrder` that has steps in it, added up. Days with none are left out. */
  function days(): StepDays {
    const order = sourceOrder();
    const sums: Record<string, number> = {};
    for (const [key, bySource] of hours) {
      const day = key.slice(0, 10);
      let n = 0;
      for (const source of order) {
        const v = bySource.get(source);
        if (v !== undefined && v > 0) {
          n = v;
          break;
        }
      }
      sums[day] = (sums[day] ?? 0) + n;
    }
    const out: StepDays = {};
    for (const day of Object.keys(sums).sort()) {
      const n = Math.round(sums[day]);
      if (n > 0) out[day] = n;
    }
    return out;
  }

  return { add, addRecord, days, get samples() {
    return samples;
  } };
}

/** The instant of an export date, for the tally. */
export const exportInstant = (s: string): number | null => parseExportDate(s)?.ms ?? null;

// ---------------------------------------------------------------- sleep

/** HKCategoryValueSleepAnalysis as the export writes it ('Asleep' is the older exports' name for unspecified). */
const SLEEP_VALUES: Record<string, SleepStage> = {
  HKCategoryValueSleepAnalysisInBed: 'inBed',
  HKCategoryValueSleepAnalysisAsleepUnspecified: 'asleep',
  HKCategoryValueSleepAnalysisAsleep: 'asleep',
  HKCategoryValueSleepAnalysisAwake: 'awake',
  HKCategoryValueSleepAnalysisAsleepCore: 'light',
  HKCategoryValueSleepAnalysisAsleepDeep: 'deep',
  HKCategoryValueSleepAnalysisAsleepREM: 'rem',
};

/** The stage a sleep record's value stands for; anything else is 'unknown' (never counted). */
export function exportSleepStage(value: string): SleepStage {
  return SLEEP_VALUES[value.trim()] ?? 'unknown';
}

/** The origin a night from the file is kept under: the kind of Apple device, a known app's id, or 'file:other'. Never a name. */
export function exportSleepOrigin(sourceName: string | null | undefined, device: string | null | undefined): string {
  const origin = exportOrigin(sourceName, device);
  return origin === 'com.apple.health.device' ? 'file:other' : origin;
}

/** A stretch longer than this is not one stage of one night. */
const MAX_SLEEP_SAMPLE_MS = 24 * HOUR;

/**
 * Sleep records of the window, per source, turned into nights (see the file
 * comment). Keeps the stretches (a few thousand for SLEEP_DAYS nights), never the records.
 */
export function createSleepTally(clock: StepClock) {
  const samples: SleepSample[] = [];
  /** Grouping key (kept origin and source name, in memory only) to the origin a night keeps. */
  const origins = new Map<string, string>();
  /** Offsets by zone and hour: a zone's offset is looked up once an hour, not once a stretch. */
  const zones = new Map<string, number | null>();
  const zoneAt = (tz: string, ms: number) => {
    const key = `${tz}|${Math.floor(ms / HOUR)}`;
    let v = zones.get(key);
    if (v === undefined) {
      v = zoneOffsetSecAt(tz, ms);
      zones.set(key, v);
    }
    return v;
  };

  function addRecord(r: SleepRecord) {
    const start = parseExportDate(r.startDate);
    const end = parseExportDate(r.endDate);
    if (!start || !end || end.ms <= start.ms || end.ms - start.ms > MAX_SLEEP_SAMPLE_MS) return;
    const stage = exportSleepStage(r.value);
    // In bed and unknown stretches never count: not kept.
    if (stage === 'inBed' || stage === 'unknown') return;
    const origin = exportSleepOrigin(r.sourceName, r.device);
    // Two sources of the same kind (two apps on the phone) stay apart: one night is never made of two.
    const key = `${origin}#${normalizeText(r.sourceName ?? '', 'NFC')}`;
    origins.set(key, origin);
    // The zone the night was slept in: HKTimeZone when the app wrote it, else the offset the date was written in
    // (which may be the exporting phone's zone, not the sleeper's: docs/health-sync.md "Not proven").
    const zone = r.timeZone ? zoneAt(r.timeZone, end.ms) : null;
    samples.push({
      store: 'file',
      origin: key,
      kind: sleepKindOf(origin),
      start: new Date(start.ms).toISOString(),
      end: new Date(end.ms).toISOString(),
      zoneOffsetSec: zone ?? end.offsetMin * 60,
      stage,
    });
  }

  /** At most one night per wake day from `firstDay`, oldest first. `now`: when the export was made (a night still going on then is left out). */
  function nights(now: number, firstDay: ISODate): SleepNight[] {
    return nightsFrom(samples, { now, clock, firstDay }).map((n) => ({ ...n, origin: origins.get(n.origin) ?? 'file:other' }));
  }

  return {
    addRecord,
    nights,
    get samples() {
      return samples.length;
    },
  };
}

/**
 * The nights of every export read in one visit, one per wake day: where two
 * files cover the same day, the newer file's (it was made later, so its night
 * is the finished one). Oldest day first.
 */
export function fileNights(reads: readonly { asOf: string; nights: readonly SleepNight[] }[]): SleepNight[] {
  const byDay = new Map<ISODate, SleepNight>();
  const order = [...reads].sort((a, b) => (a.asOf < b.asOf ? -1 : a.asOf > b.asOf ? 1 : 0));
  for (const r of order) for (const n of r.nights) byDay.set(n.date, n);
  return [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** What saving a file's nights would do: the sync's own plan (sleep.ts planSleep), and why the others are left as they are. */
export interface FileSleepPlan extends SleepPlan {
  /** Nights the file holds in the window. */
  found: number;
  /** Nights for days the person deleted (or whose sync they undid): never written again. */
  deleted: number;
  /** Nights for days whose night is already in the sleep log and stays (by hand, the same, or a better reading). */
  kept: number;
}

/**
 * The plan for a file's nights against the sleep log (every record, deleted
 * ones included) and this phone's sync memory. A night entered by hand, a
 * deleted one and a synced one from a health store are never replaced by the
 * file (rule h).
 */
export function planFileSleep(nights: readonly SleepNight[], existing: readonly SleepEntry[], handled: Readonly<Record<string, Handled>>): FileSleepPlan {
  const plan = planSleep({ nights, existing, handled });
  const live = new Set(existing.filter((r) => r && !r.deleted).map((r) => r.date));
  let deleted = 0;
  for (const n of nights) {
    const skipped = handled[sleepHandledKey(n.date)]?.how === 'skipped';
    if (skipped || (!live.has(n.date) && existing.some((r) => r && r.date === n.date))) deleted += 1;
  }
  const written = plan.add.length + plan.update.length;
  return { ...plan, found: nights.length, deleted, kept: Math.max(0, nights.length - written - deleted) };
}
