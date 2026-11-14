import { router } from 'expo-router';
import React from 'react';

import { useTheme } from '@/theme';
import { AnimatedNumber, MiniCup, PressableScale, Text } from '@/ui';

/**
 * The logging streak in Today's week-strip caption row: a small cup that is
 * full once today is logged, and the count. When the day's first entry
 * extends the streak the cup pours and the number ticks up (both kit pieces,
 * instant under reduced motion). Opens the logging calendar.
 */
export function StreakMark({ days, filled }: { days: number; filled: boolean }) {
  const { colors } = useTheme();
  return (
    <PressableScale
      testID="today-streak"
      onPress={() => router.push('/consistency' as never)}
      accessibilityLabel={`${days} day logging streak${filled ? '' : ', today not logged yet'}. Open the logging calendar`}
      hitSlop={6}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 32, paddingHorizontal: 4 }}>
      <MiniCup progress={filled ? 1 : 0} width={16} height={20} color={colors.calories} memoryKey="streak-today" />
      <AnimatedNumber variant="numM" value={days} memoryKey="streak-days" style={{ fontSize: 15, lineHeight: 20 }} accessibilityLabel={`${days}`} />
      <Text variant="caption" color="textSecondary">
        {days === 1 ? 'day' : 'days'}
      </Text>
    </PressableScale>
  );
}
