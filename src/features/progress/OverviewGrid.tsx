import React from 'react';
import { View } from 'react-native';

import { WEEKLY_ACTIVE_MINUTES, type PeriodSummary } from '@/lib/insights';
import { hoursFigure, hoursSpoken } from '@/features/trackers/helpers';
import { formatNumber, formatVolume, weightUnit, weightValue } from '@/lib/units';
import { useTheme } from '@/theme';
import type { TrendPoint } from '@/lib/trend';
import { Card } from '@/ui';

import { changeDirection, changeWords } from './change';
import { TrendLegend } from './parts';

import { weeklyRateText } from './goalDate';
import { ProgressTile } from './ProgressTile';
import type { ProgressData } from './useProgressData';

export type ProgressSegment = 'overview' | 'nutrition' | 'body' | 'habits';

function avgTrend(trend: TrendPoint[], start: string, end: string): number | null {
  const pts = trend.filter((t) => t.date >= start && t.date <= end);
  return pts.length ? pts.reduce((s, t) => s + t.trend, 0) / pts.length : null;
}

/**
 * Eight tiles, one number each, built from what useProgressData already returns. Each tile is its
 * number, a mark against the previous equal period and one line of context; the comparison in
 * words is read out with the tile, and every detail is one tap away (Nutrition, Body, Habits).
 * The mark is a triangle only for a change worth calling, by each measure's own rule (`change.ts`:
 * 100 kcal and 5% for calories, ...), else a dash; the spoken words always say the size.
 */
export function OverviewGrid({ d, range, onOpen }: { d: ProgressData; range: number; onOpen: (s: ProgressSegment) => void }) {
  const { colors, spacing } = useTheme();
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
  const waterShare = (x: PeriodSummary['water']) => (x && x.daysTracked > 0 ? x.daysAtGoal / x.daysTracked : null);

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
        caption={c ? `a day · budget ${formatNumber(Math.round(c.avgBudget))}` : 'No full days yet'}
        captionShort={c ? `budget ${formatNumber(Math.round(c.avgBudget))}` : 'No full days yet'}
        compare={changeWords('kcal', c?.avgKcal, p?.calories?.avgKcal, { period })}
        trend={changeDirection('kcal', c?.avgKcal, p?.calories?.avgKcal)}
        period={period}
        onPress={() => onOpen('nutrition')}
      />
      <ProgressTile
        testID="progress-tile-weight"
        index={1}
        title="Weight trend"
        color={colors.weight}
        value={d.series.trendKg !== null ? weightValue(d.series.trendKg, units).toFixed(1) : null}
        unit={weightUnit(units)}
        caption={rate !== null ? weeklyRateText(rate, units) : 'Rate after a week'}
        compare={changeWords('weight', trendNow, trendPrev, { period, units })}
        trend={changeDirection('weight', trendNow, trendPrev)}
        period={period}
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
        // "Target" is the calorie number only: protein has a goal.
        caption={protein ? `a day · goal ${Math.round(protein.target)} g` : 'No full days yet'}
        captionShort={protein ? `goal ${Math.round(protein.target)} g` : 'No full days yet'}
        compare={changeWords('protein', protein?.avg, p?.macros?.protein.avg, { period })}
        trend={changeDirection('protein', protein?.avg, p?.macros?.protein.avg)}
        period={period}
        onPress={() => onOpen('nutrition')}
      />
      <ProgressTile
        testID="progress-tile-expenditure"
        index={3}
        borderTop
        title="You burn"
        color={colors.calories}
        keyVariant="outline"
        // An estimate: "~" before the figure ("about" aloud), said so in its one line and by the outlined key;
        // how it is worked out is under "Where this number comes from" on Body.
        value={`~${formatNumber(Math.round(d.model.tdee))}`}
        unit="kcal"
        caption="a day, an estimate"
        captionShort="an estimate"
        spoken={`about ${formatNumber(Math.round(d.model.tdee))} kcal a day, an estimate`}
        compare={
          adaptive
            ? d.model.adaptive.confidence >= 0.75
              ? 'A settled estimate, before workouts'
              : 'An estimate that firms up as you log'
            : d.model.adaptive.needs
              ? `Learns from your logs after ${d.model.adaptive.needs}`
              : 'An estimate, before workouts'
        }
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
        captionShort={w ? 'at goal' : 'No drinks yet'}
        // The mark and its words compare the number shown: the share of tracked days at the goal.
        compare={changeWords('share', waterShare(w), waterShare(p?.water ?? null), { period, subject: 'Days at the water goal' })}
        trend={changeDirection('share', waterShare(w), waterShare(p?.water ?? null))}
        period={period}
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
        // Active minutes: the minutes that count toward the guideline (hard ones double), said in full once, aloud.
        caption={a.minutes ? `active a week · of ${WEEKLY_ACTIVE_MINUTES}` : 'No workouts yet'}
        captionShort={a.minutes ? `active, of ${WEEKLY_ACTIVE_MINUTES}` : 'No workouts yet'}
        spoken={a.minutes ? `${weekly} active minutes a week, toward the ${WEEKLY_ACTIVE_MINUTES} minutes a week guideline` : undefined}
        compare={
          a.minutes || (p && p.activity.minutes)
            ? [`${a.sessions} ${a.sessions === 1 ? 'session' : 'sessions'}`, changeWords('minutes', weekly, p ? Math.round(p.activity.weeklyMinutes) : null, { period })].filter(Boolean).join('. ')
            : null
        }
        trend={a.minutes || (p && p.activity.minutes) ? changeDirection('minutes', weekly, p ? Math.round(p.activity.weeklyMinutes) : null) : null}
        period={period}
        onPress={() => onOpen('habits')}
      />
      <ProgressTile
        testID="progress-tile-sleep"
        index={6}
        borderRight
        borderTop
        title="Sleep"
        color={colors.sleep}
        // Hours and minutes, as Sleep, the morning page and Today draw a night ("7 h 6 min"), never decimal hours.
        value={sl ? hoursFigure(sl.avgHours).value : null}
        unit={sl ? hoursFigure(sl.avgHours).unit : undefined}
        caption={sl ? `a night · ${sl.nights} ${sl.nights === 1 ? 'night' : 'nights'}` : 'No sleep logged yet'}
        spoken={sl ? `${hoursSpoken(sl.avgHours)} a night, ${sl.nights} ${sl.nights === 1 ? 'night' : 'nights'}` : undefined}
        captionShort={sl ? `a night · ${sl.nights} logged` : 'No sleep yet'}
        compare={changeWords('sleep', sl?.avgHours, p?.sleep?.avgHours, { period })}
        trend={changeDirection('sleep', sl?.avgHours, p?.sleep?.avgHours)}
        period={period}
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
        captionShort={`${s.loggedDaysInclToday} of ${Math.max(s.effectiveDays, s.loggedDaysInclToday)} logged`}
        // No triangle: the number shown is the streak, which has no earlier period; the logged days are compared in words.
        compare={loggedCompare}
        onPress={() => onOpen('habits')}
      />
      {p ? (
        // The triangles, explained once for the whole grid (as under the Nutrition card's figures).
        <View style={{ width: '100%', borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: spacing.lg, paddingVertical: spacing.md }} testID="progress-overview-trend-legend">
          <TrendLegend period={period} />
        </View>
      ) : null}
    </Card>
  );
}
