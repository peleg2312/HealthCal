import React from 'react';
import { useWindowDimensions, View } from 'react-native';

import { useTheme } from '@/theme';
import { AnimatedNumber, Button, MiniCup, Sheet, Text } from '@/ui';

import { milestoneCopy, pourIndex, type StreakMilestone } from './rules';

/** Cups wait for the sheet to slide up before the first one pours (6 x 40 ms). */
const SHEET_LEAD = 6;

/**
 * The fuller streak moment at 7, 30 and 100 days: one cup per logged day,
 * poured left to right in sequence, the count ticking up beside it, and one
 * neutral line. Shown once per milestone on this device, closed with Done or
 * the backdrop; it never blocks the log that caused it (that is already saved).
 */
export function MilestoneSheet({ milestone, onClose }: { milestone: StreakMilestone | null; onClose: () => void }) {
  const { colors, spacing } = useTheme();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const n = milestone ?? 0;
  const copy = milestone ? milestoneCopy(milestone) : null;
  // Rows of at most 10 cups that fit the sheet (40 px of padding each side, 6 px gaps).
  const perRow = n <= 7 ? n : 10;
  const inner = Math.min(screenW, 560) - 40 - 2;
  // ...and short enough that the whole moment fits on a short phone without scrolling: the sheet
  // is at most 88% of the window, and about 260 px of it is the handle, count, words and Done.
  const rows = Math.ceil(n / Math.max(1, perRow));
  const tallest = Math.floor((screenH * 0.88 - 260 - (rows - 1) * 8) / Math.max(1, rows) / 1.27);
  const cupW = Math.max(12, Math.min(30, tallest, Math.floor((inner - (perRow - 1) * 6) / Math.max(1, perRow))));
  const cupH = Math.round(cupW * 1.27);
  return (
    <Sheet visible={milestone !== null} onClose={onClose} footer={<Button testID="streak-milestone-done" title="Done" variant="secondary" onPress={onClose} />}>
      {copy ? (
        <View testID="today-streak-milestone" style={{ gap: spacing.md }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, rowGap: 8, width: perRow * cupW + (perRow - 1) * 6 }} accessibilityLabel={`${n} logged days`}>
            {Array.from({ length: n }, (_, i) => (
              <MiniCup key={i} index={SHEET_LEAD + pourIndex(i, n)} progress={1} width={cupW} height={cupH} color={colors.calories} />
            ))}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }} accessible accessibilityLabel={`${n} days`}>
            <AnimatedNumber variant="numXL" value={n} from={0} delay={SHEET_LEAD * 40} color="caloriesInk" />
            <Text variant="unit" style={{ fontSize: 18 }}>
              days
            </Text>
          </View>
          <View style={{ gap: 4 }}>
            <Text variant="h3">{copy.title}</Text>
            <Text variant="body" color="textSecondary">
              {copy.line}
            </Text>
          </View>
        </View>
      ) : null}
    </Sheet>
  );
}
