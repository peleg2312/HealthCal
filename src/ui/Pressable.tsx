import React, { useEffect, useState } from 'react';
import { Animated, Platform, Pressable as RNPressable, StyleSheet, type Insets, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

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

// ------------------------------------------------------------ web hit area
//
// react-native-web ignores `hitSlop`, so on web a 32 or 36 px control would keep a 32 or 36 px
// target. There the slop becomes a real, invisible area: a `::after` box that reaches `hitSlop`
// px past the control on each side. It belongs to the control, so a tap on it is a tap on the
// control; it sits behind the control's own content and takes no part in layout, so nothing
// moves and nothing looks different. (The box is placed from the control's padding edge, so the
// control's own border width is added to reach `hitSlop` px past its outer edge.)

type Slop = { top: number; right: number; bottom: number; left: number };

function slopOf(hitSlop: PressableProps['hitSlop']): Slop | null {
  if (hitSlop == null) return null;
  const px = (v: number | undefined) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : 0);
  const s = typeof hitSlop === 'number' ? { top: px(hitSlop), right: px(hitSlop), bottom: px(hitSlop), left: px(hitSlop) } : { top: px((hitSlop as Insets).top), right: px((hitSlop as Insets).right), bottom: px((hitSlop as Insets).bottom), left: px((hitSlop as Insets).left) };
  return s.top || s.right || s.bottom || s.left ? s : null;
}

const hitRules = new Set<string>();

/** Adds the CSS rule for one slop ('top-right-bottom-left' in px) the first time it is used (web only). */
function ensureHitRule(key: string) {
  if (hitRules.has(key) || typeof document === 'undefined') return;
  hitRules.add(key);
  const [top, right, bottom, left] = key.split('-');
  let el = document.getElementById('healthcal-hit-areas') as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = 'healthcal-hit-areas';
    document.head.appendChild(el);
  }
  el.appendChild(document.createTextNode(`[data-hit="${key}"]::after{content:"";position:absolute;z-index:-1;top:-${top}px;right:-${right}px;bottom:-${bottom}px;left:-${left}px}`));
}

/** Web: the `data-hit` value that gives a control its slop as a real hit area. Undefined on native, where `hitSlop` works. */
function useWebHitArea(hitSlop: PressableProps['hitSlop'], style: StyleProp<ViewStyle>): string | undefined {
  const slop = Platform.OS === 'web' ? slopOf(hitSlop) : null;
  let s: Slop | null = null;
  if (slop) {
    const flat = StyleSheet.flatten(style) ?? {};
    const border = (side?: number) => Math.ceil(typeof side === 'number' ? side : typeof flat.borderWidth === 'number' ? flat.borderWidth : 0);
    s = { top: slop.top + border(flat.borderTopWidth), right: slop.right + border(flat.borderRightWidth), bottom: slop.bottom + border(flat.borderBottomWidth), left: slop.left + border(flat.borderLeftWidth) };
  }
  const key = s ? `${s.top}-${s.right}-${s.bottom}-${s.left}` : undefined;
  useEffect(() => {
    if (key) ensureHitRule(key);
  }, [key]);
  return key;
}

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
 *
 * `hitSlop` widens the touch target without changing how the control looks or
 * where it sits, on every platform: natively through the platform, on web as
 * an invisible area around the control (react-native-web ignores the prop).
 * Use it to bring a control that is drawn smaller than 44 px up to a 44 px
 * target: `hitSlop={(44 - size) / 2}`.
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
  const hit = useWebHitArea(rest.hitSlop, style);
  return (
    <AnimatedPressable
      {...rest}
      {...(hit ? ({ dataSet: { hit } } as object) : null)}
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
