import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AccessibilityInfo, KeyboardAvoidingView, Modal, PanResponder, type PanResponderInstance, Platform, Pressable, ScrollView, useWindowDimensions, View, type ViewStyle } from 'react-native';
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

let sheetSeq = 0;
/** The mark a sheet puts on the browser history entry it adds while it is open (web). */
const SHEET_ENTRY = '__healthcalSheet';
type HistoryState = Record<string, unknown> | null | undefined;
const historyState = (): HistoryState => (typeof window !== 'undefined' ? (window.history.state as HistoryState) : null);
/** Sheets whose history entry is theirs and still wanted (web). */
const openEntries = new Set<number>();
/** The current history entry is one a sheet added and no longer wants: it is closed, or closing. */
function onLeftEntry(): boolean {
  const t = historyState()?.[SHEET_ENTRY];
  return typeof t === 'number' && !openEntries.has(t);
}
let historyPatched = false;
/**
 * Web, once: the router's own history moves step over an entry a closed sheet left on top. A screen the
 * sheet opened takes that entry's place (pushState becomes replaceState), and a step back from it counts
 * the entry too (go(-1) becomes go(-2)). Without this, a sheet closed in the same tap that navigates (a
 * row that opens a screen, Delete that goes back) leaves the address and the screen out of step, because
 * the sheet's own clean-up (one history.back()) cannot run before the router's move.
 */
function patchHistory() {
  if (historyPatched || typeof window === 'undefined') return;
  historyPatched = true;
  const h = window.history;
  const push = h.pushState.bind(h);
  const go = h.go.bind(h);
  h.pushState = (state: unknown, unused: string, url?: string | URL | null) => {
    const ours = !!state && typeof state === 'object' && SHEET_ENTRY in (state as object);
    if (!ours && onLeftEntry()) return h.replaceState(state, unused, url);
    return push(state, unused, url);
  };
  h.go = (delta?: number) => go(delta && delta < 0 && onLeftEntry() ? delta - 1 : delta);
}

/**
 * Web: the browser's back closes an open sheet first, as Android's back does (Modal's onRequestClose).
 * Opening, the sheet adds a history entry for the same address (keeping the router's own id in it, so the
 * router reads the entry under it as the same screen); back takes that entry off and the sheet asks to close
 * through `close` (which may ask first, or refuse: the entry then comes back). A sheet closed any other way
 * takes its entry off again with one history.back(), unless a navigation has already used it (see
 * `patchHistory`). Layout effects, so the entry is let go in the same commit as the close, before the
 * router moves the browser.
 */
