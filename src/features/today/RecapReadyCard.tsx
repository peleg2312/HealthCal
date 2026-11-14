import { router } from 'expo-router';
import { CalendarCheck, ChevronRight, X } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';

import { useRecapReady } from '@/features/progress/recapReady';
import { addDays } from '@/lib/dates';
import { weekRangeLabel } from '@/lib/insights';
import { useStore } from '@/store';
import { useDays } from '@/store/selectors';
import { cup, useTheme } from '@/theme';
import { IconButton, PressableScale, Text, toast } from '@/ui';

import { recapLine } from './recapLine';

/**
 * "Your week is ready": announces last week's check-in early in the new week.
 * Takes the coach card's place on the days it shows. Opening the recap marks
 * it seen (the recap screen does that); the dismiss control marks it seen too.
 */
export function RecapReadyCard() {
  const { colors, spacing, radius } = useTheme();
  const recap = useRecapReady();
  const end = addDays(recap.week, 6);
  const days = useDays(7, end);
  const line = recapLine(days);
  const range = weekRangeLabel(recap.week, end);

  const dismiss = () => {
    const previous = useStore.getState().settings.recapSeenWeek;
    recap.markSeen();
    toast('Check-in hidden. It stays on Progress.', {
      label: 'Undo',
      onPress: () => useStore.getState().setSettings({ recapSeenWeek: previous }),
    });
  };

  return (
    <View
      testID="today-recap-ready"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        // An alt cup (surfaceAlt, no border): a note, not a stat card.
        backgroundColor: colors.surfaceAlt,
        ...cup(radius.card),
        paddingVertical: spacing.md,
        paddingLeft: spacing.lg,
        paddingRight: spacing.sm,
      }}>
      <PressableScale
        testID="today-recap-open"
        scaleTo={0.99}
        onPress={() => router.push(`/recap?week=${recap.week}` as never)}
        accessibilityLabel={`Your week is ready, ${range}. ${line}. Open the weekly check-in`}
        style={{ flex: 1, minWidth: 0, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <CalendarCheck size={22} color={colors.text} strokeWidth={1.9} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text variant="bodyStrong" numberOfLines={1}>
            Your week is ready
            <Text variant="caption" color="textSecondary">{`  ${range}`}</Text>
          </Text>
          <Text variant="caption" color="textSecondary" numberOfLines={2}>
            {line}
          </Text>
        </View>
        <ChevronRight size={18} color={colors.textSecondary} />
      </PressableScale>
      <IconButton testID="today-recap-dismiss" accessibilityLabel="Hide this week's check-in" tone="clear" size={44} onPress={dismiss}>
        <X size={18} color={colors.textSecondary} />
      </IconButton>
    </View>
  );
}
