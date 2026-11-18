/**
 * Progress insights: period summaries, ranked insights, weekly recaps and
 * milestones. Pure functions (no React, no storage) so every claim the app
 * makes about the user's data is computed here and unit-tested.
 *
 * Rules the copy follows (see AGENTS.md):
 * - Every insight quotes the user's own numbers and offers one specific next step.
 * - Patterns are only claimed when the data shows them, with minimum sample sizes.
 * - Too little data produces "log a few more days", never a guess.
 * - Neutral, factual tone. Over a target is information, not failure.
 */
import type { GoalType, ISODate, Nutrients, UnitSystem, WaterEntry } from '@/types';

import { addDays, diffDays, formatShortDate, fromISODate, startOfWeek } from './dates';
import { KCAL_PER_KG, maxWeeklyRateKg } from './energy';
import { guidelineMinutes, MODERATE_MET, VIGOROUS_MET } from './exercise';
import { effectiveMl } from './hydration';
import type { AdaptiveTdee, TrendPoint } from './trend';
import { isCompleteDay as sharedIsCompleteDay } from './trend';
import { formatNumber, formatVolume, formatWeight } from './units';

// ------------------------------------------------------------------ inputs

/**
 * The fields of a `DaySummary` (from `@/store/selectors`) the insights need.
 * A DaySummary is assignable to this, and tests can build it by hand.
 */
export interface InsightDay {
  date: ISODate;
  /** `via` marks a drink from Water (not "food logged": `hasFoodLogged`, @/features/drinks/via). */
  entries: readonly { nutrients: Pick<Nutrients, 'fiber'>; via?: 'water' }[];
  eaten: Nutrients;
  budget: number;
  macros: { proteinG: number; carbsG: number; fatG: number; fiberG: number };
  /** MET and duration are used to count guideline minutes (moderate + 2 × vigorous). */
  activities: readonly { met?: number; durationMin?: number }[];
  activeMinutes: number;
  waterEntries: readonly Pick<WaterEntry, 'ml' | 'beverage' | 'loggedAt'>[];
  waterMl: number;
  waterGoalMl: number;
}

export interface SleepLike {
  date: ISODate;
  hours: number;
  /** 1 to 5 when the person rated the night; a night read from a health store may have none. */
  quality?: number;
}

// ------------------------------------------------------------- thresholds

/** Days within this share of the budget count as "on budget". */
export const BUDGET_BAND = 0.1;
/**
 * A logged day under this share of its budget (or under 800 kcal) is treated as
 * partly logged and left out of averages. The rule itself is `isCompleteDay` in
 * `./trend`, shared with the expenditure estimate.
 */
export const PARTIAL_DAY_SHARE = 0.5;
/** Fully logged days needed before any nutrition insight is generated. */
export const MIN_INSIGHT_DAYS = 3;
/** WHO guideline for adults: at least 150 minutes of moderate activity a week. */
export const WEEKLY_ACTIVE_MINUTES = 150;
/** Sleep most adults need (AASM / Sleep Research Society): 7 to 9 hours. */
export const SLEEP_TARGET_HOURS = 7;
export const SLEEP_MAX_HOURS = 9;
/** Days with food logged a week needs before it gets a recap. Every screen that mentions the recap uses this. */
export const MIN_LOGGED_DAYS_FOR_RECAP = 3;
/** A pace insight needs a weigh-in this recent; older rates are history, not the current pace. */
export const STALE_WEIGH_IN_DAYS = 7;

export { guidelineMinutes, MODERATE_MET, VIGOROUS_MET };

/** A glass for water suggestions: 250 ml, or 8 fl oz in imperial. */
export function glassMl(units: UnitSystem): number {
  return units === 'imperial' ? 8 * 29.5735 : 250;
}

function glassText(units: UnitSystem): string {
  return units === 'imperial' ? '8 fl oz' : '250 ml';
}
export const MAX_INSIGHTS = 5;

// ---------------------------------------------------------- period summary

