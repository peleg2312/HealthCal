import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { MAX_CONTENT_WIDTH, motion, sheetShadow, useReducedMotion, useTheme } from '@/theme';

import { Button } from './Button';
import { ease } from './motion';
import { Text } from './Text';
import { ToastHost } from './Toast';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * Bottom sheet for short, focused tasks (pick a value, confirm, quick add).
 * It slides up while its backdrop fades in, and slides down with the backdrop
 * fading out when closed; reduced motion makes both instant. The sheet stays
 * mounted for the ~200 ms of its exit, with touches passing through it.
 */
export function Sheet({
  visible,
  onClose,
  title,
  children,
  footer,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const { colors, radius, spacing } = useTheme();
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const { height: winH } = useWindowDimensions();
  // Stays true through the exit animation, then the modal unmounts.
  const [mounted, setMounted] = useState(visible);
  if (visible && !mounted) setMounted(true);
  const [sheetH, setSheetH] = useState(0);
  // 0 hidden, 1 open.
  const open = useSharedValue(visible && reduce ? 1 : 0);
  useEffect(() => {
    if (!mounted) return;
    if (reduce) {
      cancelAnimation(open);
      open.set(visible ? 1 : 0);
      if (!visible) setMounted(false);
      return;
    }
    if (visible) open.set(withTiming(1, { duration: motion.duration.sheetIn, easing: ease.enter }));
    else
      open.set(
        withTiming(0, { duration: motion.duration.sheetOut, easing: ease.exit }, (finished) => {
          if (finished) scheduleOnRN(setMounted, false);
        }),
      );
  }, [visible, mounted, reduce, open]);
  const travel = sheetH || winH;
  const backdropStyle = useAnimatedStyle(() => ({ opacity: open.get() }));
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - open.get()) * (travel + 24) }] }));
  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView
        pointerEvents={visible ? 'auto' : 'none'}
        behavior={Platform.OS === 'web' ? undefined : 'padding'}
        style={{ flex: 1, justifyContent: 'flex-end' }}>
        <AnimatedPressable
          accessibilityLabel="Close sheet"
          onPress={onClose}
          style={[{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: colors.overlay }, backdropStyle]}
        />
        {/* A native modal covers the app's own toast layer, so the sheet shows toasts itself, just above its top edge. */}
        <ToastHost placement="sheet" />
        <Animated.View
          onLayout={(e) => setSheetH(Math.round(e.nativeEvent.layout.height))}
          style={[
            {
            width: '100%',
            maxWidth: MAX_CONTENT_WIDTH,
            alignSelf: 'center',
            maxHeight: '88%',
            // A lid, not a cup: 6 px corners on top only, and the only shadow in the kit.
            backgroundColor: colors.surface,
            borderTopLeftRadius: radius.sheet,
            borderTopRightRadius: radius.sheet,
            borderWidth: 1,
            borderBottomWidth: 0,
            borderColor: colors.border,
            paddingBottom: Math.max(insets.bottom, spacing.lg),
            ...sheetShadow,
            },
            sheetStyle,
          ]}>
          <View style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 8 }}>
            <View style={{ width: 36, height: 4, borderRadius: 1, backgroundColor: colors.borderStrong }} />
          </View>
          {title ? (
            <Text variant="h2" style={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.md }}>
              {title}
            </Text>
          ) : null}
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: spacing.xl, gap: spacing.md, paddingBottom: spacing.md }}>
            {children}
          </ScrollView>
          {footer ? <View style={{ paddingHorizontal: spacing.xl, paddingTop: spacing.sm }}>{footer}</View> : null}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/**
 * Confirmation for destructive or irreversible actions. Use this instead of
 * `Alert.alert`, which does nothing on web.
 */
export function ConfirmSheet({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Cancel',
  destructive,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Sheet
      visible={visible}
      onClose={onCancel}
      title={title}
      footer={
        <View style={{ gap: 10 }}>
          <Button testID="confirm-yes" title={confirmLabel} variant={destructive ? 'danger' : 'primary'} onPress={onConfirm} />
          <Button testID="confirm-no" title={cancelLabel} variant="secondary" onPress={onCancel} />
        </View>
      }>
      {message ? (
        <Text variant="body" color="textSecondary">
          {message}
        </Text>
      ) : null}
    </Sheet>
  );
}
