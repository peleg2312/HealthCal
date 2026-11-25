import React from 'react';
import { View } from 'react-native';

import { formatShortDate } from '@/lib/dates';
import type { InsightDay, PeriodSummary } from '@/lib/insights';
import { formatNumber } from '@/lib/units';
import { useTheme, withOpacity } from '@/theme';
import { BarChart, Card, PressableScale, Text } from '@/ui';

import { buildBars, daysVerdict } from './calorieBars';
import { barsLabel } from './chartWords';
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
  const c = summary.calories;
  if (!c) return null;
  const first = days.findIndex((d) => d.entries.length > 0);
  const shown = first > 0 ? days.slice(first) : days;
  const partial = withOpacity(colors.calories, 0.45);
  const { data, weekly, openIndex } = buildBars(shown, today, { full: colors.caloriesBar, partial: partial, over: colors.warning });
  // The chart's own labels sit under every slot; the overview reads better with three: start, middle, end.
  const bars = data.map((d) => ({ ...d, label: '' }));
  const mid = shown[Math.floor((shown.length - 1) / 2)]?.date;
  const end = shown[shown.length - 1]?.date;
  const verdict = daysVerdict(shown, today);
  const title = weekly ? 'Calories a day, by week' : 'Calories a day';
  return (
    // The title is the card's heading (level 2, as SectionTitle's), so it sits outside the one control that
    // opens Nutrition: a heading inside a button is not a heading to a screen reader. Everything under it
    // is that control, so a tap anywhere below the title still opens Nutrition.
    <Card testID="progress-calories-a-day" style={{ gap: 2 }}>
      {/* The average is the Calories tile's number just below, so it is said once there (and read out here). */}
      <Text variant="h3" accessibilityRole="header" {...({ 'aria-level': 2 } as object)}>
        {title}
      </Text>
      <PressableScale
        testID="progress-calories-a-day-open"
        onPress={onOpen}
        scaleTo={0.985}
        // The summary first, then every bar's value (its day or week, kcal against its budget), then where it leads.
        accessibilityLabel={`${barsLabel(
          `${title}, average ${formatNumber(Math.round(c.avgKcal))} kcal against an average budget of ${formatNumber(Math.round(c.avgBudget))} kcal. ${verdict.line}.${verdict.note ? ` ${verdict.note}.` : ''} ${weekly ? 'Week by week' : 'Day by day'}`,
          data.map((d) => d.detail),
        )} Open nutrition`}
        style={{ gap: spacing.md }}>
        <View style={{ gap: 2 }}>
          {/* A short headline, and what it counts in the caption under it. */}
          <Text variant="title" testID="progress-calories-verdict">
            {verdict.line}
          </Text>
          {verdict.note ? (
            <Text variant="caption" color="textSecondary" testID="progress-calories-verdict-note">
              {verdict.note}
            </Text>
          ) : null}
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
      </PressableScale>
    </Card>
  );
}
