import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';

import { withoutMarks } from '@/lib/bidi';
import { cup, isReducedMotion, MAX_CONTENT_WIDTH, motion, useTheme, type ThemeColors } from '@/theme';

import { TOAST_GAP, toastBottom } from './keyboardInset';
import { PressableScale } from './Pressable';
import { Text } from './Text';

/** What a toast may carry besides its message. All optional. */
export interface ToastOptions {
  /** The action's label ("Undo"). Needs `onPress`. */
  label?: string;
  onPress?: () => void;
  /**
   * Colour of the toast's level line: the data colour of what was logged. A theme colour name
   * ('water', 'calories', 'exercise': usable from code outside React, which has no palette) or a
   * colour value (`colors.water`). Defaults to the primary.
   */
  tint?: keyof ThemeColors | (string & {});
}

interface Dock {
  id: number;
  height: number;
  cover: number;
  rides: boolean;
}

interface ToastState {
  id: number;
  message: string | null;
  actionLabel?: string;
  onAction?: () => void;
  tint?: string;
  /** Open sheets that carry their own host, newest last. The newest one shows the toast. */
  sheetHosts: number[];
  /**
   * Each focused Screen's bottom: the height of its chrome (tab bar, footer, home indicator), the px
   * the keyboard covers (what the Screen pads by) and whether that chrome is a footer riding on the
   * keyboard. Newest last.
   */
  docks: Dock[];
  show: (message: string, options?: ToastOptions) => void;
  hide: () => void;
}

const useToast = create<ToastState>((set, get) => ({
  id: 0,
  message: null,
  sheetHosts: [],
  docks: [],
  show: (message, options) =>
    set({ id: get().id + 1, message, actionLabel: options?.label && options.onPress ? options.label : undefined, onAction: options?.label ? options.onPress : undefined, tint: options?.tint }),
  hide: () => set({ message: null, actionLabel: undefined, onAction: undefined, tint: undefined }),
}));

/**
 * Show a brief confirmation, optionally with an Undo action. Callable from anywhere.
 *
 *   toast('Added 330 ml', { label: 'Undo', onPress: undo, tint: 'water' })
 */
export function toast(message: string, options?: ToastOptions) {
  useToast.getState().show(message, options);
}

let dockSeq = 0;

/**
 * Tells the toast how tall this screen's bottom chrome is (the tab bar with its + cup, a pinned
 * footer, or just the home indicator), so the toast rests 12 px above it instead of on top of
 * the screen's controls. `Screen` calls this with `active` set while the screen is focused: the
 * screen that is showing wins, even while the one it replaced is still mounted (a toast raised
 * on the sign-in screen moves above Today's tab bar the moment Today shows).
 *
 * `keyboard` is what the screen does for the on-screen keyboard: `cover`, the px it pads its
 * bottom by (the part the keyboard covers), and `rides`, true when its chrome is a pinned footer
 * that the padding lifts on top of the keyboard. The toast then rests 12 px above that footer, or
 * 12 px above the keyboard itself when there is no footer (`toastBottom` in ./keyboardInset).
 */
export function useToastDock(height: number, active = true, keyboard?: { cover: number; rides: boolean }) {
  const [id] = useState(() => ++dockSeq);
  const cover = keyboard?.cover ?? 0;
  const rides = keyboard?.rides ?? false;
  useEffect(() => {
    useToast.setState((s) => {
      const others = s.docks.filter((d) => d.id !== id);
      return { docks: active ? [...others, { id, height, cover, rides }] : others };
    });
  }, [id, height, active, cover, rides]);
  useEffect(() => () => useToast.setState((s) => ({ docks: s.docks.filter((d) => d.id !== id) })), [id]);
}

/**
 * The toast's action (Undo) takes no press in its first 600 ms on screen: a quick second tap meant for
 * the button the toast rose beside (Today's "+ 250 ml", a "+" on a row) must never undo the first one.
 * The stamp is taken when the toast is first shown, and the clock is read in the press handler.
 * Scripts that tap `toast-action` wait for this (scripts/dev/toastGuard.cjs reads the number here).
 */
export const TOAST_ACTION_GUARD_MS = 600;

let hostSeq = 0;
/** The toast last read out, so moving it between hosts does not read it twice. */
let announcedId = 0;
/** When that toast was first on screen: its action's guard counts from here. */
let shownAt = 0;
/**
 * A monotonic clock for the guard: it never jumps when the phone's time is changed, and a test that fixes the
 * page's date (Playwright's clock.setFixedTime freezes Date.now) still sees the 600 ms pass.
 */
const monotonicNow = () => (typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now());

