import React, { useState } from 'react';
import { View } from 'react-native';

import { compareText, confidenceWord, hoursText, kcalText, rateText, WEEKLY_ACTIVE_MINUTES, type PeriodSummary } from '@/lib/insights';
import { formatNumber, formatVolume, formatWeight, weightUnit, weightValue } from '@/lib/units';
import { useTheme } from '@/theme';
import type { TrendPoint } from '@/lib/trend';
import { ProgressBar, Ring, Sparkline } from '@/ui';

import { MiniBars, ProgressTile, WeekDots } from './ProgressTile';
import type { ProgressData } from './useProgressData';

export type ProgressSegment = 'overview' | 'nutrition' | 'body' | 'habits';

function avgTrend(trend: TrendPoint[], start: string, end: string): number | null {
  const pts = trend.filter((t) => t.date >= start && t.date <= end);
  return pts.length ? pts.reduce((s, t) => s + t.trend, 0) / pts.length : null;
}

/** Sparkline that fills the width it is given. */
function WideSparkline({ values, color }: { values: number[]; color: string }) {
  const [w, setW] = useState(0);
  return (
    <View onLayout={(e) => setW(Math.round(e.nativeEvent.layout.width))} style={{ height: 30 }}>
      {w > 0 ? <Sparkline values={values} color={color} width={w} height={30} /> : null}
    </View>
  );
}

