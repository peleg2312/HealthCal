import { Flame } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';

import { formatShortDate, startOfWeek, weekdayShort } from '@/lib/dates';
import { BUDGET_BAND, isCompleteDay, type InsightDay, type PeriodSummary } from '@/lib/insights';
import { formatNumber } from '@/lib/units';
import { useTheme } from '@/theme';
import { BarChart, Text, type BarDatum } from '@/ui';

import { BigStat, LegendDot, Note, SectionCard, StatStrip } from './parts';

/** Daily bars for up to ~6 weeks, weekly averages beyond that. */
function buildBars(days: InsightDay[], today: string, colors: { calories: string; warning: string; textTertiary: string }): { data: BarDatum[]; weekly: boolean } {
  const colorFor = (kcal: number, budget: number) => (kcal > budget * (1 + BUDGET_BAND) ? colors.warning : colors.calories);
  if (days.length <= 45) {
    const every = days.length <= 10 ? 1 : 7;
    const data = days.map((d, i) => {
      const fromEnd = days.length - 1 - i;
      const label = every === 1 ? (d.date === today ? 'Today' : weekdayShort(d.date)) : fromEnd % every === 3 ? formatShortDate(d.date) : '';
      const kcal = d.entries.length ? d.eaten.kcal : 0;
      const detail = `${formatShortDate(d.date)} · ${kcal ? `${formatNumber(Math.round(kcal))} of ${formatNumber(Math.round(d.budget))} kcal` : 'not logged'}`;
      return { label, value: kcal, color: d.date === today ? colors.textTertiary : colorFor(kcal, d.budget), detail };
    });
    return { data, weekly: false };
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
    const budget = complete.length ? complete.reduce((s, d) => s + d.budget, 0) / complete.length : 0;
    const fromEnd = entries.length - 1 - i;
    const detail = `Week of ${formatShortDate(start)} · ${kcal ? `${formatNumber(Math.round(kcal))} kcal a day` : 'no full days'}`;
    return { label: fromEnd % 3 === 1 ? formatShortDate(start) : '', value: kcal, color: colorFor(kcal, budget), detail };
  });
  return { data, weekly: true };
}

export function CaloriesCard({ days, summary, today, eatBack }: { days: InsightDay[]; summary: PeriodSummary; today: string; eatBack: boolean }) {
  const { colors, spacing } = useTheme();
  const c = summary.calories;
  // Skip leading days from before the user started, so the chart is not half empty.
  const first = days.findIndex((d) => d.entries.length > 0);
  const shown = first > 0 ? days.slice(first) : days;
  const { data, weekly } = buildBars(shown, today, colors);
  const diff = c ? Math.round(c.avgDiff) : 0;
  const diffText = !c ? '' : Math.abs(diff) < 10 ? 'Right on budget' : `${formatNumber(Math.abs(diff))} kcal ${diff > 0 ? 'over' : 'under'} budget on average`;

  return (
    <SectionCard
      testID="progress-calories"
      title="Calories"
      subtitle={weekly ? 'Weekly averages of fully logged days' : 'Daily intake against budget'}
      color={colors.calories}
      icon={<Flame size={18} color={colors.calories} />}
      link="/diary"
      linkLabel="Diary">
      {c ? (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.md }}>
            <BigStat value={formatNumber(Math.round(c.avgKcal))} unit="kcal" label="Daily average" />
            <Text variant="label" color={diff > c.avgBudget * BUDGET_BAND ? 'warning' : 'textSecondary'} align="right" style={{ flexShrink: 1, marginBottom: 18 }}>
              {diffText}
            </Text>
          </View>
          <BarChart
            testID="progress-calories-chart"
            data={data}
            color={colors.calories}
            band={{ from: c.avgBudget * (1 - BUDGET_BAND), to: c.avgBudget * (1 + BUDGET_BAND) }}
            height={160}
            scrub
          />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.lg, rowGap: spacing.xs }}>
            <LegendDot color={colors.calories} label="Within 10% or under" />
            <LegendDot color={colors.warning} label="More than 10% over" />
            {!weekly ? <LegendDot color={colors.textTertiary} label="Today so far" /> : null}
            <LegendDot color={`${colors.calories}44`} label="Budget ±10%" />
          </View>
          <StatStrip
            items={[
              { label: 'Within 10%', value: `${c.inBand}`, unit: `of ${summary.completeDays}` },
              { label: 'Average budget', value: formatNumber(Math.round(c.avgBudget)), unit: 'kcal' },
              { label: 'Days logged', value: `${summary.loggedDaysInclToday}`, unit: `of ${Math.max(summary.effectiveDays, summary.loggedDaysInclToday)}` },
            ]}
          />
          <Note>
            Press and drag on the chart to read each day. Averages use {summary.completeDays} fully logged {summary.completeDays === 1 ? 'day' : 'days'}. Today
            {summary.partialDays ? ` and ${summary.partialDays} partly logged ${summary.partialDays === 1 ? 'day' : 'days'} (under half the budget)` : ''} {summary.partialDays ? 'are' : 'is'} left out.{eatBack ? ' Budgets include the exercise calories you eat back.' : ''}
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
