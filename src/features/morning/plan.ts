/**
 * "For today" on the morning page: up to three concrete things to do today, each with its
 * numbers and one tap from where it is done. Pure and unit-tested (plan.test.ts).
 *
 * A plain line of today's targets (targetsLine) sits over the rows.
 *
 * Today's numbers and today's targets only (useDay(today)); yesterday is never the measure here.
 * No meal or protein row (the footer is the one place to log food), never a weight number, and
 * a row already done today is simply left out.
 */
import { addDays, diffDays, formatShortDate, startOfWeek, weekdayShort } from '@/lib/dates';
import { STALE_WEIGH_IN_DAYS } from '@/lib/insights';
import { formatNumber } from '@/lib/units';
import type { ISODate, UnitSystem } from '@/types';

import { waterFigures } from './figures';
import type { DataColor, ReviewKind } from './review';
import { WEEKLY_GUIDELINE_MIN, activeMinutes } from './review';

export type PlanKind = 'water' | 'move' | 'weigh' | 'sleep';

export interface PlanItem {
  kind: PlanKind;
  title: string;
  subtitle: string;
  /** The MiniCup's colour, a theme colour name. */
  color: DataColor;
  /** The MiniCup's level, value / goal (0 for a dashed cup). */
  progress: number;
  /** A dashed MiniCup: something not started. */
  future: boolean;
  /** Where the row goes, with router.replace. */
  href: string;
  /** The row's accessibilityHint. */
  hint: string;
}

export interface PlanInput {
  today: ISODate;
  /** useDay(today).waterMl */
  waterMl: number;
  /** useDay(today).waterGoalMl */
  waterGoalMl: number;
  /**
   * hasWaterTracked(useDay(today).waterEntries): water logged as water today. False when today's only
   * water came with drinks from the diary: the row then reads as a day with no water. Absent counts as true.
   */
  waterTracked?: boolean;
  /** guidelineMinutes of the activities from startOfWeek(today) through today. */
  weekMinutes: number;
  /** useWeightSeries().latest?.date, or null when nothing was ever weighed. */
  lastWeighIn: ISODate | null;
  /** A sleep record is dated today. */
  lastNightLogged: boolean;
  /** toAdjust(...)[0]?.kind, or null: its row comes first. */
  firstAdjust: ReviewKind | null;
  units: UnitSystem;
}

export const MAX_PLAN = 3;
/** The most guideline minutes a day can sensibly add toward the week, for "is it doable". */
export const DOABLE_MIN_PER_DAY = 60;

/** An amount of water in the goal's unit with that unit: "2.5 L", "750 ml", "112 fl oz". */
export function waterAmount(ml: number, goalMl: number, units: UnitSystem): string {
  const f = waterFigures(ml, goalMl, units);
  const unit = f.goal.slice(f.goal.indexOf(' ') + 1);
  return `${f.value} ${unit}`;
}

/** Days of the week left, today counted: 7 on a Monday, 1 on a Sunday. */
export function daysLeftInWeek(today: ISODate): number {
  return 7 - diffDays(startOfWeek(today), today);
}

function waterItem(i: PlanInput): PlanItem | null {
  const waterMl = i.waterTracked === false ? 0 : i.waterMl;
  if (!(i.waterGoalMl > 0) || waterMl >= i.waterGoalMl) return null;
  const ml = Math.max(0, waterMl);
  const f = waterFigures(ml, i.waterGoalMl, i.units);
  return {
    kind: 'water',
    title: `${waterAmount(i.waterGoalMl - ml, i.waterGoalMl, i.units)} of water to go`,
    subtitle: ml <= 0 ? 'Nothing logged yet today' : `${f.value} of ${f.goal} so far`,
    color: 'water',
    progress: ml / i.waterGoalMl,
    future: false,
    href: '/water',
    hint: 'Opens Water',
  };
}

