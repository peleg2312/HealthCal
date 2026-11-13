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
import { BarChart, Card, EmptyState, Header, PressableScale, Screen, Text } from '@/ui';

function deltaText(t: RecapTile): string {
  if (t.delta === null) return t.previous === null ? 'No data the week before' : '';
  if (t.delta === 0) return 'Same as the week before';
  const n = formatNumber(Math.abs(t.delta));
  const unit = t.id === 'water' ? (Math.abs(t.delta) === 1 ? ' day' : ' days') : t.id === 'protein' ? ' g' : t.id === 'activity' ? ' min' : ' kcal';
  return `${t.delta > 0 ? '+' : '−'}${n}${unit} vs the week before`;
}

function Tile({ t }: { t: RecapTile }) {
  const { colors, spacing, radius } = useTheme();
  const color = { calories: colors.calories, protein: colors.protein, activity: colors.exercise, water: colors.water }[t.id];
  const good = t.delta !== null && t.delta !== 0 && t.upIsGood && t.delta > 0;
  const Arrow = t.delta === null || t.delta === 0 ? ArrowRight : t.delta > 0 ? ArrowUp : ArrowDown;
  return (
    <View
      testID={`recap-tile-${t.id}`}
      accessible
      accessibilityLabel={`${t.label}: ${t.value === null ? 'no data' : `${t.value} ${t.unit}`}, ${t.context}. ${deltaText(t)}`}
      style={{ flexBasis: '47%', flexGrow: 1, minWidth: 0, padding: spacing.md, gap: 2, borderRadius: radius.md, backgroundColor: colors.surfaceAlt }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
        <Text variant="caption" color="textSecondary" numberOfLines={1}>
          {t.label}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
        <Text variant="numL" tabular color={t.value === null ? 'textTertiary' : 'text'}>
          {t.value === null ? '–' : formatNumber(t.value)}
        </Text>
        <Text variant="caption" color="textSecondary" numberOfLines={1} style={{ flexShrink: 1 }}>
          {t.unit}
        </Text>
      </View>
      <Text variant="caption" color="textTertiary" numberOfLines={1}>
        {t.context}
      </Text>
      {deltaText(t) ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
          {t.delta !== null ? <Arrow size={12} color={good ? colors.success : colors.textSecondary} /> : null}
          <Text variant="caption" color={good ? 'success' : 'textSecondary'} numberOfLines={2} style={{ flexShrink: 1 }}>
            {deltaText(t)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function Row({ icon, color, label, text, testID }: { icon: React.ReactNode; color: string; label: string; text: string; testID: string }) {
  const { spacing, radius } = useTheme();
  return (
    <View testID={testID} style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
      <View style={{ width: 32, height: 32, borderRadius: radius.sm, backgroundColor: `${color}22`, alignItems: 'center', justifyContent: 'center' }}>{icon}</View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text variant="overline" color="textTertiary">
          {label.toUpperCase()}
        </Text>
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
    <Screen header={<Header title={title} subtitle={r ? `${r.label === 'Week' ? 'Week of' : r.label} · ${weekRangeLabel(r.weekStart, r.weekEnd)}` : range} />} testID="recap-screen">
      {!r ? (
        <Card>
          <EmptyState
            emoji="🗓️"
            title="Not enough to recap yet"
            message="A weekly check-in appears once a week has at least 2 days with food logged. It compares your calories, protein, activity and water with the week before."
            action="Open diary"
            onAction={() => go('/diary')}
          />
        </Card>
      ) : (
        <>
          <View style={{ gap: spacing.xs, paddingTop: spacing.xs }}>
            <Text variant="overline" color="textTertiary">
              WIN OF THE WEEK
            </Text>
            <Text variant="h1" testID="recap-win">
              {r.win}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {d.tiles.map((t) => (
              <Tile key={t.id} t={t} />
            ))}
          </View>

          <Card style={{ gap: spacing.md }} testID="recap-days">
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: spacing.md }}>
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
                  color: !day || !isCompleteDay(day, d.today) ? colors.textTertiary : kcal > day.budget * (1 + BUDGET_BAND) ? colors.warning : colors.calories,
                  detail: date ? `${formatShortDate(date)} · ${kcal ? `${formatNumber(Math.round(kcal))} of ${formatNumber(Math.round(day.budget))} kcal` : 'not logged'}` : undefined,
                };
              })}
              marks={r.days.map((day) => isCompleteDay(day, d.today) && inBudgetBand(day.eaten.kcal, day.budget))}
              color={colors.calories}
              band={r.summary.calories ? { from: r.summary.calories.avgBudget * (1 - BUDGET_BAND), to: r.summary.calories.avgBudget * (1 + BUDGET_BAND) } : undefined}
              height={170}
              scrub
            />
            <Text variant="caption" color="textTertiary">
              The shaded band is your budget ±10%. A check marks a fully logged day inside it; grey bars are partly logged or still in progress.
            </Text>
          </Card>

          <Card style={{ gap: spacing.lg }}>
            {r.bestDay ? (
              <Row testID="recap-best-day" icon={<Star size={16} color={colors.carbs} />} color={colors.carbs} label={`Best day · ${formatDayLabel(r.bestDay.date)}`} text={r.bestDay.detail} />
            ) : null}
            <Row testID="recap-focus" icon={<Target size={16} color={colors.water} />} color={colors.water} label={r.label === 'This week' ? 'Focus for the rest of the week' : 'Focus for this week'} text={r.focus} />
          </Card>

          <PressableScale
            testID="recap-plan"
            onPress={() => go('/settings/goals')}
            accessibilityLabel={`Your plan: ${d.plan.before} kcal before, ${d.plan.after} kcal now. ${d.plan.reason} Open goals.`}
            scaleTo={0.985}>
            <Card style={{ gap: spacing.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                <Text variant="h3" style={{ flex: 1 }}>
                  Your plan this week
                </Text>
                <ChevronRight size={18} color={colors.textTertiary} />
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexWrap: 'wrap' }}>
                <View>
                  <Text variant="caption" color="textSecondary">
                    {formatShortDate(d.week)}
                  </Text>
                  <Text variant="numM" tabular color="textSecondary">
                    {formatNumber(d.plan.before)}
                    <Text variant="caption" color="textSecondary">
                      {' '}kcal
                    </Text>
                  </Text>
                </View>
                <ArrowRight size={16} color={colors.textTertiary} />
                <View>
                  <Text variant="caption" color="textSecondary">
                    {d.plan.afterDate === d.today ? 'Today' : formatShortDate(d.plan.afterDate)}
                  </Text>
                  <Text variant="numM" tabular>
                    {formatNumber(d.plan.after)}
                    <Text variant="caption" color="textSecondary">
                      {' '}kcal
                    </Text>
                  </Text>
                </View>
              </View>
              <Text variant="caption" color="textSecondary">
                {d.plan.reason} Daily budget before exercise{d.eatBack ? '; logged workouts add their own calories on the day' : ''}.
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
              style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 44 }}>
              <CalendarCheck size={18} color={colors.textSecondary} />
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
