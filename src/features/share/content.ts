/**
 * What a share card carries, for a given day (or week) and the person's
 * choices. Pure: no React, no storage, no clock. The card is drawn from this
 * (see `scene.ts`), so everything that could leave the phone passes through
 * here, and the privacy rules are tested here:
 *
 * - Weight is never on a card: no input carries it.
 * - Calories show as how full the day is (a share of its own budget). The kcal
 *   figures appear only with `choices.kcal`.
 * - Water, activity minutes, the streak and the week's cups are on by default.
 * - Food names appear only with `choices.foods`.
 */
import { addDays, fromISODate, startOfWeek } from '@/lib/dates';
import { budgetSharePct } from '@/features/progress/budgetShare';
import { budgetMark } from '@/lib/insights';
import { formatNumber, formatVolume } from '@/lib/units';
import type { ISODate, MealType, UnitSystem } from '@/types';

export interface ShareChoices {
  /** The kcal figures (eaten, budget). Off by default: the cup shows how full the day is instead. */
  kcal: boolean;
  water: boolean;
  activity: boolean;
  streak: boolean;
  /** The row of the week's cups. */
  week: boolean;
  /** Food names. Off by default. */
  foods: boolean;
}

export const DEFAULT_SHARE_CHOICES: ShareChoices = { kcal: false, water: true, activity: true, streak: true, week: true, foods: false };

/** The kinds of card: a day, a week, and a month or a year in cups (./periodContent.ts). */
export type ShareKind = 'day' | 'week' | 'month' | 'year';

/** The choices a card kind offers, in the order the sheet lists them. A week card has no food names; a month or a year no streak. */
export const CHOICES_FOR: Record<ShareKind, (keyof ShareChoices)[]> = {
  day: ['kcal', 'water', 'activity', 'streak', 'week', 'foods'],
  week: ['kcal', 'water', 'activity', 'streak'],
  month: ['kcal', 'water', 'activity', 'foods'],
  year: ['kcal', 'water', 'activity', 'foods'],
};

export const CHOICE_LABEL: Record<keyof ShareChoices, string> = {
  kcal: 'Calorie numbers',
  water: 'Water',
  activity: 'Activity',
  streak: 'Streak',
  week: 'Week',
  foods: 'Food names',
};

export const MEAL_ORDER: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

/** One day as the cards need it. */
export interface ShareDay {
  date: ISODate;
  /** Food logged that day. */
  logged: boolean;
  kcal: number;
  budget: number;
  /** Fully logged (the shared `isCompleteDay` rule), decided by the caller. */
  complete: boolean;
}

export interface ShareDayInput {
  date: ISODate;
  today: ISODate;
  units: UnitSystem;
  kcal: number;
  /** The day's own budget (exercise included as the day's rule adds it). */
  budget: number;
  /** Workout calories inside the budget (`DaySummary.exerciseAdded`, drawn as hatched headroom); 0 when none are added. */
  exerciseInBudget: number;
  /** kcal per meal, for the cup's bands. */
  mealKcal: Record<MealType, number>;
  /** Food names per meal, in logging order. Used only with `choices.foods`. */
  mealFoods: Record<MealType, string[]>;
  waterMl: number;
  waterGoalMl: number;
  /** Water logged as water that day (`hasWaterTracked`): the water stat shows only then, with the whole total (`waterMl`, diary drinks included). */
  waterLogged: boolean;
  activeMinutes: number;
  /** The forgiving streak from `useConsistency` (never re-computed here). */
  streak: number;
  /** Days of the week holding `date`, any order; missing days count as not logged. */
  week: ShareDay[];
}

export type StatKey = 'water' | 'activity' | 'streak' | 'budget' | 'kcal';

export interface ShareStat {
  key: StatKey;
  value: string;
  unit: string;
  label: string;
  /** 0..1 toward a goal to reach, when the stat has one (water). */
  progress?: number;
}

