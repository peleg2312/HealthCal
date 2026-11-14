import { useLocalSearchParams } from 'expo-router';
import { ArrowDown, ArrowRight, ArrowUp, CalendarCheck, ChevronRight, Star, Target } from 'lucide-react-native';
import React, { useEffect } from 'react';
import { View } from 'react-native';

import { addDays, formatDayLabel, formatShortDate, weekdayShort } from '@/lib/dates';
import { BUDGET_BAND, budgetBalanceText, inBudgetBand, isCompleteDay, weekRangeLabel, type RecapTile } from '@/lib/insights';
import { formatNumber } from '@/lib/units';
import { go } from '@/features/progress/parts';
import { useRecapReady } from '@/features/progress/recapReady';
import { useRecap } from '@/features/progress/useRecap';
import { useTheme } from '@/theme';
import { BarChart, Card, CupKey, Divider, EmptyState, Header, PressableScale, Screen, Text } from '@/ui';

function deltaText(t: RecapTile): string {
  if (t.soFar) return 'So far, week in progress';
  if (t.delta === null) return t.previous === null ? 'No data the week before' : '';
  if (t.delta === 0) return 'Same as the week before';
  const n = formatNumber(Math.abs(t.delta));
  const unit = t.id === 'water' ? (Math.abs(t.delta) === 1 ? ' day' : ' days') : t.id === 'protein' ? ' g' : t.id === 'activity' ? ' min' : ' kcal';
  return `${t.delta > 0 ? '+' : '−'}${n}${unit} vs the week before`;
}

