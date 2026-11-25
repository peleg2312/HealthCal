/**
 * A month or a year "in cups": the pure rules behind /recap/month and /recap/year and their share card.
 * No React, no storage, no clock (today is passed in).
 *
 * The data is the art: every day is one small cup, filled to how much of that day's own budget was eaten,
 * by the same rules as the weekly check-in's cups and the Consistency calendar (`budgetMark`, the shared
 * `isCompleteDay` decided by the caller, `hasFoodLogged` for "logged"): a lighter fill is a day only partly
 * logged, a hatched cup today, amber at the top a day above its budget, a check (month only) a fully logged
 * day on budget. Days before the first record on the phone have no cup at all: the person did not have the
 * app then, so they are never "not logged". A year shows only the months that have begun.
 */
import { addDays, diffDays, startOfWeek } from '@/lib/dates';
import { budgetMark } from '@/lib/insights';
import { daysInMonth, shiftMonth } from '@/features/progress/consistency';
import type { BudgetDayCounts } from '@/features/progress/recapDays';
import type { ISODate } from '@/types';

export type PeriodKind = 'month' | 'year';

export interface Period {
  kind: PeriodKind;
  /** 'YYYY-MM' for a month, 'YYYY' for a year. */
  key: string;
  start: ISODate;
  end: ISODate;
}

const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

const first = (raw: unknown): unknown => (Array.isArray(raw) ? raw[0] : raw);

/** A month key from a search param ('2026-10'), or null when it is not one. */
export function parseMonthKey(raw: unknown): string | null {
  const s = first(raw);
  if (typeof s !== 'string') return null;
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  return y >= MIN_YEAR && y <= MAX_YEAR ? s : null;
}

/** A year key from a search param ('2026'), or null when it is not one. */
export function parseYearKey(raw: unknown): string | null {
  const s = first(raw);
  if (typeof s !== 'string' || !/^\d{4}$/.test(s)) return null;
  const y = Number(s);
  return y >= MIN_YEAR && y <= MAX_YEAR ? s : null;
}

export const monthKeyOf = (date: ISODate): string => date.slice(0, 7);
export const yearKeyOf = (date: ISODate): string => date.slice(0, 4);

export function monthPeriod(key: string): Period {
  return { kind: 'month', key, start: `${key}-01`, end: `${key}-${String(daysInMonth(key)).padStart(2, '0')}` };
}

export function yearPeriod(key: string): Period {
  return { kind: 'year', key, start: `${key}-01-01`, end: `${key}-12-31` };
}

/** The period still holds today. */
export const inProgress = (p: Period, today: ISODate): boolean => p.start <= today && today <= p.end;

/**
 * The month a recap opens on without one asked for: the last month that has ended, or this month (so far)
 * when the phone holds nothing from before it.
 */
export function defaultMonth(today: ISODate, firstDate: ISODate | null): string {
  const last = shiftMonth(monthKeyOf(today), -1);
  if (!firstDate || monthPeriod(last).end < firstDate) return monthKeyOf(today);
  return last;
}

/** In the first week of January the year just ended, when the phone holds anything from it; else this year. */
export function defaultYear(today: ISODate, firstDate: ISODate | null): string {
  const year = yearKeyOf(today);
  const last = String(Number(year) - 1);
  if (today.slice(5) <= '01-07' && firstDate && firstDate <= yearPeriod(last).end) return last;
  return year;
}

/** Every month from the first record's to today's, newest first (at most `max`). */
export function monthsSince(firstDate: ISODate | null, today: ISODate, max = 24): string[] {
  if (!firstDate || firstDate > today) return [monthKeyOf(today)];
  const out: string[] = [];
  for (let m = monthKeyOf(today); m >= monthKeyOf(firstDate) && out.length < max; m = shiftMonth(m, -1)) out.push(m);
  return out;
}

