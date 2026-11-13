import React from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MAX_CONTENT_WIDTH, useTheme } from '@/theme';

import { Button } from './Button';
import { Text } from './Text';
import { ToastHost } from './Toast';

/** Bottom sheet for short, focused tasks (pick a value, confirm, quick add). */
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
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'web' ? undefined : 'padding'} style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable accessibilityLabel="Close sheet" onPress={onClose} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: colors.overlay }} />
        <View
          style={{
            width: '100%',
            maxWidth: MAX_CONTENT_WIDTH,
            alignSelf: 'center',
            maxHeight: '88%',
            backgroundColor: colors.bgElevated,
            borderTopLeftRadius: radius.xl,
            borderTopRightRadius: radius.xl,
            borderWidth: 1,
            borderBottomWidth: 0,
            borderColor: colors.border,
            paddingBottom: Math.max(insets.bottom, spacing.lg),
          }}>
          <View style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 6 }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong }} />
          </View>
          {title ? (
            <Text variant="h3" style={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.md }}>
              {title}
            </Text>
          ) : null}
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: spacing.xl, gap: spacing.md, paddingBottom: spacing.md }}>
            {children}
          </ScrollView>
          {footer ? <View style={{ paddingHorizontal: spacing.xl, paddingTop: spacing.sm }}>{footer}</View> : null}
        </View>
        {/* A native modal covers the app's own toast layer, so the sheet carries one too. */}
        <ToastHost />
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
