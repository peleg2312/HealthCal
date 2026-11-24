/**
 * Pure helpers for the tracker screens (water, weight, body, sleep, fasting).
 * No React, no storage, so they are covered by vitest.
 */
import { addDays, diffDays, formatShortDate, lastNDates } from '@/lib/dates';
import type { TrendPoint } from '@/lib/trend';
import { weightUnit, weightValue } from '@/lib/units';
import type { ISODate, Profile, SleepEntry, SleepQuality, UnitSystem, WeightEntry } from '@/types';

import { isSyncedWeighIn, sameFat, sameKg, withoutSyncFields } from './weighInSource';

// ------------------------------------------------------------------ common

/** The live record for a date, if any (one record per date for weights and sleep). */
export function findByDate<T extends { date: ISODate }>(entries: T[], date: ISODate): T | undefined {
  return entries.find((e) => e.date === date);
}

/** True when no record is dated after `date`, so a save there is the user's current value. */
export function isMostRecentDate(entries: { date: ISODate }[], date: ISODate): boolean {
  return entries.every((e) => e.date <= date);
}

/** 'H:MM:SS' for a running timer. */
export function formatClockDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * A weight with its one decimal, always: "74.0 kg", "163.1 lb". Every weight a person reads (a weigh-in,
 * the trend, a goal, a range, a change) has one decimal, so a goal of 74 never sits as "74 kg" beside
 * "78.8 kg" (`formatWeight` drops a trailing zero).
 */
export function weightText(kg: number, units: UnitSystem): string {
  return `${weightValue(kg, units).toFixed(1)} ${weightUnit(units)}`;
}

/** '7 h 30 min', '45 min', '9 h' from hours. */
export function formatHours(hours: number): string {
  const { value, unit } = hoursFigure(hours);
  return `${value} ${unit}`;
}

/**
 * A night's length as a figure and its small unit, the one way every screen draws sleep (Sleep, the
 * morning page, Progress, Today): 7.25 -> '7 h 15' + 'min', 7 -> '7' + 'h', 0.75 -> '45' + 'min'.
 * Never decimal hours ('7.3 h').
 */
export function hoursFigure(hours: number): { value: string; unit: string } {
  const mins = Math.round(hours * 60);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return { value: String(m), unit: 'min' };
  return m === 0 ? { value: String(h), unit: 'h' } : { value: `${h} h ${m}`, unit: 'min' };
}

/** What a screen reader says for a night's length: '7 hours 15 minutes', '1 hour', '45 minutes'. */
export function hoursSpoken(hours: number): string {
  const mins = Math.round(hours * 60);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const hw = `${h} ${h === 1 ? 'hour' : 'hours'}`;
  const mw = `${m} ${m === 1 ? 'minute' : 'minutes'}`;
  if (h === 0) return mw;
  return m === 0 ? hw : `${hw} ${mw}`;
}

// ------------------------------------------------------------------- water

export const MIN_PRESET_ML = 30;
export const MAX_PRESET_ML = 2000;

/** Clean edited preset sizes: valid, rounded, unique, at most six, in the order given. */
export function normalizePresets(values: (number | null | undefined)[]): number[] {
  const out: number[] = [];
  for (const v of values) {
    if (v === null || v === undefined || !Number.isFinite(v)) continue;
    const ml = Math.round(v);
    if (ml < MIN_PRESET_ML || ml > MAX_PRESET_ML || out.includes(ml)) continue;
    out.push(ml);
  }
  return out.slice(0, 6);
}

/** True at the moment intake crosses the goal (not on every render above it). */
export function crossedGoal(prevMl: number, nextMl: number, goalMl: number): boolean {
  return goalMl > 0 && prevMl < goalMl && nextMl >= goalMl;
}

// ------------------------------------------------------------------ weight

export type WeightRange = '1m' | '3m' | 'all';

