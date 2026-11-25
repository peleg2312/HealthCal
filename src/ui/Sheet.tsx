import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AccessibilityInfo, KeyboardAvoidingView, Modal, PanResponder, type PanResponderInstance, Platform, Pressable, ScrollView, type ScrollViewInstance, useWindowDimensions, View, type ViewStyle } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';

import { spokenUnits } from '@/lib/spokenUnits';
import { MAX_CONTENT_WIDTH, motion, sheetShadow, useReducedMotion, useTheme } from '@/theme';

import { Button } from './Button';
import { keyboardCover, revealDelta } from './keyboardInset';
import { ease } from './motion';
import { backClosesSheet, heldWrites, OWN_BACK_MS, ownBacks } from './sheetHistory';
import { useShortWindow } from './shortWindow';
import { Text } from './Text';
import { ToastHost } from './Toast';
import { ToastScope } from './toastControls';

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
/** Entries of closed sheets that a router move has already stepped over or taken. */
const usedEntries = new Set<number>();
/** The current history entry is one a sheet added and no longer wants: it is closed, or closing. */
function onLeftEntry(): boolean {
  const t = historyState()?.[SHEET_ENTRY];
  const left = typeof t === 'number' && !openEntries.has(t);
  if (left) usedEntries.add(t);
  return left;
}
let historyPatched = false;
/** How long after opening a sheet adds its history entry (the router's own wait for a move is 100 ms). */
const PUSH_AFTER_MS = 120;
/**
 * Web: the history.back() calls closed sheets made to take their entries off, until each one's popstate arrives
 * (`ownBacks` in ./sheetHistory). That popstate is the app's own step, never the person's Back: a sheet opened in
 * the same tap that closed another (a sheet's row that opens a confirmation) must not take it as Back and close
 * at once.
 */
const appBacks = ownBacks();
/** The popstate events that were the app's own steps back (marked by the first listener, before any sheet's). */
const ownPops = new WeakSet<Event>();
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
/** History writes made while the app's own step back is on its way: they run once it has come (`heldWrites`). */
const held = heldWrites();
let heldTimer: ReturnType<typeof setTimeout> | undefined;
function releaseHeld() {
  clearTimeout(heldTimer);
  held.release();
}
function hold(write: () => void) {
  if (held.write(write, appBacks.pending(now()))) return;
  // Should the step's popstate never come, the writes run once the step is forgotten.
  clearTimeout(heldTimer);
  heldTimer = setTimeout(releaseHeld, OWN_BACK_MS + 10);
}
/** A closed sheet takes its entry off: one history.back(), noted as the app's own. */
function ownBack() {
  appBacks.made(now());
  window.history.back();
}
/**
 * Web, once, as this file loads (before the router listens to the history): the browser history and the
 * steps back closing sheets make are kept in step with the router's own moves.
 * - The app's own step back is heard by no one else: its popstate is stopped where it arrives (a capture
 *   listener on the window, which runs before every other). The router would take it for the person's
 *   Back and undo a move the same tap began: the + sheet's "Search food" closed the sheet and left Today
 *   on screen, at random, whenever the router's move to search was still under way when the step landed.
 * - The router's writes made while such a step is on its way wait for it, then run in order on the entry it
 *   lands on (`heldWrites`), so a new screen never lands on the entry the step is taking away.
 * - The router's moves step over an entry a closed sheet left on top. A screen the sheet opened takes that
 *   entry's place (pushState becomes replaceState), and a step back from it counts the entry too (go(-1)
 *   becomes go(-2)): a sheet closed in the same tap that navigates (a row that opens a screen, Delete that
 *   goes back) may have no time to take its entry off before the router moves.
 */