/** Every year from the first record's to today's, newest first. */
export function yearsSince(firstDate: ISODate | null, today: ISODate): string[] {
  const to = Number(yearKeyOf(today));
  const from = firstDate && firstDate <= today ? Number(yearKeyOf(firstDate)) : to;
  return Array.from({ length: to - from + 1 }, (_, i) => String(to - i));
}

// ------------------------------------------------------------------ cups

/** One day as the cups need it (the share card's `ShareDay` has the same shape). */
export interface DayFacts {
  date: ISODate;
  /** Food logged that day (`hasFoodLogged`: drinks from Water alone are not). */
  logged: boolean;
  /** Fully logged, by the shared `isCompleteDay` (decided by the caller; never today). */
  complete: boolean;
  kcal: number;
  /** The day's own budget. */
  budget: number;
}

export interface CupCell {
  date: ISODate;
  /** Day of the month. */
  day: number;
  /** Eaten / that day's own budget (0 when not logged); above 1 the cup is full with an amber cap. */
  ratio: number;
  logged: boolean;
  complete: boolean;
  /** Logged, closed and not fully logged: the lighter fill. */
  partial: boolean;
  /** Fully logged at 90 to 100% of its own budget (`budgetMark`): the check. Never on a day above it. */
  onBudget: boolean;
  /** Logged and above its own budget: the amber cap. */
  over: boolean;
  isToday: boolean;
  /** Still to come: a dashed outline. */
  future: boolean;
}

export function cupCell(date: ISODate, d: DayFacts | undefined, today: ISODate): CupCell {
  const future = date > today;
  const logged = !future && !!d?.logged;
  const budget = d?.budget ?? 0;
  const kcal = logged && d ? Math.max(0, d.kcal) : 0;
  const complete = logged && !!d?.complete;
  const mark = logged ? budgetMark(kcal, budget) : null;
  return {
    date,
    day: Number(date.slice(8)),
    ratio: logged && budget > 0 ? kcal / budget : 0,
    logged,
    complete,
    partial: logged && !complete && date !== today,
    onBudget: complete && mark === 'on',
    over: mark === 'above',
    isToday: date === today,
    future,
  };
}

export interface CupRow {
  key: string;
  /** What the row is, for its label at the left of a year's rows ('Jan'); empty for a month's weeks. */
  label: string;
  cells: (CupCell | null)[];
}

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A month as Monday-first weeks of seven, as the calendar lays it out. No cup before the first record. */
export function monthRows(p: Period, byDate: ReadonlyMap<ISODate, DayFacts>, today: ISODate, firstDate: ISODate | null): CupRow[] {
  const lead = diffDays(startOfWeek(p.start), p.start);
  const count = diffDays(p.start, p.end) + 1;
  const cells: (CupCell | null)[] = Array.from({ length: lead }, () => null);
  for (let i = 0; i < count; i++) {
    const date = addDays(p.start, i);
    cells.push(firstDate && date >= firstDate ? cupCell(date, byDate.get(date), today) : null);
  }
  while (cells.length % 7) cells.push(null);
  const rows: CupRow[] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push({ key: `w${i / 7}`, label: '', cells: cells.slice(i, i + 7) });
  return rows;
}

/** The longest month, so the days of every month line up in columns. */
export const YEAR_SLOTS = 31;

/**
 * A year as one row per month that has begun, 31 slots each, from the first record's month (or January) to
 * today's (or December). A slot holds no cup past the month's end, before the first record or after today:
 * the year's picture ends where the year has got to.
 */
