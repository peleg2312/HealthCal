import React from 'react';
import { useWindowDimensions, View } from 'react-native';

import { formatShortDate } from '@/lib/dates';
import type { InsightDay, PeriodSummary } from '@/lib/insights';
import { formatNumber } from '@/lib/units';
import { useTheme, withOpacity } from '@/theme';
import { BarChart, Card, Text } from '@/ui';

import { buildBars, daysVerdict } from './calorieBars';
import { LegendDot } from './parts';

/**
 * The overview's lead chart (the designer's "Calories a day"): a row of slim
 * cups in the calorie colour, one per day (one per week past six weeks), each
 * capped by its level line. A bar is amber only above its own budget; the
 * dashed line is the average budget, a reference. Today is hatched and a
 * partly logged day is lighter. One verdict line says what the bars show.
 */
export function CaloriesADay({ days, summary, today, onOpen }: { days: InsightDay[]; summary: PeriodSummary; today: string; onOpen: () => void }) {
  const { colors, spacing } = useTheme();
  const narrow = useWindowDimensions().width < 360;
  const c = summary.calories;
  if (!c) return null;
  const first = days.findIndex((d) => d.entries.length > 0);
  const shown = first > 0 ? days.slice(first) : days;
  const partial = withOpacity(colors.calories, 0.45);
  const { data, weekly, openIndex } = buildBars(shown, today, partial);
  // The chart's own labels sit under every slot; the overview reads better with three: start, middle, end.
  const bars = data.map((d) => ({ ...d, label: '' }));
  const mid = shown[Math.floor((shown.length - 1) / 2)]?.date;
  const end = shown[shown.length - 1]?.date;
  const verdict = daysVerdict(shown, today);
  return (
    <Card
      testID="progress-calories-a-day"
      onPress={onOpen}
      accessibilityLabel={`Calories a day, average ${formatNumber(Math.round(c.avgKcal))} kcal against an average budget of ${formatNumber(Math.round(c.avgBudget))}. ${verdict}. Open nutrition`}
      style={{ gap: spacing.md }}>
      <View style={{ gap: 2 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', columnGap: spacing.md, rowGap: 2 }}>
          <Text variant="h3" style={{ flexShrink: 1 }}>
            {weekly ? 'Calories a day, by week' : 'Calories a day'}
          </Text>
          <Text variant="caption" color="textSecondary">
            Average{' '}
            <Text variant="numM" color="caloriesInk" style={{ fontSize: narrow ? 15 : 16, lineHeight: 20 }}>
              {formatNumber(Math.round(c.avgKcal))}
            </Text>
            <Text variant="unit"> kcal</Text>
          </Text>
        </View>
        <Text variant="title" testID="progress-calories-verdict">
          {verdict}
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
        <LegendDot color={colors.borderStrong} label="Average budget" dashed />
        <LegendDot color={colors.warning} label={weekly ? "Above that week's budget" : "Above that day's budget"} />
        {data.some((b) => b.color) ? <LegendDot color={partial} label="Partly logged" /> : null}
      </View>
    </Card>
  );
}