export interface WeekCup {
  date: ISODate;
  letter: string;
  /** eaten / that day's own budget. */
  ratio: number;
  logged: boolean;
  complete: boolean;
  over: boolean;
  future: boolean;
  /** Today: still open, drawn hatched. */
  isToday: boolean;
  /** Logged, closed and not fully logged: drawn in the lighter fill, as on the recap. */
  partial: boolean;
  /** Fully logged and on budget, at 90 to 100% of its own budget (`budgetMark`): the check. A day above it never has one. */
  onBudget: boolean;
}

export interface DayCardContent {
  kind: 'day';
  date: ISODate;
  overline: string;
  title: string;
  /** The day is still open (today). */
  inProgress: boolean;
  cup: {
    /** Cumulative tops of the meal bands, as shares of the budget, bottom first. `kcal` only when the figures are chosen. */
    bands: { meal: MealType; top: number; kcal?: number }[];
    /** eaten / budget (can pass 1). */
    level: number;
    over: boolean;
    /** Exercise share at the top of the budget, hatched. */
    headroom: number;
  };
  headline: { value: string; unit: string };
  verdict: string;
  stats: ShareStat[];
  week: WeekCup[] | null;
  foods: string | null;
  /** Everything the card says, in words, for the image's accessibility label and the share text. */
  summary: string;
}

const WEEKDAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);

export function weekCups(weekStart: ISODate, days: ShareDay[], today: ISODate): WeekCup[] {
  const byDate = new Map(days.map((d) => [d.date, d]));
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(weekStart, i);
    const d = byDate.get(date);
    const logged = !!d?.logged && date <= today;
    const ratio = logged && d && d.budget > 0 ? d.kcal / d.budget : 0;
    const complete = logged && !!d?.complete;
    return {
      date,
      letter: LETTERS[i],
      ratio,
      logged,
      complete,
      over: logged && ratio > 1,
      future: date > today,
      isToday: date === today,
      partial: logged && !complete && date !== today,
      onBudget: complete && !!d && budgetMark(d.kcal, d.budget) === 'on',
    };
  });
}

/** Neutral words for how the day stands against its own budget. Over is information, never failure. */
export function dayVerdict(kcal: number, budget: number, inProgress: boolean, logged: boolean): string {
  if (!logged) return inProgress ? 'Nothing logged yet today' : 'Nothing logged that day';
  const r = budget > 0 ? kcal / budget : 0;
  if (inProgress) return r > 1 ? 'Past the budget so far today' : 'So far today';
  // Above is anything over the budget (`budgetMark`): the cup's amber lip carries it, the words stay neutral.
  if (r <= 1) return 'Within the day’s budget';
  return 'Above the day’s budget';
}

/** Up to `max` distinct names in meal order, each cut to a readable length. */
export function foodList(mealFoods: Record<MealType, string[]>, max = 6): string | null {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const meal of MEAL_ORDER) {
    for (const raw of mealFoods[meal] ?? []) {
      const name = raw.trim();
      const key = name.toLowerCase();
      if (!name || seen.has(key)) continue;
      seen.add(key);
      names.push(name.length > 26 ? `${name.slice(0, 25).trimEnd()}…` : name);
    }
  }
  if (!names.length) return null;
  const shown = names.slice(0, max);
  const more = names.length - shown.length;
  return `${shown.join(', ')}${more > 0 ? ` and ${more} more` : ''}`;
}

