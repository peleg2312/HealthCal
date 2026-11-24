/**
 * The one personal line at the top of the morning page: something true of this person today,
 * from their own data only. Pure and unit-tested (personal.test.ts).
 *
 * The first rule that holds wins (spec 2.2); with nothing notable the line is left out (null).
 * Never weight, never calories, never praise words, and never "in a row" about the logging
 * streak: the app's streak forgives a missed day (computeConsistency), so it is not a run.
 * Records are strictly greater than every day before them (a tie is not a record) and need
 * enough history to mean something.
 */
import { SLEEP_RANGE } from '@/features/trackers/helpers';
import { addDays, diffDays } from '@/lib/dates';
import { formatNumber } from '@/lib/units';
import type { ISODate } from '@/types';

import type { DayFacts } from './facts';
import { goalMet } from './line';

export interface PersonalInput {
  today: ISODate;
  /** The local day of profile.onboardedAt (toISODate(new Date(onboardedAt))), or null. */
  onboardedDay: ISODate | null;
  /** useConsistency(today).streak: the forgiving logging streak. */
  streak: number;
  /** useDays(28, yesterday).map((d) => dayFacts(d)), oldest first; the last one is yesterday. */
  days: DayFacts[];
  /** Hours of sleep by the night's date (the wake day), from useLive('sleep'). */
  sleepHours: Record<ISODate, number>;
}

/** Streak lengths the line marks (and every multiple of 100). */
export const STREAK_MILESTONES: readonly number[] = [7, 14, 21, 30, 50, 75, 365];
/** Days before yesterday a record is measured against. */
export const RECORD_WINDOW = 13;
/** P4 needs at least this many of those days with food. */
export const RECORD_MIN_FOOD_DAYS = 7;
/** P5 needs at least this many sessions in those days. */
export const RECORD_MIN_SESSIONS = 4;
/** A run (nights, water) is named from this length. */
export const MIN_RUN = 3;

const ORDINALS: Record<number, string> = { 3: 'third', 4: 'fourth', 5: 'fifth', 6: 'sixth', 7: 'seventh', 8: 'eighth', 9: 'ninth', 10: 'tenth' };

export function isStreakMilestone(streak: number): boolean {
  return streak > 0 && (STREAK_MILESTONES.includes(streak) || streak % 100 === 0);
}

/** Nights of 7 h or more in a row, counted from the night dated `today` backwards. */
export function goodNightsInARow(sleepHours: Record<ISODate, number>, today: ISODate): number {
  let r = 0;
  for (let d = today; (sleepHours[d] ?? 0) >= SLEEP_RANGE[0]; d = addDays(d, -1)) r += 1;
  return r;
}

function nightsBody(r: number): string {
  const phrase = r <= 10 ? `a ${ORDINALS[r]} night` : `${r} nights`;
  return `${phrase} in a row with ${SLEEP_RANGE[0]} hours or more of sleep`;
}

/** The days strictly before yesterday within the record window, oldest first. */
function windowBefore(days: DayFacts[], yesterday: ISODate): DayFacts[] {
  const from = addDays(yesterday, -RECORD_WINDOW);
  return days.filter((d) => d.date >= from && d.date < yesterday);
}

function proteinRecord(y: DayFacts, before: DayFacts[]): boolean {
  if (!y.complete || y.overBand || !goalMet(y.protein, y.proteinG)) return false;
  if (before.filter((d) => d.foodLogged).length < RECORD_MIN_FOOD_DAYS) return false;
  return before.every((d) => y.protein > d.protein);
}

function longestSession(y: DayFacts, before: DayFacts[]): { name: string; durationMin: number } | null {
  if (y.activities.length === 0) return null;
  const longest = y.activities.reduce((a, b) => (b.durationMin > a.durationMin ? b : a));
  const earlier = before.flatMap((d) => d.activities);
  if (earlier.length < RECORD_MIN_SESSIONS) return null;
  return earlier.every((a) => longest.durationMin > a.durationMin) ? longest : null;
}

/** Days in a row ending yesterday with the water goal reached, within the days given. */
function waterRun(days: DayFacts[], yesterday: ISODate): number {
  const byDate = new Map(days.map((d) => [d.date, d]));
  let r = 0;
  for (let d = yesterday; ; d = addDays(d, -1)) {
    const f = byDate.get(d);
    // Only a day with water logged as water counts (`hasWater`): drinks from the diary alone are not a water day.
    if (!f || !f.hasWater || !goalMet(f.waterMl, f.waterGoalMl)) return r;
    r += 1;
  }
}

/** The body of the line (lower case or a digit first), or null when nothing holds. */
export function personalBody(i: PersonalInput): string | null {
  const yesterday = addDays(i.today, -1);
  const y = i.days.find((d) => d.date === yesterday);
  const foodYesterday = !!y?.foodLogged;

  // P1: the first week, from day 2 (day 1 is the setup day, which the page never opens on by itself).
  if (i.onboardedDay) {
    const n = diffDays(i.onboardedDay, i.today) + 1;
    if (n >= 2 && n <= 7) return `day ${n} of your first week`;
  }

  // P2: a streak milestone, on the day it is reached.
  if (foodYesterday && isStreakMilestone(i.streak)) return `your logging streak reaches ${formatNumber(i.streak)} days`;

  // P3: good nights in a row.
  const nights = goodNightsInARow(i.sleepHours, i.today);
  if (nights >= MIN_RUN) return nightsBody(nights);

  if (y) {
    const before = windowBefore(i.days, yesterday);
    // P4: the most protein in two weeks.
    if (proteinRecord(y, before)) return `your most protein in two weeks: ${formatNumber(Math.round(y.protein))} g yesterday`;
    // P5: the longest session in two weeks.
    const longest = longestSession(y, before);
    if (longest) return `your longest session in two weeks: ${longest.name.trim()}, ${formatNumber(Math.round(longest.durationMin))} min`;
  }

  // P6: the water goal reached days in a row.
  const water = waterRun(i.days, yesterday);
  if (water >= MIN_RUN) return `water goal reached ${water} days in a row`;

  // P7: no food yesterday, and the forgiving streak is still on.
  if (!foodYesterday && i.streak >= MIN_RUN) return `your ${formatNumber(i.streak)}-day logging streak is still on; one day without a log does not end it`;

  // P8: the streak.
  if (foodYesterday && i.streak >= MIN_RUN) return `${formatNumber(i.streak)} days in your logging streak`;

  return null;
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * The personal line, or null. `name` is the name the header's title had to leave out (pass
 * null when the title shows it or none is set): "Gilad, 12 days in your logging streak."
 */
export function personalLine(i: PersonalInput, name: string | null): string | null {
  const body = personalBody(i);
  if (body === null) return null;
  const who = name?.trim();
  return who ? `${who}, ${body}.` : `${capitalise(body)}.`;
}