export interface ChartData {
  line: { x: number; y: number }[];
  dots: { x: number; y: number }[];
  labels: string[];
}

/** Trend line and raw weigh-ins for a range ending at `end`, x in days from the range start. */
export function weightChartData(trend: TrendPoint[], range: WeightRange, end: ISODate, toDisplay: (kg: number) => number = (k) => k): ChartData {
  if (trend.length === 0) return { line: [], dots: [], labels: [] };
  const first = trend[0].date;
  const start = range === 'all' ? first : addDays(end, range === '1m' ? -30 : -91);
  const from = start > first ? start : first;
  const pts = trend.filter((p) => p.date >= from && p.date <= end);
  if (pts.length === 0) return { line: [], dots: [], labels: [] };
  const line = pts.map((p) => ({ x: diffDays(from, p.date), y: toDisplay(p.trend) }));
  const dots = pts.filter((p) => !p.interpolated).map((p) => ({ x: diffDays(from, p.date), y: toDisplay(p.kg) }));
  const last = pts[pts.length - 1].date;
  const mid = addDays(from, Math.round(diffDays(from, last) / 2));
  const labels = from === last ? [formatShortDate(from)] : [formatShortDate(from), formatShortDate(mid), formatShortDate(last)];
  return { line, dots, labels };
}

export interface WeightStats {
  trendKg: number;
  /** Signed kg per week, null with under a week of data. */
  weeklyKg: number | null;
  /** Trend now minus the first weigh-in. */
  totalChangeKg: number;
  /** Target minus trend (signed), null without a target. */
  toTargetKg: number | null;
}

export function weightStats(trend: TrendPoint[], startKg: number, weeklyKg: number | null, targetKg?: number): WeightStats | null {
  if (trend.length === 0) return null;
  const trendKg = trend[trend.length - 1].trend;
  return {
    trendKg,
    weeklyKg,
    totalChangeKg: trendKg - startKg,
    toTargetKg: targetKg ? targetKg - trendKg : null,
  };
}

// -------------------------------------------------------------------- body

/** Waist-to-height ratio guideline: keep the waist under half the height. */
export const WHTR_GUIDELINE = 0.5;

/** Typical error of the US Navy tape method against DEXA, percentage points. */
export const NAVY_ERROR_PCT = 3.5;

export function hasMeasurements(e: { waistCm?: number; hipCm?: number; neckCm?: number }): boolean {
  return !!(e.waistCm || e.hipCm || e.neckCm);
}

// ------------------------------------------------------------------- sleep

/** Adult reference range (AASM / Sleep Research Society 2015). */
export const SLEEP_RANGE: [number, number] = [7, 9];

export const QUALITY_LABELS: Record<SleepQuality, string> = {
  1: 'Poor',
  2: 'Fair',
  3: 'Okay',
  4: 'Good',
  5: 'Very good',
};

/**
 * The record a sleep edit writes. Changing the time asleep of a night read from
 * a health store makes it the person's own: where it came from, its times and its
 * stages no longer describe it, so they go (and the sync then leaves it alone).
 * A change of quality alone keeps them. `quality` null leaves the night unrated.
 */
export function nightAfterEdit(
  existing: SleepEntry | undefined,
  date: ISODate,
  hours: number,
  quality: SleepQuality | null,
): Omit<SleepEntry, 'id' | 'updatedAt'> & { id?: string } {
  const base: Partial<SleepEntry> = { ...(existing ?? {}) };
  delete base.deleted;
  delete base.updatedAt;
  if (existing?.source === 'health' && Math.abs(existing.hours - hours) > 1e-9) {
    delete base.source;
    delete base.store;
    delete base.origin;
    delete base.startedAt;
    delete base.endedAt;
    delete base.stages;
  }
  delete base.quality;
  return { ...base, id: existing?.id, date, hours, ...(quality !== null ? { quality } : {}) };
}

