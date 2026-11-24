import { Lock, Unlock } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';

import { MIN_INSIGHT_DAYS } from '@/lib/insights';
import { useTheme } from '@/theme';
import { Button, Card, CupKey, ProgressBar, Text } from '@/ui';

import { go } from './parts';

interface UnlockItem {
  id: string;
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
  const { colors, spacing } = useTheme();
  const items: UnlockItem[] = [
    {
      id: 'insights',
      color: colors.primary,
      title: 'Insights and calorie trends',
      detail: `Personal insights, calorie bars and protein, carb and fat averages. Opens after ${MIN_INSIGHT_DAYS} fully logged days.`,
      have: completeDays,
      need: MIN_INSIGHT_DAYS,
    },
    {
      id: 'recap',
      color: colors.carbs,
      title: 'Weekly recap',
      detail: 'Your week in numbers, best day, one win and one focus. Opens after 3 logged days in a week.',
      have: loggedThisWeek,
      need: 3,
    },
    {
      id: 'weight',
      color: colors.weight,
      title: 'Weight trend',
      detail: 'A smoothed trend line that ignores daily water swings. Starts with 2 weigh-ins; the weekly rate follows after a week.',
      have: weighIns,
      need: 2,
    },
    {
      id: 'adaptive',
      color: colors.exercise,
      title: 'What you burn, from your logs',
      detail: adaptiveNeeds ? `What you burn in a day, worked out from your logs. Still needs ${adaptiveNeeds}.` : 'Ready.',
      have: adaptiveDays,
      need: 10,
    },
  ];
  return (
    <Card testID="progress-early" style={{ gap: spacing.lg }}>
      <View style={{ gap: spacing.xs }}>
        <Text variant="h3" accessibilityRole="header" {...({ 'aria-level': 2 } as object)}>
          Your progress is getting started
        </Text>
        <Text variant="body" color="textSecondary" style={{ fontSize: 14, lineHeight: 20 }}>
          Everything here is built from your own logs. This is what will appear, and what opens each part.
        </Text>
      </View>
      {items.map((it) => {
        const ready = it.have >= it.need;
        return (
          <View key={it.id} testID={`progress-unlock-${it.id}`} style={{ flexDirection: 'row', gap: spacing.md }}>
            <CupKey color={it.color} size={10} style={{ marginTop: 6 }} />
            <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Text variant="bodyStrong" style={{ flex: 1 }}>
                  {it.title}
                </Text>
                {ready ? <Unlock size={14} color={colors.text} /> : <Lock size={14} color={colors.textTertiary} />}
                <Text variant="caption" color={ready ? 'text' : 'textSecondary'} tabular>
                  {Math.min(it.have, it.need)} of {it.need}
                </Text>
              </View>
              <Text variant="caption" color="textSecondary">
                {it.detail}
              </Text>
              <ProgressBar progress={it.have / it.need} color={it.color} height={6} style={{ marginTop: 4, marginBottom: 4 }} />
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
