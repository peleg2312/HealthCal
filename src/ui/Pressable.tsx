import React, { useRef } from 'react';
import { Animated, Pressable as RNPressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

import { haptic } from './haptics';

const AnimatedPressable = Animated.createAnimatedComponent(RNPressable);

export interface PressableScaleProps extends Omit<PressableProps, 'style' | 'children'> {
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  /** Scale while pressed. 1 disables the effect. */
  scaleTo?: number;
  feedback?: 'tap' | 'press' | 'select' | 'none';
}

/**
 * Pressable with a spring scale and optional haptic, the base of every
 * tappable surface. It renders a single node, so layout styles (flex, width,
 * margins) passed in `style` behave exactly as on a View.
 */
export function PressableScale({ style, scaleTo = 0.97, feedback = 'tap', onPressIn, onPressOut, onPress, disabled, children, ...rest }: PressableScaleProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const to = (v: number) => Animated.spring(scale, { toValue: v, useNativeDriver: true, speed: 40, bounciness: 4 }).start();
  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      accessibilityRole={rest.accessibilityRole ?? 'button'}
      onPressIn={(e) => {
        to(scaleTo);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        to(1);
        onPressOut?.(e);
      }}
      onPress={(e) => {
        if (feedback !== 'none') haptic[feedback]();
        onPress?.(e);
      }}
      style={[style, { transform: [{ scale }] }, disabled && { opacity: 0.45 }]}>
      {children}
    </AnimatedPressable>
  );
}