export interface SleepSummary {
  nights: number;
  avgHours: number | null;
  /** Average over the nights that have a quality (a synced night may have none), null when none do. */
  avgQuality: number | null;
  inRange: number;
  /** Standard deviation of nightly duration, hours. */
  spreadHours: number | null;
  /** One value per date (0 when not logged), oldest first. */
  series: { date: ISODate; hours: number }[];
}

export function sleepSummary(entries: SleepEntry[], days: number, end: ISODate): SleepSummary {
  const dates = lastNDates(days, end);
  const byDate = new Map(entries.map((e) => [e.date, e]));
  const logged = dates.map((d) => byDate.get(d)).filter((e): e is SleepEntry => !!e);
  const n = logged.length;
  const avg = n ? logged.reduce((s, e) => s + e.hours, 0) / n : null;
  const rated = logged.filter((e): e is SleepEntry & { quality: SleepQuality } => typeof e.quality === 'number');
  const spread = n >= 2 && avg !== null ? Math.sqrt(logged.reduce((s, e) => s + (e.hours - avg) ** 2, 0) / n) : null;
  return {
    nights: n,
    avgHours: avg,
    avgQuality: rated.length ? rated.reduce((s, e) => s + e.quality, 0) / rated.length : null,
    inRange: logged.filter((e) => e.hours >= SLEEP_RANGE[0] && e.hours <= SLEEP_RANGE[1]).length,
    spreadHours: spread,
    series: dates.map((d) => ({ date: d, hours: byDate.get(d)?.hours ?? 0 })),
  };
}

// ----------------------------------------------------------------- fasting

export const FASTING_PRESETS: { hours: number; label: string }[] = [
  { hours: 14, label: '14:10' },
  { hours: 16, label: '16:8' },
  { hours: 18, label: '18:6' },
  { hours: 20, label: '20:4' },
];

export const MIN_FAST_HOURS = 1;
export const MAX_FAST_HOURS = 72;
/** How far back a start time can be moved. */
export const MAX_START_BACK_MS = 72 * 3600_000;

export function fastingLabel(hours: number): string {
  const preset = FASTING_PRESETS.find((p) => p.hours === hours);
  if (preset) return preset.label;
  return hours < 24 ? `${trimNum(hours)}:${trimNum(24 - hours)}` : `${trimNum(hours)} h`;
}

function trimNum(n: number): string {
  return String(Math.round(n * 10) / 10);
}

export interface FastProgress {
  elapsedMs: number;
  remainingMs: number;
  targetMs: number;
  /** 0.. (can exceed 1 past the target). */
  progress: number;
  reached: boolean;
  endsAt: Date;
}

/** Always derived from the stored start, so it stays correct across restarts and sleep. */
export function fastProgress(startISO: string, targetHours: number, now: number, endISO?: string): FastProgress {
  const start = Date.parse(startISO);
  const stop = endISO ? Date.parse(endISO) : now;
  const targetMs = targetHours * 3600_000;
  const elapsedMs = Math.max(0, stop - start);
  return {
    elapsedMs,
    remainingMs: Math.max(0, targetMs - elapsedMs),
    targetMs,
    progress: targetMs > 0 ? elapsedMs / targetMs : 0,
    reached: elapsedMs >= targetMs,
    endsAt: new Date(start + targetMs),
  };
}

/** Keep an edited start time in the past and within the allowed window. */
export function clampFastStart(candidateMs: number, nowMs: number): number {
  return Math.min(nowMs, Math.max(nowMs - MAX_START_BACK_MS, candidateMs));
}

/** 'Today 20:15', 'Yesterday 07:00', 'Mon 13:45' relative to now. */
export function relativeDayTime(d: Date, now: Date = new Date()): string {
  const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86_400_000);
  if (diff === 0) return `Today ${hhmm}`;
  if (diff === 1) return `Yesterday ${hhmm}`;
  if (diff === -1) return `Tomorrow ${hhmm}`;
  return `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]} ${hhmm}`;
}

