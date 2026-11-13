/**
 * Pure helpers for the tracker screens (water, weight, body, sleep, fasting).
 * No React, no storage, so they are covered by vitest.
 */
import { addDays, diffDays, formatShortDate, lastNDates } from '@/lib/dates';
import type { TrendPoint } from '@/lib/trend';
import type { ISODate, SleepEntry } from '@/types';

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

/** '7 h 30 min', '45 min', '9 h' from hours. */
export function formatHours(hours: number): string {
  const mins = Math.round(hours * 60);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
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

export const QUALITY_LABELS: Record<SleepEntry['quality'], string> = {
  1: 'Poor',
  2: 'Fair',
  3: 'Okay',
  4: 'Good',
  5: 'Great',
};

export interface SleepSummary {
  nights: number;
  avgHours: number | null;
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
  const spread = n >= 2 && avg !== null ? Math.sqrt(logged.reduce((s, e) => s + (e.hours - avg) ** 2, 0) / n) : null;
  return {
    nights: n,
    avgHours: avg,
    avgQuality: n ? logged.reduce((s, e) => s + e.quality, 0) / n : null,
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