export interface PeriodSummary {
  start: ISODate;
  end: ISODate;
  totalDays: number;
  /** Days from the first day with any data to the end of the period. */
  effectiveDays: number;
  /** Days before today with food logged. */
  loggedDays: number;
  /** Days with food logged, today included. */
  loggedDaysInclToday: number;
  /** Logged days used for averages (not partial). */
  completeDays: number;
  /** Logged days that looked partly logged and were left out of averages. */
  partialDays: number;
  calories: {
    avgKcal: number;
    avgBudget: number;
    /** avgKcal - avgBudget; positive means above budget. */
    avgDiff: number;
    inBand: number;
    above: number;
    below: number;
  } | null;
  macros: {
    protein: { avg: number; target: number };
    carbs: { avg: number; target: number };
    fat: { avg: number; target: number };
    /** Null when most logged foods carry no fibre value. */
    fiber: { avg: number; target: number } | null;
  } | null;
  water: { avgMl: number; avgGoalMl: number; daysAtGoal: number; daysTracked: number } | null;
  activity: {
    /** Logged minutes, whatever the intensity. */
    minutes: number;
    /** Minutes that count toward the guideline (moderate + 2 × vigorous). */
    guidelineMinutes: number;
    sessions: number;
    activeDays: number;
    /** Guideline minutes per week. */
    weeklyMinutes: number;
  };
  /** avgQuality averages only the `rated` nights (those that have a quality); null when none do. */
  sleep: { avgHours: number; nights: number; avgQuality: number | null; rated: number } | null;
  weight: {
    startTrend: number;
    endTrend: number;
    changeKg: number;
    spanDays: number;
    /** Null when the trend spans less than a week inside the period. */
    weeklyRateKg: number | null;
    weighIns: number;
  } | null;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function hasAnyData(d: InsightDay): boolean {
  return d.entries.length > 0 || d.activities.length > 0 || d.waterEntries.length > 0;
}

export function isLogged(d: InsightDay): boolean {
  return d.entries.length > 0;
}

/** Logged, closed (before today) and not obviously partial, by the app-wide rule in `./trend`. */
export function isCompleteDay(d: InsightDay, today: ISODate): boolean {
  return d.date < today && isLogged(d) && sharedIsCompleteDay(d.eaten.kcal, d.budget);
}

export function inBudgetBand(kcal: number, budget: number): boolean {
  return budget > 0 && Math.abs(kcal - budget) <= budget * BUDGET_BAND;
}

/**
 * Summary of a run of days (oldest first). Averages use only closed, fully
 * logged days so an in-progress today or a half-logged day cannot drag them down.
 */
export function summarizePeriod(input: {
  days: InsightDay[];
  trend: TrendPoint[];
  sleep: SleepLike[];
  today: ISODate;
}): PeriodSummary {
  const { days, trend, sleep, today } = input;
  const start = days[0]?.date ?? today;
  const end = days[days.length - 1]?.date ?? today;
  const sleepIn = sleep.filter((s) => s.date >= start && s.date <= end && s.hours > 0);
  const trendIn = trend.filter((t) => t.date >= start && t.date <= end);

  let firstIdx = days.findIndex(hasAnyData);
  const firstOther = [...sleepIn.map((s) => s.date), ...trendIn.filter((t) => !t.interpolated).map((t) => t.date)].sort()[0];
  if (firstOther) {
    const i = days.findIndex((d) => d.date >= firstOther);
    if (i >= 0 && (firstIdx < 0 || i < firstIdx)) firstIdx = i;
  }
  const effectiveDays = firstIdx < 0 ? 0 : days.length - firstIdx;

  const closed = days.filter((d) => d.date < today);
  const logged = closed.filter(isLogged);
  const complete = logged.filter((d) => isCompleteDay(d, today));

  let calories: PeriodSummary['calories'] = null;
  let macros: PeriodSummary['macros'] = null;
  if (complete.length) {
    const avgKcal = avg(complete.map((d) => d.eaten.kcal));
    const avgBudget = avg(complete.map((d) => d.budget));
    calories = {
      avgKcal,
      avgBudget,
      avgDiff: avgKcal - avgBudget,
      inBand: complete.filter((d) => inBudgetBand(d.eaten.kcal, d.budget)).length,
      above: complete.filter((d) => d.eaten.kcal > d.budget * (1 + BUDGET_BAND)).length,
      below: complete.filter((d) => d.eaten.kcal < d.budget * (1 - BUDGET_BAND)).length,
    };
    const allEntries = complete.flatMap((d) => d.entries);
    const withFiber = allEntries.filter((e) => typeof e.nutrients.fiber === 'number').length;
    macros = {
      protein: { avg: avg(complete.map((d) => d.eaten.protein)), target: avg(complete.map((d) => d.macros.proteinG)) },
      carbs: { avg: avg(complete.map((d) => d.eaten.carbs)), target: avg(complete.map((d) => d.macros.carbsG)) },
      fat: { avg: avg(complete.map((d) => d.eaten.fat)), target: avg(complete.map((d) => d.macros.fatG)) },
      fiber:
        allEntries.length && withFiber / allEntries.length >= 0.8
          ? { avg: avg(complete.map((d) => d.eaten.fiber ?? 0)), target: avg(complete.map((d) => d.macros.fiberG)) }
          : null,
    };
  }

  const waterDays = closed.filter((d) => d.waterEntries.length > 0);
  const water = waterDays.length
    ? {
        avgMl: avg(waterDays.map((d) => d.waterMl)),
        avgGoalMl: avg(waterDays.map((d) => d.waterGoalMl)),
        daysAtGoal: waterDays.filter((d) => d.waterMl >= d.waterGoalMl).length,
        daysTracked: waterDays.length,
      }
    : null;

  const minutes = days.reduce((s, d) => s + d.activeMinutes, 0);
  const guideline = days.reduce((s, d) => s + guidelineMinutes(d.activities), 0);
  const sessions = days.reduce((s, d) => s + d.activities.length, 0);
  const activity = {
    minutes,
    guidelineMinutes: guideline,
    sessions,
    activeDays: days.filter((d) => d.activities.length > 0).length,
    // Never extrapolate a short history up to a full week.
    weeklyMinutes: (guideline * 7) / Math.max(7, effectiveDays),
  };

  const rated = sleepIn.flatMap((s) => (typeof s.quality === 'number' ? [s.quality] : []));
  const sleepSummary = sleepIn.length
    ? { avgHours: avg(sleepIn.map((s) => s.hours)), nights: sleepIn.length, avgQuality: rated.length ? avg(rated) : null, rated: rated.length }
    : null;

  let weight: PeriodSummary['weight'] = null;
  if (trendIn.length >= 2) {
    const first = trendIn[0];
    const last = trendIn[trendIn.length - 1];
    const spanDays = diffDays(first.date, last.date);
    const changeKg = last.trend - first.trend;
    weight = {
      startTrend: first.trend,
      endTrend: last.trend,
      changeKg,
      spanDays,
      weeklyRateKg: spanDays >= 7 ? (changeKg / spanDays) * 7 : null,
      weighIns: trendIn.filter((t) => !t.interpolated).length,
    };
  }

  return {
    start,
    end,
    totalDays: days.length,
    effectiveDays,
    loggedDays: logged.length,
    loggedDaysInclToday: days.filter(isLogged).length,
    completeDays: complete.length,
    partialDays: logged.length - complete.length,
    calories,
    macros,
    water,
    activity,
    sleep: sleepSummary,
    weight,
  };
}

// ---------------------------------------------------------------- patterns

export interface WeekendPattern {
  weekdayAvg: number;
  weekendAvg: number;
  /** weekendAvg - weekdayAvg */
  diff: number;
  weekdays: number;
  weekends: number;
}

/** Weekend (Sat, Sun) vs weekday calories on complete days. Null without enough of each. */
export function weekendPattern(days: InsightDay[], today: ISODate): WeekendPattern | null {
  const complete = days.filter((d) => isCompleteDay(d, today));
  const isWeekend = (d: InsightDay) => {
    const wd = fromISODate(d.date).getDay();
    return wd === 0 || wd === 6;
  };
  const we = complete.filter(isWeekend).map((d) => d.eaten.kcal);
  const wd = complete.filter((d) => !isWeekend(d)).map((d) => d.eaten.kcal);
  if (we.length < 2 || wd.length < 3) return null;
  const weekendAvg = avg(we);
  const weekdayAvg = avg(wd);
  return { weekdayAvg, weekendAvg, diff: weekendAvg - weekdayAvg, weekdays: wd.length, weekends: we.length };
}

export type DayPart = 'morning' | 'afternoon' | 'evening';

const DAY_PARTS: { id: DayPart; from: number; to: number; label: string }[] = [
  { id: 'morning', from: 0, to: 12, label: 'before noon' },
  { id: 'afternoon', from: 12, to: 17, label: 'from noon to 5 pm' },
  { id: 'evening', from: 17, to: 24, label: 'after 5 pm' },
];
/** Waking hours in each part, so a 5-hour afternoon is compared fairly with a 6-hour evening. */
const DAY_PART_HOURS: Record<DayPart, number> = { morning: 5, afternoon: 5, evening: 6 };

export interface HydrationPattern {
  low: DayPart;
  high: DayPart;
  /** Average ml per day in each part. */
  ml: Record<DayPart, number>;
}

/**
 * Which part of the day water intake drops, from the time each drink was
 * logged. Only reported when the lowest part's hourly rate is under 60% of
 * the highest's across at least 3 tracked days.
 */
export function hydrationPattern(days: InsightDay[], today: ISODate): HydrationPattern | null {
  const tracked = days.filter((d) => d.date < today && d.waterEntries.length > 0);
  if (tracked.length < 3) return null;
  const totals: Record<DayPart, number> = { morning: 0, afternoon: 0, evening: 0 };
  for (const d of tracked) {
    for (const w of d.waterEntries) {
      const h = new Date(w.loggedAt).getHours();
      const part = DAY_PARTS.find((p) => h >= p.from && h < p.to)!.id;
      totals[part] += effectiveMl(w.ml, w.beverage);
    }
  }
  const ml = {
    morning: totals.morning / tracked.length,
    afternoon: totals.afternoon / tracked.length,
    evening: totals.evening / tracked.length,
  };
  const rate = (p: DayPart) => ml[p] / DAY_PART_HOURS[p];
  const parts: DayPart[] = ['morning', 'afternoon', 'evening'];
  const low = parts.reduce((a, b) => (rate(b) < rate(a) ? b : a));
  const high = parts.reduce((a, b) => (rate(b) > rate(a) ? b : a));
  if (rate(high) <= 0 || rate(low) >= rate(high) * 0.6) return null;
  return { low, high, ml };
}

export interface SleepAppetite {
  shortAvgKcal: number;
  restAvgKcal: number;
  diff: number;
  shortDays: number;
  restDays: number;
}

/** Calories on days after a short night (< 6.5 h) vs other days, when both have 3+ complete days. */
export function sleepAppetite(days: InsightDay[], sleep: SleepLike[], today: ISODate): SleepAppetite | null {
  const byDate = new Map(sleep.map((s) => [s.date, s.hours]));
  const short: number[] = [];
  const rest: number[] = [];
  for (const d of days) {
    if (!isCompleteDay(d, today)) continue;
    const h = byDate.get(d.date);
    if (h === undefined) continue;
    (h < 6.5 ? short : rest).push(d.eaten.kcal);
  }
  if (short.length < 3 || rest.length < 3) return null;
  const s = avg(short);
  const r = avg(rest);
  return { shortAvgKcal: s, restAvgKcal: r, diff: s - r, shortDays: short.length, restDays: rest.length };
}

// ---------------------------------------------------------------- insights

export type InsightTone = 'positive' | 'neutral' | 'attention';

export interface Insight {
  /** Stable id, e.g. 'protein-low', usable as a React key and testID. */
  id: string;
  tone: InsightTone;
  title: string;
  body: string;
  action?: { label: string; route: string };
  /** Higher ranks first. */
  score: number;
}

export interface InsightContext {
  summary: PeriodSummary;
  days: InsightDay[];
  sleep: SleepLike[];
  today: ISODate;
  units: UnitSystem;
  goal: GoalType;
  /** The weekly rate the user chose (positive kg). */
  chosenWeeklyKg: number;
  weightKg: number;
  /** Current trend rate from the weight series (signed kg/week), null when too short. */
  currentWeeklyRateKg: number | null;
  /** All weigh-ins ever, for the minimum-data check on pace. */
  weighInsTotal: number;
  /** Date of the latest weigh-in; a rate from weigh-ins older than a week is not presented as current. */
  lastWeighIn?: ISODate | null;
  energy: {
    formulaTdee: number;
    adaptive: AdaptiveTdee;
    usingAdaptive: boolean;
    useAdaptiveSetting: boolean;
    tdee: number;
  };
  streak: number;
}

export const kcalText = (n: number) => `${formatNumber(Math.round(n))} kcal`;
const gText = (n: number) => `${Math.round(n)} g`;
const round10 = (n: number) => Math.round(n / 10) * 10;
const round50 = (n: number) => Math.max(50, Math.round(n / 50) * 50);

/** Weekly weight change for copy: one decimal, two below 0.1. */
export function rateText(kg: number, units: UnitSystem): string {
  const a = Math.abs(kg);
  return formatWeight(a, units, a < 0.1 && a > 0 ? 2 : 1);
}

export function hoursText(h: number): string {
  return `${(Math.round(h * 10) / 10).toFixed(1).replace(/\.0$/, '')} h`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * Ranked insights for a period. Returns a single "log a few more days"
 * insight when there is too little data to say anything honest.
 */
export function generateInsights(ctx: InsightContext): Insight[] {
  const { summary: s } = ctx;
  if (s.completeDays < MIN_INSIGHT_DAYS) {
    const need = MIN_INSIGHT_DAYS - s.completeDays;
    return [
      {
        id: 'log-more',
        tone: 'neutral',
        title: 'Log a few more days',
        body: `Insights start after ${MIN_INSIGHT_DAYS} fully logged days in this range. You have ${s.completeDays} so far, so ${plural(need, 'more day')} will unlock them.`,
        action: { label: 'Open diary', route: '/diary' },
        score: 100,
      },
    ];
  }

  const out: Insight[] = [];
  const push = (i: Insight | null) => {
    if (i) out.push(i);
  };
  push(caloriesInsight(ctx));
  push(proteinInsight(ctx));
  push(fiberInsight(ctx));
  push(hydrationInsight(ctx));
  push(activityInsight(ctx));
  push(sleepInsight(ctx));
  push(sleepAppetiteInsight(ctx));
  push(paceInsight(ctx));
  push(weekendInsight(ctx));
  push(consistencyInsight(ctx));
  push(adaptiveInsight(ctx));
  return rankInsights(out);
}

/** Highest score first, at most MAX_INSIGHTS, and at least one positive when one exists. */
export function rankInsights(list: Insight[], max = MAX_INSIGHTS): Insight[] {
  const sorted = [...list].sort((a, b) => b.score - a.score);
  const top = sorted.slice(0, max);
  if (!top.some((i) => i.tone === 'positive')) {
    const best = sorted.find((i) => i.tone === 'positive');
    if (best && top.length) top[top.length - 1] = best;
  }
  return top;
}

function caloriesInsight({ summary: s, days, today, units }: InsightContext): Insight | null {
  const c = s.calories;
  if (!c) return null;
  const rel = c.avgDiff / c.avgBudget;
  const n = s.completeDays;
  const base = `You averaged ${kcalText(c.avgKcal)} on ${n} fully logged days against a ${kcalText(c.avgBudget)} budget`;
  if (Math.abs(rel) <= 0.05) {
    return {
      id: 'calories-on-budget',
      tone: 'positive',
      title: 'Calories on budget',
      body: `${base}, and ${c.inBand} of ${n} days landed within 10% of it. Keep the same routine.`,
      score: 50,
    };
  }
  if (rel > 0.05) {
    const diff = c.avgDiff;
    const slower = (diff * 7) / KCAL_PER_KG;
    const pattern = weekendPattern(days, today);
    const weekdaysOnPlan = pattern && pattern.diff >= 150 && Math.abs(pattern.weekdayAvg - c.avgBudget) <= c.avgBudget * 0.05;
    const step = weekdaysOnPlan
      ? 'Weekdays are close to budget, so planning one weekend meal ahead would make the biggest difference.'
      : `Trimming one ${diff <= 250 ? 'snack' : 'portion'} of about ${round50(diff)} kcal a day would bring the average back to budget.`;
    return {
      id: 'calories-above',
      tone: 'attention',
      title: 'Calories above budget',
      body: `${base}: ${kcalText(diff)} a day above. At that level your trend moves about ${rateText(slower, units)} a week ${slower > 0 ? 'higher' : 'lower'} than planned. ${step}`,
      action: { label: 'Open diary', route: '/diary' },
      score: 60 + Math.min(30, rel * 200),
    };
  }
  if (rel < -0.15) {
    const gap = -c.avgDiff;
    return {
      id: 'calories-well-under',
      tone: 'attention',
      title: 'Eating well under budget',
      body: `${base}: ${kcalText(gap)} a day under. Eating this far under can sap energy and cost muscle; adding a snack of about ${round50(Math.min(gap, 400))} kcal brings you closer to plan. If some meals went unlogged, logging them keeps your estimates accurate.`,
      action: { label: 'Open diary', route: '/diary' },
      score: 58,
    };
  }
  return {
    id: 'calories-under',
    tone: 'neutral',
    title: 'A little under budget',
    body: `${base}: ${kcalText(-c.avgDiff)} a day under, a modest gap. If you feel low on energy, a snack of about ${round50(-c.avgDiff)} kcal would close it.`,
    score: 22,
  };
}

function proteinInsight({ summary: s, goal }: InsightContext): Insight | null {
  const p = s.macros?.protein;
  if (!p || p.target <= 0) return null;
  const gap = p.target - p.avg;
  if (gap >= Math.max(10, p.target * 0.1)) {
    const step =
      gap <= 35
        ? 'One more serving of Greek yogurt (about 24 g) or a 100 g portion of chicken (about 31 g) a day would close most of the gap.'
        : 'Adding a protein source to two meals a day, such as Greek yogurt at breakfast and chicken, fish or tofu at lunch, would close most of the gap.';
    return {
      id: 'protein-low',
      tone: 'attention',
      title: 'Protein below target',
      body: `Protein averaged ${gText(p.avg)}, ${gText(gap)} under your ${gText(p.target)} target. ${step}`,
      action: { label: 'Find protein foods', route: '/food/search?meal=snack' },
      score: 55 + Math.min(25, (gap / p.target) * 100),
    };
  }
  if (p.avg >= p.target * 0.95) {
    const why = goal === 'lose' ? ', which helps keep muscle while you lose weight' : goal === 'gain' ? ', which supports building muscle' : '';
    return {
      id: 'protein-on-target',
      tone: 'positive',
      title: 'Protein on target',
      body: `Protein averaged ${gText(p.avg)} against a ${gText(p.target)} target${why}.`,
      score: 40,
    };
  }
  return null;
}

function fiberInsight({ summary: s }: InsightContext): Insight | null {
  const f = s.macros?.fiber;
  if (!f || f.target <= 0) return null;
  if (f.avg < f.target * 0.7) {
    return {
      id: 'fiber-low',
      tone: 'attention',
      title: 'Fibre is low',
      body: `Fibre averaged ${gText(f.avg)} against ${gText(f.target)}. A cup of cooked lentils or beans (about 13 g) or a pear with a handful of almonds (about 9 g) would close much of the gap.`,
      score: 32 + Math.min(15, (1 - f.avg / f.target) * 30),
    };
  }
  if (f.avg >= f.target * 0.9) {
    return {
      id: 'fiber-on-target',
      tone: 'positive',
      title: 'Fibre on target',
      body: `Fibre averaged ${gText(f.avg)} against a ${gText(f.target)} target.`,
      score: 18,
    };
  }
  return null;
}

function hydrationInsight({ summary: s, days, today, units }: InsightContext): Insight | null {
  const w = s.water;
  if (!w || w.daysTracked < 3) return null;
  const rate = w.daysAtGoal / w.daysTracked;
  const head = `You reached your water goal on ${w.daysAtGoal} of ${w.daysTracked} days`;
  if (rate < 0.5) {
    const gap = Math.max(0, w.avgGoalMl - w.avgMl);
    const pattern = hydrationPattern(days, today);
    const label = (p: DayPart) => DAY_PARTS.find((x) => x.id === p)!.label;
    const patternText = pattern
      ? `; ${pattern.low === 'morning' ? 'mornings' : pattern.low === 'afternoon' ? 'afternoons' : 'evenings'} are where intake drops, about ${formatVolume(round50(pattern.ml[pattern.low]), units)} ${label(pattern.low)} against ${formatVolume(round50(pattern.ml[pattern.high]), units)} ${label(pattern.high)}`
      : '';
    const glasses = Math.max(1, Math.ceil(gap / glassMl(units)));
    const when = pattern?.low === 'afternoon' ? ' in the afternoon' : pattern?.low === 'morning' ? ' in the morning' : pattern?.low === 'evening' ? ' in the early evening' : '';
    return {
      id: 'water-low',
      tone: 'attention',
      title: 'Water goal missed on most days',
      body: `${head}, averaging ${formatVolume(w.avgMl, units)} against ${formatVolume(w.avgGoalMl, units)}${patternText}. ${glasses === 1 ? `One more ${glassText(units)} glass` : `${glasses} more ${glassText(units)} glasses`}${when} would close the gap.`,
      action: { label: 'Log water', route: '/water' },
      score: 42 + (1 - rate) * 20,
    };
  }
  if (rate >= 0.8) {
    return {
      id: 'water-on-track',
      tone: 'positive',
      title: 'Hydration on track',
      body: `${head}, averaging ${formatVolume(w.avgMl, units)} a day.`,
      score: 34,
    };
  }
  return {
    id: 'water-mixed',
    tone: 'neutral',
    title: 'Water goal on some days',
    body: `${head}, averaging ${formatVolume(w.avgMl, units)} against ${formatVolume(w.avgGoalMl, units)}. A glass with each meal would make it most days.`,
    action: { label: 'Log water', route: '/water' },
    score: 24,
  };
}

function activityInsight({ summary: s }: InsightContext): Insight | null {
  if (s.effectiveDays < 5) return null;
  const a = s.activity;
  const weekly = Math.round(a.weeklyMinutes);
  const sessions = plural(a.sessions, 'session');
  const light = a.minutes > 0 && a.guidelineMinutes < a.minutes ? ' Light sessions such as easy walks are logged but do not count toward it.' : '';
  if (weekly >= WEEKLY_ACTIVE_MINUTES) {
    return {
      id: 'activity-on-track',
      tone: 'positive',
      title: 'Above the activity guideline',
      body: `You averaged ${weekly} guideline minutes a week (${sessions} in this range, hard sessions count double), above the ${WEEKLY_ACTIVE_MINUTES}-minute guideline.`,
      score: 38,
    };
  }
  const gap = WEEKLY_ACTIVE_MINUTES - weekly;
  const walks = Math.ceil(gap / 30);
  return {
    id: 'activity-low',
    tone: 'attention',
    title: `Under ${WEEKLY_ACTIVE_MINUTES} guideline minutes a week`,
    body: `You averaged ${weekly} guideline minutes a week (${sessions} in this range), ${gap} short of the ${WEEKLY_ACTIVE_MINUTES}-minute guideline.${light} ${walks === 1 ? 'One brisk 30-minute walk' : `${walks} brisk 30-minute walks`} a week would cover it.`,
    action: { label: 'Log activity', route: '/activity/pick' },
    score: 30 + Math.min(20, (gap / WEEKLY_ACTIVE_MINUTES) * 20),
  };
}

function sleepInsight({ summary: s }: InsightContext): Insight | null {
  const sl = s.sleep;
  if (!sl || sl.nights < 3) return null;
  if (sl.avgHours < SLEEP_TARGET_HOURS) {
    const mins = Math.max(5, Math.round(((SLEEP_TARGET_HOURS - sl.avgHours) * 60) / 5) * 5);
    return {
      id: 'sleep-short',
      tone: 'attention',
      title: 'Sleep under 7 hours',
      body: `Sleep averaged ${hoursText(sl.avgHours)} over ${plural(sl.nights, 'night')}, under the 7 h most adults need. Going to bed ${mins} minutes earlier would close the gap.`,
      action: { label: 'Sleep log', route: '/sleep' },
      score: 33 + Math.min(20, (SLEEP_TARGET_HOURS - sl.avgHours) * 15),
    };
  }
  if (sl.avgHours > SLEEP_MAX_HOURS) {
    return {
      id: 'sleep-long',
      tone: 'neutral',
      title: 'Sleep above 9 hours',
      body: `Sleep averaged ${hoursText(sl.avgHours)} over ${plural(sl.nights, 'night')}, above the 7 to 9 h most adults need. Long sleep is often catch-up after short nights; if it lasts, it is worth mentioning to a doctor.`,
      action: { label: 'Sleep log', route: '/sleep' },
      score: 36,
    };
  }
  return {
    id: 'sleep-on-track',
    tone: 'positive',
    title: 'Sleep in a healthy range',
    body: `Sleep averaged ${hoursText(sl.avgHours)} over ${plural(sl.nights, 'night')}, inside the 7 to 9 h most adults need.`,
    score: 24,
  };
}

function sleepAppetiteInsight({ days, sleep, today }: InsightContext): Insight | null {
  const p = sleepAppetite(days, sleep, today);
  if (!p || p.diff < 150) return null;
  return {
    id: 'sleep-appetite',
    tone: 'neutral',
    title: 'Short nights, bigger appetite',
    body: `On days after less than 6.5 h of sleep you ate ${kcalText(p.diff)} more on average (${kcalText(p.shortAvgKcal)} across ${p.shortDays} days against ${kcalText(p.restAvgKcal)}). After a short night, a protein-rich breakfast helps keep hunger steady.`,
    score: 36,
  };
}

function paceInsight(ctx: InsightContext): Insight | null {
  const { currentWeeklyRateKg: rate, weighInsTotal, goal, chosenWeeklyKg, weightKg, units, energy } = ctx;
  if (rate === null || weighInsTotal < 5) return null;
  if (ctx.lastWeighIn && diffDays(ctx.lastWeighIn, ctx.today) > STALE_WEIGH_IN_DAYS) {
    const ago = diffDays(ctx.lastWeighIn, ctx.today);
    return {
      id: 'pace-stale',
      tone: 'neutral',
      title: 'Weigh in to update your pace',
      body: `Your last weigh-in was ${ago} days ago (${formatShortDate(ctx.lastWeighIn)}), so there is no current rate to compare with your plan. A few mornings this week will bring the trend up to date.`,
      action: { label: 'Log weight', route: '/weight' },
      score: 35,
    };
  }
  const r = (kg: number) => rateText(kg, units);
  const movement = rate < -0.02 ? `falling ${r(rate)} a week` : rate > 0.02 ? `rising ${r(rate)} a week` : 'holding flat';
  const adjust = (kgPerWeek: number) => `${kcalText(round10((Math.abs(kgPerWeek) * KCAL_PER_KG) / 7))}`;
  const adaptiveNote = energy.usingAdaptive ? ' Your budget already updates from these numbers as the estimate learns.' : '';

  if (goal === 'maintain') {
    if (Math.abs(rate) <= 0.15) {
      return {
        id: 'pace-on-track',
        tone: 'positive',
        title: 'Weight holding steady',
        body: `Your trend weight is ${movement}, well within normal variation for maintenance.`,
        score: 55,
      };
    }
    return {
      id: 'pace-drift',
      tone: 'neutral',
      title: 'Trend weight drifting',
      body: `Your trend weight is ${movement} while your goal is to maintain. ${rate > 0 ? 'Eating' : 'Adding'} about ${adjust(rate)} ${rate > 0 ? 'less' : 'more'} a day would level it out.${adaptiveNote}`,
      action: { label: 'Review goals', route: '/settings/goals' },
      score: 50,
    };
  }

  const dir = goal === 'lose' ? -1 : 1;
  const chosen = dir * Math.abs(chosenWeeklyKg);
  const max = maxWeeklyRateKg(goal, weightKg);
  const towards = rate * dir; // positive when moving in the goal direction
  const tol = Math.max(0.1, Math.abs(chosen) * 0.25);
  const verb = goal === 'lose' ? 'fell' : 'rose';

  if (towards > max * 1.1) {
    return {
      id: 'pace-too-fast',
      tone: 'attention',
      title: goal === 'lose' ? 'Losing faster than recommended' : 'Gaining faster than planned',
      body:
        goal === 'lose'
          ? `Your trend weight is ${movement}, faster than the ${r(max)} a week upper limit for your weight. Losing this fast makes it harder to keep muscle; eating about ${adjust(towards - Math.abs(chosen))} more a day would bring you to the ${r(chosen)} pace you chose.`
          : `Your trend weight is ${movement}, above the ${r(max)} a week that mostly adds muscle. Eating about ${adjust(towards - Math.abs(chosen))} less a day would bring you to the ${r(chosen)} pace you chose.`,
      action: { label: 'Review goals', route: '/settings/goals' },
      score: 75,
    };
  }
  if (Math.abs(rate - chosen) <= tol) {
    return {
      id: 'pace-on-track',
      tone: 'positive',
      title: 'Right on pace',
      body: `Your trend weight ${verb} ${r(rate)} a week, right at the ${r(chosen)} pace you chose.`,
      score: 58,
    };
  }
  if (towards > Math.abs(chosen)) {
    return {
      id: 'pace-ahead',
      tone: 'neutral',
      title: 'Ahead of your chosen pace',
      body: `Your trend weight ${verb} ${r(rate)} a week, faster than the ${r(chosen)} you chose and within the ${r(max)} safe limit. If hunger or training suffer, about ${adjust(towards - Math.abs(chosen))} more a day would ease it back.`,
      score: 44,
    };
  }
  return {
    id: 'pace-slower',
    tone: 'neutral',
    title: 'Slower than your chosen pace',
    body: `Your trend weight is ${movement} against the ${r(chosen)} a week you chose. A daily change of about ${adjust(chosen - rate)} would close the gap; first check that drinks, oils and weekend meals are logged.${adaptiveNote}`,
    action: { label: 'Review goals', route: '/settings/goals' },
    score: 48,
  };
}

function weekendInsight({ summary: s, days, today }: InsightContext): Insight | null {
  const p = weekendPattern(days, today);
  if (!p || Math.abs(p.diff) < 150) return null;
  const c = s.calories!;
  if (p.diff > 0) {
    const onBudget = Math.abs(c.avgDiff) <= c.avgBudget * 0.05;
    const under = c.avgDiff < -c.avgBudget * 0.05;
    const step = onBudget
      ? 'Your overall average is still on budget, so this is a pattern to know about rather than something to fix.'
      : under
        ? 'Your overall average is under budget, so this is a pattern to know about rather than something to trim.'
        : `Setting aside about ${kcalText(round10((p.diff * 2) / 5))} on each weekday would balance the week.`;
    return {
      id: 'weekend-higher',
      tone: 'neutral',
      title: 'Weekends run higher',
      body: `Weekends average ${kcalText(p.diff)} more than weekdays (${kcalText(p.weekendAvg)} against ${kcalText(p.weekdayAvg)}). ${step}`,
      score: onBudget || under ? 30 : 46,
    };
  }
  return {
    id: 'weekday-higher',
    tone: 'neutral',
    title: 'Weekdays run higher',
    body: `Weekdays average ${kcalText(-p.diff)} more than weekends (${kcalText(p.weekdayAvg)} against ${kcalText(p.weekendAvg)}). Workday snacks are a common source; logging them as you go shows where it adds up.`,
    score: 30,
  };
}

function consistencyInsight({ summary: s, streak }: InsightContext): Insight | null {
  const d = s.effectiveDays;
  if (d < 7) return null;
  const n = s.loggedDaysInclToday;
  const rate = n / d;
  if (rate >= 0.85) {
    return {
      id: 'logging-consistent',
      tone: 'positive',
      title: 'Consistent logging',
      body: `You logged food on ${n} of the last ${d} days${streak >= 3 ? `, with a current streak of ${streak} days` : ''}. That consistency is what makes these averages reliable.`,
      score: 28,
    };
  }
  if (rate < 0.6) {
    return {
      id: 'logging-gaps',
      tone: 'attention',
      title: 'Gaps in logging',
      body: `You logged food on ${n} of ${d} days. Each fully logged day sharpens your averages and expenditure estimate; on busy days, copying a previous meal takes two taps.`,
      action: { label: 'Open diary', route: '/diary' },
      score: 40,
    };
  }
  return null;
}

export function confidenceWord(c: number): string {
  if (c >= 0.75) return 'high';
  if (c >= 0.6) return 'good';
  if (c >= 0.4) return 'moderate';
  return 'early';
}

function adaptiveInsight({ energy }: InsightContext): Insight | null {
  const a = energy.adaptive;
  const formula = energy.formulaTdee;
  if (a.observed === null) {
    const needsWeight = !!a.needs && /weigh/.test(a.needs);
    return {
      id: 'adaptive-pending',
      tone: 'neutral',
      title: 'Personal expenditure estimate in progress',
      body: `Your own expenditure estimate needs ${a.needs ?? 'a little more data'}. Until then targets use the formula estimate of ${kcalText(formula)} a day.`,
      action: needsWeight ? { label: 'Log weight', route: '/weight' } : { label: 'Open diary', route: '/diary' },
      score: 26,
    };
  }
  const diff = a.observed - formula;
  const rel = Math.abs(diff) < 50 ? 'close to' : `${kcalText(Math.abs(diff))} ${diff > 0 ? 'above' : 'below'}`;
  const pct = Math.round(a.confidence * 100);
  if (!energy.usingAdaptive) {
    return {
      id: 'adaptive-available',
      tone: 'neutral',
      title: 'Your measured expenditure is ready',
      body: `Your intake and weigh-ins put your expenditure, before logged exercise, at ${kcalText(a.observed)} a day, ${rel} the formula's ${kcalText(formula)}. Turn on the adaptive estimate in goals to base your targets on it.`,
      action: { label: 'Review goals', route: '/settings/goals' },
      score: 45,
    };
  }
  return {
    id: 'adaptive-active',
    tone: 'positive',
    title: 'Your expenditure, measured',
    body: `Your intake and weigh-ins put your expenditure, before logged exercise, at ${kcalText(a.observed)} a day, ${rel} the formula's ${kcalText(formula)}. At ${confidenceWord(a.confidence)} confidence (${pct}%) it now sets your targets, from a blended ${kcalText(energy.tdee)} maintenance.`,
    score: Math.abs(diff) >= 150 ? 42 : 27,
  };
}

// ------------------------------------------------------------ weekly recap

export type RecapLabel = 'This week' | 'Last week' | 'Week';

export interface WeeklyRecap {
  /** 'Last week' for the last closed week (the default), 'This week' for the week in progress, else 'Week'. */
  label: RecapLabel;
  weekStart: ISODate;
  weekEnd: ISODate;
  /** The seven days of the week that are on or before today, oldest first. */
  days: InsightDay[];
  summary: PeriodSummary;
  /** The week before, for comparisons. Null when it has no logged day. */
  previous: PeriodSummary | null;
  /** Sum of (eaten - budget) over the week's complete days; negative means under. Null without complete days. */
  budgetBalance: number | null;
  bestDay: { date: ISODate; detail: string } | null;
  win: string;
  focus: string;
}

/** Monday of the last closed (fully past) Monday-based week. */
export function lastClosedWeek(today: ISODate): ISODate {
  return addDays(startOfWeek(today), -7);
}

/** Words for a recap's period in running text. */
export function recapPeriodWord(label: RecapLabel): string {
  return label === 'This week' ? 'this week' : label === 'Last week' ? 'last week' : 'that week';
}

/**
 * Recap of one Monday-based week: by default the last closed week, so its
 * numbers no longer move. Pass `week` (a Monday) for another week. Null when
 * the week has fewer than 2 logged days.
 */
export function weeklyRecap(input: {
  days: InsightDay[];
  trend: TrendPoint[];
  sleep: SleepLike[];
  today: ISODate;
  units: UnitSystem;
  goal: GoalType;
  week?: ISODate;
}): WeeklyRecap | null {
  const { days, today } = input;
  const thisStart = startOfWeek(today);
  const weekStart = startOfWeek(input.week ?? lastClosedWeek(today));
  if (weekStart > thisStart) return null;
  const weekEnd = addDays(weekStart, 6);
  const pick = (start: ISODate, end: ISODate) => days.filter((d) => d.date >= start && d.date <= end && d.date <= today);
  const weekDays = pick(weekStart, weekEnd);
  if (weekDays.filter(isLogged).length < MIN_LOGGED_DAYS_FOR_RECAP) return null;
  const label: RecapLabel = weekStart === thisStart ? 'This week' : weekStart === addDays(thisStart, -7) ? 'Last week' : 'Week';
  const summary = summarizePeriod({ days: weekDays, trend: input.trend, sleep: input.sleep, today });
  const prevDays = pick(addDays(weekStart, -7), addDays(weekStart, -1));
  const previous = prevDays.some(isLogged) ? summarizePeriod({ days: prevDays, trend: input.trend, sleep: input.sleep, today }) : null;
  const complete = weekDays.filter((d) => isCompleteDay(d, today));
  const budgetBalance = complete.length ? complete.reduce((sum, d) => sum + d.eaten.kcal - d.budget, 0) : null;

  // Best day: closest to budget, with protein and water as tie-breakers.
  let bestDay: WeeklyRecap['bestDay'] = null;
  let bestScore = Infinity;
  for (const d of complete) {
    const kcalOff = Math.abs(d.eaten.kcal - d.budget) / d.budget;
    const proteinShort = d.macros.proteinG > 0 ? Math.max(0, 1 - d.eaten.protein / d.macros.proteinG) : 0;
    const waterMet = d.waterMl >= d.waterGoalMl;
    const score = kcalOff + proteinShort * 0.5 + (waterMet ? 0 : 0.15) - Math.min(d.activeMinutes, 60) / 600;
    if (score < bestScore) {
      bestScore = score;
      const parts = [`${formatNumber(Math.round(d.eaten.kcal))} of ${kcalText(d.budget)}`, `${gText(d.eaten.protein)} protein`];
      if (waterMet) parts.push('water goal met');
      if (d.activeMinutes > 0) parts.push(`${d.activeMinutes} active min`);
      bestDay = { date: d.date, detail: parts.join(', ') };
    }
  }

  const { win, focus } = recapWinFocus(summary, input.units, input.goal, recapPeriodWord(label));
  return { label, weekStart, weekEnd, days: weekDays, summary, previous, budgetBalance, bestDay, win, focus };
}

/** Mondays of earlier weeks (newest first, before the last closed week) that have a recap. */
export function recapWeeks(days: InsightDay[], today: ISODate, max = 8): ISODate[] {
  const logged = new Map<ISODate, number>();
  for (const d of days) if (d.date < today && isLogged(d)) logged.set(startOfWeek(d.date), (logged.get(startOfWeek(d.date)) ?? 0) + 1);
  const out: ISODate[] = [];
  let wk = addDays(lastClosedWeek(today), -7);
  const first = days[0]?.date;
  while (out.length < max && first && addDays(wk, 6) >= first) {
    if ((logged.get(wk) ?? 0) >= 2) out.push(wk);
    wk = addDays(wk, -7);
  }
  return out;
}

/** One win and one focus, each from the user's own numbers. */
export function recapWinFocus(s: PeriodSummary, units: UnitSystem, goal: GoalType, period = 'this week'): { win: string; focus: string } {
  const wins: { score: number; text: string }[] = [];
  const focuses: { score: number; text: string }[] = [];
  const c = s.calories;
  if (c && s.completeDays >= 2) {
    const share = c.inBand / s.completeDays;
    if (share >= 0.6) wins.push({ score: share, text: `${c.inBand} of ${s.completeDays} fully logged days landed within 10% of your budget.` });
    if (c.avgDiff > c.avgBudget * 0.05)
      focuses.push({
        score: Math.min(1, c.avgDiff / c.avgBudget / 0.2),
        text: `Calories averaged ${kcalText(c.avgDiff)} above budget; trimming one ${c.avgDiff <= 250 ? 'snack' : 'portion'} a day would close it.`,
      });
  }
  const p = s.macros?.protein;
  if (p && p.target > 0) {
    const ratio = p.avg / p.target;
    if (ratio >= 0.95) wins.push({ score: 0.9, text: `Protein averaged ${gText(p.avg)}, on your ${gText(p.target)} target.` });
    else if (p.target - p.avg >= 10)
      focuses.push({ score: Math.min(1, (1 - ratio) * 3), text: `Protein: add about ${gText(p.target - p.avg)} a day, for example one Greek yogurt or a portion of chicken.` });
  }
  const w = s.water;
  if (w && w.daysTracked >= 2) {
    const r = w.daysAtGoal / w.daysTracked;
    if (r >= 0.7) wins.push({ score: r, text: `You hit your water goal on ${w.daysAtGoal} of ${w.daysTracked} days.` });
    else focuses.push({ score: (1 - r) * 0.8, text: `Water: goal reached on ${w.daysAtGoal} of ${w.daysTracked} days; one more ${glassText(units)} glass a day would help.` });
  }
  const mins = s.activity.guidelineMinutes;
  if (mins >= WEEKLY_ACTIVE_MINUTES) wins.push({ score: 0.85, text: `${mins} guideline minutes across ${plural(s.activity.sessions, 'session')}, above the 150-minute guideline.` });
  else if (s.totalDays >= 5)
    focuses.push({ score: ((WEEKLY_ACTIVE_MINUTES - mins) / WEEKLY_ACTIVE_MINUTES) * 0.7, text: `Activity: ${mins} of 150 guideline minutes; ${plural(Math.ceil((WEEKLY_ACTIVE_MINUTES - mins) / 30), 'brisk 30-minute walk')} would get you there.` });
  const sl = s.sleep;
  if (sl && sl.nights >= 3) {
    if (sl.avgHours >= SLEEP_TARGET_HOURS && sl.avgHours <= SLEEP_MAX_HOURS) wins.push({ score: 0.6, text: `Sleep averaged ${hoursText(sl.avgHours)} a night.` });
    else if (sl.avgHours < SLEEP_TARGET_HOURS) focuses.push({ score: Math.min(1, (SLEEP_TARGET_HOURS - sl.avgHours) / 1.5) * 0.7, text: `Sleep averaged ${hoursText(sl.avgHours)}; aim for lights out ${Math.max(5, Math.round(((SLEEP_TARGET_HOURS - sl.avgHours) * 60) / 5) * 5)} minutes earlier.` });
  }
  const wt = s.weight;
  if (wt && wt.weighIns >= 2 && goal !== 'maintain') {
    const toward = goal === 'lose' ? -wt.changeKg : wt.changeKg;
    if (toward >= 0.1) wins.push({ score: 0.8, text: `Trend weight moved ${rateText(wt.changeKg, units)} toward your goal.` });
  }
  const loggedText = `You logged food on ${plural(s.loggedDaysInclToday, 'day')} ${period}.`;
  if (s.loggedDaysInclToday >= 6) wins.push({ score: 0.7, text: loggedText });
  wins.sort((a, b) => b.score - a.score);
  focuses.sort((a, b) => b.score - a.score);
  return {
    win: wins[0]?.text ?? loggedText,
    focus: focuses[0]?.text ?? 'Keep the same rhythm; it is working.',
  };
}

// --------------------------------------------------------------- milestones

export interface Milestone {
  id: string;
  title: string;
  detail: string;
  achieved: boolean;
  /** Date the milestone was reached. */
  date?: ISODate;
  current: number;
  goal: number;
}

/**
 * Gentle milestones from cumulative totals. Nothing here depends on
 * consecutive days, so a break never takes anything away.
 */
export function computeMilestones(input: {
  /** Full history, oldest first. */
  days: InsightDay[];
  weighInDates: ISODate[];
  trend: TrendPoint[];
  goal: GoalType;
  units: UnitSystem;
}): Milestone[] {
  const { days, goal, units } = input;
  const nth = <T,>(list: T[], n: number): T | undefined => list[n - 1];
  const loggedDates = days.filter(isLogged).map((d) => d.date);
  const waterDates = days.filter((d) => d.waterEntries.length > 0 && d.waterMl >= d.waterGoalMl).map((d) => d.date);
  const sessionDates = days.flatMap((d) => d.activities.map(() => d.date));
  const weighIns = [...new Set(input.weighInDates)].sort();

  const count = (id: string, title: string, detail: string, dates: ISODate[], goalN: number): Milestone => {
    const date = nth(dates, goalN);
    return { id, title, detail, achieved: !!date, date, current: Math.min(dates.length, goalN), goal: goalN };
  };

  const out: Milestone[] = [
    count('first-day', 'First day logged', 'Every trend starts with one day.', loggedDates, 1),
    count('first-week', 'First week logged', '7 days of food logged, in any order.', loggedDates, 7),
    count('month-logged', '30 days logged', 'A month of data makes your estimates personal.', loggedDates, 30),
    count('days-100', '100 days logged', 'A long-term record few people build.', loggedDates, 100),
    count('weigh-ins-10', '10 weigh-ins', 'Enough for a reliable trend line.', weighIns, 10),
    count('weigh-ins-50', '50 weigh-ins', 'A trend you can trust week to week.', weighIns, 50),
    count('water-7', '7 days at water goal', 'Counted across any days, not in a row.', waterDates, 7),
    count('water-30', '30 days at water goal', 'Counted across any days, not in a row.', waterDates, 30),
    count('sessions-10', '10 workouts logged', 'Any activity counts.', sessionDates, 10),
    count('sessions-50', '50 workouts logged', 'Any activity counts.', sessionDates, 50),
  ];

  // First Monday-based week with 150+ active minutes.
  const weekMinutes = new Map<ISODate, number>();
  let activeWeek: ISODate | undefined;
  let bestWeek = 0;
  for (const d of days) {
    const g = guidelineMinutes(d.activities);
    if (!g) continue;
    const wk = startOfWeek(d.date);
    const total = (weekMinutes.get(wk) ?? 0) + g;
    weekMinutes.set(wk, total);
    bestWeek = Math.max(bestWeek, total);
    if (!activeWeek && total >= WEEKLY_ACTIVE_MINUTES) activeWeek = d.date;
  }
  out.push({
    id: 'active-week',
    title: '150 guideline minutes in a week',
    detail: 'The weekly guideline for adults; hard sessions count double.',
    achieved: !!activeWeek,
    date: activeWeek,
    current: Math.min(bestWeek, WEEKLY_ACTIVE_MINUTES),
    goal: WEEKLY_ACTIVE_MINUTES,
  });

  // First kilo (or 2 lb) of trend change toward the goal.
  if (goal !== 'maintain' && input.trend.length >= 2) {
    const step = units === 'imperial' ? 2 * 0.45359237 : 1;
    const start = input.trend[0].trend;
    const dir = goal === 'lose' ? -1 : 1;
    let reached: ISODate | undefined;
    let best = 0;
    for (const t of input.trend) {
      const moved = (t.trend - start) * dir;
      best = Math.max(best, moved);
      if (!reached && moved >= step) reached = t.date;
    }
    out.push({
      id: 'trend-first-unit',
      title: `First ${formatWeight(step, units, 0)} of trend change`,
      detail: 'Measured on the smoothed trend, not a single weigh-in.',
      achieved: !!reached,
      date: reached,
      current: Math.round(Math.min(best, step) * 10) / 10,
      goal: step,
    });
  }
  return out;
}

/** Label like 'Nov 3 – 9' or 'Oct 27 – Nov 2' for a week. */
export function weekRangeLabel(start: ISODate, end: ISODate): string {
  const a = formatShortDate(start);
  const b = formatShortDate(end);
  return a.slice(0, 3) === b.slice(0, 3) ? `${a} – ${b.slice(4)}` : `${a} – ${b}`;
}

// ------------------------------------------------------- weekly check-in

export interface RecapTile {
  id: 'calories' | 'protein' | 'activity' | 'water';
  label: string;
  value: number | null;
  unit: string;
  /** What the value is measured against, e.g. 'budget 2,050 kcal'. */
  context: string;
  previous: number | null;
  /** value - previous, when both exist. */
  delta: number | null;
  /** Whether a rise is good news (shown in the success colour); calories stay neutral either way. */
  upIsGood: boolean;
  /** Set when the tile is a running total for a week still in progress, so a comparison would mislead. */
  soFar?: boolean;
}

/** The four check-in tiles, each with the week before for comparison. */
export function recapTiles(r: Pick<WeeklyRecap, 'summary' | 'previous' | 'label'>): RecapTile[] {
  const s = r.summary;
  const p = r.previous;
  const partial = r.label === 'This week';
  const tile = (t: Omit<RecapTile, 'delta'>): RecapTile => {
    // Totals (minutes, goal days) of a part week cannot be compared with a full week; averages can.
    if (partial && (t.id === 'activity' || t.id === 'water')) return { ...t, previous: null, delta: null, soFar: true };
    return { ...t, delta: t.value !== null && t.previous !== null ? t.value - t.previous : null };
  };
  const round = (n: number | undefined | null) => (n === undefined || n === null ? null : Math.round(n));
  return [
    tile({
      id: 'calories',
      label: 'Average intake',
      value: round(s.calories?.avgKcal),
      unit: 'kcal',
      context: s.calories ? `budget ${kcalText(s.calories.avgBudget)}` : 'no fully logged days',
      previous: round(p?.calories?.avgKcal),
      upIsGood: false,
    }),
    tile({
      id: 'protein',
      label: 'Protein',
      value: round(s.macros?.protein.avg),
      unit: 'g / day',
      context: s.macros ? `target ${gText(s.macros.protein.target)}` : 'no fully logged days',
      previous: round(p?.macros?.protein.avg),
      upIsGood: true,
    }),
    tile({
      id: 'activity',
      label: 'Guideline minutes',
      value: s.activity.guidelineMinutes,
      unit: 'min',
      context: `of ${WEEKLY_ACTIVE_MINUTES}, ${plural(s.activity.sessions, 'session')}`,
      previous: p ? p.activity.guidelineMinutes : null,
      upIsGood: true,
    }),
    tile({
      id: 'water',
      label: 'Water goal met',
      value: s.water ? s.water.daysAtGoal : null,
      unit: s.water ? `of ${s.water.daysTracked} days` : 'days',
      context: s.water ? `${plural(s.water.daysTracked, 'day')} tracked` : 'no drinks logged',
      previous: p?.water ? p.water.daysAtGoal : null,
      upIsGood: true,
    }),
  ];
}

/** Caption under the check-in bars, e.g. '310 kcal under budget for the week'. */
export function budgetBalanceText(balance: number | null): string {
  if (balance === null) return 'No fully logged days to compare with the budget.';
  const b = Math.round(balance);
  if (Math.abs(b) < 50) return 'Right on budget for the week';
  return `${kcalText(Math.abs(b))} ${b > 0 ? 'over' : 'under'} budget for the week`;
}

/** One line on why the daily budget changed between two weeks. */
export function planChangeText(
  before: { target: number; tdee: number; usingAdaptive: boolean },
  after: { target: number; tdee: number; usingAdaptive: boolean },
): string {
  const diff = Math.round(after.target - before.target);
  if (Math.abs(diff) < 20) return 'Same budget as last week.';
  const dir = diff > 0 ? 'up' : 'down';
  if (after.usingAdaptive && !before.usingAdaptive) {
    return `Your budget now follows your measured expenditure, ${kcalText(after.tdee)} a day outside logged workouts, so it moved ${dir} ${kcalText(Math.abs(diff))}.`;
  }
  if (after.usingAdaptive && Math.abs(after.tdee - before.tdee) >= 20) {
    return `Your measured expenditure, outside logged workouts, is now ${kcalText(after.tdee)} a day against ${kcalText(before.tdee)}, so the budget moved ${dir} ${kcalText(Math.abs(diff))}.`;
  }
  return `Your budget moved ${dir} ${kcalText(Math.abs(diff))} after a change to your goal, weight or activity settings.`;
}

// ------------------------------------------------------- period comparison

/**
 * A neutral sentence comparing a value with the same measure over the previous
 * equal period, e.g. '12 g more than the previous 30 days'. Differences within
 * `same` read as 'About the same'. Null when either side is missing.
 */
export function compareText(
  current: number | null | undefined,
  previous: number | null | undefined,
  opts: {
    /** e.g. '30 days'. */
    period: string;
    /** Formats the absolute difference with its unit, e.g. (n) => `${Math.round(n)} g`. */
    format: (n: number) => string;
    /** Differences up to this count as the same. */
    same: number;
    more?: string;
    less?: string;
  },
): string | null {
  if (current === null || current === undefined || previous === null || previous === undefined) return null;
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  const diff = current - previous;
  if (Math.abs(diff) <= opts.same) return `About the same as the previous ${opts.period}`;
  return `${opts.format(Math.abs(diff))} ${diff > 0 ? (opts.more ?? 'more') : (opts.less ?? 'less')} than the previous ${opts.period}`;
}

// -------------------------------------------------------------- baselines

/** Fewest samples before a same-weekday median is shown. */
export const MIN_WEEKDAY_SAMPLES = 3;
/** Fewest complete days before a usual range is shown. */
export const MIN_RANGE_SAMPLES = 7;

/** Linear-interpolated percentile (0..1) of an ascending list. */
export function percentile(sorted: readonly number[], p: number): number {
  if (!sorted.length) return NaN;
  const i = (sorted.length - 1) * Math.min(1, Math.max(0, p));
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

export interface UsualRange {
  /** 25th percentile. */
  low: number;
  median: number;
  /** 75th percentile. */
  high: number;
  samples: number;
}

/** The middle half of a set of values, or null below `min` samples. */
export function usualRange(values: readonly number[], min = MIN_RANGE_SAMPLES): UsualRange | null {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length < min) return null;
  return { low: percentile(v, 0.25), median: percentile(v, 0.5), high: percentile(v, 0.75), samples: v.length };
}

/** Usual daily intake: the middle half of complete days in the 28 days before today. */
export function usualKcalRange(days: readonly InsightDay[], today: ISODate): UsualRange | null {
  const from = addDays(today, -28);
  return usualRange(days.filter((d) => d.date >= from && isCompleteDay(d, today)).map((d) => d.eaten.kcal));
}

/** Usual weight: the middle half of weigh-ins in the 28 days up to today. */
export function usualWeightRange(weighIns: readonly { date: ISODate; kg: number }[], today: ISODate): UsualRange | null {
  const from = addDays(today, -27);
  return usualRange(weighIns.filter((w) => w.date >= from && w.date <= today).map((w) => w.kg));
}

/**
 * Median of a value on the same weekday over the previous `weeks` weeks (the
 * date itself excluded), e.g. a usual Friday. Days where `pick` returns null
 * are skipped; null below MIN_WEEKDAY_SAMPLES.
 */
export function weekdayUsual(
  days: readonly InsightDay[],
  date: ISODate,
  pick: (d: InsightDay) => number | null,
  weeks = 6,
): number | null {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const values: number[] = [];
  for (let w = 1; w <= weeks; w++) {
    const d = byDate.get(addDays(date, -7 * w));
    const v = d ? pick(d) : null;
    if (v !== null && Number.isFinite(v)) values.push(v);
  }
  if (values.length < MIN_WEEKDAY_SAMPLES) return null;
  return percentile(values.sort((a, b) => a - b), 0.5);
}

export type Direction = 'up' | 'down' | 'same';

/** Which way a value moved against the previous period; null when either is missing. */
export function direction(current: number | null | undefined, previous: number | null | undefined, same: number): Direction | null {
  if (current === null || current === undefined || previous === null || previous === undefined) return null;
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  const d = current - previous;
  return Math.abs(d) <= same ? 'same' : d > 0 ? 'up' : 'down';
}
