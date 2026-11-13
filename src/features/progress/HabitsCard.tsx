import { ChevronRight, Droplet, Dumbbell, Moon } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';

import { hoursText, plural, SLEEP_TARGET_HOURS, WEEKLY_ACTIVE_MINUTES, type PeriodSummary } from '@/lib/insights';
import { formatVolume } from '@/lib/units';
import { useTheme } from '@/theme';
import type { UnitSystem } from '@/types';
import { Card, Divider, PressableScale, ProgressBar, Text } from '@/ui';

import { go } from './parts';

function HabitRow({
  testID,
  route,
  icon,
  color,
  title,
  value,
  unit,
  detail,
  progress,
}: {
  testID: string;
  route: string;
  icon: React.ReactNode;
  color: string;
  title: string;
  value: string | null;
  unit?: string;
  detail: string;
  progress: number;
}) {
  const { colors, spacing, radius } = useTheme();
  return (
    <PressableScale testID={testID} onPress={() => go(route)} scaleTo={0.985} accessibilityLabel={`${title}: ${value ?? 'no data'} ${unit ?? ''}. ${detail}`} style={{ gap: spacing.sm, paddingVertical: spacing.xs }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <View style={{ width: 36, height: 36, borderRadius: radius.sm, backgroundColor: `${color}22`, alignItems: 'center', justifyContent: 'center' }}>{icon}</View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="bodyStrong">{title}</Text>
          <Text variant="caption" color="textSecondary" numberOfLines={2}>
            {detail}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
          <Text variant="numM" tabular color={value ? 'text' : 'textTertiary'}>
            {value ?? '–'}
          </Text>
          {unit && value ? (
            <Text variant="caption" color="textSecondary">
              {unit}
            </Text>
          ) : null}
        </View>
        <ChevronRight size={18} color={colors.textTertiary} />
      </View>
      <ProgressBar progress={progress} color={color} height={6} style={{ marginLeft: 48 }} />
    </PressableScale>
  );
}

export function HabitsCard({ summary, units }: { summary: PeriodSummary; units: UnitSystem }) {
  const { colors, spacing } = useTheme();
  const w = summary.water;
  const a = summary.activity;
  const s = summary.sleep;
  const weekly = Math.round(a.weeklyMinutes);
  const water = w ? formatVolume(w.avgMl, units).split(' ') : null;
  return (
    <Card testID="progress-habits" style={{ gap: spacing.md }}>
      <Text variant="h3">Water, activity and sleep</Text>
      <HabitRow
        testID="progress-habit-water"
        route="/water"
        color={colors.water}
        icon={<Droplet size={18} color={colors.water} />}
        title="Hydration"
        value={water ? water[0] : null}
        unit={water ? `${water[1]} / day` : undefined}
        detail={w ? `Goal met on ${w.daysAtGoal} of ${w.daysTracked} days · goal ${formatVolume(w.avgGoalMl, units)}` : 'No drinks logged in this range yet'}
        progress={w ? w.avgMl / w.avgGoalMl : 0}
      />
      <Divider />
      <HabitRow
        testID="progress-habit-activity"
        route="/train"
        color={colors.exercise}
        icon={<Dumbbell size={18} color={colors.exercise} />}
        title="Activity"
        value={a.minutes ? `${weekly}` : null}
        unit="min / week"
        detail={
          a.minutes
            ? `${plural(a.sessions, 'session')} · guideline ${WEEKLY_ACTIVE_MINUTES} min`
            : 'No workouts logged in this range yet'
        }
        progress={weekly / WEEKLY_ACTIVE_MINUTES}
      />
      <Divider />
      <HabitRow
        testID="progress-habit-sleep"
        route="/sleep"
        color={colors.sleep}
        icon={<Moon size={18} color={colors.sleep} />}
        title="Sleep"
        value={s ? hoursText(s.avgHours).replace(' h', '') : null}
        unit="h / night"
        detail={s ? `${plural(s.nights, 'night')} logged · quality ${s.avgQuality.toFixed(1)} of 5 · aim for ${SLEEP_TARGET_HOURS} to 9 h` : 'No sleep logged in this range yet'}
        progress={s ? s.avgHours / SLEEP_TARGET_HOURS : 0}
      />
    </Card>
  );
}
