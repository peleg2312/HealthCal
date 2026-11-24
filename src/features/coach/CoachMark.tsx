import React from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';

import { AiMark, aiMarkHeadroom } from '@/features/ai/mark';
import { motion } from '@/ui';

/**
 * The coach's mark is the AI's mark (`AiMark`, `@/features/ai/mark`): the kit's open cup filled with a
 * tint of the primary colour, the `rim` level line on top, and the AI's drop above its open top. One
 * motif in three sizes (ruling L2, fix X6): the hero over the greeting (56 x 72 on a window 700 px
 * tall or more, else 44 x 56; pours in once when the coach opens), the small one beside every AI
 * answer (16 x 20, a 2.5 px line), and the same small cup pouring in a loop while the coach works
 * (./WaitingRow.tsx).
 *
 * This wrapper keeps the coach's layout as it was released: the cup stands exactly where the plain
 * cup stood, and the drop hangs above it in the room that was already there (the mark is pulled up by
 * the drop's own height, `aiMarkHeadroom`), so no row and no greeting moved. Decorative: hidden from
 * screen readers.
 */
export function CoachMark({
  size,
  level = 0.55,
  animate = false,
  working = false,
  duration = motion.duration.pourSmall,
  memoryKey,
  testID,
  style,
}: {
  size: 'heroTall' | 'hero' | 'small';
  level?: number;
  animate?: boolean;
  /** The pouring loop while the coach works. */
  working?: boolean;
  duration?: number;
  memoryKey?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const hero = size !== 'small';
  const tall = size === 'heroTall';
  return (
    <AiMark
      size={hero ? 'hero' : 'row'}
      tall={tall}
      working={working}
      level={level}
      animate={animate}
      duration={duration}
      memoryKey={memoryKey}
      testID={testID}
      style={[{ marginTop: -aiMarkHeadroom(hero ? 'hero' : 'row', tall) }, style]}
    />
  );
}
