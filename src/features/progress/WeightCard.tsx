import { Scale } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';

import { diffDays, formatShortDate, toISODate } from '@/lib/dates';
import { projectedGoalDate } from '@/lib/energy';
import { rateText } from '@/lib/insights';
import { weightUnit, weightValue } from '@/lib/units';
import type { WeightSeries } from '@/store/selectors';
import { useTheme } from '@/theme';
import type { Profile } from '@/types';
import { Button, LineChart, Text } from '@/ui';

import { BigStat, go, Note, SectionCard, StatStrip } from './parts';

export function WeightCard({ series, start, end, profile }: { series: WeightSeries; start: string; end: string; profile: Profile }) {
  const { colors, spacing } = useTheme();
  const units = profile.units;
  const unit = weightUnit(units);
  const v = (kg: number) => weightValue(kg, units);

  if (series.entries.length < 2 || series.trendKg === null) {
    return (
      <SectionCard testID="progress-weight" title="Weight" color={colors.weight} icon={<Scale size={18} color={colors.weight} />} link="/weight">
        <Text variant="body" color="textSecondary">
          {series.entries.length === 0
            ? 'Log your weight a few mornings a week. The trend line appears after two weigh-ins and the weekly rate after one week.'
            : `One weigh-in so far (${v(series.entries[0].kg).toFixed(1)} ${unit}). The trend line appears after the next one.`}
        </Text>
        <Button testID="progress-weight-log" title="Log weight" variant="secondary" size="md" onPress={() => go('/weight')} />
      </SectionCard>
    );
  }

  let pts = series.trend.filter((t) => t.date >= start && t.date <= end);
  if (pts.length < 2) pts = series.trend.slice(-14);
  const origin = pts[0].date;
  const line = pts.map((t) => ({ x: diffDays(origin, t.date), y: v(t.trend) }));
  const dots = pts.filter((t) => !t.interpolated).map((t) => ({ x: diffDays(origin, t.date), y: v(t.kg) }));
  const change = pts[pts.length - 1].trend - pts[0].trend;
  const rate = series.weeklyRateKg;
  const target = profile.targetWeightKg;
  const eta = rate !== null && target ? projectedGoalDate(series.trendKg, target, rate) : null;
  const sign = (kg: number) => (kg < -0.005 ? '−' : kg > 0.005 ? '+' : '');

  return (
    <SectionCard
      testID="progress-weight"
      title="Weight"
      subtitle="Smoothed trend"
      color={colors.weight}
      icon={<Scale size={18} color={colors.weight} />}
      link="/weight">
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: spacing.md }}>
        <BigStat value={v(series.trendKg).toFixed(1)} unit={unit} label="Trend weight" color={colors.weight} />
        {rate !== null ? (
          <BigStat value={`${sign(rate)}${rateText(rate, units).replace(` ${unit}`, '')}`} unit={`${unit} / wk`} label="Last two weeks" align="right" />
        ) : (
          <Text variant="caption" color="textSecondary" align="right" style={{ flexShrink: 1, marginBottom: 2 }}>
            Weekly rate appears after{'\n'}a week of weigh-ins
          </Text>
        )}
      </View>
      <LineChart
        line={line}
        dots={dots}
        color={colors.weight}
        height={170}
        formatY={(n) => n.toFixed(1)}
        xLabels={[formatShortDate(pts[0].date), formatShortDate(pts[pts.length - 1].date)]}
      />
      <StatStrip
        items={[
          { label: 'Trend change in range', value: `${sign(change)}${Math.abs(v(change)).toFixed(1)}`, unit },
          { label: 'Weigh-ins in range', value: `${dots.length}` },
          target
            ? { label: eta ? `Goal, around ${formatShortDate(toISODate(eta))}` : 'Goal weight', value: v(target).toFixed(1), unit }
            : { label: 'Latest weigh-in', value: v(series.latest!.kg).toFixed(1), unit },
        ]}
      />
      <Note>The line smooths out day-to-day swings from water and salt; dots are your individual weigh-ins.</Note>
    </SectionCard>
  );
}
