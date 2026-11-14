import React, { useState } from 'react';
import { Animated, Platform, Pressable as RNPressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

import { useReducedMotion } from '@/theme';

import { haptic } from './haptics';

/**
 * Animated wrappers add `collapsable={false}`, a native-only hint. On web it
 * would leak into the DOM as an unknown attribute, so it is dropped there.
 */
const BasePressable = React.forwardRef<React.ComponentRef<typeof RNPressable>, PressableProps & { collapsable?: boolean }>(function BasePressable({ collapsable, ...props }, ref) {
  return <RNPressable ref={ref} {...props} {...(Platform.OS === 'web' ? null : { collapsable })} />;
});

const AnimatedPressable = Animated.createAnimatedComponent(BasePressable);

export interface PressableScaleProps extends Omit<PressableProps, 'style' | 'children'> {
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  /** Scale while pressed. 1 disables the effect. */
  scaleTo?: number;
  feedback?: 'tap' | 'press' | 'select' | 'none';
  /** Fade to 45% when disabled (default). Turn off when the content already shows it is unavailable (a dashed future day). */
  dimDisabled?: boolean;
  /** Also sink this many px while pressed (the centre + cup dips). */
  dip?: number;
}

/**
 * Pressable with a spring scale and optional haptic, the base of every
 * tappable surface. It renders a single node, so layout styles (flex, width,
 * margins) passed in `style` behave exactly as on a View.
 */
export function PressableScale({ style, scaleTo = 0.97, feedback = 'tap', dimDisabled = true, dip = 0, onPressIn, onPressOut, onPress, disabled, children, ...rest }: PressableScaleProps) {
  // Held in state, not a ref: the value is read while rendering. 1 at rest, 0 fully pressed.
  const [press] = useState(() => new Animated.Value(1));
  const reduce = useReducedMotion();
  const to = (v: number) => {
    // Reduced motion: the pressed state still shows, it just does not spring.
    if (reduce) press.setValue(v);
    else Animated.spring(press, { toValue: v, useNativeDriver: Platform.OS !== 'web', speed: 40, bounciness: 0 }).start();
  };
  const scale = scaleTo === 1 ? 1 : press.interpolate({ inputRange: [0, 1], outputRange: [scaleTo, 1] });
  const transform = dip ? [{ scale }, { translateY: press.interpolate({ inputRange: [0, 1], outputRange: [dip, 0] }) }] : [{ scale }];
  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      accessibilityRole={rest.accessibilityRole ?? 'button'}
      onPressIn={(e) => {
        to(0);
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
      style={[style, { transform }, disabled && dimDisabled && { opacity: 0.45 }]}>
      {children}
    </AnimatedPressable>
  );
}