/** Eight tiles, one number each, built from what useProgressData already returns. */
export function OverviewGrid({ d, range, onOpen }: { d: ProgressData; range: number; onOpen: (s: ProgressSegment) => void }) {
  const { colors, spacing } = useTheme();
  const s: PeriodSummary = d.summary;
  const p = d.previous;
  const period = `${range} days`;
  const units = d.profile.units;
  const start = d.days[0].date;
  const prevStart = p?.start ?? null;

  const last7 = d.days.slice(-7);
  const c = s.calories;
  const protein = s.macros?.protein ?? null;
  const w = s.water;
  const a = s.activity;
  const sl = s.sleep;
  const weekly = Math.round(a.weeklyMinutes);

  const trendNow = avgTrend(d.series.trend, start, d.today);
  const trendPrev = prevStart && p ? avgTrend(d.series.trend, prevStart, p.end) : null;
  const trendPts = d.series.trend.filter((t) => t.date >= start && t.date <= d.today).map((t) => weightValue(t.trend, units));
  const rate = d.series.weeklyRateKg;

  const loggedDiff = p ? s.loggedDays - p.loggedDays : null;
  const loggedCompare =
    loggedDiff === null || p?.effectiveDays === 0
      ? null
      : loggedDiff === 0
        ? `Same number of logged days as the previous ${period}`
        : `${Math.abs(loggedDiff)} ${loggedDiff > 0 ? 'more' : 'fewer'} logged ${Math.abs(loggedDiff) === 1 ? 'day' : 'days'} than the previous ${period}`;

  const adaptive = d.model.usingAdaptive;

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }} testID="progress-overview-grid">
      <ProgressTile
        testID="progress-tile-calories"
        title="Calories"
        color={colors.calories}
        value={c ? formatNumber(Math.round(c.avgKcal)) : null}
        unit="kcal"
        caption={c ? `a day · budget ${formatNumber(Math.round(c.avgBudget))}` : 'No fully logged days yet'}
        visual={
          <MiniBars
            values={last7.map((x) => ({ value: x.entries.length ? x.eaten.kcal : 0, budget: x.budget, muted: x.date === d.today }))}
            color={colors.calories}
            overColor={colors.warning}
          />
        }
        compare={compareText(c?.avgKcal, p?.calories?.avgKcal, { period, format: (n) => kcalText(n), same: 20 })}
        onPress={() => onOpen('nutrition')}
      />
      <ProgressTile
        testID="progress-tile-weight"
        title="Weight trend"
        color={colors.weight}
        value={d.series.trendKg !== null ? weightValue(d.series.trendKg, units).toFixed(1) : null}
        unit={weightUnit(units)}
        caption={rate !== null ? `${rate > 0 ? '+' : rate < 0 ? '−' : ''}${rateText(rate, units)} a week` : 'Rate after a week of weigh-ins'}
        visual={trendPts.length >= 2 ? <WideSparkline values={trendPts} color={colors.weight} /> : null}
        compare={compareText(trendNow, trendPrev, { period, format: (n) => formatWeight(n, units), same: 0.05, more: 'higher', less: 'lower' })}
        onPress={() => onOpen('body')}
      />
      <ProgressTile
        testID="progress-tile-protein"
        title="Protein"
        color={colors.protein}
        value={protein ? `${Math.round(protein.avg)}` : null}
        unit="g"
        caption={protein ? `a day · target ${Math.round(protein.target)} g` : 'No fully logged days yet'}
        visual={protein ? <ProgressBar progress={protein.avg / Math.max(1, protein.target)} color={colors.protein} height={6} /> : null}
        compare={compareText(protein?.avg, p?.macros?.protein.avg, { period, format: (n) => `${Math.round(n)} g`, same: 2 })}
        onPress={() => onOpen('nutrition')}
      />
      <ProgressTile
        testID="progress-tile-expenditure"
        title="Expenditure"
        color={colors.calories}
        value={formatNumber(Math.round(d.model.tdee))}
        unit="kcal"
        caption={adaptive ? `a day · confidence ${confidenceWord(d.model.adaptive.confidence)}` : 'a day · formula estimate'}
        visual={<ProgressBar progress={adaptive ? d.model.adaptive.confidence : 0} color={colors.primary} height={6} />}
        compare={adaptive ? `Formula alone says ${kcalText(d.model.formulaTdee)}` : d.model.adaptive.needs ? `Your data estimate needs ${d.model.adaptive.needs}` : null}
        onPress={() => onOpen('body')}
      />
      <ProgressTile
        testID="progress-tile-water"
        title="Water"
        color={colors.water}
        value={w ? `${w.daysAtGoal}` : null}
        unit={w ? `of ${w.daysTracked} days` : undefined}
        caption={w ? `at goal · ${formatVolume(w.avgMl, units)} a day` : 'No drinks logged yet'}
        visual={w ? <ProgressBar progress={w.daysAtGoal / Math.max(1, w.daysTracked)} color={colors.water} height={6} /> : null}
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
        title="Activity"
        color={colors.exercise}
        value={a.minutes ? `${weekly}` : null}
        unit="min / wk"
        caption={a.minutes ? `${a.sessions} ${a.sessions === 1 ? 'session' : 'sessions'} · guide ${WEEKLY_ACTIVE_MINUTES}` : 'No workouts logged yet'}
        visual={
          <View style={{ flexDirection: 'row' }}>
            <Ring size={30} stroke={5} progress={weekly / WEEKLY_ACTIVE_MINUTES} color={colors.exercise} animate={false} />
          </View>
        }
        compare={a.minutes || (p && p.activity.minutes) ? compareText(weekly, p ? Math.round(p.activity.weeklyMinutes) : null, { period, format: (n) => `${Math.round(n)} min a week`, same: 5 }) : null}
        onPress={() => onOpen('habits')}
      />
      <ProgressTile
        testID="progress-tile-sleep"
        title="Sleep"
        color={colors.sleep}
        value={sl ? hoursText(sl.avgHours).replace(' h', '') : null}
        unit="h / night"
        caption={sl ? `${sl.nights} ${sl.nights === 1 ? 'night' : 'nights'} logged` : 'No sleep logged yet'}
        visual={sl ? <ProgressBar progress={Math.min(sl.avgHours, 9) / 9} color={colors.sleep} height={6} /> : null}
        compare={compareText(sl?.avgHours, p?.sleep?.avgHours, { period, format: (n) => hoursText(n), same: 0.1, more: 'longer', less: 'shorter' })}
        onPress={() => onOpen('habits')}
      />
      <ProgressTile
        testID="progress-tile-consistency"
        title="Consistency"
        color={colors.primary}
        value={`${d.consistency.streak}`}
        unit={d.consistency.streak === 1 ? 'day streak' : 'day streak'}
        caption={`${s.loggedDaysInclToday} of ${Math.max(s.effectiveDays, s.loggedDaysInclToday)} days logged`}
        visual={<WeekDots days={last7.map((x) => ({ date: x.date, logged: x.entries.length > 0 }))} color={colors.primary} />}
        compare={loggedCompare}
        onPress={() => onOpen('habits')}
      />
    </View>
  );
}