function patchHistory() {
  if (historyPatched || typeof window === 'undefined') return;
  historyPatched = true;
  window.addEventListener(
    'popstate',
    (e) => {
      if (!appBacks.arrived(now())) return;
      ownPops.add(e);
      e.stopImmediatePropagation();
      if (!appBacks.pending(now())) releaseHeld();
    },
    true,
  );
  const h = window.history;
  const push = h.pushState.bind(h);
  const replace = h.replaceState.bind(h);
  const go = h.go.bind(h);
  const isOurs = (state: unknown) => !!state && typeof state === 'object' && SHEET_ENTRY in (state as object);
  h.pushState = (state: unknown, unused: string, url?: string | URL | null) =>
    hold(() => {
      if (!isOurs(state) && onLeftEntry()) replace(state, unused, url);
      else push(state, unused, url);
    });
  h.go = (delta?: number) => hold(() => go(delta && delta < 0 && onLeftEntry() ? delta - 1 : delta));
  // Replacing a closed sheet's entry leaves the entry under it as it was: noted, so it is not taken off.
  h.replaceState = (state: unknown, unused: string, url?: string | URL | null) =>
    hold(() => {
      if (!isOurs(state)) onLeftEntry();
      replace(state, unused, url);
    });
}
if (Platform.OS === 'web') patchHistory();

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
    // A beat after opening, so a router move still on its way (one that opened this sheet, such as a
    // back the screen refused) lands first and this entry goes on top of the right one.
    // Not while another sheet's own step back is still on its way: that step would take this entry off instead.
    let pushed = false;
    let first: ReturnType<typeof setTimeout> = setTimeout(function pushWhenStill() {
      if (appBacks.pending(now())) {
        first = setTimeout(pushWhenStill, 30);
        return;
      }
      pushed = true;
      push();
    }, PUSH_AFTER_MS);
    let popped = false;
    let again: ReturnType<typeof setTimeout> | undefined;
    const onPop = (e: Event) => {
      // Not the person's Back for this sheet: the app's own step back (a sheet closed in the tap that opened this
      // one), any step before this sheet has its own entry, and a step that stays on its entry or a later sheet's.
      if (!backClosesSheet({ own: ownPops.has(e), pushed, closing: popped, at: historyState()?.[SHEET_ENTRY], token })) return;
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
      clearTimeout(first);
      openEntries.delete(token);
      if (popped || !pushed) return;
      setTimeout(() => {
        const used = usedEntries.delete(token);
        if (!used && historyState()?.[SHEET_ENTRY] === token) ownBack();
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
 * Phone browsers (web only): the px the on-screen keyboard covers while the sheet is open, 0 otherwise, as
 * `Screen` reads it (`keyboardCover` in ./keyboardInset): the page's layout does not shrink for the keyboard
 * in a phone browser, only the visual viewport does. The sheet pads its bottom by that much, so it rests on
 * the keyboard with its footer in view, and the focused field in its body is scrolled into the part that
 * shows, after the padding is laid out and again whenever the focus moves to another field.
 */
function useSheetKeyboard(open: boolean, body: React.RefObject<ScrollViewInstance | null>): number {
  const [cover, setCover] = useState(0);
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !open) return;
    const vv = window.visualViewport;
    if (!vv) return;
    const measure = () => {
      const next = keyboardCover({ layoutHeight: window.innerHeight, viewportHeight: vv.height, scale: vv.scale });
      setCover(next);
      // The browser panned the page to the field; the padding now makes room, so pan it back.
      if (next > 0 && (window.scrollY > 0 || vv.offsetTop > 0)) window.scrollTo(0, 0);
    };
    measure();
    vv.addEventListener('resize', measure);
    vv.addEventListener('scroll', measure);
    return () => {
      vv.removeEventListener('resize', measure);
      vv.removeEventListener('scroll', measure);
      setCover(0);
    };
  }, [open]);
  useEffect(() => {
    if (!cover || typeof document === 'undefined') return;
    const reveal = () => {
      const node = (body.current as unknown as { getScrollableNode?: () => unknown } | null)?.getScrollableNode?.();
      const el = document.activeElement;
      if (!(node instanceof HTMLElement) || !(el instanceof HTMLElement) || !node.contains(el)) return;
      if (!/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) && !el.isContentEditable) return;
      const r = el.getBoundingClientRect();
      const v = node.getBoundingClientRect();
      const delta = revealDelta({ top: r.top, bottom: r.bottom }, { top: v.top, bottom: Math.min(v.bottom, window.innerHeight - cover) });
      if (delta) node.scrollTop += delta;
    };
    const frame = requestAnimationFrame(reveal);
    const onFocus = () => requestAnimationFrame(reveal);
    document.addEventListener('focusin', onFocus);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('focusin', onFocus);
    };
  }, [cover, body]);
  return cover;
}

