/**
 * Derived data. Pure `compute*` functions take plain state so they can be used
 * outside React (notifications, sync, tests); the `use*` hooks memoise them.
 */
import { useMemo } from 'react';

import { addDays, diffDays, lastNDates, startOfWeek, today } from '@/lib/dates';
import { bmr, calorieTarget, formulaTdee, macroTargets, type BmrMethod, type CalorieTarget, type MacroTargets } from '@/lib/energy';
import { baseWaterGoalMl, effectiveMl, exerciseWaterMl } from '@/lib/hydration';
import { entriesTotal } from '@/lib/nutrition';
import { adaptiveTdee, weightTrend, weeklyRate, type AdaptiveTdee, type TrendPoint } from '@/lib/trend';
import type {
  ActivityEntry,
  FoodEntry,
  ISODate,
  MealType,
  Nutrients,
  Profile,
  SyncedRecord,
  WaterEntry,
  WeightEntry,
} from '@/types';

import { useStore, type Store } from './index';

export function live<T extends SyncedRecord>(map: Record<string, T>): T[] {
  return Object.values(map).filter((r) => !r.deleted);
}

// ------------------------------------------------------------ energy model

export interface EnergyModel {
  bmr: number;
  bmrMethod: BmrMethod;
  formulaTdee: number;
  adaptive: AdaptiveTdee;
  /** Expenditure actually used for targets. */
  tdee: number;
  usingAdaptive: boolean;
  target: CalorieTarget;
}

export function intakeByDate(entries: FoodEntry[]): Record<ISODate, number> {
  const out: Record<ISODate, number> = {};
  for (const e of entries) out[e.date] = (out[e.date] ?? 0) + e.nutrients.kcal;
  return out;
}

export function computeEnergyModel(
  profile: Profile,
  foodEntries: FoodEntry[],
  weights: WeightEntry[],
  end: ISODate = today(),
): EnergyModel {
  const b = bmr(profile);
  const formula = formulaTdee(profile);
  // Yesterday is the last complete day; today's partial log would bias intake low.
  const adaptive = adaptiveTdee({
    formulaTdee: formula,
    weights: weights.map((w) => ({ date: w.date, kg: w.kg })),
    intakeByDate: intakeByDate(foodEntries),
    end: addDays(end, -1),
  });
  const usingAdaptive = profile.useAdaptiveTdee && adaptive.observed !== null;
  const tdee = usingAdaptive ? adaptive.tdee : formula;
  return {
    bmr: b.kcal,
    bmrMethod: b.method,
    formulaTdee: formula,
    adaptive,
    tdee,
    usingAdaptive,
    target: calorieTarget(profile, tdee),
  };
}

// --------------------------------------------------------------- day view

export interface DaySummary {
  date: ISODate;
  entries: FoodEntry[];
  byMeal: Record<MealType, FoodEntry[]>;
  eaten: Nutrients;
  activities: ActivityEntry[];
  exerciseNet: number;
  exerciseGross: number;
  activeMinutes: number;
  /** Base target, before exercise. */
  target: number;
  /** Target plus exercise when the user eats exercise calories back. */
  budget: number;
  /** budget - eaten; negative when over. */
  remaining: number;
  macros: MacroTargets;
  waterEntries: WaterEntry[];
  /** Hydration-weighted intake in ml. */
  waterMl: number;
  waterGoalMl: number;
  waterRemainingMl: number;
}

export function computeDay(
  date: ISODate,
  profile: Profile,
  model: EnergyModel,
  foodEntries: FoodEntry[],
  activities: ActivityEntry[],
  water: WaterEntry[],
): DaySummary {
  const entries = foodEntries.filter((e) => e.date === date).sort((a, b) => a.loggedAt.localeCompare(b.loggedAt));
  const byMeal: Record<MealType, FoodEntry[]> = { breakfast: [], lunch: [], dinner: [], snack: [] };
  for (const e of entries) byMeal[e.meal].push(e);
  const eaten = entriesTotal(entries);

  const dayActivities = activities.filter((a) => a.date === date).sort((a, b) => a.loggedAt.localeCompare(b.loggedAt));
  const exerciseNet = dayActivities.reduce((s, a) => s + a.kcalNet, 0);
  const exerciseGross = dayActivities.reduce((s, a) => s + a.kcalGross, 0);
  const activeMinutes = dayActivities.reduce((s, a) => s + a.durationMin, 0);

  const target = model.target.target;
  const budget = Math.round(target + (profile.eatBackExercise ? exerciseNet : 0));

  const waterEntries = water.filter((w) => w.date === date).sort((a, b) => a.loggedAt.localeCompare(b.loggedAt));
  const waterMl = Math.round(waterEntries.reduce((s, w) => s + effectiveMl(w.ml, w.beverage), 0));
  const waterGoalMl =
    profile.waterGoalMlOverride && profile.waterGoalMlOverride > 0
      ? profile.waterGoalMlOverride
      : baseWaterGoalMl(profile.weightKg, profile.sex) + exerciseWaterMl(dayActivities);

  return {
    date,
    entries,
    byMeal,
    eaten,
    activities: dayActivities,
    exerciseNet: Math.round(exerciseNet),
    exerciseGross: Math.round(exerciseGross),
    activeMinutes,
    target,
    budget,
    remaining: Math.round(budget - eaten.kcal),
    macros: macroTargets(profile, budget),
    waterEntries,
    waterMl,
    waterGoalMl,
    waterRemainingMl: Math.max(0, waterGoalMl - waterMl),
  };
}

