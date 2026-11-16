/**
 * Daily steps from the phone's health store (Health Connect or Apple Health).
 *
 * Steps are shown on Train and never added to the calorie budget: the
 * activity level the budget is built on already counts everyday walking, and a
 * walk logged as a workout adds its own net calories, so adding steps would
 * count the same walking twice (product principle 2).
 *
 * They are kept only on this phone, with the rest of the sync's memory
 * (state.ts), for the last 35 days; they are not a synced collection, never go
 * to the AI functions and never to friends.
 *
 * The rules, all pure and tested (steps.test.ts):
 *  - One count where apps overlap, and it is the store's own. The phone and a
 *    watch both count the same steps; Health Connect's aggregate and HealthKit's
 *    statistics already keep one count by the store's own source priority, so
 *    the adapters ask the store for a total per day (`readStepDays`) instead of
 *    adding up samples. The number on Train is then the store's own figure for
 *    that day, as the Health app shows it on an iPhone (product principle 2).
 *    An earlier version merged samples itself and counted a walk twice when two
 *    apps recorded it in pieces of different lengths.
 *  - The day is the local calendar day of the phone (`StepClock`), which is
 *    also how both stores cut their days: Health Connect by the phone's zone,
 *    HealthKit from a midnight anchor in the phone's calendar.
 *  - A day with no steps has no entry (not 0): Train leaves it out of the average.
 *  - Each sync re-reads the last three days (apps write steps late) or, after a
 *    long pause, from the day before the last read; older days keep what was read.
 */
import { wallTimeToEpoch } from '@/features/import/time';
import { addDays, toISODate } from '@/lib/dates';
import { formatNumber } from '@/lib/units';
import type { ISODate } from '@/types';

import type { StepDayTotal } from './types';

/** Days of steps kept on the phone, today included: this week and the four before it. */
export const STEP_DAYS = 35;
/** Days before today that every sync reads again, because apps hand their steps over late. */
export const STEP_RECHECK_DAYS = 2;
/** Every time zone's offset is a whole number of quarter hours: midnight is searched for in these steps. */
const QUARTER_MS = 15 * 60_000;

/** Steps per local calendar day; days with none are left out. */
export type StepDays = Record<ISODate, number>;

/** What the phone remembers about steps. */
export interface StepsMemory {
  days: StepDays;
  /** When steps were last read successfully. */
  readAt: string | null;
}

export const NO_STEPS: StepsMemory = { days: {}, readAt: null };

/** Which calendar day an instant is in, and when a day starts. */
export interface StepClock {
  dayOf(ms: number): ISODate;
  /** The first instant of the day (local midnight, or the first hour that exists on a day that skips it). */
  midnightOf(day: ISODate): number;
}

/** The phone's own zone, as the rest of the app counts days (`today()`). */
export const localClock: StepClock = {
  dayOf: (ms) => toISODate(new Date(ms)),
  midnightOf: (day) => {
    const [y, m, d] = day.split('-').map(Number);
    return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
  },
};

/** A named time zone ('Europe/Amsterdam'), for tests. */
export function zoneClock(timeZone: string): StepClock {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const dayOf = (ms: number): ISODate => {
    const parts = f.formatToParts(new Date(ms));
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
    return `${get('year')}-${get('month')}-${get('day')}`;
  };
  return {
    dayOf,
    midnightOf: (day) => {
      const [year, month, d] = day.split('-').map(Number);
      let ms = wallTimeToEpoch({ year, month, day: d, hour: 0, minute: 0, second: 0 }, timeZone, 'steps');
      // Where midnight does not exist (a change at 00:00) the nearest instant can fall on the day before.
      while (dayOf(ms) < day) ms += QUARTER_MS;
      while (dayOf(ms - QUARTER_MS) === day) ms -= QUARTER_MS;
      return ms;
    },
  };
}

/**
 * The store's day totals as kept: whole counts, only real days with steps, a
 * day listed twice added up (each total covers its own part of the range).
 */
