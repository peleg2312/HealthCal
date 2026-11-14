import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';

import { cup, isReducedMotion, MAX_CONTENT_WIDTH, motion, useTheme, type ThemeColors } from '@/theme';

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

interface ToastState {
  id: number;
  message: string | null;
  actionLabel?: string;
  onAction?: () => void;
  tint?: string;
  /** Open sheets that carry their own host, newest last. The newest one shows the toast. */
  sheetHosts: number[];
  /** Height of the bottom chrome (tab bar, footer, home indicator) of each mounted Screen, newest last. */
  docks: { id: number; height: number }[];
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
 * the screen's controls. `Screen` calls this; the screen mounted last (the one on top) wins.
 */
export function useToastDock(height: number) {
  const [id] = useState(() => ++dockSeq);
  useEffect(() => {
    useToast.setState((s) => ({ docks: s.docks.some((d) => d.id === id) ? s.docks.map((d) => (d.id === id ? { id, height } : d)) : [...s.docks, { id, height }] }));
  }, [id, height]);
  useEffect(() => () => useToast.setState((s) => ({ docks: s.docks.filter((d) => d.id !== id) })), [id]);
}

/** Space between the toast and the chrome under it. */
const TOAST_GAP = 12;

let hostSeq = 0;
/** The toast last read out, so moving it between hosts does not read it twice. */
let announcedId = 0;

/**
 * Shows the current toast: an ink cup (square shoulders, round base) with a
 * 3 px level line along its top edge in the colour of what was logged.
 *
 * Mounted once at the app root ('screen'), and once inside every open Sheet
 * ('sheet'): a native modal covers the app's own layer, so a sheet has to show
 * the toast itself. On a screen it rests 12 px above the bottom chrome the
 * screen reported with `useToastDock` (tab bar, footer or home indicator),
 * never mid-screen on top of controls. In a sheet it sits in the layout right
 * above the sheet's top edge, and the host underneath steps aside so there is
 * only ever one toast on screen.
 */
export function ToastHost({ placement = 'screen' }: { placement?: 'screen' | 'sheet' }) {
  const { colors, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const { id, message, actionLabel, onAction, tint, hide } = useToast();
  const sheetHosts = useToast((s) => s.sheetHosts);
  const docks = useToast((s) => s.docks);
  const dock = docks.length ? docks[docks.length - 1].height : insets.bottom;
  const [anim] = useState(() => new Animated.Value(0));
  const [hostId] = useState(() => ++hostSeq);
  const inSheet = placement === 'sheet';

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
      // Live regions are Android-only; announcing explicitly covers iOS as well.
      AccessibilityInfo.announceForAccessibility(actionLabel ? `${message}. ${actionLabel} available.` : message);
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

  if (!message || !active) return null;
  return (
    <View
      pointerEvents="box-none"
      style={
        inSheet
          ? { alignSelf: 'stretch', alignItems: 'center', paddingHorizontal: 20, marginBottom: 12 }
          : { position: 'absolute', left: 0, right: 0, bottom: dock + TOAST_GAP, alignItems: 'center', paddingHorizontal: 20 }
      }>
      <Animated.View
        accessibilityLiveRegion="polite"
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
        <Text variant="label" color={colors.bg} style={{ flexShrink: 1 }}>
          {message}
        </Text>
        {actionLabel ? (
          <PressableScale
            testID="toast-action"
            accessibilityLabel={actionLabel}
            hitSlop={10}
            onPress={() => {
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
