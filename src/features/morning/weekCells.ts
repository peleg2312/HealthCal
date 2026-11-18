/**
 * The cells of the week picture on the morning page (WeekCups draws them): which days are drawn
 * and how each one reads. Pure and unit-tested (weekCells.test.ts): no hooks, no clock, no storage.
 *
 * - The row runs from max(yesterday - 6, the setup day) to yesterday, then today. Days before setup
 *   are never drawn, so a second day shows only Yesterday and Today.
 * - Every day is calories against that day's own budget (a limit): `partial` while partly logged
 *   (drawn pale), `over` when a complete day is above its budget (the amber lip), the exercise
 *   added to the budget as `headroom`, and `workout` when anything was logged under Train.
 * - The picture is left out (`show` false) when only Today would be drawn (yesterday is before
 *   setup) or when no drawn day before today has food: seven blank cups say nothing.
 */
import { addDays } from '@/lib/dates';
import type { ISODate } from '@/types';

/** What the page knows of one day (from useDays and dayFacts). */
export interface WeekDayIn {
  date: ISODate;
  kcal: number;
  /** The day's own budget, exercise included when eat-back is on. */
  budget: number;
  /** The day's target before exercise. */
  target: number;
  foodLogged: boolean;
  complete: boolean;
  approx: boolean;
  workout: boolean;
}

export interface WeekCell {
  date: ISODate;
  kcal: number;
  budget: number;
  /** Exercise added to the budget (budget above target), hatched over the target. */
  headroom: number;
  foodLogged: boolean;
  /** Food logged but the day is not complete: drawn pale. */
  partial: boolean;
  /** A complete day above its budget: the amber lip. */
  over: boolean;
  approx: boolean;
  workout: boolean;
}

export interface WeekCells {
  /** The small cups, oldest first: the drawn days before yesterday (up to six). */
  before: WeekCell[];
  /** Yesterday's large cup, or null when yesterday is before setup. */
  yesterday: WeekCell | null;
  /** Today so far: the cup at the end. */
  today: WeekCell;
  /** Draw the picture at all. */
  show: boolean;
  /** Any drawn day (today included) has a workout: the legend line shows. */
  anyWorkout: boolean;
}

function cell(d: WeekDayIn): WeekCell {
  const partial = d.foodLogged && !d.complete;
  return {
    date: d.date,
    kcal: d.foodLogged ? Math.max(0, d.kcal) : 0,
    budget: Math.max(0, d.budget),
    headroom: Math.max(0, d.budget - d.target),
    foodLogged: d.foodLogged,
    partial,
    over: d.foodLogged && d.complete && d.budget > 0 && d.kcal > d.budget,
    approx: d.foodLogged && d.approx,
    workout: d.workout,
  };
}

function empty(date: ISODate): WeekDayIn {
  return { date, kcal: 0, budget: 0, target: 0, foodLogged: false, complete: false, approx: false, workout: false };
}

/**
 * The week's cells. `days` may hold any days (in any order); a drawn day missing from it reads as
 * nothing logged. `setupDay` is the local day of setup, or null when unknown (then six days before
 * yesterday are drawn).
 */
export function weekCells({ days, todayDay, setupDay, yesterday, today }: { days: readonly WeekDayIn[]; todayDay: WeekDayIn | null; setupDay: ISODate | null; yesterday: ISODate; today: ISODate }): WeekCells {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const first = addDays(yesterday, -6);
  const from = setupDay && setupDay > first ? setupDay : first;
  const drawn: WeekCell[] = [];
  for (let d = from; d <= yesterday; d = addDays(d, 1)) drawn.push(cell(byDate.get(d) ?? empty(d)));
  const t = cell(todayDay && todayDay.date === today ? todayDay : empty(today));
  const y = drawn.length > 0 && drawn[drawn.length - 1].date === yesterday ? drawn[drawn.length - 1] : null;
  const before = y ? drawn.slice(0, -1) : drawn;
  const show = y !== null && drawn.some((c) => c.foodLogged);
  return { before, yesterday: y, today: t, show, anyWorkout: show && (drawn.some((c) => c.workout) || t.workout) };
}