export function stepDaysFromTotals(totals: readonly StepDayTotal[]): StepDays {
  const sums: Record<string, number> = {};
  for (const t of totals) {
    if (!t || typeof t.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(t.day)) continue;
    if (typeof t.count !== 'number' || !Number.isFinite(t.count) || t.count <= 0) continue;
    sums[t.day] = (sums[t.day] ?? 0) + t.count;
  }
  const out: StepDays = {};
  for (const day of Object.keys(sums).sort()) {
    const n = Math.round(sums[day]);
    if (n > 0) out[day] = n;
  }
  return out;
}

/** The oldest day kept: today and the 34 days before it. */
export const oldestStepDay = (today: ISODate): ISODate => addDays(today, -(STEP_DAYS - 1));

/**
 * What one sync reads: from the midnight of `fromDay` up to now. The last
 * three days every time, further back after a pause (the day before the last
 * read), the whole 35 days the first time; never before the oldest day kept.
 */
export function stepsReadRange(readAt: string | null, now: number, clock: StepClock): { fromDay: ISODate; from: string; to: string } {
  const today = clock.dayOf(now);
  const oldest = oldestStepDay(today);
  let fromDay = addDays(today, -STEP_RECHECK_DAYS);
  const last = readAt ? Date.parse(readAt) : Number.NaN;
  if (!Number.isFinite(last)) fromDay = oldest;
  else {
    const after = addDays(clock.dayOf(last), -1);
    if (after < fromDay) fromDay = after;
  }
  if (fromDay < oldest) fromDay = oldest;
  return { fromDay, from: new Date(clock.midnightOf(fromDay)).toISOString(), to: new Date(now).toISOString() };
}

/**
 * The days to keep after a read: what was stored before `fromDay`, what was
 * read from `fromDay` on (a re-read day that now has none is dropped), and
 * nothing older than the window.
 */
export function mergeStepDays(stored: StepDays, read: StepDays, fromDay: ISODate, today: ISODate): StepDays {
  const oldest = oldestStepDay(today);
  const out: StepDays = {};
  for (const day of Object.keys(stored).sort()) if (day >= oldest && day < fromDay && stored[day] > 0) out[day] = stored[day];
  for (const day of Object.keys(read).sort()) if (day >= oldest && day >= fromDay && day <= today && read[day] > 0) out[day] = read[day];
  return out;
}

/** Only the days inside the window (for a phone that was not opened for a while). */
export function pruneStepDays(days: StepDays, today: ISODate): StepDays {
  const oldest = oldestStepDay(today);
  const out: StepDays = {};
  for (const [day, n] of Object.entries(days)) if (day >= oldest && day <= today) out[day] = n;
  return out;
}

export interface StepsWeek {
  /** Today's steps, when the week shown holds today and there are any. */
  today: number | null;
  /** The mean of the week's earlier days that have steps (today is not over, so it is left out). */
  average: number | null;
  /** How many days the average is over. */
  averageDays: number;
  /** True when the week shown holds today. */
  thisWeek: boolean;
}

/** Steps for Train's week card; null when the week has none. */
export function stepsWeek(days: StepDays, weekDates: readonly ISODate[], today: ISODate): StepsWeek | null {
  const thisWeek = weekDates.includes(today);
  const own = thisWeek && days[today] > 0 ? days[today] : null;
  const earlier = weekDates.filter((d) => d < today && days[d] > 0).map((d) => days[d]);
  const average = earlier.length ? Math.round(earlier.reduce((a, b) => a + b, 0) / earlier.length) : null;
  if (own === null && average === null) return null;
  return { today: own, average, averageDays: earlier.length, thisWeek };
}

/**
 * "8,432 steps today, 7,950 a day this week", "7,950 steps a day that week".
 * `short` (a phone under 360 px wide, where the long form wraps and leaves
 * "week" alone on a line) leaves out "this week" from the two-part line: it sits
 * in the week's own card. The spoken label always uses the long form.
 */
export function stepsLine(w: StepsWeek, short = false): string {
  const n = (x: number) => formatNumber(x);
  const when = w.thisWeek ? 'this week' : 'that week';
  if (w.today !== null && w.average !== null) return short ? `${n(w.today)} steps today, ${n(w.average)} a day` : `${n(w.today)} steps today, ${n(w.average)} a day ${when}`;
  if (w.today !== null) return `${n(w.today)} ${w.today === 1 ? 'step' : 'steps'} today`;
  return `${n(w.average as number)} steps a day ${when}`;
}

