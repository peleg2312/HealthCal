/**
 * The day's calories burned as the watch (through the phone's health store)
 * counts them: Health Connect's day totals of total and active calories;
 * HealthKit's active plus basal energy. Shown on Progress beside HealthCal's own
 * figure as the watch's estimate, and nothing else.
 *
 * It is never added to the budget and never informs any estimate (the energy
 * model, the morning page, the AI functions, friends, the export): the watch's
 * total holds the workouts the budget already counts, so using it would count
 * them twice, and the learned estimate, from real weigh-ins, is the better
 * correction. Kept only on this phone, like steps (state.ts), for 14 days.
 *
 * The rules, all pure and tested (dayEnergy.test.ts):
 *  - A day counts only when something was recorded (active above 0: a store may
 *    fill a total with a resting estimate where nothing was written, but never
 *    invents active energy), resting energy was there too (total above active),
 *    and the total is between the person's resting rate and four times it.
 *  - The estimate is the mean of the valid days among the 7 complete days
 *    before today (today is never used), and only with at least 5 of them.
 *  - HealthCal's side for the same days is the non-exercise maintenance the
 *    targets use plus the mean of the same days' workout net calories, since
 *    the watch's total holds the workouts too.
 */
import { addDays } from '@/lib/dates';
import type { ActivityEntry, ISODate } from '@/types';

import { isAppleOrigin, originName } from './origins';
import type { StepClock } from './steps';
import { HealthError, storeName, type DayEnergyDay, type HealthAccess, type HealthErrorCode, type HealthStore, type StepsRange } from './types';

export type { DayEnergyDay } from './types';

/** Days kept on the phone, today included. */
export const DAY_ENERGY_DAYS = 14;
/** Days before today that every read covers again (so three in all). */
export const DAY_ENERGY_RECHECK_DAYS = 2;
/** Complete days before today the estimate looks at. */
export const WATCH_WINDOW_DAYS = 7;
/** Valid days needed before anything is shown. */
export const MIN_ENERGY_DAYS = 5;
/** Health Connect's own origin: where it filled resting time itself, it names no app. */
const HEALTH_CONNECT_ORIGIN = 'com.google.android.apps.healthdata';

/** One kept day. */
export interface EnergyDayValue {
  kcal: number;
  activeKcal: number;
  origins: string[];
}

export type EnergyDays = Record<ISODate, EnergyDayValue>;

/** What the phone remembers about the day's calories burned. */
export interface DayEnergyMemory {
  days: EnergyDays;
  /** When it was last read successfully. */
  readAt: string | null;
}

export const NO_DAY_ENERGY: DayEnergyMemory = { days: {}, readAt: null };

const isDay = (x: unknown): x is ISODate => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x);
const nonNeg = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x >= 0;

/** The oldest day kept: today and the 13 before it. */
export const oldestEnergyDay = (today: ISODate): ISODate => addDays(today, -(DAY_ENERGY_DAYS - 1));

/**
 * What one read covers, as the steps read does: the last three days every
 * time, from the day before the last read after a pause, 14 days the first time.
 */
export function dayEnergyReadRange(readAt: string | null, now: number, clock: StepClock): StepsRange {
  const today = clock.dayOf(now);
  const oldest = oldestEnergyDay(today);
  let fromDay = addDays(today, -DAY_ENERGY_RECHECK_DAYS);
  const last = readAt ? Date.parse(readAt) : Number.NaN;
  if (!Number.isFinite(last)) fromDay = oldest;
  else {
    const after = addDays(clock.dayOf(last), -1);
    if (after < fromDay) fromDay = after;
  }
  if (fromDay < oldest) fromDay = oldest;
  return { from: new Date(clock.midnightOf(fromDay)).toISOString(), to: new Date(now).toISOString(), fromDay, toDay: today };
}

/** The store's days as kept: real days with something in them, a day listed twice added up, origins joined. */
export function energyDaysFrom(read: readonly DayEnergyDay[]): EnergyDays {
  const out: EnergyDays = {};
  for (const d of read) {
    if (!d || !isDay(d.day) || !nonNeg(d.kcal) || !nonNeg(d.activeKcal)) continue;
    if (d.kcal <= 0 && d.activeKcal <= 0) continue;
    const held = out[d.day];
    const origins = Array.isArray(d.origins) ? d.origins.filter((o): o is string => typeof o === 'string' && o.length > 0) : [];
    out[d.day] = held
      ? { kcal: held.kcal + d.kcal, activeKcal: held.activeKcal + d.activeKcal, origins: [...new Set([...held.origins, ...origins])].sort() }
      : { kcal: d.kcal, activeKcal: d.activeKcal, origins: [...new Set(origins)].sort() };
  }
  for (const v of Object.values(out)) {
    v.kcal = Math.round(v.kcal);
    v.activeKcal = Math.round(v.activeKcal);
  }
  return out;
}

/**
 * The days to keep after a read: what was kept before `fromDay`, what was read
 * from `fromDay` to today (a re-read day that now has nothing is dropped), and
 * nothing older than the window.
 */
export function mergeDayEnergy(before: EnergyDays, read: readonly DayEnergyDay[], fromDay: ISODate, today: ISODate): EnergyDays {
  const oldest = oldestEnergyDay(today);
  const got = energyDaysFrom(read);
  const out: EnergyDays = {};
  for (const day of Object.keys(before).sort()) if (day >= oldest && day < fromDay) out[day] = before[day];
  for (const day of Object.keys(got).sort()) if (day >= oldest && day >= fromDay && day <= today) out[day] = got[day];
  return out;
}

