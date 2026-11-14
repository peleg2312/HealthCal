import React, { useState } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { motion, useTheme } from '@/theme';

import { useFadeAfter, usePour, useReachFlash } from './motion';
import type { GoalKind } from './vesselLayout';

/**
 * A flat level bar: track, flat fill in the data colour and a rim tick (the
 * level line) at the current value, standing proud of the bar above and
 * below. Square-ish ends (radius 2), never a pill. Do not clip the parent:
 * the tick overhangs the bar by 4 px (7 px once a goal is reached).
 *
 * Past 1 the fill reaches the end. With the default `goalKind="limit"` the
 * part over target is drawn in `warning` (neutral, never red). With
 * `goalKind="reach"` (water, minutes, protein) nothing turns amber: at or past
 * 1 the whole bar is the data colour and the tick becomes the brim tick at
 * the end, taller and 1 px heavier, so a reached goal is told from 98% in a
 * still picture. It flashes once in the data colour when the level crosses the
 * goal on screen, and `onReached` fires then (see `Vessel` for the rule).
 */
export function ProgressBar({
  progress,
  color,
  height = 8,
  trackColor,
  tick = true,
  overColor,
  goalKind = 'limit',
  onReached,
  animate = true,
  delay = 0,
  memoryKey,
  style,
}: {
  /** 0..1 of the target. Values above 1 show the over-target part in `overColor` (a limit) or the brim tick (a goal to reach). */
  progress: number;
  color: string;
  /** 8 by default, 6 inside dense cards. */
  height?: number;
  trackColor?: string;
  /** The rim tick at the value. On by default; hide it only for decorative bars. */
  tick?: boolean;
  /** 'limit' only. Defaults to `warning`. */
  overColor?: string;
  /** 'limit' (default): the part past 1 is amber. 'reach': a goal to get to, never amber; at or past 1 the bar is full and wears the brim tick. */
  goalKind?: GoalKind;
  /** 'reach' only: called once when the level crosses the goal while the bar is on screen, in the same tick as the change. */
  onReached?: () => void;
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
  const reach = goalKind === 'reach';
  const reached = reach && p >= 1;
  // Share of the bar that is within target when over a limit: the rest is the over part.
  const within = !reach && p > 1 ? 1 / p : 1;
  const [w, setW] = useState(0);
  const pour = usePour(target, { animate, delay, memoryKey, duration: motion.duration.pourSmall });
  const { level, settle } = pour;
  const brimOpacity = useFadeAfter(reached, pour.endsIn, pour.instant);
  const flash = useReachFlash(reached, { delay: pour.endsIn, instant: pour.instant, memoryKey, onReached });
  return (
    <View style={[{ height, justifyContent: 'center' }, style]} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      <View style={{ height, borderRadius: radius.track, backgroundColor: trackColor ?? colors.track, overflow: 'hidden' }}>
        {/* Keyed by the width: the animated styles are first worked out with the real width, so the bar never shows a frame full with the tick at 0. */}
        {w > 0 ? <BarFill key={w} w={w} height={height} level={level} color={color} within={within} overColor={overColor ?? colors.warning} /> : null}
      </View>
      {w > 0 ? <BarTicks key={w} w={w} height={height} level={level} settle={settle} reached={reached} tick={tick && p > 0} color={color} rim={colors.rim} brimOpacity={brimOpacity} flash={flash} /> : null}
    </View>
  );
}

/** The fill: a clipping window slides open over a fill that stays put (two opposite transforms), so the over-target part is revealed at its true place. */
function BarFill({ w, height, level, color, within, overColor }: { w: number; height: number; level: SharedValue<number>; color: string; within: number; overColor: string }) {
  const clip = useAnimatedStyle(() => ({ transform: [{ translateX: -(1 - level.get()) * w }] }));
  const content = useAnimatedStyle(() => ({ transform: [{ translateX: (1 - level.get()) * w }] }));
  return (
    <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: w, height, overflow: 'hidden' }, clip]}>
      <Animated.View style={[{ width: w, height, flexDirection: 'row' }, content]}>
        <View style={{ flex: within, backgroundColor: color }} />
        {within < 1 ? <View style={{ flex: 1 - within, backgroundColor: overColor }} /> : null}
      </Animated.View>
    </Animated.View>
  );
}

function BarTicks({ w, height, level, settle, reached, tick, color, rim, brimOpacity, flash }: { w: number; height: number; level: SharedValue<number>; settle: SharedValue<number>; reached: boolean; tick: boolean; color: string; rim: string; brimOpacity: SharedValue<number>; flash: SharedValue<number> }) {
  const tickStyle = useAnimatedStyle(() => ({ opacity: level.get() > 0.0005 ? 1 : 0, transform: [{ translateX: level.get() * w + settle.get() }] }));
  const brimStyle = useAnimatedStyle(() => ({ opacity: brimOpacity.get() }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.get() }));
  const tickH = height + 8;
  return (
    <>
      {reached && tick ? <Animated.View pointerEvents="none" style={[{ position: 'absolute', right: -5, top: -10, width: 10, height: height + 20, borderRadius: 2, backgroundColor: color }, flashStyle]} /> : null}
      {tick ? (
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: -4, left: 0, width: 0, height: tickH }, tickStyle]}>
          <View style={{ position: 'absolute', left: -1.5, width: 3, height: tickH, borderRadius: 1, backgroundColor: rim }} />
          {/* The brim tick of a reached goal: the same line, taller and 1 px heavier, at the end. */}
          {reached ? <Animated.View style={[{ position: 'absolute', left: -2, top: -3, width: 4, height: tickH + 6, borderRadius: 1, backgroundColor: rim }, brimStyle]} /> : null}
        </Animated.View>
      ) : null}
    </>
  );
}