/** One cell of the week's numbers: the four share a card, divided by hairlines. */
function Tile({ t, index }: { t: RecapTile; index: number }) {
  const { colors, spacing } = useTheme();
  const color = {
    calories: colors.calories,
    protein: colors.protein,
    activity: colors.exercise,
    water: colors.water,
  }[t.id];
  const Arrow = t.delta === null || t.delta === 0 ? ArrowRight : t.delta > 0 ? ArrowUp : ArrowDown;
  return (
    <View
      testID={`recap-tile-${t.id}`}
      accessible
      accessibilityLabel={`${t.label}: ${t.value === null ? 'no data' : `${t.value} ${t.unit}`}, ${t.context}. ${deltaText(t)}`}
      style={{
        width: '50%',
        minWidth: 0,
        paddingHorizontal: spacing.lg,
        paddingTop: 14,
        paddingBottom: spacing.lg,
        gap: 3,
        borderRightWidth: index % 2 === 0 ? 1 : 0,
        borderTopWidth: index >= 2 ? 1 : 0,
        borderColor: colors.border,
      }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
        <CupKey color={color} size={10} />
        <Text variant="label" color="textSecondary" numberOfLines={1} style={{ flexShrink: 1 }}>
          {t.label}
        </Text>
      </View>
      <Text variant="numL" color={t.value === null ? 'textTertiary' : 'text'} numberOfLines={1}>
        {t.value === null ? '–' : formatNumber(t.value)}
        {t.value === null ? null : <Text variant="unit">{` ${t.unit}`}</Text>}
      </Text>
      <Text variant="caption" color="textSecondary" numberOfLines={1}>
        {t.context}
      </Text>
      {deltaText(t) ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            marginTop: 4,
          }}>
          {t.delta !== null ? <Arrow size={12} color={colors.textSecondary} /> : null}
          <Text variant="caption" color="textSecondary" numberOfLines={2} style={{ flexShrink: 1 }}>
            {deltaText(t)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function Row({ icon, label, text, testID }: { icon: React.ReactNode; label: string; text: string; testID: string }) {
  const { spacing } = useTheme();
  return (
    <View
      testID={testID}
      style={{
        flexDirection: 'row',
        gap: spacing.md,
        alignItems: 'flex-start',
      }}>
      <View style={{ width: 20, paddingTop: 1 }}>{icon}</View>
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <Text variant="overline">{label}</Text>
        <Text variant="body">{text}</Text>
      </View>
    </View>
  );
}

export default function RecapScreen() {
  const { week: weekParam } = useLocalSearchParams<{ week?: string }>();
  const { colors, spacing } = useTheme();
  const d = useRecap(weekParam);
  const ready = useRecapReady();
  const r = d.recap;

  // Opening last week's check-in clears "Your week is ready" on Today.
  useEffect(() => {
    if (r && ready.ready && ready.week === d.week) ready.markSeen();
  }, [r, ready, d.week]);

  const title = r?.label === 'This week' ? 'This week so far' : r?.label === 'Last week' ? 'Your week' : 'Weekly check-in';
  const range = weekRangeLabel(d.week, addDays(d.week, 6));

  return (
    <Screen
      header={<Header title={title} subtitle={r ? `${r.label === 'Week' ? 'Week of' : r.label} · ${weekRangeLabel(r.weekStart, r.weekEnd)}` : range} />}
      testID="recap-screen">
      {!r ? (
        <Card>
          <EmptyState
            title="Not enough to recap yet"
            message="A weekly check-in appears once a week has at least 3 days with food logged. It compares your calories, protein, activity and water with the week before."
            action="Open diary"
            onAction={() => go('/diary')}
          />
        </Card>
      ) : (
        <>
          <View style={{ gap: spacing.xs, paddingTop: spacing.xs }}>
            <Text variant="overline">Win of the week</Text>
            <Text variant="h1" testID="recap-win">
              {r.win}
            </Text>
          </View>

          <Card padding={0} style={{ flexDirection: 'row', flexWrap: 'wrap' }} testID="recap-tiles">
            {d.tiles.map((t, i) => (
              <Tile key={t.id} t={t} index={i} />
            ))}
          </Card>

          <Card style={{ gap: spacing.md }} testID="recap-days">
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                gap: spacing.md,
              }}>
              <Text variant="h3">Day by day</Text>
              <Text variant="caption" color="textSecondary" align="right" style={{ flexShrink: 1 }}>
                {budgetBalanceText(r.budgetBalance)}
              </Text>
            </View>
            <BarChart
              testID="recap-days-chart"
              data={Array.from({ length: 7 }, (_, i) => {
                const day = r.days[i];
                const date = day?.date;
                const kcal = day && day.entries.length ? day.eaten.kcal : 0;
                return {
                  label: date ? weekdayShort(date) : '',
                  value: kcal,
                  // Partly logged days are drawn in a neutral colour; today is hatched (openIndex).
                  color: day && day.date !== d.today && !isCompleteDay(day, d.today) ? colors.textTertiary : undefined,
                  detail: date
                    ? `${formatShortDate(date)} · ${kcal ? `${formatNumber(Math.round(kcal))} of ${formatNumber(Math.round(day.budget))} kcal` : 'not logged'}`
                    : undefined,
                };
              })}
              marks={r.days.map((day) => isCompleteDay(day, d.today) && inBudgetBand(day.eaten.kcal, day.budget))}
              color={colors.calories}
              goal={r.summary.calories?.avgBudget}
              openIndex={r.days.findIndex((day) => day.date === d.today) >= 0 ? r.days.findIndex((day) => day.date === d.today) : undefined}
              band={
                r.summary.calories
                  ? {
                      from: r.summary.calories.avgBudget * (1 - BUDGET_BAND),
                      to: r.summary.calories.avgBudget * (1 + BUDGET_BAND),
                      color: colors.textSecondary,
                    }
                  : undefined
              }
              height={170}
              scrub
            />
            <Text variant="caption" color="textTertiary">
              The dashed line is your average budget and the shaded band ±10% around it. A check marks a fully logged day inside the band; grey bars are partly
              logged, and a hatched bar is today, still in progress.
            </Text>
          </Card>

          <Card style={{ gap: spacing.md }}>
            {r.bestDay ? (
              <>
                <Row
                  testID="recap-best-day"
                  icon={<Star size={19} color={colors.text} strokeWidth={1.9} />}
                  label={`Best day · ${formatDayLabel(r.bestDay.date)}`}
                  text={r.bestDay.detail}
                />
                <Divider />
              </>
            ) : null}
            <Row
              testID="recap-focus"
              icon={<Target size={19} color={colors.text} strokeWidth={1.9} />}
              label={r.label === 'This week' ? 'Focus for the rest of the week' : 'Focus for this week'}
              text={r.focus}
            />
          </Card>

          <PressableScale
            testID="recap-plan"
            onPress={() => go('/settings/goals')}
            accessibilityLabel={`Your plan: ${d.plan.before} kcal before, ${d.plan.after} kcal now. ${d.plan.reason} Open goals.`}
            scaleTo={0.985}>
            <Card style={{ gap: spacing.sm }}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: spacing.md,
                }}>
                <Text variant="h3" style={{ flex: 1 }}>
                  Your plan this week
                </Text>
                <ChevronRight size={18} color={colors.textSecondary} strokeWidth={1.9} />
              </View>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'flex-end',
                  gap: spacing.lg,
                  flexWrap: 'wrap',
                }}>
                <View>
                  <Text variant="caption" color="textSecondary">
                    {formatShortDate(d.week)}
                  </Text>
                  <Text variant="numM" color="textSecondary">
                    {formatNumber(d.plan.before)}
                    <Text variant="unit"> kcal</Text>
                  </Text>
                </View>
                <ArrowRight size={18} color={colors.textSecondary} style={{ marginBottom: 6 }} />
                <View>
                  <Text variant="caption" color="textSecondary">
                    {d.plan.afterDate === d.today ? 'Today' : formatShortDate(d.plan.afterDate)}
                  </Text>
                  <Text variant="numL">
                    {formatNumber(d.plan.after)}
                    <Text variant="unit"> kcal</Text>
                  </Text>
                </View>
              </View>
              <Text variant="caption" color="textSecondary">
                {d.plan.reason} Daily budget before exercise
                {d.eatBack ? '; logged workouts add their own calories on the day' : ''}.
              </Text>
            </Card>
          </PressableScale>
        </>
      )}

      {d.earlier.length ? (
        <Card style={{ gap: spacing.xs }} testID="recap-earlier">
          <Text variant="h3" style={{ marginBottom: spacing.xs }}>
            Earlier weeks
          </Text>
          {d.earlier.map((w) => (
            <PressableScale
              key={w}
              testID={`recap-week-${w}`}
              onPress={() => go(`/recap?week=${w}`)}
              accessibilityLabel={`Open the check-in for the week of ${formatShortDate(w)}`}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.md,
                minHeight: 44,
              }}>
              <CalendarCheck size={18} color={colors.textSecondary} strokeWidth={1.9} />
              <Text variant="body" style={{ flex: 1 }}>
                {weekRangeLabel(w, addDays(w, 6))}
              </Text>
              <ChevronRight size={18} color={colors.textTertiary} />
            </PressableScale>
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}