export function dayCardContent(input: ShareDayInput, choices: ShareChoices): DayCardContent {
  const d = fromISODate(input.date);
  const inProgress = input.date === input.today;
  const budget = Math.max(0, input.budget);
  const logged = input.kcal > 0;
  const level = budget > 0 ? input.kcal / budget : 0;

  let acc = 0;
  const bands: { meal: MealType; top: number; kcal?: number }[] = [];
  for (const meal of MEAL_ORDER) {
    const k = Math.max(0, input.mealKcal[meal] ?? 0);
    if (k <= 0 || budget <= 0) continue;
    acc += k;
    bands.push(choices.kcal ? { meal, top: acc / budget, kcal: Math.round(k) } : { meal, top: acc / budget });
  }

  const headline = choices.kcal
    ? { value: formatNumber(Math.round(input.kcal)), unit: `of ${formatNumber(Math.round(budget))} kcal` }
    : // The share as every screen says it (`budgetSharePct`: floored and in step with the on-budget mark).
      { value: `${budgetSharePct(input.kcal, budget) ?? 0}%`, unit: inProgress ? 'of today’s budget' : 'of the day’s budget' };

  const stats: ShareStat[] = [];
  if (choices.water && input.waterLogged) {
    const reached = input.waterMl >= input.waterGoalMl && input.waterGoalMl > 0;
    const [value, ...unit] = formatVolume(input.waterMl, input.units).split(' ');
    stats.push({
      key: 'water',
      value,
      unit: unit.join(' '),
      label: reached ? 'water, goal reached' : `water of ${formatVolume(input.waterGoalMl, input.units).replace(/ /g, '\u00A0')}`,
      progress: input.waterGoalMl > 0 ? input.waterMl / input.waterGoalMl : 0,
    });
  }
  if (choices.activity && input.activeMinutes > 0) {
    stats.push({ key: 'activity', value: formatNumber(Math.round(input.activeMinutes)), unit: 'min', label: 'active' });
  }
  if (choices.streak && input.streak > 0) {
    stats.push({ key: 'streak', value: `${input.streak}`, unit: plural(input.streak, 'day'), label: 'logging streak' });
  }

  const week = choices.week ? weekCups(startOfWeek(input.date), input.week, input.today) : null;
  const foods = choices.foods ? foodList(input.mealFoods) : null;
  const verdict = dayVerdict(input.kcal, budget, inProgress, logged);
  const title = `My ${WEEKDAY_LONG[d.getDay()]}`;
  const overline = `${WEEKDAY_LONG[d.getDay()]}, ${MONTH_LONG[d.getMonth()]} ${d.getDate()}`.toUpperCase();

  const summary = [
    `${title}, ${MONTH_SHORT[d.getMonth()]} ${d.getDate()}.`,
    `${headline.value} ${headline.unit}.`,
    `${verdict}.`,
    ...stats.map((s) => `${s.value} ${s.unit} ${s.label}.`.replace(/\s+/g, ' ')),
    foods ? `On the plate: ${foods}.` : '',
  ]
    .filter(Boolean)
    .join(' ');

  return {
    kind: 'day',
    date: input.date,
    overline,
    title,
    inProgress,
    cup: { bands, level, over: level > 1, headroom: budget > 0 ? Math.min(1, Math.max(0, input.exerciseInBudget) / budget) : 0 },
    headline,
    verdict,
    stats,
    week,
    foods,
    summary,
  };
}

// --------------------------------------------------------------------- week

export interface ShareWeekInput {
  weekStart: ISODate;
  today: ISODate;
  units: UnitSystem;
  days: ShareDay[];
  /** Average intake and budget over the week's fully logged days (null without any). */
  avgKcal: number | null;
  avgBudget: number | null;
  waterDaysAtGoal: number;
  waterDaysTracked: number;
  guidelineMinutes: number;
  sessions: number;
  streak: number;
}

export interface WeekCardContent {
  kind: 'week';
  overline: string;
  title: string;
  /** The week is still open (it holds today). */
  inProgress: boolean;
  headline: string;
  cups: WeekCup[];
  stats: ShareStat[];
  summary: string;
}

/**
 * A week card writes its own headline from the facts it is allowed to show,
 * so a win about weight, or one quoting kcal when the figures are off, never
 * reaches it. The headline says the fact in words; the numbers are in the
 * stats under the cups, so the card never prints the same figure twice.
 */