/**
 * Shows the current toast: an ink cup (square shoulders, round base) with a
 * 3 px level line along its top edge in the colour of what was logged.
 *
 * Mounted once at the app root ('screen'), and once inside every open Sheet
 * ('sheet'): a native modal covers the app's own layer, so a sheet has to show
 * the toast itself. On a screen it rests 12 px above the bottom chrome the
 * screen reported with `useToastDock` (tab bar, footer or home indicator),
 * never mid-screen on top of controls. While the on-screen keyboard is up it
 * rests 12 px above the footer that rides on the keyboard, or 12 px above the
 * keyboard when the screen has no footer, by the same measure the screen pads
 * itself with, and moves above the focused field when it would cover it and
 * there is room. The root host is outside every ScrollView, so a tap on its
 * action is never taken for a tap that dismisses the keyboard (only a
 * ScrollView does that, by its keyboardShouldPersistTaps). In a sheet it sits in the layout right
 * above the sheet's top edge, and the host underneath steps aside so there is
 * only ever one toast on screen.
 */
export function ToastHost({ placement = 'screen' }: { placement?: 'screen' | 'sheet' }) {
  const { colors, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const { id, message, actionLabel, onAction, tint, hide } = useToast();
  const sheetHosts = useToast((s) => s.sheetHosts);
  const inSheet = placement === 'sheet';
  const docks = useToast((s) => s.docks);
  const last = docks.length ? docks[docks.length - 1] : null;
  const placed = last ? { dock: last.height, ridesKeyboard: last.rides, cover: last.cover } : { dock: insets.bottom, ridesKeyboard: false, cover: 0 };
  const keyboardUp = !inSheet && placed.cover > 0;
  // With the keyboard up: the focused field, as distances from the bottom of the host, and how
  // high the host is (the toast may not rise into the status bar). Measured, so null until then.
  // Kept with the toast and keyboard it was measured for, so a stale one is never used.
  const [field, setField] = useState<{ top: number; bottom: number; hostBottom: number; key: string } | null>(null);
  const key = `${id}:${placed.cover}:${placed.dock}`;
  const [toastH, setToastH] = useState(0);
  const outer = useRef<React.ComponentRef<typeof View>>(null);
  const bottomNow = useRef(0);
  const [anim] = useState(() => new Animated.Value(0));
  const [hostId] = useState(() => ++hostSeq);

  useEffect(() => {
    if (!inSheet) return;
    useToast.setState((s) => ({ sheetHosts: [...s.sheetHosts, hostId] }));
    return () => useToast.setState((s) => ({ sheetHosts: s.sheetHosts.filter((h) => h !== hostId) }));
  }, [inSheet, hostId]);

  const top = sheetHosts[sheetHosts.length - 1];
  // Before a new sheet host has registered itself (its first render), it already counts as the one on top.
  const active = inSheet ? top === hostId || !sheetHosts.includes(hostId) : sheetHosts.length === 0;

  useEffect(() => {
    if (!message || !active) return;
    if (announcedId !== id) {
      announcedId = id;
      shownAt = monotonicNow();
      // Live regions are Android-only; announcing explicitly covers iOS as well. A name isolated for
      // drawing (`isolateRtl`) is announced raw: screen readers get no direction marks.
      const spoken = withoutMarks(message);
      AccessibilityInfo.announceForAccessibility(actionLabel ? `${spoken}. ${actionLabel} available.` : spoken);
    }
    // Rises 16 px and fades in, ease-out, no bounce; instant under reduced motion.
    if (isReducedMotion()) anim.setValue(1);
    else Animated.timing(anim, { toValue: 1, duration: motion.duration.row, easing: Easing.bezier(...motion.easing.enter), useNativeDriver: Platform.OS !== 'web' }).start();
    let cancelled = false;
    let t: ReturnType<typeof setTimeout> | undefined;
    const close = () =>
      isReducedMotion() ? hide() : Animated.timing(anim, { toValue: 0, duration: motion.duration.fade, easing: Easing.bezier(...motion.easing.exit), useNativeDriver: Platform.OS !== 'web' }).start(() => hide());
    // Someone using a screen reader needs longer to reach the action.
    AccessibilityInfo.isScreenReaderEnabled()
      .catch(() => false)
      .then((reader) => {
        if (!cancelled) t = setTimeout(close, actionLabel ? (reader ? 12000 : 4500) : 2200);
      });
    return () => {
      cancelled = true;
      if (t) clearTimeout(t);
    };
  }, [id, message, actionLabel, anim, hide, active]);

  // The focused field while a toast shows over the keyboard, so the toast can keep clear of it.
  const shown = !!message && active;
  useEffect(() => {
    if (!shown || !keyboardUp) return;
    let cancelled = false;
    const measure = () =>
      focusedFieldBox(outer.current, bottomNow.current).then((f) => {
        if (!cancelled) setField(f ? { ...f, key } : null);
      });
    const frame = requestAnimationFrame(() => void measure());
    // On web the focus can move while the toast shows (a tap back into the field).
    const doc = Platform.OS === 'web' && typeof document !== 'undefined' ? document : null;
    const onFocus = () => requestAnimationFrame(() => void measure());
    doc?.addEventListener('focusin', onFocus);
    doc?.addEventListener('focusout', onFocus);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      doc?.removeEventListener('focusin', onFocus);
      doc?.removeEventListener('focusout', onFocus);
    };
  }, [shown, keyboardUp, key]);

  const bottom = toastBottom(
    placed,
    keyboardUp && field && field.key === key && toastH > 0 ? { top: field.top, bottom: field.bottom, toastHeight: toastH, limit: field.hostBottom - insets.top } : null,
    TOAST_GAP,
  );
  useEffect(() => {
    bottomNow.current = bottom;
  }, [bottom]);

  if (!message || !active) return null;
  return (
    <View
      ref={outer}
      pointerEvents="box-none"
      style={
        inSheet
          ? { alignSelf: 'stretch', alignItems: 'center', paddingHorizontal: 20, marginBottom: 12 }
          : { position: 'absolute', left: 0, right: 0, bottom, alignItems: 'center', paddingHorizontal: 20 }
      }>
      {/* Only the action takes a touch: a tap on the toast's ink body goes through to what is under it (Today's
          "+ 250 ml" sits just above the resting toast at 360 x 740, and a second glass must still log). */}
      <Animated.View
        testID="toast"
        pointerEvents="box-none"
        accessibilityLiveRegion="polite"
        onLayout={inSheet ? undefined : (e) => setToastH(Math.round(e.nativeEvent.layout.height))}
        style={{
          maxWidth: MAX_CONTENT_WIDTH - 40,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 16,
          minHeight: 44,
          // An ink cup: text-coloured, square shoulders, round base.
          backgroundColor: colors.text,
          ...cup(radius.button),
          paddingHorizontal: 16,
          paddingTop: 13,
          paddingBottom: 11,
          opacity: anim,
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
        }}>
        {/* The level line: what was logged, in its own colour. */}
        <View
          pointerEvents="none"
          style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 3, borderTopLeftRadius: radius.shoulder, borderTopRightRadius: radius.shoulder, backgroundColor: tint ? ((colors as unknown as Record<string, string>)[tint] ?? tint) : colors.primary }}
        />
        <View pointerEvents="none" style={{ flexShrink: 1 }}>
          <Text variant="label" color={colors.bg} accessibilityLabel={withoutMarks(message)}>
            {message}
          </Text>
        </View>
        {actionLabel ? (
          <PressableScale
            testID="toast-action"
            accessibilityLabel={actionLabel}
            hitSlop={10}
            onPress={() => {
              // A press in the toast's first moments was meant for what it rose beside: ignored, the toast stays.
              if (monotonicNow() - shownAt < TOAST_ACTION_GUARD_MS) return;
              onAction?.();
              hide();
            }}
            style={{ minHeight: 44, paddingHorizontal: 10, marginVertical: -12, marginRight: -6, justifyContent: 'center' }}>
            <Text variant="label" color={colors.bg} style={{ textDecorationLine: 'underline' }}>
              {actionLabel}
            </Text>
          </PressableScale>
        ) : null}
      </Animated.View>
    </View>
  );
}

