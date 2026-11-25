import { useMemo } from 'react';

import { hasFoodLogged } from '@/features/drinks/via';
import { displayFoodName } from '@/features/food/displayName';
import { budgetDaysVerdict } from '@/features/progress/recapDays';
import type { SharePeriodInput } from '@/features/share/periodContent';
import { diffDays } from '@/lib/dates';
import { isCompleteDay } from '@/lib/insights';
import { useToday } from '@/store/clock';
import { foodLoggedDates, useDays, useLive, useProfile, useWeightSeries } from '@/store/selectors';
import type { ISODate } from '@/types';

import { activityFacts, topFoods, waterFacts } from './facts';
import {
  countedSpan,
  defaultMonth,
  defaultYear,
  loggedBetween,
  monthPeriod,
  monthTallies,
  monthsSince,
  parseMonthKey,
  parseYearKey,
  periodRows,
  periodTally,
  yearPeriod,
  yearsSince,
  type DayFacts,
  type PeriodKind,
} from './period';

/** The first record on the phone (food, a workout, a weigh-in or water), as the Consistency calendar finds it. */
export function useFirstDate(today: ISODate): ISODate | null {
  const food = useLive('foodEntries');
  const activities = useLive('activities');
  const weights = useLive('weights');
  const water = useLive('water');
  return useMemo(() => {
    let min: ISODate | null = null;
    for (const list of [food, activities, weights, water] as { date: ISODate }[][]) {
      for (const r of list) if (r.date <= today && (!min || r.date < min)) min = r.date;
    }
    return min;
  }, [food, activities, weights, water, today]);
}

/** How many months the month page lists to open. */
const OTHER_MONTHS = 12;

/** Everything a month's or a year's recap shows, for `param` (a `?month=` or `?year=`; the default when absent or wrong). */
export function usePeriodRecap(kind: PeriodKind, param: unknown) {
  const today = useToday();
  const profile = useProfile();
  const food = useLive('foodEntries');
  const series = useWeightSeries();
  const firstDate = useFirstDate(today);
  const key = kind === 'month' ? (parseMonthKey(param) ?? defaultMonth(today, firstDate)) : (parseYearKey(param) ?? defaultYear(today, firstDate));
  const period = useMemo(() => (kind === 'month' ? monthPeriod(key) : yearPeriod(key)), [kind, key]);
  const counted = countedSpan(period, today, firstDate);
  const from = counted?.from ?? null;
  const to = counted?.to ?? null;
  // Only the days the figures cover (at most a year): never before the first record, never after today.
  const days = useDays(from && to ? diffDays(from, to) + 1 : 1, to ?? today);

  return useMemo(() => {
    const span = from && to ? { from, to } : null;
    const inSpan = span ? days.filter((d) => d.date >= span.from && d.date <= span.to) : [];
    const facts: DayFacts[] = inSpan.map((d) => ({ date: d.date, logged: hasFoodLogged(d.entries), complete: isCompleteDay(d, today), kcal: d.eaten.kcal, budget: d.budget }));
    const byDate = new Map(facts.map((f) => [f.date, f]));
    const rows = periodRows(period, byDate, today, firstDate);
    const tally = periodTally(period, byDate, today, firstDate);
    const water = waterFacts(inSpan, today);
    const activity = activityFacts(inSpan);
    const complete = inSpan.filter((d) => isCompleteDay(d, today));
    const avgKcal = complete.length ? complete.reduce((s, d) => s + d.eaten.kcal, 0) / complete.length : null;
    const foods = span ? topFoods(food, span.from, span.to) : [];

    // The smoothed weight trend over the span, only with two weigh-ins in it. On the screen only: never on a card.
    const trendIn = span ? series.trend.filter((t) => t.date >= span.from && t.date <= span.to) : [];
    const weighIns = trendIn.filter((t) => !t.interpolated).length;
    const weight = trendIn.length >= 2 && weighIns >= 2 ? { first: trendIn[0], last: trendIn[trendIn.length - 1], points: trendIn, weighIns } : null;

    const logged = foodLoggedDates(food);
    const months = monthTallies(period, logged, today, firstDate);
    const otherMonths =
      kind === 'month'
        ? monthsSince(firstDate, today, OTHER_MONTHS + 1)
            .filter((m) => m !== key)
            .slice(0, OTHER_MONTHS)
            .map((m) => {
              const s = countedSpan(monthPeriod(m), today, firstDate);
              return { month: m, logged: s ? loggedBetween(logged, s.from, s.to) : 0, elapsed: s ? diffDays(s.from, s.to) + 1 : 0 };
            })
        : [];
    const years = yearsSince(firstDate, today).map((y) => {
      const s = countedSpan(yearPeriod(y), today, firstDate);
      return { year: y, logged: s ? loggedBetween(logged, s.from, s.to) : 0, elapsed: s ? diffDays(s.from, s.to) + 1 : 0 };
    });

    const share: SharePeriodInput = {
      period,
      today,
      units: profile.units,
      rows,
      tally,
      avgKcal,
      activity,
      water,
      foods: foods.map((f) => displayFoodName(f)),
    };
    return {
      today,
      firstDate,
      period,
      units: profile.units,
      rows,
      tally,
      verdict: budgetDaysVerdict(tally.counts),
      water,
      activity,
      foods,
      weight,
      months,
      otherMonths,
      years,
      share,
    };
  }, [from, to, days, today, period, firstDate, food, series.trend, kind, key, profile.units]);
}
