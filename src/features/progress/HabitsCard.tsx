import { ChevronRight } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';

import { direction, hoursText, plural, type Direction, SLEEP_MAX_HOURS, SLEEP_TARGET_HOURS, WEEKLY_ACTIVE_MINUTES, type PeriodSummary } from '@/lib/insights';
import { formatNumber, formatVolume, volumeUnit, volumeValue } from '@/lib/units';
import { useTheme } from '@/theme';
import type { UnitSystem } from '@/types';
import { Card, CupKey, Divider, PressableScale, ProgressBar, Text } from '@/ui';

import { go, TrendLegend, TrendMark } from './parts';

function HabitRow({
  testID,
  route,
  color,
  title,
  value,
  unit,
  detail,
  progress,
  trend,
  period,
}: {
  trend?: Direction | null;
  period?: string;
  testID: string;
  route: string;
  color: string;
  title: string;
  value: string | null;
  unit?: string;
  detail: string;
  progress: number;
}) {
  const { colors, spacing } = useTheme();
  return (
    <PressableScale testID={testID} onPress={() => go(route)} scaleTo={0.985} accessibilityLabel={`${title}: ${value ?? 'no data'} ${unit ?? ''}. ${detail}`} style={{ gap: spacing.sm, paddingVertical: spacing.xs }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <CupKey color={color} size={10} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="bodyStrong">{title}</Text>
          <Text variant="caption" color="textSecondary" numberOfLines={2}>
            {detail}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
          <Text variant="numM" color={value ? 'text' : 'textTertiary'}>
            {value ?? '–'}
            {unit && value ? <Text variant="unit">{` ${unit}`}</Text> : null}
          </Text>
          {value ? <TrendMark trend={trend} period={period} /> : null}
        </View>
        <ChevronRight size={18} color={colors.textTertiary} strokeWidth={1.9} />
      </View>
      <ProgressBar progress={progress} color={color} overColor={color} height={6} style={{ marginLeft: 22, marginBottom: 4 }} />
    </PressableScale>
  );
}

export function HabitsCard({ summary, previous, units }: { summary: PeriodSummary; previous?: PeriodSummary | null; units: UnitSystem }) {
  const { colors, spacing } = useTheme();
  const w = summary.water;
  const a = summary.activity;
  const s = summary.sleep;
  const weekly = Math.round(a.weeklyMinutes);
  const period = `${summary.totalDays} days`;
  const p = previous;
  return (
    <Card testID="progress-habits" style={{ gap: spacing.md }}>
      <Text variant="h3">Water, activity and sleep</Text>
      <HabitRow
        testID="progress-habit-water"
        route="/water"
        color={colors.water}
        title="Hydration"
        value={w ? formatNumber(Math.round(volumeValue(w.avgMl, units))) : null}
        unit={`${volumeUnit(units)} / day`}
        detail={w ? `Goal met on ${w.daysAtGoal} of ${w.daysTracked} days · goal ${formatVolume(w.avgGoalMl, units)}` : 'No drinks logged in this range yet'}
        progress={w ? w.avgMl / w.avgGoalMl : 0}
        trend={direction(w?.avgMl, p?.water?.avgMl, 50)}
        period={period}
      />
      <Divider />
      <HabitRow
        testID="progress-habit-activity"
        route="/train"
        color={colors.exercise}
        title="Activity"
        value={a.minutes ? `${weekly}` : null}
        unit="min / wk"
        detail={
          a.minutes
            ? `${plural(a.sessions, 'session')}, ${formatNumber(a.minutes)} min logged · hard sessions count double toward ${WEEKLY_ACTIVE_MINUTES}`
            : 'No workouts logged in this range yet'
        }
        progress={weekly / WEEKLY_ACTIVE_MINUTES}
        trend={p && (a.minutes || p.activity.minutes) ? direction(weekly, Math.round(p.activity.weeklyMinutes), 5) : null}
        period={period}
      />
      <Divider />
      <HabitRow
        testID="progress-habit-sleep"
        route="/sleep"
        color={colors.sleep}
        title="Sleep"
        value={s ? hoursText(s.avgHours).replace(' h', '') : null}
        unit="h / night"
        detail={s ? `${plural(s.nights, 'night')} logged · quality ${s.avgQuality.toFixed(1)} of 5 · aim for ${SLEEP_TARGET_HOURS} to ${SLEEP_MAX_HOURS} h` : 'No sleep logged in this range yet'}
        progress={s ? Math.min(s.avgHours, SLEEP_MAX_HOURS) / SLEEP_TARGET_HOURS : 0}
        trend={direction(s?.avgHours, p?.sleep?.avgHours, 0.1)}
        period={period}
      />
      {p ? <TrendLegend period={period} /> : null}
    </Card>
  );
}
