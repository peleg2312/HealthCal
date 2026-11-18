import { useMemo } from 'react';

import { hasFoodLogged } from '@/features/drinks/via';
import { addDays, startOfWeek } from '@/lib/dates';
import { isCompleteDay, type WeeklyRecap } from '@/lib/insights';
import { useToday } from '@/store/clock';
import { useConsistency, useDay, useDays, useProfile, type DaySummary } from '@/store/selectors';
import type { ISODate, MealType } from '@/types';

import { MEAL_ORDER, type ShareDay, type ShareDayInput, type ShareWeekInput } from './content';

function shareDay(d: DaySummary | WeeklyRecap['days'][number], today: ISODate): ShareDay {
  return { date: d.date, logged: hasFoodLogged(d.entries), kcal: d.eaten.kcal, budget: d.budget, complete: isCompleteDay(d, today) };
}

/** Everything a day card may show, read from the store. Weight is not read at all. */
export function useShareDayInput(date: ISODate): ShareDayInput {
  const today = useToday();
  const profile = useProfile();
  const day = useDay(date);
  const week = useDays(7, addDays(startOfWeek(date), 6));
  // The forgiving streak as of the shared day.
  const consistency = useConsistency(date <= today ? date : today);
  return useMemo(() => {
    const mealKcal = {} as Record<MealType, number>;
    const mealFoods = {} as Record<MealType, string[]>;
    for (const m of MEAL_ORDER) {
      mealKcal[m] = day.byMeal[m].reduce((s, e) => s + e.nutrients.kcal, 0);
      mealFoods[m] = day.byMeal[m].map((e) => e.name);
    }
    return {
      date,
      today,
      units: profile.units,
      kcal: day.eaten.kcal,
      budget: day.budget,
      exerciseInBudget: Math.max(0, day.exerciseAdded),
      mealKcal,
      mealFoods,
      waterMl: day.waterMl,
      waterGoalMl: day.waterGoalMl,
      waterLogged: day.waterEntries.length > 0,
      activeMinutes: day.activeMinutes,
      streak: consistency.streak,
      week: week.map((d) => shareDay(d, today)),
    };
  }, [date, today, profile.units, day, week, consistency.streak]);
}

/** A week card's facts from a weekly recap. */
export function useShareWeekInput(recap: WeeklyRecap): ShareWeekInput {
  const today = useToday();
  const profile = useProfile();
  const end = addDays(recap.weekStart, 6);
  const consistency = useConsistency(end <= today ? end : today);
  return useMemo(() => {
    const s = recap.summary;
    return {
      weekStart: recap.weekStart,
      today,
      units: profile.units,
      days: recap.days.map((d) => shareDay(d, today)),
      avgKcal: s.calories?.avgKcal ?? null,
      avgBudget: s.calories?.avgBudget ?? null,
      waterDaysAtGoal: s.water?.daysAtGoal ?? 0,
      waterDaysTracked: s.water?.daysTracked ?? 0,
      guidelineMinutes: Math.round(s.activity.guidelineMinutes),
      sessions: s.activity.sessions,
      streak: consistency.streak,
    };
  }, [recap, today, profile.units, consistency.streak]);
}