function useBackCloses(visible: boolean, close: () => void, stillOpen: () => boolean) {
  const latest = useRef({ close, stillOpen });
  useEffect(() => {
    latest.current = { close, stillOpen };
  });
  useLayoutEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !visible) return;
    patchHistory();
    const token = ++sheetSeq;
    const push = () => {
      const base = historyState();
      openEntries.add(token);
      window.history.pushState({ ...(base && typeof base === 'object' ? base : {}), [SHEET_ENTRY]: token }, '');
    };
    push();
    let popped = false;
    let again: ReturnType<typeof setTimeout> | undefined;
    const onPop = () => {
      const at = historyState()?.[SHEET_ENTRY];
      // Still on this sheet's entry, or on a sheet opened over it.
      if (typeof at === 'number' && at >= token) return;
      if (popped) return;
      popped = true;
      openEntries.delete(token);
      latest.current.close();
      // A sheet that did not close (it asks first, or refuses) gets its entry back.
      clearTimeout(again);
      again = setTimeout(() => {
        if (!latest.current.stillOpen()) return;
        popped = false;
        push();
      }, 60);
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      clearTimeout(again);
      openEntries.delete(token);
      if (popped) return;
      setTimeout(() => {
        if (historyState()?.[SHEET_ENTRY] === token) window.history.back();
      }, 0);
    };
  }, [visible]);
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
  accessibilityLabel,
  unsaved,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** The dialog's name for a screen reader when the sheet has no title (with a title, the title names it). */
  accessibilityLabel?: string;
  /**
   * Set while the sheet holds something typed and not saved: a question such as "Discard this weigh-in?".
   * Closing it by the backdrop, a drag, Escape, the back button or the screen reader's escape then asks
   * first, in the sheet, with "Discard" and "Keep editing". The sheet's own buttons close it as they do.
   */
  unsaved?: string | false | null;
}) {
  const { colors, radius, spacing } = useTheme();
  // Asking whether to drop what was typed (see `unsaved`).
  const [asking, setAsking] = useState(false);
  if (asking && (!visible || !unsaved)) setAsking(false);
  // Every close that is not one of the sheet's own buttons comes here.
  const requestClose = () => {
    if (asking) return setAsking(false);
    if (unsaved) {
      AccessibilityInfo.announceForAccessibility(unsaved);
      return setAsking(true);
    }
    onClose();
  };
  const [titleId] = useState(() => `sheet-title-${++sheetSeq}`);
  const latestOpen = useRef(visible);
  useEffect(() => {
    latestOpen.current = visible;
  });
  useBackCloses(visible, requestClose, () => latestOpen.current);
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
  // Whether this opening's sheet has been measured. Until it has, it waits below the window and does
  // not start its slide: a slide begun on a guess (the window's height, or the height of the last time
  // it opened) changed its length when the measure came in and jumped about 70 px in its second frame.
  const [measured, setMeasured] = useState(false);
  if (!mounted && measured) setMeasured(false);
  // A last resort, should a layout never arrive: the slide starts anyway, a little late.
  const [waitedOut, setWaitedOut] = useState(false);
  if (!mounted && waitedOut) setWaitedOut(false);
  const ready = measured || waitedOut;
  useEffect(() => {
    if (!mounted || ready) return;
    const timer = setTimeout(() => setWaitedOut(true), 120);
    return () => clearTimeout(timer);
  }, [mounted, ready]);
  // 0 hidden, 1 open.
  const open = useSharedValue(visible && reduce ? 1 : 0);
  useEffect(() => {
    if (!mounted) return;
    if (reduce) {
      cancelAnimation(open);
      open.set(visible ? 1 : 0);
      return;
    }
    if (visible) {
      if (!ready) return;
      // It moves from its first frame and slows all the way to rest (`easing.arrive`), so a tall sheet
      // never hangs for two frames and then leaps a fifth of its height in one.
      open.set(withTiming(1, { duration: motion.duration.sheetIn, easing: ease.arrive }));
    } else
      open.set(
        withTiming(0, { duration: motion.duration.sheetOut, easing: ease.exit }, (finished) => {
          if (finished) scheduleOnRN(setMounted, false);
        }),
      );
  }, [visible, mounted, reduce, open, ready]);
  // Until measured, a whole window's height (and its 24 px) below: out of sight whatever its size.
  const travel = measured && sheetH ? sheetH : winH;
  // How far the finger has pulled the sheet down (0 at rest). Reset each time the sheet opens.
  const drag = useSharedValue(0);
  useEffect(() => {
    if (visible) {
      cancelAnimation(drag);
      drag.set(0);
    }
  }, [visible, drag]);
  // The latest props for the drag handlers, which are made once, after the first render.
  const latest = useRef({ onClose: requestClose, visible, reduce, travel });
  useEffect(() => {
    latest.current = { onClose: requestClose, visible, reduce, travel };
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
  const toastStyle = useAnimatedStyle(() => ({ opacity: open.get() }));
  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      onRequestClose={requestClose}
      statusBarTranslucent
      // Web: the dialog is named by its title (or the label given), as a screen reader expects of a dialog.
      {...((title ? { 'aria-labelledby': titleId } : accessibilityLabel ? { 'aria-label': accessibilityLabel } : {}) as object)}>
      <KeyboardAvoidingView
        pointerEvents={visible ? 'auto' : 'none'}
        behavior={Platform.OS === 'web' ? undefined : 'padding'}
        style={{ flex: 1, justifyContent: 'flex-end' }}>
        <AnimatedPressable
          accessibilityLabel="Close sheet"
          testID="sheet-backdrop"
          onPress={requestClose}
          style={[{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: colors.overlay }, backdropStyle]}
        />
        {/* A native modal covers the app's own toast layer, so the sheet shows toasts itself, just above its top edge.
            It fades with the sheet: closing, the toast leaves with it (then rises again over the screen's tab bar
            or footer) instead of hanging in mid-air while the sheet slides away. */}
        <Animated.View pointerEvents="box-none" style={[{ zIndex: 2 }, toastStyle]}>
          <ToastHost placement="sheet" />
        </Animated.View>
        <Animated.View
          testID="sheet"
          // VoiceOver's escape gesture (two-finger scrub) closes it, as the backdrop does.
          onAccessibilityEscape={requestClose}
          onLayout={(e) => {
            setSheetH(Math.round(e.nativeEvent.layout.height));
            setMeasured(true);
          }}
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
              <Text variant="h2" nativeID={titleId} style={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.md }}>
                {title}
              </Text>
            ) : null}
          </View>
          <ScrollView testID="sheet-body" keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: spacing.xl, gap: spacing.md, paddingBottom: spacing.md }}>
            {children}
          </ScrollView>
          {asking && unsaved ? (
            // Asked in the sheet itself, in place of its footer: one sheet on screen at a time.
            <View testID="sheet-discard" style={{ paddingHorizontal: spacing.xl, paddingTop: spacing.sm, gap: 10 }}>
              <Text variant="bodyStrong" testID="sheet-discard-title" accessibilityLiveRegion="polite">
                {unsaved}
              </Text>
              <Button
                testID="sheet-discard-yes"
                title="Discard"
                variant="danger"
                onPress={() => {
                  setAsking(false);
                  onClose();
                }}
              />
              <Button testID="sheet-discard-keep" title="Keep editing" variant="secondary" onPress={() => setAsking(false)} />
            </View>
          ) : footer ? (
            <View testID="sheet-footer" style={{ paddingHorizontal: spacing.xl, paddingTop: spacing.sm }}>
              {footer}
            </View>
          ) : null}
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
