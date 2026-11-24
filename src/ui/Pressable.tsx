import React, { useEffect, useState } from 'react';
import { Animated, Platform, Pressable as RNPressable, StyleSheet, type GestureResponderEvent, type Insets, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

import { useReducedMotion, useTheme } from '@/theme';

import { ANDROID_TARGET, ariaFromState, fixedSize, isSpaceKey, pressesOnSpace, slopToReach } from './controlRules';
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

// ------------------------------------------------------------ web focus ring
//
// A keyboard user sees where focus is by one ring, the same on every control: a 2 px line in the
// look's `rim` (the level line) 2 px outside the control, so it never touches the control's own
// fill (WCAG 2.4.13: a 2 px perimeter that changes at 3:1 or more; `rim` is at least 3.9:1 on bg,
// bgElevated, surface, surfaceAlt and the tab bar in all six looks). It shows only for
// `:focus-visible`, so a tap or a click never draws it, and an element focused by code that is not
// a tab stop (tabindex -1, a sheet or a heading) is left alone. A kit text field draws it around
// its cup instead of the bare input (`FOCUS_CUP`), right against the cup's edge, so the field's
// rim-coloured border and the ring read as one heavier edge. A control inside a strip that clips
// (a horizontal scroller) passes `focusRing="inside"` to have it drawn 2 px inside its edge.

const FOCUS_VAR = '--healthcal-focus-ring';
let focusColor: string | null = null;

function ensureFocusRule() {
  if (typeof document === 'undefined' || document.getElementById('healthcal-focus-ring')) return;
  const el = document.createElement('style');
  el.id = 'healthcal-focus-ring';
  const ring = `outline:2px solid var(${FOCUS_VAR},currentColor)!important`;
  el.appendChild(
    document.createTextNode(
      [
        `:focus-visible:not([tabindex="-1"]){${ring};outline-offset:2px!important}`,
        `[data-focus-ring="inside"]:focus-visible{outline-offset:-2px!important}`,
        `[data-focus-cup]:has(>input:focus,>textarea:focus){${ring};outline-offset:0!important}`,
        `[data-focus-cup]>input:focus-visible,[data-focus-cup]>textarea:focus-visible{outline:none!important}`,
      ].join(''),
    ),
  );
  document.head.appendChild(el);
}

/** Web: keeps the focus ring in the look's level-line colour. Every kit control calls it; the work is done once per colour. */
export function useFocusRing() {
  const { colors } = useTheme();
  const color = colors.rim;
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    ensureFocusRule();
    if (focusColor === color) return;
    focusColor = color;
    document.documentElement.style.setProperty(FOCUS_VAR, color);
  }, [color]);
}

/** Web: spread on a text field's cup (the View that draws its edge) so the focus ring goes round the cup, not the input inside it. */
export const FOCUS_CUP: object = Platform.OS === 'web' ? { dataSet: { focusCup: '1' } } : {};

// ------------------------------------------------------------ Android touch area
//
// Android asks for 48 dp touch targets; the kit draws its controls at 44 (or 32 and 36 with slop
// to 44). On Android the slop grows by itself to reach 48 on every axis whose size the control's
// style fixes in numbers (width and height, or their minimums), so nothing is drawn or laid out
// differently. Other platforms keep the 44 px target.

function androidSlop(hitSlop: PressableProps['hitSlop'], style: StyleProp<ViewStyle>): PressableProps['hitSlop'] {
  if (Platform.OS !== 'android') return hitSlop;
  const flat = (StyleSheet.flatten(style) ?? {}) as Record<string, unknown>;
  return slopToReach(hitSlop as Insets | number | null | undefined, fixedSize(flat), ANDROID_TARGET) as PressableProps['hitSlop'];
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
  /** For a control that opens or closes something ("Show all"): sets the expanded state, `aria-expanded` on the web. */
  expanded?: boolean;
  /** Web: where the keyboard focus ring is drawn. 'inside' for a control in a strip that clips what reaches past it. */
  focusRing?: 'outside' | 'inside';
  /** Web only: a key handler (react-native-web forwards it to the element). */
  onKeyDown?: (e: { key: string; repeat?: boolean; target: unknown; currentTarget: unknown; defaultPrevented?: boolean; preventDefault: () => void }) => void;
  /** Web only: the element's tab stop (roving focus in a tab row or a radio group). */
  tabIndex?: 0 | -1;
  'aria-selected'?: boolean;
  'aria-checked'?: boolean | 'mixed';
  'aria-pressed'?: boolean;
  'aria-expanded'?: boolean;
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
 * target: `hitSlop={(44 - size) / 2}`. On Android it then grows to 48 dp by
 * itself where the style fixes the control's size (see `androidSlop`).
 *
 * On the web it also carries what react-native-web leaves out: `accessibilityState`
 * as the ARIA state the role reads (selected on a tab, checked on a radio or a
 * switch, pressed on a button, expanded), Space on a switch, a radio, a tab or a
 * checkbox (react-native-web presses only buttons on Space), and the focus ring.
 */
export function PressableScale({ style, scaleTo = 0.97, feedback = 'tap', dimDisabled = true, dip = 0, expanded, focusRing, onKeyDown, onPressIn, onPressOut, onPress, disabled, children, ...rest }: PressableScaleProps) {
  // Held in state, not a ref: the value is read while rendering. 1 at rest, 0 fully pressed.
  const [press] = useState(() => new Animated.Value(1));
  const reduce = useReducedMotion();
  useFocusRing();
  const to = (v: number) => {
    // Reduced motion: the pressed state still shows, it just does not spring.
    if (reduce) press.setValue(v);
    else Animated.spring(press, { toValue: v, useNativeDriver: Platform.OS !== 'web', speed: 40, bounciness: 0 }).start();
  };
  const scale = scaleTo === 1 ? 1 : press.interpolate({ inputRange: [0, 1], outputRange: [scaleTo, 1] });
  const transform = dip ? [{ scale }, { translateY: press.interpolate({ inputRange: [0, 1], outputRange: [dip, 0] }) }] : [{ scale }];
  const hit = useWebHitArea(rest.hitSlop, style);
  const role = ((rest as { role?: string }).role ?? rest.accessibilityRole ?? 'button') as string;
  const state = expanded === undefined ? rest.accessibilityState : { ...rest.accessibilityState, expanded };
  const pressed = (e: GestureResponderEvent) => {
    if (feedback !== 'none') haptic[feedback]();
    onPress?.(e);
  };
  let web: object | null = null;
  if (Platform.OS === 'web') {
    const explicit = rest as Record<string, unknown>;
    const data: Record<string, string> = {};
    if (hit) data.hit = hit;
    if (focusRing === 'inside') data.focusRing = 'inside';
    web = {
      ...ariaFromState(role, state, explicit),
      ...(Object.keys(data).length ? { dataSet: data } : null),
      onKeyDown: (e: Parameters<NonNullable<PressableScaleProps['onKeyDown']>>[0]) => {
        onKeyDown?.(e);
        if (e.defaultPrevented || disabled || !pressesOnSpace(role) || !isSpaceKey(e.key) || e.target !== e.currentTarget) return;
        // Space presses the control and never scrolls the page under it.
        e.preventDefault();
        if (!e.repeat) pressed(e as unknown as GestureResponderEvent);
      },
    };
  }
  return (
    <AnimatedPressable
      {...rest}
      {...web}
      hitSlop={androidSlop(rest.hitSlop, style)}
      accessibilityState={state}
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
      onPress={pressed}
      style={[style, { transform }, disabled && dimDisabled && { opacity: 0.45 }]}>
      {children}
    </AnimatedPressable>
  );
}
