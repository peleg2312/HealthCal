/**
 * Pure helpers for the Consistency screen: longest streak, the month calendar
 * and weekly rhythm targets. No React, no storage.
 *
 * Streak rule (the same as computeConsistency in the store): a single missed
 * day is bridged, every time; only two missed days in a row end a streak.
 */
import { addDays, diffDays, startOfWeek } from '@/lib/dates';
import { inBudgetBand } from '@/lib/insights';
import type { ISODate } from '@/types';

// ------------------------------------------------------------------ streaks

export interface StreakRun {
  /** Logged days in the run (bridged days are not counted). */
  length: number;
  start: ISODate | null;
  end: ISODate | null;
}

/** Longest run of logged days, bridging single missed days. */
export function longestStreak(dates: Iterable<ISODate>): StreakRun {
  const sorted = [...new Set(dates)].sort();
  let best: StreakRun = { length: 0, start: null, end: null };
  let start = 0;
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && diffDays(sorted[i - 1], sorted[i]) > 2) start = i;
    const length = i - start + 1;
    if (length > best.length) best = { length, start: sorted[start], end: sorted[i] };
  }
  return best;
}

// ----------------------------------------------------------------- calendar

/** What the calendar needs to know about one day. */
export interface CalendarDayInput {
  date: ISODate;
  /** Food logged that day. */
  logged: boolean;
  /** Fully logged, by the shared `isCompleteDay` rule (decided by the caller). */
  complete: boolean;
  kcal: number;
  budget: number;
  waterMet: boolean;
  trained: boolean;
}

export interface CalendarCell {
  date: ISODate;
  day: number;
  future: boolean;
  isToday: boolean;
  logged: boolean;
  /** Eaten / that day's own budget (0 when not logged): how full its cup is. */
  ratio: number;
  /** kcal eaten and that day's budget (0 when not logged), for the day's words. */
  kcal: number;
  budget: number;
  /** Logged, closed and not fully logged: the lighter fill. */
  partial: boolean;
  /** Fully logged and within 10% of that day's budget: the check. */
  onBudget: boolean;
  waterMet: boolean;
  trained: boolean;
  /** The pill continues from the cell to the left (same week row). */
  joinPrev: boolean;
  /** The pill continues into the cell to the right (same week row). */
  joinNext: boolean;
}

/** `YYYY-MM` of a day key. */
export const monthOf = (date: ISODate) => date.slice(0, 7);

/** First day of the month `delta` months from `month` (YYYY-MM). */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const t = y * 12 + (m - 1) + delta;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}

export function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/**
 * Monday-first weeks of a month. Cells outside the month are null. Consecutive
 * logged days in the same row join into one pill.
 */
export function monthGrid(month: string, byDate: ReadonlyMap<ISODate, CalendarDayInput>, today: ISODate): (CalendarCell | null)[][] {
  const first = `${month}-01` as ISODate;
  const count = daysInMonth(month);
  const lead = diffDays(startOfWeek(first), first);
  const cells: (CalendarCell | null)[] = Array.from({ length: lead }, () => null);
  for (let i = 0; i < count; i++) {
    const date = addDays(first, i);
    const d = byDate.get(date);
    const future = date > today;
    const logged = !future && !!d?.logged;
    cells.push({
      date,
      day: i + 1,
      future,
      isToday: date === today,
      logged,
      ratio: logged && d && d.budget > 0 ? d.kcal / d.budget : 0,
      kcal: logged && d ? d.kcal : 0,
      budget: logged && d ? d.budget : 0,
      partial: logged && !!d && !d.complete && date !== today,
      onBudget: logged && !!d && d.complete && inBudgetBand(d.kcal, d.budget),
      waterMet: !future && !!d?.waterMet,
      trained: !future && !!d?.trained,
      joinPrev: false,
      joinNext: false,
    });
  }
  while (cells.length % 7) cells.push(null);
  const rows: (CalendarCell | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  for (const row of rows) {
    for (let i = 0; i < 7; i++) {
      const c = row[i];
      if (!c?.logged) continue;
      c.joinPrev = !!row[i - 1]?.logged;
      c.joinNext = !!row[i + 1]?.logged;
    }
  }
  return rows;
}

/** Days logged so far in the month and the days that could have been (up to today). */
export function monthTally(month: string, logged: ReadonlySet<ISODate>, today: ISODate): { logged: number; elapsed: number } {
  const count = daysInMonth(month);
  let n = 0;
  let elapsed = 0;
  for (let i = 0; i < count; i++) {
    const date = addDays(`${month}-01`, i);
    if (date > today) break;
    elapsed += 1;
    if (logged.has(date)) n += 1;
  }
  return { logged: n, elapsed };
}

// ------------------------------------------------------------------- rhythm

export type RhythmKind = 'food' | 'train' | 'weigh';
export type RhythmTargets = Record<RhythmKind, number>;

export const DEFAULT_RHYTHM: RhythmTargets = { food: 5, train: 3, weigh: 2 };
export const RHYTHM_KINDS: RhythmKind[] = ['food', 'train', 'weigh'];

/** Clamp a stored value to 1..7 days, falling back to the default. */
export function cleanTargets(raw: Partial<Record<RhythmKind, unknown>> | null | undefined): RhythmTargets {
  const out = { ...DEFAULT_RHYTHM };
  for (const k of RHYTHM_KINDS) {
    const v = raw?.[k];
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = Math.min(7, Math.max(1, Math.round(v)));
  }
  return out;
}

export interface RhythmWeek {
  weekStart: ISODate;
  /** Days with the habit in that week. */
  count: number;
  /** The current week, still in progress. */
  partial: boolean;
  met: boolean;
}

/** The last `weeks` Monday-based weeks, oldest first, ending with the current one. */
export function rhythmWeeks(dates: ReadonlySet<ISODate>, target: number, today: ISODate, weeks = 8): RhythmWeek[] {
  const current = startOfWeek(today);
  return Array.from({ length: weeks }, (_, i) => {
    const weekStart = addDays(current, (i - (weeks - 1)) * 7);
    let count = 0;
    for (let d = 0; d < 7; d++) {
      const date = addDays(weekStart, d);
      if (date <= today && dates.has(date)) count += 1;
    }
    return { weekStart, count, partial: weekStart === current, met: count >= target };
  });
}

/**
 * Weeks on rhythm in total (not in a row): every week since `first` where all
 * three targets were met. The current week counts once it has met them, since
 * that cannot be undone. `closed` is the number of finished weeks looked at.
 */
export function weeksOnRhythm(
  sets: Record<RhythmKind, ReadonlySet<ISODate>>,
  targets: RhythmTargets,
  first: ISODate | null,
  today: ISODate,
): { total: number; closed: number } {
  if (!first || first > today) return { total: 0, closed: 0 };
  const current = startOfWeek(today);
  let total = 0;
  let closed = 0;
  for (let w = startOfWeek(first); w <= current; w = addDays(w, 7)) {
    const isCurrent = w === current;
    if (!isCurrent) closed += 1;
    const met = RHYTHM_KINDS.every((k) => {
      let n = 0;
      for (let d = 0; d < 7; d++) {
        const date = addDays(w, d);
        if (date <= today && sets[k].has(date)) n += 1;
      }
      return n >= targets[k];
    });
    if (met) total += 1;
  }
  return { total, closed };
}