/** Only the days inside the window (for a phone that was not opened for a while, or a read that failed). */
export function pruneDayEnergy(days: EnergyDays, today: ISODate): EnergyDays {
  const oldest = oldestEnergyDay(today);
  const out: EnergyDays = {};
  for (const [day, v] of Object.entries(days)) if (day >= oldest && day <= today) out[day] = v;
  return out;
}

/** A day the watch recorded whole (see the file comment). `bmrKcal`: bmr(profile).kcal. */
export function validEnergyDay(d: Pick<EnergyDayValue, 'kcal' | 'activeKcal'>, bmrKcal: number): boolean {
  if (!d || !nonNeg(d.kcal) || !nonNeg(d.activeKcal) || !(bmrKcal > 0)) return false;
  return d.activeKcal > 0 && d.kcal > d.activeKcal && d.kcal >= bmrKcal && d.kcal <= 4 * bmrKcal;
}

/** The watch's estimate, as Progress shows it. */
export interface WatchEstimate {
  /** Mean calories burned a day over the valid days, rounded to 10. */
  avg: number;
  /** How many days it is over. */
  n: number;
  /** "Garmin Connect" when one app recorded every valid day (Apple's own devices aside when another app did), else the store's name. */
  label: string;
  /** HealthCal's figure for the same days: maintenance plus the mean workout net calories, rounded to 10. */
  app: number;
}

const to10 = (x: number) => Math.round(x / 10) * 10;

/**
 * Null until at least 5 of the 7 complete days before today are valid.
 * `exerciseNetByDate`: what HealthCal counts the workouts of each day as
 * burning above resting (`exerciseNetByDate`); `maintenanceKcal`: the
 * non-exercise figure the targets use (`maintenanceKcal`).
 */
export function watchEstimate(
  days: EnergyDays,
  today: ISODate,
  exerciseNetByDate: Readonly<Record<ISODate, number>>,
  maintenanceKcal: number,
  bmrKcal: number,
  store: HealthStore | null,
): WatchEstimate | null {
  if (!Number.isFinite(maintenanceKcal)) return null;
  const valid: ISODate[] = [];
  for (let i = WATCH_WINDOW_DAYS; i >= 1; i--) {
    const day = addDays(today, -i);
    const d = days[day];
    if (d && validEnergyDay(d, bmrKcal)) valid.push(day);
  }
  if (valid.length < MIN_ENERGY_DAYS) return null;
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const avg = to10(mean(valid.map((d) => days[d].kcal)));
  const exercise = mean(valid.map((d) => (Number.isFinite(exerciseNetByDate[d]) ? exerciseNetByDate[d] : 0)));
  const origins = new Set<string>();
  for (const d of valid) for (const o of days[d].origins) if (o !== HEALTH_CONNECT_ORIGIN) origins.add(o);
  // An iPhone writes its own active energy beside a watch app's (and its sources
  // carry no device kind, so every Apple device reads 'Apple Health'): when
  // another app recorded too, Apple's own devices are left out of the name.
  const apps = [...origins].filter((o) => !isAppleOrigin(o));
  const names = new Set((apps.length > 0 ? apps : [...origins]).map((o) => originName(o)));
  const label = names.size === 1 ? [...names][0] : storeName(store);
  return { avg, n: valid.length, label, app: to10(maintenanceKcal + exercise) };
}

/** The live workouts' net calories per date: what HealthCal counts each day's workouts as burning above resting. */
export function exerciseNetByDate(activities: readonly Pick<ActivityEntry, 'date' | 'kcalNet' | 'deleted'>[]): Record<ISODate, number> {
  const out: Record<ISODate, number> = {};
  for (const a of activities) {
    if (a.deleted || !isDay(a.date) || !nonNeg(a.kcalNet)) continue;
    out[a.date] = (out[a.date] ?? 0) + a.kcalNet;
  }
  return out;
}

/** The non-exercise maintenance the targets use: the learned estimate when it is on and reliable, else the formula. */
export function maintenanceKcal(model: { usingAdaptive: boolean; adaptive: { tdee: number }; formulaTdee: number }): number {
  return model.usingAdaptive ? model.adaptive.tdee : model.formulaTdee;
}

/** What the engine asks of the adapter (HealthAdapter.readDayEnergy). */
export interface DayEnergyReader {
  readDayEnergy(range: StepsRange, access: HealthAccess): Promise<DayEnergyDay[]>;
}

export type DayEnergyRead = { ok: true; days: DayEnergyDay[] } | { ok: false; code: HealthErrorCode; detail: string };

/** A read that fails or is refused is an answer, never a thrown error that would end the sync. */
export async function readDayEnergySafely(adapter: DayEnergyReader, range: StepsRange, access: HealthAccess): Promise<DayEnergyRead> {
  if (!access.dayEnergy) return { ok: true, days: [] };
  try {
    const days = await adapter.readDayEnergy(range, access);
    return { ok: true, days: Array.isArray(days) ? days : [] };
  } catch (e) {
    if (e instanceof HealthError) return { ok: false, code: e.code, detail: e.message };
    return { ok: false, code: 'failed', detail: e instanceof Error ? e.message : String(e) };
  }
}