// ---------------------------------------------------------------- steps from the Health app's export file

/**
 * Steps read from the Health app's export file (exportFile.ts adds them up),
 * kept beside the synced ones in this phone's memory. A file is a snapshot:
 * Train says where they are from and as of when.
 */
export interface FileSteps {
  days: StepDays;
  /** When the export was made (its ExportDate), ISO instant. */
  asOf: string;
  /** The phone's calendar day of `asOf`: that day was cut off by the export, so it is not a full day unless it is today. */
  asOfDay: ISODate;
}

/**
 * A file's days, merged with what an earlier import left.
 *
 * A file made at the same time as the one kept or later replaces the days it
 * covers (`fromDay` to `asOfDay`; a covered day with no steps is dropped), and
 * the kept file's days outside that stay until they leave the 35-day window,
 * except the kept file's own cut-off day, which was never a whole day.
 *
 * A file made before the one kept (an older export picked after a newer one)
 * replaces nothing: the newer file has every sample the older one had, and
 * more for the days the older one ended on or that a watch handed over late.
 * It only fills days the kept file has no steps for, never with its own cut-off
 * day, and the kept file stays the one Train names ("as of").
 */
export function mergeFileSteps(before: FileSteps | null, read: FileSteps & { fromDay: ISODate }, today: ISODate): FileSteps {
  const oldest = oldestStepDay(today);
  const inWindow = (day: ISODate, n: number) => day >= oldest && day <= today && n > 0;
  const days: StepDays = {};
  const newer = !before || read.asOf >= before.asOf;
  if (newer) {
    if (before) {
      for (const [day, n] of Object.entries(before.days)) {
        if (!inWindow(day, n) || (day >= read.fromDay && day <= read.asOfDay)) continue;
        if (day === before.asOfDay && day < today) continue;
        days[day] = n;
      }
    }
    for (const [day, n] of Object.entries(read.days)) if (inWindow(day, n)) days[day] = n;
  } else {
    for (const [day, n] of Object.entries(before.days)) if (inWindow(day, n)) days[day] = n;
    for (const [day, n] of Object.entries(read.days)) if (inWindow(day, n) && !(day in days) && day !== read.asOfDay) days[day] = n;
  }
  const sorted: StepDays = {};
  for (const day of Object.keys(days).sort()) sorted[day] = days[day];
  return newer ? { days: sorted, asOf: read.asOf, asOfDay: read.asOfDay } : { days: sorted, asOf: before.asOf, asOfDay: before.asOfDay };
}

export interface ShownSteps {
  days: StepDays;
  /** The days whose figure came from the export file. */
  fromFile: ISODate[];
  /** When that file was made, when any day shown came from it. */
  asOf: string | null;
}

/**
 * What Train shows: the synced days (when automatic sync is on) and the file's,
 * where a synced day wins over the file's for the same day (it is live, the
 * file is a snapshot). The file's own last day, cut off by the export, is left
 * out once it is no longer today.
 */
export function shownSteps(synced: StepDays | null, file: FileSteps | null, today: ISODate): ShownSteps {
  const oldest = oldestStepDay(today);
  const days: StepDays = {};
  const fromFile: ISODate[] = [];
  if (file) {
    for (const [day, n] of Object.entries(file.days)) {
      if (day < oldest || day > today || n <= 0) continue;
      if (day === file.asOfDay && day < today) continue;
      days[day] = n;
      fromFile.push(day);
    }
  }
  if (synced) {
    for (const [day, n] of Object.entries(synced)) {
      if (day < oldest || day > today || n <= 0) continue;
      days[day] = n;
      const i = fromFile.indexOf(day);
      if (i >= 0) fromFile.splice(i, 1);
    }
  }
  fromFile.sort();
  return { days, fromFile, asOf: fromFile.length && file ? file.asOf : null };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "From your Health export, Nov 16" (the export's day, in the phone's calendar). */
export function fileStepsNote(asOfDay: ISODate): string {
  const [, m, d] = asOfDay.split('-').map(Number);
  return `From your Health export, ${MONTHS[m - 1]} ${d}`;
}
