import { useMemo } from 'react';

import { diffDays } from '@/lib/dates';
import {
  computeMilestones,
  generateInsights,
  isCompleteDay,
  usualKcalRange,
  usualWeightRange,
  recapWeeks,
  summarizePeriod,
  weeklyRecap,
  type InsightDay,
} from '@/lib/insights';
import { useToday } from '@/store/clock';
import { useConsistency, useDays, useEnergyModel, useLive, useProfile, useWeightSeries } from '@/store/selectors';
import type { ISODate } from '@/types';

export type RangeDays = 7 | 30 | 90;

/** Longest history the milestones look at. */
const MAX_HISTORY = 400;

/** Everything the Progress tab shows, derived once per data change. */
export function useProgressData(range: RangeDays) {
  const profile = useProfile();
  const t = useToday();
  const food = useLive('foodEntries');
  const activities = useLive('activities');
  const water = useLive('water');
  const weights = useLive('weights');
  const sleep = useLive('sleep');

  const firstDate = useMemo<ISODate | null>(() => {
    let min: ISODate | null = null;
    for (const list of [food, activities, water, weights, sleep] as { date: ISODate }[][]) {
      for (const r of list) if (!min || r.date < min) min = r.date;
    }
    return min;
  }, [food, activities, water, weights, sleep]);
  const historyDays = firstDate ? Math.min(MAX_HISTORY, Math.max(1, diffDays(firstDate, t) + 1)) : 1;

  // One run of day summaries covers the range and the equal period before it, the recap (two weeks) and the milestones.
  const all = useDays(Math.max(range * 2, historyDays, 21), t);
  const model = useEnergyModel(t);
  const series = useWeightSeries();
  const consistency = useConsistency(t);

  return useMemo(() => {
    const days: InsightDay[] = all.slice(-range);
    const summary = summarizePeriod({ days, trend: series.trend, sleep, today: t });
    // The equal period just before, for neutral 'than the previous 30 days' comparisons.
    const prevDays: InsightDay[] = all.slice(-range * 2, -range);
    const prevSummary = prevDays.length === range ? summarizePeriod({ days: prevDays, trend: series.trend, sleep, today: t }) : null;
    const previous = prevSummary && prevSummary.effectiveDays > 0 ? prevSummary : null;
    const insights = generateInsights({
      summary,
      days,
      sleep,
      today: t,
      units: profile.units,
      goal: profile.goal,
      chosenWeeklyKg: profile.weeklyRateKg,
      weightKg: profile.weightKg,
      currentWeeklyRateKg: series.weeklyRateKg,
      weighInsTotal: series.entries.length,
      lastWeighIn: series.latest?.date ?? null,
      energy: {
        formulaTdee: model.formulaTdee,
        adaptive: model.adaptive,
        usingAdaptive: model.usingAdaptive,
        useAdaptiveSetting: profile.useAdaptiveTdee,
        tdee: model.tdee,
      },
      streak: consistency.streak,
    });
    // Always the last closed week, so its numbers no longer move.
    const recap = weeklyRecap({ days: all.slice(-21), trend: series.trend, sleep, today: t, units: profile.units, goal: profile.goal });
    const history = all.slice(-historyDays);
    const milestones = computeMilestones({
      days: history,
      weighInDates: series.entries.map((w) => w.date),
      trend: series.trend,
      goal: profile.goal,
      units: profile.units,
    });
    const earlierWeeks = recapWeeks(history, t, 3);
    // Closed, fully logged days across all history: decides the early state.
    const completeEver = history.filter((d) => isCompleteDay(d, t)).length;
    return {
      today: t,
      profile,
      days: all.slice(-range),
      weekDays: all.slice(-14),
      summary,
      previous,
      // The user's own usual ranges (middle half of the last 28 days), for chart bands.
      usualKcal: usualKcalRange(all, t),
      usualWeight: usualWeightRange(series.entries, t),
      insights,
      recap,
      earlierWeeks,
      milestones,
      model,
      series,
      consistency,
      completeEver,
      historyDays: firstDate ? historyDays : 0,
    };
  }, [all, range, series, sleep, t, profile, model, consistency, historyDays, firstDate]);
}

export type ProgressData = ReturnType<typeof useProgressData>;
