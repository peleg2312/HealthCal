import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';

import { cup, MAX_CONTENT_WIDTH, useTheme } from '@/theme';

import { PressableScale } from './Pressable';
import { Text } from './Text';

interface ToastState {
  id: number;
  message: string | null;
  actionLabel?: string;
  onAction?: () => void;
  /** Open sheets that carry their own host, newest last. The newest one shows the toast. */
  sheetHosts: number[];
  show: (message: string, action?: { label: string; onPress: () => void }) => void;
  hide: () => void;
}

const useToast = create<ToastState>((set, get) => ({
  id: 0,
  message: null,
  sheetHosts: [],
  show: (message, action) => set({ id: get().id + 1, message, actionLabel: action?.label, onAction: action?.onPress }),
  hide: () => set({ message: null, actionLabel: undefined, onAction: undefined }),
}));

/** Show a brief confirmation, optionally with an Undo action. Callable from anywhere. */
export function toast(message: string, action?: { label: string; onPress: () => void }) {
  useToast.getState().show(message, action);
}

let hostSeq = 0;
/** The toast last read out, so moving it between hosts does not read it twice. */
let announcedId = 0;

/**
 * Shows the current toast. Mounted once at the app root ('screen'), and once
 * inside every open Sheet ('sheet'): a native modal covers the app's own layer,
 * so a sheet has to show the toast itself. There it sits in the layout right
 * above the sheet's top edge, where it cannot cover the sheet's controls, and
 * the host underneath steps aside so there is only ever one toast on screen.
 */
export function ToastHost({ placement = 'screen' }: { placement?: 'screen' | 'sheet' }) {
  const { colors, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const { id, message, actionLabel, onAction, hide } = useToast();
  const sheetHosts = useToast((s) => s.sheetHosts);
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
    Animated.spring(anim, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 6 }).start();
    let cancelled = false;
    let t: ReturnType<typeof setTimeout> | undefined;
    const close = () => Animated.timing(anim, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => hide());
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
          : { position: 'absolute', left: 0, right: 0, bottom: insets.bottom + 92, alignItems: 'center', paddingHorizontal: 20 }
      }>
      <Animated.View
        accessibilityLiveRegion="polite"
        style={{
          maxWidth: MAX_CONTENT_WIDTH - 40,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 16,
          // An ink cup: text-coloured, square shoulders, round base.
          backgroundColor: colors.text,
          ...cup(radius.tile),
          paddingHorizontal: 16,
          paddingVertical: 12,
          opacity: anim,
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
        }}>
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