/** Everything a non-React caller (notifications, widgets) needs for one day. */
export function computeDayFromStore(s: Store, date: ISODate = today()): DaySummary | null {
  if (!s.profile?.onboardedAt) return null;
  const food = live(s.foodEntries);
  const model = computeEnergyModel(s.profile, food, live(s.weights), date);
  return computeDay(date, s.profile, model, food, live(s.activities), live(s.water));
}

// ------------------------------------------------------------------ hooks

export function useProfile(): Profile {
  const p = useStore((s) => s.profile);
  if (!p) throw new Error('useProfile used before onboarding finished');
  return p;
}

export function useLive<K extends 'foodEntries' | 'activities' | 'water' | 'weights' | 'sleep' | 'fasting' | 'savedMeals' | 'customFoods' | 'favorites'>(
  collection: K,
): Store[K][string][] {
  const map = useStore((s) => s[collection]);
  return useMemo(() => live(map as Record<string, SyncedRecord>) as Store[K][string][], [map]);
}

/** `date` is the day the model is for; pass `useToday()` so it rolls over at midnight. */
export function useEnergyModel(date: ISODate): EnergyModel {
  const profile = useProfile();
  const food = useLive('foodEntries');
  const weights = useLive('weights');
  return useMemo(() => computeEnergyModel(profile, food, weights, date), [profile, food, weights, date]);
}

export function useDay(date: ISODate): DaySummary {
  const profile = useProfile();
  const food = useLive('foodEntries');
  const weights = useLive('weights');
  const activities = useLive('activities');
  const water = useLive('water');
  return useMemo(() => {
    const model = computeEnergyModel(profile, food, weights, date);
    return computeDay(date, profile, model, food, activities, water);
  }, [date, profile, food, weights, activities, water]);
}

/** Summaries for a run of days ending at `end`, oldest first. */
export function useDays(count: number, end: ISODate): DaySummary[] {
  const profile = useProfile();
  const food = useLive('foodEntries');
  const weights = useLive('weights');
  const activities = useLive('activities');
  const water = useLive('water');
  return useMemo(() => {
    const model = computeEnergyModel(profile, food, weights, end);
    return lastNDates(count, end).map((d) => computeDay(d, profile, model, food, activities, water));
  }, [count, end, profile, food, weights, activities, water]);
}

export interface WeightSeries {
  entries: WeightEntry[];
  trend: TrendPoint[];
  latest: WeightEntry | null;
  /** Current smoothed weight. */
  trendKg: number | null;
  /** kg per week over the last two weeks, signed. */
  weeklyRateKg: number | null;
  startKg: number | null;
}

export function useWeightSeries(): WeightSeries {
  const weights = useLive('weights');
  return useMemo(() => {
    const entries = [...weights].sort((a, b) => a.date.localeCompare(b.date));
    const trend = weightTrend(entries.map((w) => ({ date: w.date, kg: w.kg })));
    return {
      entries,
      trend,
      latest: entries[entries.length - 1] ?? null,
      trendKg: trend.length ? trend[trend.length - 1].trend : null,
      weeklyRateKg: weeklyRate(trend),
      startKg: entries[0]?.kg ?? null,
    };
  }, [weights]);
}

export interface Consistency {
  /** Consecutive days with something logged; one missed day does not break it. */
  streak: number;
  /** Days with food logged in the current Monday-based week. */
  daysThisWeek: number;
  loggedToday: boolean;
  totalDaysLogged: number;
}

/**
 * Streaks are deliberately forgiving: a single missed day is bridged, because
 * all-or-nothing streaks punish exactly the people who most need to come back.
 */
export function computeConsistency(dates: Set<ISODate>, end: ISODate = today()): Consistency {
  let streak = 0;
  let cursor = end;
  let graceUsed = false;
  // Today not logged yet should not read as a broken streak.
  if (!dates.has(cursor)) cursor = addDays(cursor, -1);
  while (true) {
    if (dates.has(cursor)) {
      streak += 1;
      cursor = addDays(cursor, -1);
    } else if (!graceUsed && dates.has(addDays(cursor, -1))) {
      graceUsed = true;
      cursor = addDays(cursor, -1);
    } else break;
  }
  // Monday-based week up to and including `end` (the field is documented as the current week, not a rolling 7 days).
  const week = lastNDates(diffDays(startOfWeek(end), end) + 1, end).filter((d) => dates.has(d)).length;
  return { streak, daysThisWeek: week, loggedToday: dates.has(end), totalDaysLogged: dates.size };
}

export function useConsistency(end: ISODate): Consistency {
  const food = useLive('foodEntries');
  return useMemo(() => computeConsistency(new Set(food.map((e) => e.date)), end), [food, end]);
}