export function yearRows(p: Period, byDate: ReadonlyMap<ISODate, DayFacts>, today: ISODate, firstDate: ISODate | null): CupRow[] {
  if (!firstDate || firstDate > p.end || p.start > today) return [];
  const from = firstDate > p.start ? monthKeyOf(firstDate) : `${p.key}-01`;
  const to = today < p.end ? monthKeyOf(today) : `${p.key}-12`;
  const rows: CupRow[] = [];
  for (let m = from; m <= to; m = shiftMonth(m, 1)) {
    const dim = daysInMonth(m);
    const cells = Array.from({ length: YEAR_SLOTS }, (_, i) => {
      if (i >= dim) return null;
      const date = `${m}-${String(i + 1).padStart(2, '0')}`;
      if (date < firstDate || date > today) return null;
      return cupCell(date, byDate.get(date), today);
    });
    rows.push({ key: m, label: MONTH_SHORT[Number(m.slice(5)) - 1], cells });
  }
  return rows;
}

export function periodRows(p: Period, byDate: ReadonlyMap<ISODate, DayFacts>, today: ISODate, firstDate: ISODate | null): CupRow[] {
  return p.kind === 'month' ? monthRows(p, byDate, today, firstDate) : yearRows(p, byDate, today, firstDate);
}

// ----------------------------------------------------------------- tally

export interface PeriodTally {
  /** The first and last day counted: from the period's start or the first record, to its end or today. */
  from: ISODate | null;
  to: ISODate | null;
  /** Days from `from` to `to`. */
  elapsed: number;
  /** Of them, days with food logged. */
  logged: number;
  /** Fully logged days and how they stand, by `budgetMark` (the recap's and Progress's headline counts). */
  counts: BudgetDayCounts;
  /** Logged, closed and not fully logged. */
  partial: number;
}

/** The span a period's figures cover: never before the first record, never after today. */
export function countedSpan(p: Period, today: ISODate, firstDate: ISODate | null): { from: ISODate; to: ISODate } | null {
  if (!firstDate) return null;
  const from = firstDate > p.start ? firstDate : p.start;
  const to = today < p.end ? today : p.end;
  return from <= to ? { from, to } : null;
}

export function periodTally(p: Period, byDate: ReadonlyMap<ISODate, DayFacts>, today: ISODate, firstDate: ISODate | null): PeriodTally {
  const span = countedSpan(p, today, firstDate);
  const counts: BudgetDayCounts = { full: 0, on: 0, above: 0 };
  if (!span) return { from: null, to: null, elapsed: 0, logged: 0, counts, partial: 0 };
  let logged = 0;
  let partial = 0;
  const elapsed = diffDays(span.from, span.to) + 1;
  for (let i = 0; i < elapsed; i++) {
    const c = cupCell(addDays(span.from, i), byDate.get(addDays(span.from, i)), today);
    if (!c.logged) continue;
    logged += 1;
    if (c.partial) partial += 1;
    if (!c.complete) continue;
    counts.full += 1;
    if (c.onBudget) counts.on += 1;
    if (c.over) counts.above += 1;
  }
  return { from: span.from, to: span.to, elapsed, logged, counts, partial };
}

/** Days with food logged in each month of a year that has begun, for the year's list of months. */
export function monthTallies(p: Period, loggedDates: ReadonlySet<ISODate>, today: ISODate, firstDate: ISODate | null): { month: string; logged: number; elapsed: number }[] {
  const out: { month: string; logged: number; elapsed: number }[] = [];
  if (p.kind !== 'year') return out;
  for (let m = `${p.key}-01`; m <= `${p.key}-12`; m = shiftMonth(m, 1)) {
    const span = countedSpan(monthPeriod(m), today, firstDate);
    if (!span) continue;
    const elapsed = diffDays(span.from, span.to) + 1;
    let logged = 0;
    for (let i = 0; i < elapsed; i++) if (loggedDates.has(addDays(span.from, i))) logged += 1;
    out.push({ month: m, logged, elapsed });
  }
  return out.reverse();
}

/** Days with food logged between `from` and `to` (inclusive), from the set of logged days. */
export function loggedBetween(loggedDates: ReadonlySet<ISODate>, from: ISODate, to: ISODate): number {
  let n = 0;
  for (const d of loggedDates) if (d >= from && d <= to) n += 1;
  return n;
}