// ------------------------------------------------------- display round-trip

/**
 * A number field is prefilled with a rounded display value of a stored metric
 * value. When the user leaves it untouched, keep the stored value instead of
 * converting the rounded number back (which would drift: 38.0 cm -> 15.0 in -> 38.1 cm).
 */
export function keepOrConvert(
  shown: number | null,
  original: number | null | undefined,
  toDisplay: (metric: number) => number,
  toMetric: (display: number) => number,
): number | null {
  if (shown === null || !Number.isFinite(shown)) return null;
  if (original !== null && original !== undefined && toDisplay(original) === shown) return original;
  return toMetric(shown);
}

/** Split a formatted figure at the first space after the number: '70 fl oz' -> 70 / 'fl oz'. */
export function splitUnit(formatted: string): { value: string; unit: string } {
  const m = /^(\S+)\s(.+)$/.exec(formatted);
  return m ? { value: m[1], unit: m[2] } : { value: formatted, unit: '' };
}

/** Body fat the profile should carry: the newest live weigh-in that has one, else none. */
export function latestBodyFat(entries: { date: ISODate; bodyFatPct?: number }[]): number | undefined {
  let best: { date: ISODate; bodyFatPct?: number } | undefined;
  for (const e of entries) {
    if (e.bodyFatPct === undefined || e.bodyFatPct === null) continue;
    if (!best || e.date > best.date) best = e;
  }
  return best?.bodyFatPct;
}

// ------------------------------------------------------- synced weigh-ins

/** The figures a weigh-in edit may change (the sheet's patch). */
export type WeighInPatch = Partial<Omit<WeightEntry, 'id' | 'updatedAt' | 'deleted' | 'date'>>;

/**
 * The record a weigh-in save writes. Changing the weight or the body fat of a
 * weigh-in a health store wrote (`isSyncedWeighIn`) makes it the person's own:
 * where it came from no longer describes it, so those fields go, and the sync
 * leaves it alone after that. Changing only waist, hip, neck or the note keeps it
 * synced. Fields not in the patch are kept; a patch key set to undefined clears it.
 */
export function weighInAfterEdit(
  existing: WeightEntry | undefined,
  date: ISODate,
  patch: WeighInPatch & { kg: number },
): Omit<WeightEntry, 'id' | 'updatedAt'> & { id?: string } {
  const merged: Partial<WeightEntry> = { ...(existing ?? {}), ...patch };
  delete merged.deleted;
  delete merged.updatedAt;
  for (const k of Object.keys(merged) as (keyof WeightEntry)[]) if (merged[k] === undefined) delete merged[k];
  const changesReading =
    !!existing &&
    isSyncedWeighIn(existing) &&
    (!sameKg(patch.kg, existing.kg) || ('bodyFatPct' in patch && !sameFat(patch.bodyFatPct, existing.bodyFatPct)));
  const out = changesReading ? withoutSyncFields(merged) : merged;
  return { ...out, id: existing?.id, date, kg: patch.kg };
}

/** What a synced weigh-in would set the targets to, when they do not use it yet (`targetsBehind`). */
export interface TargetsBehind {
  latest: WeightEntry;
  kg: number;
  /** Set only when the weigh-in has body fat that differs from the profile's. */
  bodyFatPct?: number;
}

/**
 * The newest-dated live weigh-in, when it is a synced one whose weight differs
 * from the profile's by 0.05 kg or more, or whose body fat differs from the
 * profile's by 0.1 or more: what "Use it for targets" on /weight would apply.
 * Null otherwise (no profile, no weigh-ins, the newest is the person's own, or
 * the targets already use it). A sync never writes the profile itself.
 */
