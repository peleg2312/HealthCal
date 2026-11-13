import { CalendarCheck, Gauge, Lock, Scale, Sparkles, Unlock } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';

import { MIN_INSIGHT_DAYS } from '@/lib/insights';
import { useTheme } from '@/theme';
import { Button, Card, ProgressBar, Text } from '@/ui';

import { go } from './parts';

interface UnlockItem {
  id: string;
  icon: React.ReactNode;
  color: string;
  title: string;
  detail: string;
  have: number;
  need: number;
}

export function EarlyState({
  completeDays,
  weighIns,
  loggedThisWeek,
  adaptiveNeeds,
  adaptiveDays,
}: {
  completeDays: number;
  weighIns: number;
  loggedThisWeek: number;
  adaptiveNeeds: string | null;
  adaptiveDays: number;
}) {
  const { colors, spacing, radius } = useTheme();
  const items: UnlockItem[] = [
    {
      id: 'insights',
      icon: <Sparkles size={18} color={colors.primary} />,
      color: colors.primary,
      title: 'Insights and calorie trends',
      detail: `Personal insights, calorie bars and macro averages. Unlocks after ${MIN_INSIGHT_DAYS} fully logged days.`,
      have: completeDays,
      need: MIN_INSIGHT_DAYS,
    },
    {
      id: 'recap',
      icon: <CalendarCheck size={18} color={colors.carbs} />,
      color: colors.carbs,
      title: 'Weekly recap',
      detail: 'Your week in numbers, best day, one win and one focus. Unlocks after 3 logged days in a week.',
      have: loggedThisWeek,
      need: 3,
    },
    {
      id: 'weight',
      icon: <Scale size={18} color={colors.weight} />,
      color: colors.weight,
      title: 'Weight trend',
      detail: 'A smoothed trend line that ignores daily water swings. Starts with 2 weigh-ins; the weekly rate follows after a week.',
      have: weighIns,
      need: 2,
    },
    {
      id: 'adaptive',
      icon: <Gauge size={18} color={colors.exercise} />,
      color: colors.exercise,
      title: 'Your measured expenditure',
      detail: adaptiveNeeds ? `Calories you really burn, worked out from your logs. Still needs ${adaptiveNeeds}.` : 'Ready.',
      have: adaptiveDays,
      need: 10,
    },
  ];
  return (
    <Card testID="progress-early" style={{ gap: spacing.lg }}>
      <View style={{ gap: spacing.xs }}>
        <Text variant="h3">Your progress is getting started</Text>
        <Text variant="body" color="textSecondary" style={{ fontSize: 14, lineHeight: 20 }}>
          Everything here is built from your own logs. This is what will appear, and what unlocks each part.
        </Text>
      </View>
      {items.map((it) => {
        const ready = it.have >= it.need;
        return (
          <View key={it.id} testID={`progress-unlock-${it.id}`} style={{ flexDirection: 'row', gap: spacing.md }}>
            <View style={{ width: 36, height: 36, borderRadius: radius.sm, backgroundColor: `${it.color}22`, alignItems: 'center', justifyContent: 'center' }}>{it.icon}</View>
            <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Text variant="bodyStrong" style={{ flex: 1 }}>
                  {it.title}
                </Text>
                {ready ? <Unlock size={14} color={colors.success} /> : <Lock size={14} color={colors.textTertiary} />}
                <Text variant="caption" color={ready ? 'success' : 'textSecondary'} tabular>
                  {Math.min(it.have, it.need)} of {it.need}
                </Text>
              </View>
              <Text variant="caption" color="textSecondary">
                {it.detail}
              </Text>
              <ProgressBar progress={it.have / it.need} color={it.color} height={5} />
            </View>
          </View>
        );
      })}
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <Button testID="progress-early-log-food" title="Log food" size="md" onPress={() => go('/diary')} style={{ flex: 1 }} />
        <Button testID="progress-early-log-weight" title="Log weight" size="md" variant="secondary" onPress={() => go('/weight')} style={{ flex: 1 }} />
      </View>
    </Card>
  );
}
