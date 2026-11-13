import React, { useEffect, useRef } from 'react';
import { Animated, Easing, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

import { useTheme } from '@/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export interface RingProps {
  size: number;
  stroke?: number;
  /** 0..1; values above 1 draw a second lap in `overColor`. */
  progress: number;
  color: string;
  /** Second gradient stop; defaults to a solid stroke. */
  colorEnd?: string;
  overColor?: string;
  trackColor?: string;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  animate?: boolean;
}

let gradientSeq = 0;

/** Animated circular progress. Starts at 12 o'clock and fills clockwise. */
export function Ring({ size, stroke = 12, progress, color, colorEnd, overColor, trackColor, children, style, animate = true }: RingProps) {
  const { colors } = useTheme();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Number.isFinite(progress) ? Math.max(0, progress) : 0;
  const first = Math.min(1, clamped);
  const over = Math.min(1, Math.max(0, clamped - 1));
  const value = useRef(new Animated.Value(animate ? 0 : first)).current;
  const overValue = useRef(new Animated.Value(animate ? 0 : over)).current;
  const gradId = useRef(`ring-${gradientSeq++}`).current;

  useEffect(() => {
    if (!animate) {
      value.setValue(first);
      overValue.setValue(over);
      return;
    }
    Animated.parallel([
      Animated.timing(value, { toValue: first, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
      Animated.timing(overValue, { toValue: over, duration: 700, delay: 250, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
    ]).start();
  }, [first, over, animate, value, overValue]);

  const dash = value.interpolate({ inputRange: [0, 1], outputRange: [c, 0] });
  const overDash = overValue.interpolate({ inputRange: [0, 1], outputRange: [c, 0] });

  return (
    <View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Defs>
          <LinearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={color} />
            <Stop offset="1" stopColor={colorEnd ?? color} />
          </LinearGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={trackColor ?? colors.track} strokeWidth={stroke} fill="none" />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={`url(#${gradId})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${c} ${c}`}
          strokeDashoffset={dash}
          opacity={clamped > 0 ? 1 : 0}
        />
        {over > 0 ? (
          <AnimatedCircle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={overColor ?? colors.warning}
            strokeWidth={stroke}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${c} ${c}`}
            strokeDashoffset={overDash}
          />
        ) : null}
      </Svg>
      {children}
    </View>
  );
}