/** A box in window coordinates: its top and bottom edge. */
type Measurable = { measureInWindow?: (callback: (x: number, y: number, width: number, height: number) => void) => void };

function measureBox(node: Measurable | null): Promise<{ y: number; h: number } | null> {
  return new Promise((resolve) => {
    const m = node?.measureInWindow;
    if (!node || typeof m !== 'function') return resolve(null);
    try {
      m.call(node, (_x, y, _w, h) => resolve(Number.isFinite(y) && Number.isFinite(h) ? { y, h } : null));
    } catch {
      resolve(null);
    }
  });
}

/**
 * The focused text field, as distances from the bottom of the toast's host (the app's root), and
 * where that bottom is in the window. `hostView` is the toast's own outer view and `placedBottom`
 * its current `bottom`: the host's bottom edge is the outer view's bottom plus that, so both boxes
 * are read in the same (window) coordinates on every platform. Null when no field has the focus.
 */
async function focusedFieldBox(hostView: Measurable | null, placedBottom: number): Promise<{ top: number; bottom: number; hostBottom: number } | null> {
  if (Platform.OS === 'web') {
    if (typeof document === 'undefined' || typeof window === 'undefined') return null;
    const el = document.activeElement;
    if (!(el instanceof HTMLElement) || !(/^(INPUT|TEXTAREA)$/.test(el.tagName) || el.isContentEditable)) return null;
    const r = el.getBoundingClientRect();
    const hostBottom = window.innerHeight;
    return { top: hostBottom - r.top, bottom: hostBottom - r.bottom, hostBottom };
  }
  const input = TextInput.State?.currentlyFocusedInput?.() as unknown as Measurable | null | undefined;
  if (!input) return null;
  const [host, box] = await Promise.all([measureBox(hostView), measureBox(input)]);
  if (!host || !box) return null;
  const hostBottom = host.y + host.h + placedBottom;
  return { top: hostBottom - box.y, bottom: hostBottom - (box.y + box.h), hostBottom };
}
