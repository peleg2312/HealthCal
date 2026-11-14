import React from 'react';
import { View } from 'react-native';

import { formatShortDate } from '@/lib/dates';
import type { InsightDay, PeriodSummary } from '@/lib/insights';
import { formatNumber } from '@/lib/units';
import { useTheme } from '@/theme';
import { BarChart, Card, Text } from '@/ui';

import { buildBars } from './CaloriesCard';
import { LegendDot } from './parts';

/**
 * The overview's lead chart (the designer's "Calories a day"): a row of slim
 * cups, one per day (one per week past six weeks), each capped by its level
 * line, amber above the dashed budget, today hatched because it is not over.
 */
export function CaloriesADay({ days, summary, today, onOpen }: { days: InsightDay[]; summary: PeriodSummary; today: string; onOpen: () => void }) {
  const { colors, spacing } = useTheme();
  const c = summary.calories;
  if (!c) return null;
  const first = days.findIndex((d) => d.entries.length > 0);
  const shown = first > 0 ? days.slice(first) : days;
  const { data, weekly, openIndex } = buildBars(shown, today);
  // The chart's own labels sit under every slot; the overview reads better with three: start, middle, end.
  const bars = data.map((d) => ({ ...d, label: '' }));
  const mid = shown[Math.floor((shown.length - 1) / 2)]?.date;
  const end = shown[shown.length - 1]?.date;
  return (
    <Card testID="progress-calories-a-day" onPress={onOpen} accessibilityLabel={`Calories a day, average ${formatNumber(Math.round(c.avgKcal))} kcal against a budget of ${formatNumber(Math.round(c.avgBudget))}. Open nutrition`} style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.md }}>
        <Text variant="h3" numberOfLines={1} style={{ flexShrink: 1 }}>
          {weekly ? 'Calories a day, by week' : 'Calories a day'}
        </Text>
        <Text variant="caption" color="textSecondary" numberOfLines={1}>
          Average <Text variant="numM" style={{ fontSize: 16, lineHeight: 20 }}>{formatNumber(Math.round(c.avgKcal))}</Text>
          <Text variant="unit"> kcal</Text>
        </Text>
      </View>
      <View>
        <BarChart data={bars} color={colors.calories} goal={c.avgBudget} openIndex={openIndex} height={150} testID="progress-overview-chart" />
        {shown.length > 1 ? (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: -16 }}>
            <Text variant="caption" color="textSecondary">
              {formatShortDate(shown[0].date)}
            </Text>
            {shown.length > 4 && mid ? (
              <Text variant="caption" color="textSecondary">
                {formatShortDate(mid)}
              </Text>
            ) : null}
            <Text variant="caption" color="textSecondary">
              {end === today ? 'Today' : end ? formatShortDate(end) : ''}
            </Text>
          </View>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.lg, rowGap: spacing.xs }}>
        <LegendDot color={colors.borderStrong} label="Budget" dashed />
        <LegendDot color={colors.rim} label="Day's level" level />
        <LegendDot color={colors.warning} label="Above budget" />
      </View>
    </Card>
  );
}
