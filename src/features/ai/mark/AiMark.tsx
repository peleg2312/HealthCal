import React, { useEffect, useState } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

import { useTheme } from '@/theme';
import { ease, motion, useReducedMotion, Vessel } from '@/ui';

import { aiMarkFill, dropColor } from './fill';
import { startWaitLoop, waitDuration, WAIT_HIGH, WAIT_REST } from './loop';

/**
 * The AI's mark: the kit's open cup with the one thing no other cup in the app has, a drop above its
 * open top. Every data cup is filled by the person's own logging; the AI's cup is the one filled from
 * outside, a drop at a time: "this was poured in by an estimate, check it". The cup is the coach's cup
 * (a tint of the primary colour from `aiMarkFill`, the `rim` level line on top); the drop is a small
 * square turned 45 degrees in the level line's colour (`dropColor`).
 *
 * One mark in three sizes, wherever the AI made something or is working:
 * - 'hero': over the coach's greeting (44 x 56 cup; `tall` is the 56 x 72 one for a window 700 px tall or more).
 * - 'row': beside an AI answer, the waiting row, the analysing steps and the estimate's result (16 x 20 cup).
 * - 'small': the source mark of an AI-estimated food (8 x 10 cup; see ./SourceMark.tsx).
 *
 * The box is the cup plus the room the drop needs above it (`AI_MARK_BOX`); the cup sits at its
 * bottom, so a caller that lines things up with the cup lines up with the box's bottom edge.
 *
 * `working` pours it in a loop while the AI works (./loop.ts: 1,120 ms a turn): the drop falls into
 * the cup as the level pours up, the level falls back and the drop returns. The loop never claims a
 * share done. Under reduced motion nothing loops: the cup rests at `level` with the drop above it.
 * Only transforms and opacity animate. Decorative: hidden from screen readers, the words beside it
 * carry the meaning.
 */
export type AiMarkSize = 'hero' | 'row' | 'small';

interface MarkSize {
  /** The cup. */
  width: number;
  height: number;
  rim: number;
  /** The drop: the side of its square, and how far its lower tip stays from the cup's open top. */
  drop: number;
  gap: number;
  /** The whole mark, the drop included. */
  boxHeight: number;
}

const SIZES: Record<'heroTall' | AiMarkSize, MarkSize> = {
  heroTall: { width: 56, height: 72, rim: 3, drop: 9, gap: 8, boxHeight: 93 },
  hero: { width: 44, height: 56, rim: 3, drop: 7, gap: 6, boxHeight: 72 },
  row: { width: 16, height: 20, rim: 2.5, drop: 4, gap: 2, boxHeight: 28 },
  small: { width: 8, height: 10, rim: 2, drop: 3, gap: 1, boxHeight: 15 },
};

/** The size of the whole mark (the cup and its drop) in px, for a caller that has to count its height. */
export const AI_MARK_BOX = {
  heroTall: { width: SIZES.heroTall.width, height: SIZES.heroTall.boxHeight },
  hero: { width: SIZES.hero.width, height: SIZES.hero.boxHeight },
  row: { width: SIZES.row.width, height: SIZES.row.boxHeight },
  small: { width: SIZES.small.width, height: SIZES.small.boxHeight },
} as const;

/** How much of the box is the drop's room above the cup: what a caller pulls back to keep the cup where a plain cup stood. */
export function aiMarkHeadroom(size: AiMarkSize, tall = false): number {
  const s = size === 'hero' && tall ? SIZES.heroTall : SIZES[size];
  return s.boxHeight - s.height;
}

export function AiMark({
  size,
  working = false,
  tall = false,
  level = WAIT_REST,
  animate = false,
  duration = motion.duration.pourSmall,
  memoryKey,
  testID,
  style,
}: {
  size: AiMarkSize;
  /** The pouring loop while the AI works. */
  working?: boolean;
  /** 'hero' only: the larger hero (a 56 x 72 cup) for windows 700 px tall or more. */
  tall?: boolean;
  /** The resting level, 0..1. */
  level?: number;
  /** Pour in once on mount (the hero on the coach). */
  animate?: boolean;
  /** How long that pour takes. */
  duration?: number;
  /** Passed to the cup, so a remount with the same key does not pour again. */
  memoryKey?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, chartFill } = useTheme();
  const reduce = useReducedMotion();
  const loop = working && !reduce;
  const s = size === 'hero' && tall ? SIZES.heroTall : SIZES[size];
  const fill = aiMarkFill(colors, chartFill);
  // The level the loop asked for last; null until a loop has run.
  const [looped, setLooped] = useState<number | null>(null);
  const dropOpacity = useSharedValue(1);
  const dropY = useSharedValue(0);
  const diagonal = Math.round(s.drop * Math.SQRT2);
  // The drop goes in: it ends just under the level line of a filling cup.
  const fall = diagonal + s.gap + s.height * 0.35;

  useEffect(() => {
    if (!loop) return;
    const stop = startWaitLoop((to) => {
      setLooped(to);
      if (to >= WAIT_HIGH) {
        // The pour starts and the drop falls into the cup; it is put back, unseen, once it has gone in.
        dropOpacity.set(withTiming(0, { duration: motion.duration.fade, easing: ease.exit }));
        dropY.set(withSequence(withTiming(fall, { duration: motion.duration.fade, easing: ease.exit }), withTiming(0, { duration: 0 })));
      } else {
        dropOpacity.set(withTiming(1, { duration: motion.duration.fade, easing: ease.enter }));
      }
    }, false);
    return () => {
      stop();
      cancelAnimation(dropY);
      dropY.set(0);
      dropOpacity.set(withTiming(1, { duration: motion.duration.fade, easing: ease.enter }));
    };
  }, [loop, fall, dropOpacity, dropY]);

  const dropStyle = useAnimatedStyle(() => ({ opacity: dropOpacity.get(), transform: [{ translateY: dropY.get() }] }));

  const shown = loop && looped !== null ? looped : level;
  return (
    <View
      testID={testID}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[{ width: s.width, height: s.boxHeight }, style]}>
      <Vessel
        value={shown}
        max={1}
        color={fill.color}
        width={s.width}
        height={s.height}
        rimWidth={s.rim}
        animate={animate || loop || looped !== null}
        duration={loop ? waitDuration(shown) : duration}
        memoryKey={memoryKey}
        style={{ position: 'absolute', left: 0, bottom: 0 }}
      />
      <Animated.View style={[{ position: 'absolute', left: (s.width - s.drop) / 2, top: (diagonal - s.drop) / 2, width: s.drop, height: s.drop }, dropStyle]}>
        <View style={{ width: s.drop, height: s.drop, backgroundColor: dropColor(colors), transform: [{ rotate: '45deg' }] }} />
      </Animated.View>
    </View>
  );
}
