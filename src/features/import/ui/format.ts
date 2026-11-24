/**
 * Plain formatting and counting for the Garmin import screen. Pure: no React,
 * no storage, no clock (today's date is passed in), so it is unit-tested.
 */
import { ACTIVITY_BY_ID } from '@/data/activities';
import { addDays, formatDuration, fromISODate } from '@/lib/dates';
import { kcalRange } from '@/lib/exercise';
import { formatDistance, formatNumber } from '@/lib/units';
import type { ISODate, UnitSystem } from '@/types';

import { speedIntensity } from '../effort';
import type { ImportCandidate } from '../plan';
import type { ImportBatch } from '../read';
import { recordedWallTime } from '../time';
import type { ImportedWorkout } from '../types';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Today", "Yesterday", "Sat, Dec 27", or with the year when it is not this year: "Sat, Dec 27, 2025". */
export function dayLabel(date: ISODate, todayDate: ISODate): string {
  if (date === todayDate) return 'Today';
  if (date === addDays(todayDate, -1)) return 'Yesterday';
  const d = fromISODate(date);
  const base = `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
  return date.slice(0, 4) === todayDate.slice(0, 4) ? base : `${base}, ${d.getFullYear()}`;
}

type Recorded = Pick<ImportedWorkout, 'startUtc' | 'utcOffsetMin'>;

/**
 * Start time where the workout was recorded (the file's own offset, else this
 * device's zone): "07:05", or "7:05 AM" for a 12-hour clock.
 */
export function clockTime(w: Recorded, hour12: boolean): string {
  const t = recordedWallTime(w);
  const h = t.hour;
  const m = String(t.minute).padStart(2, '0');
  if (!hour12) return `${String(h).padStart(2, '0')}:${m}`;
  return `${h % 12 === 0 ? 12 : h % 12}:${m} ${h >= 12 ? 'PM' : 'AM'}`;
}

/** The calendar day the workout was done on, where it was recorded (the day its entry is saved under). */
export const localDay = (w: Recorded): ISODate => recordedWallTime(w).date;

/** Seconds as the app shows durations: "48 min", "1 h 2 min". Under a minute: "45 s". */
export function durationLabel(sec: number): string {
  if (sec < 60) return `${Math.max(1, Math.round(sec))} s`;
  return formatDuration(sec / 60);
}

/** Distance in the person's units, or null when the file has none or it is zero. */
export function distanceLabel(m: number | null, units: UnitSystem): string | null {
  // Under 10 m is GPS noise (a multisport transition), not a distance worth showing.
  if (m === null || m < 10) return null;
  return formatDistance(m / 1000, units);
}

/** The meta line under a row: day, start time, duration and distance. Non-breaking spaces keep a value with its unit. */
export function metaLine(w: ImportedWorkout, todayDate: ISODate, units: UnitSystem, hour12: boolean): string {
  const parts = [dayLabel(localDay(w), todayDate), clockTime(w, hour12), durationLabel(w.durationSec)];
  const dist = distanceLabel(w.distanceM, units);
  if (dist) parts.push(dist);
  return parts.map((p) => p.replace(/ /g, ' ')).join(' · ');
}

export interface CalorieView {
  /** The workout's calories above resting, as shown ("+561", "~488"); null until there is an activity. */
  added: string | null;
  /** True when the added figure is an estimate (the file had no calories). */
  estimate: boolean;
  /** The line under it: "658 by watch", "likely 390–586" (the run log's word for the range), or "no calories in file". */
  detail: string;
  /** Spoken version for screen readers. */
  spoken: string;
}

export function calorieView(c: Pick<ImportCandidate, 'workout' | 'entry' | 'status'>): CalorieView {
  const gross = c.workout.kcal;
  const measured = gross !== null && gross > 0;
  // A row that is the same workout again adds nothing, so it shows only what the file says.
  if (!c.entry || c.status === 'already-imported' || c.status === 'duplicate-in-file') {
    if (measured) return { added: null, estimate: false, detail: `${formatNumber(gross)} by watch`, spoken: `${formatNumber(gross)} kilocalories measured by the watch` };
    // A file that states 0 kcal does have a calorie figure; it is just zero.
    return gross === 0
      ? { added: null, estimate: true, detail: '0 kcal in file', spoken: 'The file states 0 kilocalories' }
      : { added: null, estimate: true, detail: 'No calories in file', spoken: 'No calories in the file' };
  }
  const net = Math.round(c.entry.kcalNet);
  if (c.entry.measured) {
    return {
      // The burn is measured; the part above resting is still an estimate, so it carries "~" (one name: "added").
      added: `~${formatNumber(net)}`,
      estimate: false,
      detail: `${formatNumber(gross ?? c.entry.kcalGross)} by watch`,
      spoken: `${formatNumber(gross ?? c.entry.kcalGross)} kilocalories burned, measured by the watch, about ${formatNumber(net)} kilocalories added`,
    };
  }
  const [lo, hi] = kcalRange(net);
  return {
    added: `~${formatNumber(net)}`,
    estimate: true,
    detail: `likely ${formatNumber(lo)}–${formatNumber(hi)}`,
    spoken: `${gross === 0 ? 'The file states 0 kilocalories. ' : ''}About ${formatNumber(net)} kilocalories added, an estimate between ${formatNumber(lo)} and ${formatNumber(hi)}`,
  };
}

export type RowFilter = 'all' | 'selected' | 'choose' | 'duplicates';

export const isDuplicate = (c: ImportCandidate) => c.status !== 'new' && c.status !== 'update';
/** A row the person can still tick (has an activity and is not the same workout again). */
export const isTickable = (c: ImportCandidate) => c.entry !== null && c.status !== 'already-imported' && c.status !== 'duplicate-in-file';

export function filterRows(rows: ImportCandidate[], filter: RowFilter): ImportCandidate[] {
  switch (filter) {
    case 'all':
      return rows;
    case 'selected':
      return rows.filter((r) => r.selected);
    case 'choose':
      return rows.filter((r) => r.activityId === null && r.status !== 'already-imported' && r.status !== 'duplicate-in-file');
    case 'duplicates':
      return rows.filter(isDuplicate);
  }
}

export interface RowCounts {
  total: number;
  selected: number;
  /** Rows waiting for the person to choose an activity (repeats excluded). */
  choose: number;
  alreadyImported: number;
  /** Workouts already imported from a poorer file, which this one improves. */
  updates: number;
  /** Workouts the person changed after importing; the file would undo that, so they are only offered. */
  edited: number;
  /** Imported before and then deleted: can be restored. */
  deletedBefore: number;
  duplicates: number;
  probable: number;
  /** Rows nobody can tick: already imported or repeated in the file. */
  locked: number;
}

export function countRows(rows: ImportCandidate[]): RowCounts {
  const c: RowCounts = { total: rows.length, selected: 0, choose: 0, alreadyImported: 0, updates: 0, edited: 0, deletedBefore: 0, duplicates: 0, probable: 0, locked: 0 };
  for (const r of rows) {
    if (r.selected) c.selected += 1;
    if (r.status === 'already-imported') {
      c.alreadyImported += 1;
      if (r.match?.deleted) c.deletedBefore += 1;
    }
    if (r.status === 'update') {
      if (r.edited) c.edited += 1;
      else c.updates += 1;
    }
    if (isDuplicate(r)) c.duplicates += 1;
    if (r.status === 'probable-duplicate') c.probable += 1;
    if (r.status === 'already-imported' || r.status === 'duplicate-in-file') c.locked += 1;
    else if (r.activityId === null) c.choose += 1;
  }
  return c;
}

type Totals = { id?: string; date: ISODate; durationMin: number; kcalNet: number };

/**
 * Totals of what an import changes: sessions, minutes, net kcal and the days
 * touched (newest first). `previous` holds the stored versions of workouts the
 * import updated: they count as updated, not added, and only the difference
 * in calories and minutes is counted.
 */
export function summarise(entries: Totals[], previous: Totals[] = []) {
  const before = new Map(previous.filter((p) => p.id).map((p) => [p.id as string, p]));
  const byDay = new Map<ISODate, { date: ISODate; sessions: number; updated: number; kcal: number; minutes: number }>();
  let kcal = 0;
  let minutes = 0;
  let updated = 0;
  for (const e of entries) {
    const old = e.id ? before.get(e.id) : undefined;
    const dk = e.kcalNet - (old?.kcalNet ?? 0);
    const dm = e.durationMin - (old?.durationMin ?? 0);
    kcal += dk;
    minutes += dm;
    const d = byDay.get(e.date) ?? { date: e.date, sessions: 0, updated: 0, kcal: 0, minutes: 0 };
    if (old) {
      d.updated += 1;
      updated += 1;
    } else d.sessions += 1;
    d.kcal += dk;
    d.minutes += dm;
    byDay.set(e.date, d);
  }
  const days = [...byDay.values()].sort((a, b) => b.date.localeCompare(a.date));
  return { sessions: entries.length - updated, updated, kcal: Math.round(kcal), minutes, days };
}

/** "1 workout", "12 workouts". */
export const workouts = (n: number) => `${formatNumber(n)} ${n === 1 ? 'workout' : 'workouts'}`;

/** The picked file a path inside an archive belongs to: 'export.zip/a/b.fit' -> 'export.zip'. */
export function topFile(path: string, picked: string[]): string {
  return picked.find((p) => path === p || path.startsWith(`${p}/`)) ?? path;
}

/** The part of a path after the picked file, for naming a file inside an archive ('a/b.fit'), or null for the file itself. */
export function innerPath(path: string, top: string): string | null {
  return path.length > top.length + 1 && path.startsWith(`${top}/`) ? path.slice(top.length + 1) : null;
}

export interface FileNote {
  /** The file the person picked. */
  file: string;
  /** Formats found in it ('FIT', 'CSV', ...), archive contents included. */
  formats: string[];
  workouts: number;
  errors: { inner: string | null; message: string }[];
  warnings: { inner: string | null; code: string; message: string }[];
}

/** One note per picked file: what was found in it and what went wrong, in plain words. */
export function fileNotes(batches: { name: string; batch: ImportBatch }[], workoutsFound: ImportedWorkout[]): FileNote[] {
  const picked = batches.map((b) => b.name);
  return batches.map(({ name, batch }) => {
    const formats = [...new Set(batch.files.map((f) => f.format).filter((f): f is NonNullable<typeof f> => f !== null && f !== 'zip' && f !== 'gzip'))].map((f) => f.toUpperCase());
    // Several identical warnings (one per file inside a ZIP) are shown once, with the count.
    const seen = new Map<string, number>();
    const warnings: FileNote['warnings'] = [];
    for (const w of batch.warnings) {
      const k = `${w.code}|${w.message}`;
      if (seen.has(k)) continue;
      seen.set(k, 1);
      warnings.push({ inner: innerPath(w.file, name), code: w.code, message: w.message });
    }
    return {
      file: name,
      formats,
      workouts: workoutsFound.filter((w) => topFile(w.fileName, picked) === name).length,
      errors: batch.errors.map((e) => ({ inner: innerPath(e.file, name), message: e.message })),
      warnings,
    };
  });
}

/** Move a workout's start by whole days (for an old FIT file whose clock was never set). */
export function shiftDays(w: ImportedWorkout, days: number): ImportedWorkout {
  if (!days) return w;
  const ms = Date.parse(w.startUtc) + days * 86_400_000;
  return { ...w, startUtc: new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z') };
}

/** A safe, stable piece of a testID for a row key ('Activities.csv#12' -> 'activities-csv-12'). */
export const slug = (key: string) => key.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** True when, with no effort picked, the row's estimate takes its effort from the pace (effort.ts). */
export function paceSetsEffort(r: Pick<ImportCandidate, 'activityId' | 'workout'>): boolean {
  const activity = r.activityId ? ACTIVITY_BY_ID[r.activityId] : undefined;
  return !!activity && speedIntensity(activity, r.workout) !== null;
}