export function weekHeadline(input: ShareWeekInput, cups: WeekCup[], choices: ShareChoices): string {
  const complete = cups.filter((c) => c.complete).length;
  const onBudget = cups.filter((c) => c.onBudget).length;
  const logged = cups.filter((c) => c.logged).length;
  const inProgress = cups.some((c) => c.isToday);
  const lines: { score: number; text: string }[] = [];
  if (complete >= 2 && onBudget / complete >= 0.6)
    lines.push({ score: onBudget / complete, text: onBudget === complete ? 'Every full day on budget.' : 'Most full days on budget.' });
  if (choices.activity && input.guidelineMinutes >= 150) lines.push({ score: 0.85, text: `Past the weekly 150 active minutes${inProgress ? ' already' : ''}.` });
  if (choices.water && input.waterDaysTracked >= 2 && input.waterDaysAtGoal / input.waterDaysTracked >= 0.7)
    lines.push({ score: input.waterDaysAtGoal / input.waterDaysTracked, text: input.waterDaysAtGoal === input.waterDaysTracked ? 'Water goal reached every day it was tracked.' : 'Water goal reached on most days.' });
  if (logged >= 6) lines.push({ score: 0.7, text: logged === 7 ? 'Food logged every day of the week.' : `Food logged on ${logged} of 7 days.` });
  lines.sort((a, b) => b.score - a.score);
  if (lines[0]) return lines[0].text;
  if (!logged) return inProgress ? 'A new week, nothing logged yet.' : 'Nothing logged this week.';
  return `Food logged on ${logged} ${plural(logged, 'day')}${inProgress ? ' so far' : ''}.`;
}

export function weekCardContent(input: ShareWeekInput, choices: ShareChoices): WeekCardContent {
  const cups = weekCups(input.weekStart, input.days, input.today);
  const start = fromISODate(input.weekStart);
  const end = fromISODate(addDays(input.weekStart, 6));
  const range =
    start.getMonth() === end.getMonth()
      ? `${MONTH_SHORT[start.getMonth()]} ${start.getDate()} – ${end.getDate()}`
      : `${MONTH_SHORT[start.getMonth()]} ${start.getDate()} – ${MONTH_SHORT[end.getMonth()]} ${end.getDate()}`;
  const complete = cups.filter((c) => c.complete).length;
  const onBudget = cups.filter((c) => c.onBudget).length;
  const inProgress = cups.some((c) => c.isToday);

  // With no fully logged day there is nothing to measure, so no "0 of 0".
  const stats: ShareStat[] = complete ? [{ key: 'budget', value: `${onBudget}`, unit: `of ${complete}`, label: `full ${plural(complete, 'day')} on budget` }] : [];
  if (choices.kcal && input.avgKcal !== null) stats.push({ key: 'kcal', value: formatNumber(Math.round(input.avgKcal)), unit: 'kcal', label: 'a day on average' });
  if (choices.water && input.waterDaysTracked > 0)
    stats.push({ key: 'water', value: `${input.waterDaysAtGoal}`, unit: `of ${input.waterDaysTracked}`, label: 'days, water goal reached', progress: input.waterDaysAtGoal / Math.max(1, input.waterDaysTracked) });
  if (choices.activity && input.guidelineMinutes > 0)
    stats.push({ key: 'activity', value: formatNumber(input.guidelineMinutes), unit: 'min', label: inProgress ? 'active so far' : 'active this week' });
  if (choices.streak && input.streak > 0) stats.push({ key: 'streak', value: `${input.streak}`, unit: plural(input.streak, 'day'), label: 'logging streak' });

  const headline = weekHeadline(input, cups, choices);
  const summary = [`My week${inProgress ? ' so far' : ''}, ${range}.`, headline, ...stats.map((s) => `${s.value} ${s.unit} ${s.label}.`)].join(' ');
  return { kind: 'week', overline: `WEEK OF ${range.toUpperCase()}`, title: 'My week', inProgress, headline, cups, stats, summary };
}
