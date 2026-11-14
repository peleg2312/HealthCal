import React from 'react';
import { View } from 'react-native';

import { formatShortDate, startOfWeek, weekdayShort } from '@/lib/dates';
import { direction, isCompleteDay, type InsightDay, type PeriodSummary, type UsualRange } from '@/lib/insights';
import { formatNumber } from '@/lib/units';
import { useTheme } from '@/theme';
import { BarChart, Text, type BarDatum } from '@/ui';

import { BigStat, LegendDot, Note, SectionCard, StatStrip, TrendLegend } from './parts';

/**
 * Daily bars for up to ~6 weeks, weekly averages beyond that. Bars are slim
 * cups: the kit draws the part above the budget line in amber and hatches
 * today (`openIndex`), so no bar picks its own colour.
 */
export function buildBars(days: InsightDay[], today: string): { data: BarDatum[]; weekly: boolean; openIndex?: number } {
  if (days.length <= 45) {
    const every = days.length <= 10 ? 1 : 7;
    const data = days.map((d, i) => {
      const fromEnd = days.length - 1 - i;
      const label = every === 1 ? (d.date === today ? 'Today' : weekdayShort(d.date)) : fromEnd % every === 3 ? formatShortDate(d.date) : '';
      const kcal = d.entries.length ? d.eaten.kcal : 0;
      const detail = `${formatShortDate(d.date)} · ${kcal ? `${formatNumber(Math.round(kcal))} of ${formatNumber(Math.round(d.budget))} kcal` : 'not logged'}`;
      return { label, value: kcal, detail };
    });
    const open = days.findIndex((d) => d.date === today);
    return { data, weekly: false, openIndex: open >= 0 ? open : undefined };
  }
  const weeks = new Map<string, InsightDay[]>();
  for (const d of days) {
    const k = startOfWeek(d.date);
    weeks.set(k, [...(weeks.get(k) ?? []), d]);
  }
  const entries = [...weeks.entries()];
  const data = entries.map(([start, list], i) => {
    const complete = list.filter((d) => isCompleteDay(d, today));
    const kcal = complete.length ? complete.reduce((s, d) => s + d.eaten.kcal, 0) / complete.length : 0;
    const fromEnd = entries.length - 1 - i;
    const detail = `Week of ${formatShortDate(start)} · ${kcal ? `${formatNumber(Math.round(kcal))} kcal a day` : 'no full days'}`;
    return { label: fromEnd % 3 === 1 ? formatShortDate(start) : '', value: kcal, detail };
  });
  return { data, weekly: true };
}

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
  const { data, weekly, openIndex } = buildBars(shown, today);
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
            <LegendDot color={colors.warning} label="Above budget" />
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
            Press and drag on the chart to read each day. Averages use {summary.completeDays} fully logged {summary.completeDays === 1 ? 'day' : 'days'}. Today
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
