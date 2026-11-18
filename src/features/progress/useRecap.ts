import { useMemo } from 'react';

import { addDays, diffDays, startOfWeek } from '@/lib/dates';
import { exerciseRuleOf, rangeRule } from '@/lib/exerciseBudget';
import { lastClosedWeek, planChangeText, recapTiles, recapWeeks, weeklyRecap } from '@/lib/insights';
import { useToday } from '@/store/clock';
import { useDays, useEnergyModel, useLive, useProfile, useWeightSeries } from '@/store/selectors';
import type { ISODate } from '@/types';

/** How far back the list of earlier weeks looks. */
const MAX_WEEKS_BACK = 12;

/** Everything the weekly check-in shows for one Monday-based week (default: the last closed week). */
export function useRecap(weekParam?: string) {
  const profile = useProfile();
  const today = useToday();
  const sleep = useLive('sleep');
  const series = useWeightSeries();
  const thisWeek = startOfWeek(today);
  const valid = typeof weekParam === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(weekParam);
  const week: ISODate = valid ? startOfWeek(weekParam as ISODate) : lastClosedWeek(today);
  const future = week > thisWeek;
  // The chosen week, the one before it (for comparison) and the earlier-weeks list.
  const oldest = [addDays(week, -7), addDays(lastClosedWeek(today), -7 * MAX_WEEKS_BACK)].sort()[0];
  const n = Math.min(400, Math.max(21, diffDays(oldest, today) + 1));
  const days = useDays(n, today);
  // Budget at the start of the chosen week and of the following week (or today, for the week in progress).
  const nextStart = addDays(week, 7) <= today ? addDays(week, 7) : today;
  const before = useEnergyModel(future ? today : week);
  const after = useEnergyModel(nextStart);

  return useMemo(() => {
    const recap = future ? null : weeklyRecap({ days, trend: series.trend, sleep, today, units: profile.units, goal: profile.goal, week });
    const plan = {
      before: Math.round(before.target.target),
      after: Math.round(after.target.target),
      afterDate: nextStart,
      reason: planChangeText(
        { target: before.target.target, tdee: before.tdee, usingAdaptive: before.usingAdaptive },
        { target: after.target.target, tdee: after.tdee, usingAdaptive: after.usingAdaptive },
      ),
    };
    // A week not yet begun has no days: it is described by the current rule.
    const weekDays = days.filter((x) => x.date >= week && x.date < addDays(week, 7));
    const earlier = recapWeeks(days, today, MAX_WEEKS_BACK).filter((w) => w !== week);
    const lastClosed = lastClosedWeek(today);
    return {
      today,
      week,
      recap,
      tiles: recap ? recapTiles(recap) : [],
      plan,
      earlier: week !== lastClosed ? [lastClosed, ...earlier.filter((w) => w !== lastClosed)] : earlier,
      // The rules the recapped week's days had (it may lie before a change of rule), not today's.
      exerciseRule: weekDays.length ? rangeRule(weekDays.map((x) => x.exerciseRule)) : exerciseRuleOf(profile),
    };
  }, [days, series.trend, sleep, today, profile, week, future, before, after, nextStart]);
}