export function targetsBehind(profile: Pick<Profile, 'weightKg' | 'bodyFatPct'> | null | undefined, liveWeights: readonly WeightEntry[]): TargetsBehind | null {
  if (!profile) return null;
  let latest: WeightEntry | undefined;
  for (const w of liveWeights) if (!w.deleted && (!latest || w.date > latest.date)) latest = w;
  if (!latest || !isSyncedWeighIn(latest)) return null;
  const kgDiffers = Math.abs(latest.kg - profile.weightKg) >= 0.05;
  const fat = latest.bodyFatPct;
  const fatDiffers = typeof fat === 'number' && (typeof profile.bodyFatPct !== 'number' || Math.abs(fat - profile.bodyFatPct) >= 0.1);
  if (!kgDiffers && !fatDiffers) return null;
  return { latest, kg: latest.kg, ...(fatDiffers ? { bodyFatPct: fat } : {}) };
}

/**
 * Whether deleting `entry` should move the profile's body fat to the newest
 * other reading (or clear it): only when the entry held the newest body-fat
 * reading among the live weigh-ins and the profile's value is that reading's,
 * i.e. it came from this weigh-in. A body fat typed in Goals or on /body that
 * differs is never cleared by deleting a weigh-in.
 */
export function bodyFatFollowsDelete(
  profile: Pick<Profile, 'bodyFatPct'> | null | undefined,
  entry: Pick<WeightEntry, 'id' | 'date' | 'bodyFatPct'>,
  live: readonly Pick<WeightEntry, 'id' | 'date' | 'bodyFatPct'>[],
): boolean {
  if (typeof entry.bodyFatPct !== 'number' || !profile || typeof profile.bodyFatPct !== 'number') return false;
  const newest = live.every((e) => e.id === entry.id || typeof e.bodyFatPct !== 'number' || e.date < entry.date);
  return newest && sameFat(profile.bodyFatPct, entry.bodyFatPct);
}

/**
 * Body fat the profile may fall back to: the newest of the person's own weigh-ins
 * that has one. A synced weigh-in (`isSyncedWeighIn`) does not count: it reaches
 * the profile only by the person's own save of it or "Use it for targets".
 */
export function ownLatestBodyFat(entries: readonly WeightEntry[]): number | undefined {
  return latestBodyFat(entries.filter((e) => !e.deleted && !isSyncedWeighIn(e)));
}

/**
 * What deleting `entry` changes in the profile (`live`: the live weigh-ins before
 * the delete). The weight moves only when the entry was the newest-dated weigh-in
 * and the profile's weight came from it; it then goes to the newest remaining
 * weigh-in of the person's own (a synced one waits for "Use it for targets"), or
 * stays when there is none. Body fat follows `bodyFatFollowsDelete`, falling back
 * to `ownLatestBodyFat` or none. Deleting an older weigh-in, or one whose figures
 * the person has typed over in Goals or on /body, changes nothing. A key present
 * with `undefined` clears that figure.
 */
export function profileAfterDelete(
  profile: Pick<Profile, 'weightKg' | 'bodyFatPct'> | null | undefined,
  entry: WeightEntry,
  live: readonly WeightEntry[],
): Partial<Pick<Profile, 'weightKg' | 'bodyFatPct'>> {
  if (!profile) return {};
  const rest = live.filter((e) => e.id !== entry.id && !e.deleted);
  const patch: Partial<Pick<Profile, 'weightKg' | 'bodyFatPct'>> = {};
  const newest = rest.every((e) => e.date < entry.date);
  if (newest && sameKg(profile.weightKg, entry.kg)) {
    let target: WeightEntry | undefined;
    for (const e of rest) if (!isSyncedWeighIn(e) && (!target || e.date > target.date)) target = e;
    if (target && !sameKg(target.kg, profile.weightKg)) patch.weightKg = target.kg;
  }
  if (bodyFatFollowsDelete(profile, entry, live)) {
    const bf = ownLatestBodyFat(rest);
    if (bf !== profile.bodyFatPct) patch.bodyFatPct = bf;
  }
  return patch;
}
