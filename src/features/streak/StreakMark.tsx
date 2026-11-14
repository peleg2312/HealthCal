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
 * The mark waits for today's cup in the week strip (the sixth or seventh in the
 * row, staggered 40 ms apart) to pour first, so the moment reads in order: the
 * day fills, then the streak. (MiniCup takes no delay of its own, so the wait
 * is given as a position further along the row.)
 */
export const AFTER_STRIP_MS = 6 * motion.duration.stagger + motion.duration.pourSmall;

export function StreakMark({ days, filled }: { days: number; filled: boolean }) {
  const { colors } = useTheme();
  return (
    <PressableScale
      testID="today-streak"
      onPress={() => router.push('/consistency' as never)}
      accessibilityLabel={`${days} day logging streak${filled ? '' : ', today not logged yet'}. Open the logging calendar`}
      hitSlop={6}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 32, paddingHorizontal: 4 }}>
      <MiniCup progress={filled ? 1 : 0} width={16} height={20} color={colors.calories} memoryKey="streak-today" index={AFTER_STRIP_MS / motion.duration.stagger} />
      <AnimatedNumber variant="numM" value={days} memoryKey="streak-days" delay={AFTER_STRIP_MS} duration={motion.duration.pourSmall} style={{ fontSize: 15, lineHeight: 20 }} accessibilityLabel={`${days}`} />
      <Text variant="caption" color="textSecondary">
        {days === 1 ? 'day' : 'days'}
      </Text>
    </PressableScale>
  );
}