/**
 * Web: the control that opened the sheet gets the focus back when it closes. React Native Web's modal notes
 * the focused element only after the sheet's content has mounted, so a field that takes the focus as the sheet
 * opens (`autoFocus`) was noted instead of its opener, and on close the focus fell to the page. So the page's
 * last focused control outside any dialog is kept as it is focused (`lastOutside`), and a sheet that opens
 * notes it (or the control still focused, when nothing inside took the focus); once the sheet is gone, that
 * control is focused again unless the focus already went somewhere (the modal's own return, or a screen the
 * sheet opened).
 */
let lastOutside: HTMLElement | null = null;
const inDialog = (el: Element) => !!el.closest('[aria-modal="true"]');
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  document.addEventListener(
    'focusin',
    (e) => {
      if (e.target instanceof HTMLElement && !inDialog(e.target)) lastOutside = e.target;
    },
    true,
  );
}

/**
 * Web: while a sheet is open, the page behind it (the app's root) and any sheet under it are `inert` and
 * `aria-hidden`, so a screen reader, the keyboard and a pointer meet only the sheet on top (a dialog's
 * `aria-modal` alone is not honoured by every reader, and the page's controls were in the tree twice: a glass
 * behind the + sheet beside the sheet's own). React Native Web puts each modal in a layer of its own, a child
 * of the body; the top one is the last of them. It is set after the modal's own focus trap has noted the
 * opener, and taken off as the sheet starts to close, before the focus goes back to the opener.
 */
const shownSheets = new Set<string>();
const madeInert = new Set<HTMLElement>();
/** The modal layer (a child of the body) that holds the element with this id. */
function layerOf(id: string): HTMLElement | null {
  let el = document.getElementById(id);
  while (el && el.parentElement && el.parentElement !== document.body) el = el.parentElement;
  return el && el.parentElement === document.body ? el : null;
}
function applyInert() {
  const layers = [...shownSheets].map(layerOf).filter((l): l is HTMLElement => !!l);
  layers.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
  const top = layers.at(-1);
  const want = new Set<HTMLElement>();
  if (top) {
    const root = document.getElementById('root');
    if (root && !root.contains(top)) want.add(root);
    for (const l of layers) if (l !== top) want.add(l);
  }
  for (const el of [...madeInert]) {
    if (want.has(el)) continue;
    el.removeAttribute('inert');
    el.removeAttribute('aria-hidden');
    madeInert.delete(el);
  }
  for (const el of want) {
    if (madeInert.has(el)) continue;
    el.setAttribute('inert', '');
    el.setAttribute('aria-hidden', 'true');
    madeInert.add(el);
  }
}
function useInertBehind(visible: boolean, layerId: string) {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined' || !visible) return;
    shownSheets.add(layerId);
    applyInert();
    return () => {
      shownSheets.delete(layerId);
      applyInert();
    };
  }, [visible, layerId]);
}

