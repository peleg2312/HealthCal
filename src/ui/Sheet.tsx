import React, { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, PanResponder, type PanResponderInstance, Platform, Pressable, ScrollView, useWindowDimensions, View, type ViewStyle } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { MAX_CONTENT_WIDTH, motion, sheetShadow, useReducedMotion, useTheme } from '@/theme';

import { Button } from './Button';
import { ease } from './motion';
import { Text } from './Text';
import { ToastHost } from './Toast';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Released past this share of the sheet's height, the drag closes it. */
const CLOSE_SHARE = 0.25;
/** A flick: released moving down at least this fast (px/ms), after at least FLICK_MIN px. */
const FLICK_SPEED = 0.5;
const FLICK_MIN = 12;
/** On web the drag zone takes the finger itself: no page scroll, pull-to-refresh or text selection starts there. */
const DRAG_ZONE_WEB = (Platform.OS === 'web' ? { touchAction: 'none', userSelect: 'none', cursor: 'grab' } : null) as ViewStyle | null;

// How many sheets are on screen. A native modal sits outside the page, but its touches still bubble
// through the React tree to the page's own handlers (on web through the portal, natively through the
// responder system): the page's gestures (the day swipe) ask this and leave a touch alone while one is open.
let openSheets = 0;

/** Whether any sheet is on screen (open, or still sliding away). */
export function sheetOnScreen(): boolean {
  return openSheets > 0;
}

/** Pure rule for the end of a drag: close, or settle back. Exported for the tests. */
export function sheetDragCloses(dy: number, vy: number, sheetHeight: number): boolean {
  if (dy <= 0) return false;
  return dy > sheetHeight * CLOSE_SHARE || (vy > FLICK_SPEED && dy > FLICK_MIN);
}

/**
 * Bottom sheet for short, focused tasks (pick a value, confirm, quick add).
 * It slides up while its backdrop fades in, and slides down with the backdrop
 * fading out when closed; reduced motion makes both instant. The sheet stays
 * mounted for the ~200 ms of its exit, with touches passing through it.
 *
 * The handle means what it shows: dragging down on the handle or the title
 * (the drag zone) moves the sheet with the finger, and letting go past a
 * quarter of its height, or flicking down, closes it through `onClose` (the
 * same as the backdrop, the back button and Escape on web); otherwise it
 * settles back. The body still scrolls: only the drag zone takes the drag.
 * Under reduced motion the sheet does not follow the finger, but a drag past
 * the threshold still closes it. Built on PanResponder, not a gesture library:
 * it runs inside the native Modal (where react-native-gesture-handler would
 * need a root of its own on Android) and, through react-native-web's responder
 * system, with a finger or a mouse in a browser.
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
  // Reduced motion: no exit animation to wait for.
  if (!visible && mounted && reduce) setMounted(false);
  useEffect(() => {
    if (!mounted) return;
    openSheets += 1;
    return () => {
      openSheets -= 1;
    };
  }, [mounted]);
  const [sheetH, setSheetH] = useState(0);
  // 0 hidden, 1 open.
  const open = useSharedValue(visible && reduce ? 1 : 0);
  useEffect(() => {
    if (!mounted) return;
    if (reduce) {
      cancelAnimation(open);
      open.set(visible ? 1 : 0);
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
  // How far the finger has pulled the sheet down (0 at rest). Reset each time the sheet opens.
  const drag = useSharedValue(0);
  useEffect(() => {
    if (visible) {
      cancelAnimation(drag);
      drag.set(0);
    }
  }, [visible, drag]);
  // The latest props for the drag handlers, which are made once, after the first render.
  const latest = useRef({ onClose, visible, reduce, travel });
  useEffect(() => {
    latest.current = { onClose, visible, reduce, travel };
  });
  const [pan, setPan] = useState<PanResponderInstance | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const settle = () => {
      if (latest.current.reduce) drag.set(0);
      else drag.set(withTiming(0, { duration: motion.duration.settle, easing: ease.enter }));
    };
    setPan(
      PanResponder.create({
        // The zone holds no controls, so it can take the touch at once (before the browser starts anything).
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 4 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => cancelAnimation(drag),
        onPanResponderMove: (_, g) => {
          // Down follows the finger; up gives a little, never more than 12 px.
          if (!latest.current.reduce) drag.set(g.dy >= 0 ? g.dy : -Math.min(12, -g.dy / 4));
        },
        onPanResponderRelease: (_, g) => {
          if (!sheetDragCloses(g.dy, g.vy, latest.current.travel)) return settle();
          latest.current.onClose();
          // A sheet that refuses to close (onClose does nothing) comes back.
          clearTimeout(timer);
          timer = setTimeout(() => {
            if (latest.current.visible) settle();
          }, 80);
        },
        onPanResponderTerminate: settle,
      }),
    );
    return () => clearTimeout(timer);
  }, [drag]);
  const backdropStyle = useAnimatedStyle(() => ({ opacity: open.get() * (1 - Math.min(0.6, Math.max(0, drag.get()) / (travel + 24))) }));
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - open.get()) * (travel + 24) + drag.get() }] }));
  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView
        pointerEvents={visible ? 'auto' : 'none'}
        behavior={Platform.OS === 'web' ? undefined : 'padding'}
        style={{ flex: 1, justifyContent: 'flex-end' }}>
        <AnimatedPressable
          accessibilityLabel="Close sheet"
          testID="sheet-backdrop"
          onPress={onClose}
          style={[{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: colors.overlay }, backdropStyle]}
        />
        {/* A native modal covers the app's own toast layer, so the sheet shows toasts itself, just above its top edge. */}
        <ToastHost placement="sheet" />
        <Animated.View
          testID="sheet"
          // VoiceOver's escape gesture (two-finger scrub) closes it, as the backdrop does.
          onAccessibilityEscape={onClose}
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
          {/* The drag zone: the handle and the title. */}
          <View testID="sheet-drag" {...pan?.panHandlers} style={DRAG_ZONE_WEB}>
            <View style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 8 }}>
              <View testID="sheet-handle" style={{ width: 36, height: 4, borderRadius: 1, backgroundColor: colors.borderStrong }} />
            </View>
            {title ? (
              <Text variant="h2" style={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.md }}>
                {title}
              </Text>
            ) : null}
          </View>
          <ScrollView testID="sheet-body" keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: spacing.xl, gap: spacing.md, paddingBottom: spacing.md }}>
            {children}
          </ScrollView>
          {footer ? <View testID="sheet-footer" style={{ paddingHorizontal: spacing.xl, paddingTop: spacing.sm }}>{footer}</View> : null}
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
