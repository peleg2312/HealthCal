import { router } from 'expo-router';
import { CalendarCheck, X } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';

import { useRecapReady } from '@/features/progress/recapReady';
import { addDays } from '@/lib/dates';
import { weekRangeLabel } from '@/lib/insights';
import { useStore } from '@/store';
import { useDays } from '@/store/selectors';
import { cup, useTheme } from '@/theme';
import { IconButton, ListRow, toast } from '@/ui';

import { recapLine } from './recapLine';

/**
 * "Your week is ready": announces last week's check-in early in the new week, in the coach card's place.
 * One slim row, not a card of its own: the kit's ListRow (its mark, the words, its chevron) in a surface
 * tile with the cards' 1 px line, so it is no louder than the cards around it, and the hide control
 * beside it. The week's dates and numbers are on the check-in it opens, and read out here. Opening the
 * recap marks it seen (the recap screen does that); the hide control marks it seen too, with Undo.
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
        backgroundColor: colors.surface,
        ...cup(radius.tile, 5),
        borderWidth: 1,
        borderColor: colors.border,
        paddingLeft: spacing.lg,
        paddingRight: spacing.xs,
      }}>
      <ListRow
        testID="today-recap-open"
        title="Your week is ready"
        left={<CalendarCheck size={20} color={colors.text} strokeWidth={1.9} />}
        chevron
        accessibilityHint={`${range}. ${line}. Opens the weekly check-in`}
        onPress={() => router.push(`/recap?week=${recap.week}` as never)}
        style={{ flex: 1, minWidth: 0, minHeight: 48, paddingVertical: 2 }}
      />
      <IconButton testID="today-recap-dismiss" accessibilityLabel="Hide this week's check-in" tone="clear" size={44} onPress={dismiss}>
        <X size={18} color={colors.textSecondary} />
      </IconButton>
    </View>
  );
}
