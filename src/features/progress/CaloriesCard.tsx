import { Info } from 'lucide-react-native';
import React, { useState } from 'react';
import { View } from 'react-native';

import type { ExerciseRule } from '@/lib/exerciseBudget';
import { direction, type InsightDay, type PeriodSummary, type UsualRange } from '@/lib/insights';
import { formatNumber } from '@/lib/units';
import { useTheme, withOpacity } from '@/theme';
import { BarChart, IconButton, Sheet, Text } from '@/ui';

import { buildBars, daysVerdict } from './calorieBars';
import { changeDirection } from './change';
import { BigStat, LegendDot, SectionCard, StatStrip, TrendLegend } from './parts';

export function CaloriesCard({
  days,
  summary,
  previous,
  usual,
  today,
  rule,
}: {
  days: InsightDay[];
  summary: PeriodSummary;
  /** The equal period before, for the triangles. */
  previous?: PeriodSummary | null;
  /** The user's usual intake range; shaded behind the bars when known. */
  usual?: UsualRange | null;
  today: string;
  /** The workout rule of the days shown (`rangeRule` over their `exerciseRule`; 'mixed' across a change), for the sentence about what budgets include. */
  rule: ExerciseRule | 'mixed';
}) {
  const { colors, spacing } = useTheme();
  const [help, setHelp] = useState(false);
  const c = summary.calories;
  // Skip leading days from before the user started, so the chart is not half empty.
  const first = days.findIndex((d) => d.entries.length > 0);
  const shown = first > 0 ? days.slice(first) : days;
  const { data, weekly, openIndex } = buildBars(shown, today, { full: colors.calories, partial: withOpacity(colors.calories, 0.45), over: colors.warning });
  const verdict = daysVerdict(shown, today);
  const diff = c ? Math.round(c.avgDiff) : 0;
  const diffText = !c ? '' : Math.abs(diff) < 10 ? 'At budget on average' : `${formatNumber(Math.abs(diff))} kcal ${diff > 0 ? 'above' : 'under'} budget on average`;

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
            <BigStat value={formatNumber(Math.round(c.avgKcal))} unit="kcal" label="Daily average" ink="caloriesInk" />
            <Text variant="label" color="textSecondary" align="right" style={{ flexShrink: 1, marginBottom: 18 }}>
              {diffText}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginTop: -spacing.sm }}>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text variant="title" testID="progress-calories-card-verdict">
                {verdict.line}
              </Text>
              {verdict.note ? (
                <Text variant="caption" color="textSecondary">
                  {verdict.note}
                </Text>
              ) : null}
            </View>
            <IconButton size={36} tone="clear" testID="progress-calories-help" accessibilityLabel="How to read the calorie chart" onPress={() => setHelp(true)}>
              <Info size={20} color={colors.textSecondary} strokeWidth={1.9} />
            </IconButton>
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
            {usual ? <LegendDot color={withOpacity(colors.textSecondary, 0.33)} label={`Your usual ${formatNumber(Math.round(usual.low))}–${formatNumber(Math.round(usual.high))} kcal`} /> : null}
          </View>
          <StatStrip
            items={[
              {
                // The headline's count, by the same rule (`budgetMark`: 90 to 100% of each day's own budget).
                label: 'On budget',
                value: `${c.onBudget}`,
                unit: `of ${summary.completeDays}`,
                trend: previous?.calories ? changeDirection('share', c.onBudget / Math.max(1, summary.completeDays), previous.calories.onBudget / Math.max(1, previous.completeDays)) : null,
              },
              { label: 'Average budget', value: formatNumber(Math.round(c.avgBudget)), unit: 'kcal', trend: changeDirection('kcal', c.avgBudget, previous?.calories?.avgBudget) },
              {
                label: 'Days logged',
                value: `${summary.loggedDaysInclToday}`,
                unit: `of ${Math.max(summary.effectiveDays, summary.loggedDaysInclToday)}`,
                trend: previous ? direction(summary.loggedDays, previous.loggedDays, 0) : null,
              },
            ]}
          />
          {previous ? <TrendLegend period={`${summary.totalDays} days`} /> : null}
          <Sheet visible={help} onClose={() => setHelp(false)} title="Reading the chart">
            <View style={{ gap: spacing.md }} testID="progress-calories-help-text">
              <Text variant="body">
                Each bar is one {weekly ? "week's average day" : 'day'}, and it is amber only above its own {weekly ? "week's" : "day's"} budget. A fully logged day is on budget at 90 to 100% of its own budget. The dashed line is the average budget, for reference.
              </Text>
              {usual ? <Text variant="body">The grey band is your usual intake: the middle half of your fully logged days in the last 4 weeks.</Text> : null}
              <Text variant="body" color="textSecondary">
                Averages use {summary.completeDays} fully logged {summary.completeDays === 1 ? 'day' : 'days'}. Today
                {summary.partialDays ? ` and ${summary.partialDays} partly logged ${summary.partialDays === 1 ? 'day' : 'days'} (under 800 kcal or half the budget)` : ''} {summary.partialDays ? 'are' : 'is'} left out.{rule === 'week' ? ' Budgets include workout calories, each shared over 7 days.' : rule === 'mixed' ? ' Budgets include workout calories, on their own day or shared over 7 days, by the rule each day had.' : rule === 'day' ? ' Budgets include the exercise calories you eat back.' : ''} Press and drag on the chart to read each {weekly ? 'week' : 'day'}.
              </Text>
            </View>
          </Sheet>
        </>
      ) : (
        <Text variant="body" color="textSecondary">
          Fully log a day to see your calories here. Days in progress are left out until they are complete.
        </Text>
      )}
    </SectionCard>
  );
}