function useOpenerFocus(visible: boolean, mounted: boolean) {
  const opener = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined' || !visible) return;
    const now = document.activeElement;
    opener.current = now instanceof HTMLElement && now !== document.body && !inDialog(now) ? now : lastOutside;
  }, [visible]);
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined' || mounted) return;
    const el = opener.current;
    opener.current = null;
    if (!el) return;
    // The modal's content leaves the page a frame or two after the sheet lets it go: wait for the focus to
    // fall (to the page, or with a field that has left the page), at most about half a second.
    let frames = 0;
    let frame = 0;
    const look = () => {
      if (!document.contains(el)) return;
      const now = document.activeElement;
      const fell = !now || now === document.body || !document.contains(now);
      if (fell) return el.focus();
      // Focus went somewhere else outside a dialog (the modal's own return, a screen the sheet opened): leave it.
      if (!inDialog(now)) return;
      if (++frames < 30) frame = requestAnimationFrame(look);
    };
    look();
    return () => cancelAnimationFrame(frame);
  }, [mounted]);
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
  const layerId = `${titleId}-layer`;
  const latestOpen = useRef(visible);
  useEffect(() => {
    latestOpen.current = visible;
  });
  useBackCloses(visible, requestClose, () => latestOpen.current);
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const { height: winH } = useWindowDimensions();
  // A short window (a browser zoomed to 400%, a window held sideways) pins nothing but the handle: the title, the
  // body and the footer scroll together, so the body never has 0 px between them (WCAG 1.4.10; `SHORT_WINDOW`).
  const short = useShortWindow();
  // Stays true through the exit animation, then the modal unmounts.
  const [mounted, setMounted] = useState(visible);
  if (visible && !mounted) setMounted(true);
  // Reduced motion: no exit animation to wait for.
  if (!visible && mounted && reduce) setMounted(false);
  useOpenerFocus(visible, mounted);
  useInertBehind(visible, layerId);
  const body = useRef<ScrollViewInstance>(null);
  const keyboard = useSheetKeyboard(visible, body);
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
  const titleView = title ? (
    <Text variant="h2" nativeID={titleId} style={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.md }}>
      {title}
    </Text>
  ) : null;
  const footerView =
    asking && unsaved ? (
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
    ) : null;
  return (
    // A sheet's controls count for no screen: the sheet shows its own toast, and a closing sheet's controls
    // must not move the screen's toast (./toastControls).
    <ToastScope.Provider value={null}>
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      onRequestClose={requestClose}
      statusBarTranslucent
      // Web: the dialog is named by its title (or the label given), as a screen reader expects of a dialog.
      {...((title ? { 'aria-labelledby': titleId } : accessibilityLabel ? { 'aria-label': spokenUnits(accessibilityLabel) } : {}) as object)}>
      <KeyboardAvoidingView
        nativeID={layerId}
        pointerEvents={visible ? 'auto' : 'none'}
        behavior={Platform.OS === 'web' ? undefined : 'padding'}
        // Web: rests on a phone browser's keyboard (natively KeyboardAvoidingView pads for it).
        style={{ flex: 1, justifyContent: 'flex-end', paddingBottom: keyboard }}>
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
          {/* The drag zone: the handle and the title (on a short window the handle only). */}
          <View testID="sheet-drag" {...pan?.panHandlers} style={DRAG_ZONE_WEB}>
            <View style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 8 }}>
              <View testID="sheet-handle" style={{ width: 36, height: 4, borderRadius: 1, backgroundColor: colors.borderStrong }} />
            </View>
            {short ? null : titleView}
          </View>
          {short ? (
            <ScrollView ref={body} testID="sheet-body" keyboardShouldPersistTaps="handled">
              {titleView}
              <View style={{ paddingHorizontal: spacing.xl, gap: spacing.md, paddingBottom: spacing.md }}>{children}</View>
              {footerView}
            </ScrollView>
          ) : (
            <ScrollView ref={body} testID="sheet-body" keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: spacing.xl, gap: spacing.md, paddingBottom: spacing.md }}>
              {children}
            </ScrollView>
          )}
          {short ? null : footerView}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
    </ToastScope.Provider>
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
