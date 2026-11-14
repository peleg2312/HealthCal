import React from 'react';
import { View } from 'react-native';

import { useTheme } from '@/theme';
import { Button, CupKey, Sheet, Text } from '@/ui';

const READS: { title: string; why: string }[] = [
  { title: 'Exercise', why: 'Your workouts: what kind, when they started and ended, and their name.' },
  { title: 'Active calories burned', why: 'What a workout burned above resting. This is what is added to your day.' },
  { title: 'Total calories burned', why: 'The workout\'s total, kept beside it so resting energy is never counted twice.' },
  { title: 'Distance', why: 'How far a run, ride or swim was.' },
];

/**
 * Shown before Android's own permission screen: what will be asked, what each
 * thing is for, and what is not asked. Android only shows its screen a couple
 * of times, so the person should know what is coming before it appears.
 */
export function ExplainSheet({ visible, busy, onClose, onContinue }: { visible: boolean; busy: boolean; onClose: () => void; onContinue: () => void }) {
  const { colors, spacing } = useTheme();
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Before Android asks"
      footer={<Button testID="health-sync-continue" title="Continue to Health Connect" loading={busy} onPress={onContinue} />}>
      <View style={{ gap: spacing.md }} testID="health-sync-explain">
        <Text variant="body" color="textSecondary">
          Next, Health Connect shows its own screen. HealthCal asks to read four things, from the last 30 days onwards:
        </Text>
        <View style={{ gap: spacing.md }}>
          {READS.map((r) => (
            <View key={r.title} style={{ flexDirection: 'row', gap: spacing.md }}>
              <CupKey color={colors.exercise} size={9} style={{ marginTop: 6 }} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="bodyStrong">{r.title}</Text>
                <Text variant="caption" color="textSecondary">
                  {r.why}
                </Text>
              </View>
            </View>
          ))}
        </View>
        <Text variant="body" color="textSecondary">
          It does not ask for heart rate, sleep, weight, location or anything else, and it cannot write to Health Connect. You can allow only some of the four: without the
          calories, workouts are still added, with the app&apos;s own estimate.
        </Text>
      </View>
    </Sheet>
  );
}
