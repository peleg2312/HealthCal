import React, { useState } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { motion, useTheme } from '@/theme';

import { usePour } from './motion';

/**
 * A flat level bar: track, flat fill in the data colour and a rim tick (the
 * level line) at the current value, standing proud of the bar above and
 * below. Past 1 the fill reaches the end and the part over target is drawn in
 * `warning` (neutral, never red). Square-ish ends (radius 2), never a pill.
 * Do not clip the parent: the tick overhangs the bar by 4 px.
 */
export function ProgressBar({
  progress,
  color,
  height = 8,
  trackColor,
  tick = true,
  overColor,
  animate = true,
  delay = 0,
  memoryKey,
  style,
}: {
  /** 0..1 of the target. Values above 1 show the over-target part in `overColor`. */
  progress: number;
  color: string;
  /** 8 by default, 6 inside dense cards. */
  height?: number;
  trackColor?: string;
  /** The rim tick at the value. On by default; hide it only for decorative bars. */
  tick?: boolean;
  /** Defaults to `warning`. */
  overColor?: string;
  /** Pour on mount and on change (default true). Reduced motion always jumps. */
  animate?: boolean;
  /** Wait before pouring (a stagger). */
  delay?: number;
  /** Remember the level for the session, so a remount with the same value does not pour again. */
  memoryKey?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, radius } = useTheme();
  const p = Number.isFinite(progress) ? Math.max(0, progress) : 0;
  const target = Math.min(1, p);
  // Share of the bar that is within target when over: the rest is the over part.
  const within = p > 1 ? 1 / p : 1;
  const [w, setW] = useState(0);
  const { level, settle } = usePour(target, { animate, delay, memoryKey, duration: motion.duration.pourSmall });
  // A clipping window slides open over a fill that stays put (two opposite transforms), so the
  // over-target part is revealed at its true place instead of riding at the leading edge.
  const clip = useAnimatedStyle(() => ({ transform: [{ translateX: -(1 - level.get()) * w }] }));
  const content = useAnimatedStyle(() => ({ transform: [{ translateX: (1 - level.get()) * w }] }));
  const tickStyle = useAnimatedStyle(() => ({ opacity: level.get() > 0.0005 ? 1 : 0, transform: [{ translateX: level.get() * w + settle.get() }] }));
  const tickH = height + 8;
  return (
    <View style={[{ height, justifyContent: 'center' }, style]} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      <View style={{ height, borderRadius: radius.track, backgroundColor: trackColor ?? colors.track, overflow: 'hidden' }}>
        {w > 0 ? (
          <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: w, height, overflow: 'hidden' }, clip]}>
            <Animated.View style={[{ width: w, height, flexDirection: 'row' }, content]}>
              <View style={{ flex: within, backgroundColor: color }} />
              {within < 1 ? <View style={{ flex: 1 - within, backgroundColor: overColor ?? colors.warning }} /> : null}
            </Animated.View>
          </Animated.View>
        ) : null}
      </View>
      {tick && p > 0 && w > 0 ? (
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: -4, left: 0, width: 0, height: tickH }, tickStyle]}>
          <View style={{ position: 'absolute', left: -1.5, width: 3, height: tickH, borderRadius: 1, backgroundColor: colors.rim }} />
        </Animated.View>
      ) : null}
    </View>
  );
}
