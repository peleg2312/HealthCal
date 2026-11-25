import React, { useEffect, useState } from 'react';
import { Animated, Platform, Pressable as RNPressable, StyleSheet, type GestureResponderEvent, type Insets, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

import { useReducedMotion, useTheme } from '@/theme';

import { ANDROID_TARGET, ariaFromState, fixedSize, isSpaceKey, pressesOnSpace, slopToReach, wantsAndroidTarget } from './controlRules';
import { haptic } from './haptics';
import { passRef, useToastControl } from './toastControls';

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
// A keyboard user sees where focus is by one ring, the same on every control: the level line's
// 3 px in the look's `rim`, 2 px outside the control, so it never touches the control's own fill
// (WCAG 2.4.13: at least a 2 px perimeter that changes at 3:1 or more; `rim` is at least 3.9:1 on
// bg, bgElevated, surface, surfaceAlt and the tab bar in all six looks, and 3 px keeps that area
// at a rounded cup's corners too). It shows only for `:focus-visible`, so a tap or a click never
// draws it, and an element focused by code that is not a tab stop (tabindex -1: a sheet, a
// heading) is left alone. A kit text field draws it round its cup instead of the bare input
// (`FOCUS_CUP`), right against the cup's edge, so the field's rim-coloured border and the ring
// read as one heavier edge. A tab, and a control that passes `focusRing="inside"`, has it drawn
// just inside its edge: tabs fill their row edge to edge, and a strip or a bar that clips (the week
// strip, the tab bar at the bottom of the window) would cut a ring drawn outside.

const FOCUS_VAR = '--healthcal-focus-ring';
let focusColor: string | null = null;

function ensureFocusRule() {
  if (typeof document === 'undefined' || document.getElementById('healthcal-focus-ring')) return;
  const el = document.createElement('style');
  el.id = 'healthcal-focus-ring';
  const ring = `outline:3px solid var(${FOCUS_VAR},currentColor)!important`;
  el.appendChild(
    document.createTextNode(
      [
        `:focus-visible:not([tabindex="-1"]){${ring};outline-offset:2px!important}`,
        `[data-focus-ring="inside"]:focus-visible{outline-offset:-3px!important}`,
        `[data-focus-cup]:has(>input:focus,>textarea:focus){${ring};outline-offset:0!important}`,
        // A browser without :has() rings the cup whenever focus is inside it.
        `@supports not selector(:has(a)){[data-focus-cup]:focus-within{${ring};outline-offset:0!important}}`,
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
// differently. A browser on an Android phone used by touch does the same through the web's hit
// area (`wantsAndroidTarget`). Other platforms keep the 44 px target.

/** True where the kit's touch areas grow to 48: the Android app, and an Android browser used by touch. Read once. */
export const ANDROID_TOUCH = wantsAndroidTarget(
  Platform.OS,
  typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
  Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia('(pointer: coarse)').matches : false,
);

function androidSlop(hitSlop: PressableProps['hitSlop'], style: StyleProp<ViewStyle>): PressableProps['hitSlop'] {
  if (!ANDROID_TOUCH) return hitSlop;
  const flat = (StyleSheet.flatten(style) ?? {}) as Record<string, unknown>;
  return slopToReach(hitSlop as Insets | number | null | undefined, fixedSize(flat), ANDROID_TARGET) as PressableProps['hitSlop'];
}

export interface PressableScaleProps extends Omit<PressableProps, 'style' | 'children' | 'onKeyDown'> {
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
  /** Scale while pressed. 1 disables the effect. */
  scaleTo?: number;
  /**
   * A haptic played by the press itself. None by default: a haptic means something (a choice made: 'select'), so a
   * plain press plays none, and what a press brings about (a log, a refusal, a delete) plays its own `haptic.*`
   * in the handler, where its meaning is known.
   */
  feedback?: 'tap' | 'press' | 'select' | 'none';
  /** Fade to 45% when disabled (default). Turn off when the content already shows it is unavailable (a dashed future day). */
  dimDisabled?: boolean;
  /** Also sink this many px while pressed (the centre + cup dips). */
  dip?: number;
  /** For a control that opens or closes something ("Show all"): sets the expanded state, `aria-expanded` on the web. */
  expanded?: boolean;
  /** Web: where the keyboard focus ring is drawn. 'inside' (the default for a tab) for a control in a strip or a bar that clips what reaches past it. */
  focusRing?: 'outside' | 'inside';
  /** Web only: a key handler (react-native-web forwards it to the element). */
  onKeyDown?: (e: { key: string; repeat?: boolean; target: unknown; currentTarget: unknown; defaultPrevented?: boolean; preventDefault: () => void }) => void;
}

/**
 * Pressable with a spring scale and an optional haptic (none unless `feedback` asks), the base of every
 * tappable surface. It renders a single node, so layout styles (flex, width,
 * margins) passed in `style` behave exactly as on a View.
 *
 * `hitSlop` widens the touch target without changing how the control looks or
 * where it sits, on every platform: natively through the platform, on web as
 * an invisible area around the control (react-native-web ignores the prop).
 * Use it to bring a control that is drawn smaller than 44 px up to a 44 px
 * target: `hitSlop={(44 - size) / 2}`. On Android, and in a browser on an
 * Android phone used by touch, it then grows to 48 by itself where the style
 * fixes the control's size (see `androidSlop`).
 *
 * On the web it also carries what react-native-web leaves out: `accessibilityState`
 * as the ARIA state the role reads (selected on a tab, checked on a radio or a
 * switch, pressed on a button, expanded), Space on a switch, a radio, a tab or a
 * checkbox (react-native-web presses only buttons on Space), and the focus ring.
 */
export function PressableScale({ style, scaleTo = 0.97, feedback = 'none', dimDisabled = true, dip = 0, expanded, focusRing, onKeyDown, onPressIn, onPressOut, onPress, disabled, children, ...rest }: PressableScaleProps) {
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
  // The touch area past the drawn edge: what the caller gave, grown to 48 where Android asks for it.
  const slop = androidSlop(rest.hitSlop, style);
  const hit = useWebHitArea(slop, style);
  // On a phone the control is on its screen's list, so a toast rests clear of it (./toastControls).
  const ownRef = useToastControl<unknown>();
  const given = (rest as { ref?: unknown }).ref;
  const setRef = (n: unknown) => {
    ownRef.current = n;
    passRef(given, n);
  };
  // Web: a named control's icons only decorate (its name says what it does), so they are hidden from assistive
  // technology, whoever drew them: a screen's own icon in a pressable row or tile as much as a kit Button's. An
  // svg that carries a name of its own keeps it. Run after every render, as the icons inside may change.
  const named = typeof rest.accessibilityLabel === 'string' ? rest.accessibilityLabel.trim() !== '' : !!(rest as Record<string, unknown>)['aria-label'] || !!(rest as Record<string, unknown>)['aria-labelledby'];
  useEffect(() => {
    const n = ownRef.current;
    if (Platform.OS !== 'web' || !named || typeof HTMLElement === 'undefined' || !(n instanceof HTMLElement)) return;
    for (const svg of n.querySelectorAll('svg:not([aria-hidden]):not([aria-label]):not([aria-labelledby])')) svg.setAttribute('aria-hidden', 'true');
  });
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
    if ((focusRing ?? (role === 'tab' ? 'inside' : 'outside')) === 'inside') data.focusRing = 'inside';
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
      // The name is used as given: a control that shows words is named with them as drawn, units included ("Add
      // 250 ml of water" for "+ 250 ml"; WCAG 2.5.3, label in name), so a speech user can say what they see. A control
      // that shows no words says its units in full (`IconButton` does it for its cups; `spokenUnits`).
      {...web}
      ref={setRef as never}
      hitSlop={slop}
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
