import React from 'react';
import { View } from 'react-native';

import { direction, type InsightDay, type PeriodSummary, type UsualRange } from '@/lib/insights';
import { formatNumber } from '@/lib/units';
import { useTheme, withOpacity } from '@/theme';
import { BarChart, Text } from '@/ui';

import { buildBars } from './calorieBars';
import { BigStat, LegendDot, Note, SectionCard, StatStrip, TrendLegend } from './parts';

export function CaloriesCard({
  days,
  summary,
  previous,
  usual,
  today,
  eatBack,
}: {
  days: InsightDay[];
  summary: PeriodSummary;
  /** The equal period before, for the triangles. */
  previous?: PeriodSummary | null;
  /** The user's usual intake range; shaded behind the bars when known. */
  usual?: UsualRange | null;
  today: string;
  eatBack: boolean;
}) {
  const { colors, spacing } = useTheme();
  const c = summary.calories;
  // Skip leading days from before the user started, so the chart is not half empty.
  const first = days.findIndex((d) => d.entries.length > 0);
  const shown = first > 0 ? days.slice(first) : days;
  const { data, weekly, openIndex } = buildBars(shown, today, withOpacity(colors.calories, 0.45));
  const diff = c ? Math.round(c.avgDiff) : 0;
  const diffText = !c ? '' : Math.abs(diff) < 10 ? 'Right on budget' : `${formatNumber(Math.abs(diff))} kcal ${diff > 0 ? 'over' : 'under'} budget on average`;

  return (
    <SectionCard
      testID="progress-calories"
      title="Calories"
      subtitle={weekly ? 'Weekly averages of fully logged days' : 'Daily intake against budget'}
      color={colors.calories}
      link="/diary"
      linkLabel="Diary">
      {c ? (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.md }}>
            <BigStat value={formatNumber(Math.round(c.avgKcal))} unit="kcal" label="Daily average" />
            <Text variant="label" color="textSecondary" align="right" style={{ flexShrink: 1, marginBottom: 18 }}>
              {diffText}
            </Text>
          </View>
          <BarChart
            testID="progress-calories-chart"
            data={data}
            color={colors.calories}
            band={usual ? { from: usual.low, to: usual.high, color: colors.textSecondary } : undefined}
            goal={c.avgBudget}
            openIndex={openIndex}
            height={160}
            scrub
          />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.lg, rowGap: spacing.xs }}>
            <LegendDot color={colors.borderStrong} label="Average budget" dashed />
            <LegendDot color={colors.rim} label="Day's level" level />
            <LegendDot color={colors.warning} label={weekly ? "Above that week's budget" : "Above that day's budget"} />
            {data.some((b) => b.color) ? <LegendDot color={withOpacity(colors.calories, 0.45)} label="Partly logged" /> : null}
            {openIndex !== undefined ? <LegendDot color={colors.calories} label="Today, hatched: not finished" /> : null}
            {usual ? <LegendDot color={`${colors.textSecondary}55`} label={`Your usual ${formatNumber(Math.round(usual.low))}–${formatNumber(Math.round(usual.high))} kcal`} /> : null}
          </View>
          <StatStrip
            items={[
              {
                label: 'Within 10%',
                value: `${c.inBand}`,
                unit: `of ${summary.completeDays}`,
                trend: previous?.calories ? direction(c.inBand / Math.max(1, summary.completeDays), previous.calories.inBand / Math.max(1, previous.completeDays), 0.05) : null,
              },
              { label: 'Average budget', value: formatNumber(Math.round(c.avgBudget)), unit: 'kcal', trend: direction(c.avgBudget, previous?.calories?.avgBudget, 20) },
              {
                label: 'Days logged',
                value: `${summary.loggedDaysInclToday}`,
                unit: `of ${Math.max(summary.effectiveDays, summary.loggedDaysInclToday)}`,
                trend: previous ? direction(summary.loggedDays, previous.loggedDays, 0) : null,
              },
            ]}
          />
          {previous ? <TrendLegend period={`${summary.totalDays} days`} /> : null}
          <Note>
            {usual
              ? `The grey band is your usual intake, the middle half of your fully logged days in the last 4 weeks. `
              : ''}
            Each bar is amber only above its own {weekly ? "week's" : "day's"} budget; the dashed line is the average budget, for reference. Press and drag on the chart to read each {weekly ? 'week' : 'day'}. Averages use {summary.completeDays} fully logged {summary.completeDays === 1 ? 'day' : 'days'}. Today
            {summary.partialDays ? ` and ${summary.partialDays} partly logged ${summary.partialDays === 1 ? 'day' : 'days'} (under 800 kcal or half the budget)` : ''} {summary.partialDays ? 'are' : 'is'} left out.{eatBack ? ' Budgets include the exercise calories you eat back.' : ''}
          </Note>
        </>
      ) : (
        <Text variant="body" color="textSecondary">
          Fully log a day to see your calories here. Days in progress are left out until they are complete.
        </Text>
      )}
    </SectionCard>
  );
}
