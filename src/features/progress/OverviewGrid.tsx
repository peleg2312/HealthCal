import React from 'react';

import { compareText, confidenceWord, hoursText, kcalText, rateText, WEEKLY_ACTIVE_MINUTES, type PeriodSummary } from '@/lib/insights';
import { formatNumber, formatVolume, formatWeight, weightUnit, weightValue } from '@/lib/units';
import { useTheme } from '@/theme';
import type { TrendPoint } from '@/lib/trend';
import { Card } from '@/ui';

import { ProgressTile } from './ProgressTile';
import type { ProgressData } from './useProgressData';

export type ProgressSegment = 'overview' | 'nutrition' | 'body' | 'habits';

function avgTrend(trend: TrendPoint[], start: string, end: string): number | null {
  const pts = trend.filter((t) => t.date >= start && t.date <= end);
  return pts.length ? pts.reduce((s, t) => s + t.trend, 0) / pts.length : null;
}

/** Eight tiles, one number each, built from what useProgressData already returns. */
export function OverviewGrid({ d, range, onOpen }: { d: ProgressData; range: number; onOpen: (s: ProgressSegment) => void }) {
  const { colors } = useTheme();
  const s: PeriodSummary = d.summary;
  const p = d.previous;
  const period = `${range} days`;
  const units = d.profile.units;
  const start = d.days[0].date;
  const prevStart = p?.start ?? null;

  const c = s.calories;
  const protein = s.macros?.protein ?? null;
  const w = s.water;
  const a = s.activity;
  const sl = s.sleep;
  const weekly = Math.round(a.weeklyMinutes);

  const trendNow = avgTrend(d.series.trend, start, d.today);
  const trendPrev = prevStart && p ? avgTrend(d.series.trend, prevStart, p.end) : null;
  const rate = d.series.weeklyRateKg;

  // Both counts include every logged day of their period (today too), matching the headline above.
  const loggedDiff = p ? s.loggedDaysInclToday - p.loggedDaysInclToday : null;
  const loggedCompare =
    loggedDiff === null || p?.effectiveDays === 0
      ? null
      : loggedDiff === 0
        ? `Same number of logged days as the previous ${period}`
        : `${Math.abs(loggedDiff)} ${loggedDiff > 0 ? 'more' : 'fewer'} logged ${Math.abs(loggedDiff) === 1 ? 'day' : 'days'} than the previous ${period}`;

  const adaptive = d.model.usingAdaptive;

  return (
    // One card divided by hairlines, two columns (the designer's 2 x 4 grid).
    <Card padding={0} testID="progress-overview-grid" style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
      <ProgressTile
        testID="progress-tile-calories"
        index={0}
        borderRight
        title="Calories"
        color={colors.calories}
        valueColor="caloriesInk"
        value={c ? formatNumber(Math.round(c.avgKcal)) : null}
        unit="kcal"
        caption={c ? `a day · budget ${formatNumber(Math.round(c.avgBudget))}` : 'No fully logged days yet'}
        compare={compareText(c?.avgKcal, p?.calories?.avgKcal, { period, format: (n) => kcalText(n), same: 20 })}
        onPress={() => onOpen('nutrition')}
      />
      <ProgressTile
        testID="progress-tile-weight"
        index={1}
        title="Weight trend"
        color={colors.weight}
        value={d.series.trendKg !== null ? weightValue(d.series.trendKg, units).toFixed(1) : null}
        unit={weightUnit(units)}
        caption={rate !== null ? `${rate > 0 ? '+' : rate < 0 ? '−' : ''}${rateText(rate, units)} a week` : 'Rate after a week of weigh-ins'}
        compare={compareText(trendNow, trendPrev, { period, format: (n) => formatWeight(n, units), same: 0.05, more: 'higher', less: 'lower' })}
        onPress={() => onOpen('body')}
      />
      <ProgressTile
        testID="progress-tile-protein"
        index={2}
        borderRight
        borderTop
        title="Protein"
        color={colors.protein}
        value={protein ? `${Math.round(protein.avg)}` : null}
        unit="g"
        caption={protein ? `a day · target ${Math.round(protein.target)} g` : 'No fully logged days yet'}
        compare={compareText(protein?.avg, p?.macros?.protein.avg, { period, format: (n) => `${Math.round(n)} g`, same: 2 })}
        onPress={() => onOpen('nutrition')}
      />
      <ProgressTile
        testID="progress-tile-expenditure"
        index={3}
        borderTop
        title="Expenditure"
        color={colors.calories}
        keyVariant="outline"
        value={formatNumber(Math.round(d.model.tdee))}
        unit="kcal"
        caption={adaptive ? `a day · confidence ${confidenceWord(d.model.adaptive.confidence)}` : 'a day · formula estimate'}
        compare={adaptive ? `Formula alone says ${kcalText(d.model.formulaTdee)}` : d.model.adaptive.needs ? `Your data estimate needs ${d.model.adaptive.needs}` : null}
        onPress={() => onOpen('body')}
      />
      <ProgressTile
        testID="progress-tile-water"
        index={4}
        borderRight
        borderTop
        title="Water"
        color={colors.water}
        value={w ? `${w.daysAtGoal}` : null}
        unit={w ? `of ${w.daysTracked} days` : undefined}
        caption={w ? `at goal · ${formatVolume(w.avgMl, units)} a day` : 'No drinks logged yet'}
        compare={compareText(w?.avgMl, p?.water?.avgMl, {
          period,
          format: (n) => formatVolume(n, units),
          same: 50,
          more: 'more a day',
          less: 'less a day',
        })}
        onPress={() => onOpen('habits')}
      />
      <ProgressTile
        testID="progress-tile-activity"
        index={5}
        borderTop
        title="Activity"
        color={colors.exercise}
        value={a.minutes ? `${weekly}` : null}
        unit="min"
        caption={a.minutes ? `a week · guideline ${WEEKLY_ACTIVE_MINUTES} · ${a.sessions} ${a.sessions === 1 ? 'session' : 'sessions'}` : 'No workouts logged yet'}
        compare={a.minutes || (p && p.activity.minutes) ? compareText(weekly, p ? Math.round(p.activity.weeklyMinutes) : null, { period, format: (n) => `${Math.round(n)} min a week`, same: 5 }) : null}
        onPress={() => onOpen('habits')}
      />
      <ProgressTile
        testID="progress-tile-sleep"
        index={6}
        borderRight
        borderTop
        title="Sleep"
        color={colors.sleep}
        value={sl ? hoursText(sl.avgHours).replace(' h', '') : null}
        unit="h"
        caption={sl ? `a night · ${sl.nights} ${sl.nights === 1 ? 'night' : 'nights'} logged` : 'No sleep logged yet'}
        compare={compareText(sl?.avgHours, p?.sleep?.avgHours, { period, format: (n) => hoursText(n), same: 0.1, more: 'longer', less: 'shorter' })}
        onPress={() => onOpen('habits')}
      />
      <ProgressTile
        testID="progress-tile-consistency"
        index={7}
        borderTop
        title="Consistency"
        color={colors.text}
        value={`${d.consistency.streak}`}
        unit={d.consistency.streak === 1 ? 'day streak' : 'day streak'}
        caption={`${s.loggedDaysInclToday} of ${Math.max(s.effectiveDays, s.loggedDaysInclToday)} days logged`}
        compare={loggedCompare}
        onPress={() => onOpen('habits')}
      />
    </Card>
  );
}
