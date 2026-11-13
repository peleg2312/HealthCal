import React, { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';

import { MAX_CONTENT_WIDTH, useTheme } from '@/theme';

import { Text } from './Text';

interface ToastState {
  id: number;
  message: string | null;
  actionLabel?: string;
  onAction?: () => void;
  show: (message: string, action?: { label: string; onPress: () => void }) => void;
  hide: () => void;
}

const useToast = create<ToastState>((set, get) => ({
  id: 0,
  message: null,
  show: (message, action) => set({ id: get().id + 1, message, actionLabel: action?.label, onAction: action?.onPress }),
  hide: () => set({ message: null, actionLabel: undefined, onAction: undefined }),
}));

/** Show a brief confirmation, optionally with an Undo action. Callable from anywhere. */
export function toast(message: string, action?: { label: string; onPress: () => void }) {
  useToast.getState().show(message, action);
}

/** Mounted once at the app root. */
export function ToastHost() {
  const { colors, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const { id, message, actionLabel, onAction, hide } = useToast();
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!message) return;
    Animated.spring(anim, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 6 }).start();
    const t = setTimeout(
      () => Animated.timing(anim, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => hide()),
      actionLabel ? 4500 : 2200,
    );
    return () => clearTimeout(t);
  }, [id, message, actionLabel, anim, hide]);

  if (!message) return null;
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: insets.bottom + 108, alignItems: 'center', paddingHorizontal: 20 }}>
      <Animated.View
        accessibilityLiveRegion="polite"
        style={{
          maxWidth: MAX_CONTENT_WIDTH - 40,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 16,
          backgroundColor: colors.text,
          borderRadius: radius.md,
          paddingHorizontal: 16,
          paddingVertical: 12,
          opacity: anim,
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
        }}>
        <Text variant="label" color={colors.bg} style={{ flexShrink: 1 }}>
          {message}
        </Text>
        {actionLabel ? (
          <Text
            variant="label"
            color={colors.bg}
            style={{ textDecorationLine: 'underline' }}
            accessibilityRole="button"
            onPress={() => {
              onAction?.();
              hide();
            }}>
            {actionLabel}
          </Text>
        ) : null}
      </Animated.View>
    </View>
  );
}
