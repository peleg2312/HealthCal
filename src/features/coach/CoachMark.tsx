import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';
import { motion, Vessel } from '@/ui';

import { coachMarkFill } from './markFill';

/**
 * The coach's mark: the kit's open cup, filled with a tint of the primary colour (`coachMarkFill`,
 * ./markFill.ts: the level line at 3:1 on the fill and the fill at 3:1 on the page wherever a palette
 * allows it), with the `rim` level line on top. One motif in three sizes (ruling L2, fix X6): the hero
 * over the greeting (56 x 72 on a window 700 px tall or more, else 44 x 56; pours in once when the
 * coach opens), the small one beside every AI answer (16 x 20, a 2.5 px line), and the same small cup
 * pouring in a loop while the coach works (./WaitingRow.tsx). Decorative: hidden from screen readers.
 */
const SIZES = {
  heroTall: { width: 56, height: 72, rim: 3 },
  hero: { width: 44, height: 56, rim: 3 },
  small: { width: 16, height: 20, rim: 2.5 },
} as const;

export function CoachMark({
  size,
  level = 0.55,
  animate = false,
  duration = motion.duration.pourSmall,
  memoryKey,
  testID,
  style,
}: {
  size: 'heroTall' | 'hero' | 'small';
  level?: number;
  animate?: boolean;
  duration?: number;
  memoryKey?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, chartFill } = useTheme();
  const s = SIZES[size];
  const fill = coachMarkFill(colors, chartFill);
  return (
    <View testID={testID} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none" style={style}>
      <Vessel value={level} max={1} color={fill.color} width={s.width} height={s.height} rimWidth={s.rim} animate={animate} duration={duration} memoryKey={memoryKey} />
    </View>
  );
}