function moveItem(i: PlanInput): PlanItem | null {
  const w = Math.max(0, Math.round(i.weekMinutes));
  const left = WEEKLY_GUIDELINE_MIN - w;
  if (left <= 0 || left > DOABLE_MIN_PER_DAY * daysLeftInWeek(i.today)) return null;
  const monday = startOfWeek(i.today) === i.today;
  return {
    kind: 'move',
    // "this week" sits in the subtitle, so the title stays on one line at 360 px.
    title: `${activeMinutes(left)} left`,
    subtitle: monday && w === 0 ? 'A new week starts today' : `${formatNumber(w)} of ${WEEKLY_GUIDELINE_MIN} this week`,
    color: 'exercise',
    progress: w / WEEKLY_GUIDELINE_MIN,
    future: false,
    href: `/activity/pick?date=${i.today}`,
    hint: 'Opens the workout list',
  };
}

function weighItem(i: PlanInput): PlanItem | null {
  if (!i.lastWeighIn) return null;
  const d = diffDays(i.lastWeighIn, i.today);
  if (d < STALE_WEIGH_IN_DAYS) return null;
  return {
    kind: 'weigh',
    title: 'Weigh in',
    subtitle: `Last one ${formatNumber(d)} days ago, ${weekdayShort(i.lastWeighIn)}, ${formatShortDate(i.lastWeighIn)}`,
    color: 'weight',
    progress: 0,
    future: true,
    href: '/weight?log=1',
    hint: 'Opens Weight',
  };
}

function sleepItem(i: PlanInput): PlanItem | null {
  if (i.lastNightLogged) return null;
  return {
    kind: 'sleep',
    title: "Add last night's sleep",
    subtitle: 'Not logged yet',
    color: 'sleep',
    progress: 0,
    future: true,
    href: '/sleep?log=1',
    hint: 'Opens Sleep',
  };
}

const ORDER: PlanKind[] = ['water', 'move', 'weigh', 'sleep'];

/** The adjust item whose row leads the plan (calories and a logged short night have no row). */
const LEADS: Partial<Record<ReviewKind, PlanKind>> = { water: 'water' };

/** Up to three rows for today, the one matching the first thing to adjust first. */
export function todayPlan(i: PlanInput): PlanItem[] {
  const build: Record<PlanKind, () => PlanItem | null> = { water: () => waterItem(i), move: () => moveItem(i), weigh: () => weighItem(i), sleep: () => sleepItem(i) };
  const lead = i.firstAdjust ? LEADS[i.firstAdjust] : undefined;
  const order = lead ? [lead, ...ORDER.filter((k) => k !== lead)] : ORDER;
  const items: PlanItem[] = [];
  for (const k of order) {
    const item = build[k]();
    if (item) items.push(item);
  }
  return items.slice(0, MAX_PLAN);
}

/** The parts of today's DaySummary (useDay(today)) the targets line reads. */
export interface TodayTargets {
  /** useDay(today).budget */
  budget: number;
  /** useDay(today).macros.proteinG */
  proteinG: number;
}

/**
 * The plain line under "For today" (testID morning-targets), named as targets so it is never read
 * as what was eaten: "Today's budget: 2,190 kcal and 152 g of protein.", "Today's budget:
 * 1,980 kcal." without a protein target, null without a budget (the budget, never "target": the target is the
 * number before workouts).
 */
export function targetsLine(t: TodayTargets): string | null {
  const budget = Math.round(t.budget);
  if (!(budget > 0)) return null;
  const protein = Math.round(t.proteinG);
  return protein > 0
    ? `Today's budget: ${formatNumber(budget)} kcal and ${formatNumber(protein)} g of protein.`
    : `Today's budget: ${formatNumber(budget)} kcal.`;
}

/** The week's first day and today, for gathering weekMinutes: activities with from <= date <= to. */
export function weekSoFar(today: ISODate): { from: ISODate; to: ISODate } {
  return { from: startOfWeek(today), to: today };
}

/** The days before yesterday in yesterday's week, for ReviewInput.weekBefore; null on a Monday (weekBefore is 0). */
export function weekBeforeYesterday(today: ISODate): { from: ISODate; to: ISODate } | null {
  const yesterday = addDays(today, -1);
  const from = startOfWeek(yesterday);
  return from === yesterday ? null : { from, to: addDays(yesterday, -1) };
}
