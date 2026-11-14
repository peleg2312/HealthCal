import React, { useEffect, useState } from 'react';
import { Animated, Easing, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme';

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
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, radius } = useTheme();
  const p = Number.isFinite(progress) ? Math.max(0, progress) : 0;
  const target = Math.min(1, p);
  // Share of the bar that is within target when over: the rest is the over part.
  const within = p > 1 ? 1 / p : 1;
  const [value] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(value, { toValue: target, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [target, value]);
  const width = value.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  const tickH = height + 8;
  return (
    <View style={[{ height, justifyContent: 'center' }, style]}>
      <View style={{ height, borderRadius: radius.track, backgroundColor: trackColor ?? colors.track, overflow: 'hidden', flexDirection: 'row' }}>
        <Animated.View style={{ height, width, flexDirection: 'row' }}>
          <View style={{ flex: within, backgroundColor: color }} />
          {within < 1 ? <View style={{ flex: 1 - within, backgroundColor: overColor ?? colors.warning }} /> : null}
        </Animated.View>
      </View>
      {tick && p > 0 ? (
        <Animated.View pointerEvents="none" style={{ position: 'absolute', top: -4, left: width, width: 0, height: tickH }}>
          <View style={{ position: 'absolute', left: -1.5, width: 3, height: tickH, borderRadius: 1, backgroundColor: colors.rim }} />
        </Animated.View>
      ) : null}
    </View>
  );
}
