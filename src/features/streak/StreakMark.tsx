import { router } from 'expo-router';
import React from 'react';

import { motion, useTheme } from '@/theme';
import { AnimatedNumber, MiniCup, PressableScale, Text } from '@/ui';

/**
 * The logging streak in Today's week-strip caption row: a small cup that is
 * full once today is logged, and the count. When the day's first entry
 * extends the streak the cup pours and the number ticks up (both kit pieces,
 * instant under reduced motion). Opens the logging calendar.
 */
/**
 * The mark pours with the week strip's stagger, as the strip's last cup (position 6 in a row 40 ms apart), so
 * Today's whole entry ends with the strip and the hero cup, inside the 600 ms of routine motion, never after them.
 * (MiniCup takes no delay of its own, so the start is given as a position in the row.) `AFTER_STRIP_MS` is when its
 * count has ticked up: a line about the streak is said after it.
 */
const STREAK_INDEX = 6;
const STREAK_START_MS = STREAK_INDEX * motion.duration.stagger;
export const AFTER_STRIP_MS = STREAK_START_MS + motion.duration.pourSmall;

export function StreakMark({ days, filled }: { days: number; filled: boolean }) {
  const { colors } = useTheme();
  return (
    <PressableScale
      testID="today-streak"
      onPress={() => router.push('/consistency' as never)}
      // Starts with the words drawn on it ("33 days"): label in name.
      accessibilityLabel={`${days} ${days === 1 ? 'day' : 'days'} logging streak${filled ? '' : ', today not logged yet'}. Open the logging calendar`}
      hitSlop={6}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 32, paddingHorizontal: 4 }}>
      <MiniCup progress={filled ? 1 : 0} width={16} height={20} color={colors.calories} memoryKey="streak-today" index={STREAK_INDEX} />
      <AnimatedNumber variant="numM" value={days} memoryKey="streak-days" delay={STREAK_START_MS} duration={motion.duration.pourSmall} style={{ fontSize: 15, lineHeight: 20 }} accessibilityLabel={`${days}`} />
      <Text variant="caption" color="textSecondary">
        {days === 1 ? 'day' : 'days'}
      </Text>
    </PressableScale>
  );
}
