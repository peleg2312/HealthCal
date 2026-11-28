import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, PanResponder, type PanResponderInstance, Platform, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';

import { withoutMarks } from '@/lib/bidi';
import { spokenUnits } from '@/lib/spokenUnits';
import { cup, isReducedMotion, MAX_CONTENT_WIDTH, motion, useLargeText, useTheme, type ThemeColors } from '@/theme';

import { figure } from './decorative';
import { type ControlBox, sheetToastPlace, TOAST_GAP, toastBand, toastBottom, toastCovers, toastCoversAmong, toastGesture, type WindowBox } from './keyboardInset';
import { PressableScale } from './Pressable';
import { Text } from './Text';
import { controlsIn } from './toastControls';

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
  /**
   * The same news in fewer words, drawn instead of `message` while text is large (`useLargeText`), so the toast
   * keeps to two lines over the screen's bottom chrome (Today's glass at 320 x 640). The spoken label is still the
   * whole `message`.
   */
  short?: string;
}

interface Dock {
  id: number;
  height: number;
  cover: number;
  rides: boolean;
  /** The screen's element id on web (its `nativeID`): the toast keeps clear of the controls inside it. */
  scope?: string;
}

interface ToastState {
  id: number;
  message: string | null;
  actionLabel?: string;
  onAction?: () => void;
  tint?: string;
  short?: string;
  /** Raised inside `toastToScreen`: shown by the screen once every sheet has gone, never in a sheet. */
  toScreen?: boolean;
  /**
   * While a toast shows over a control of a screen's scroll area: that screen (its element id, or a sheet's layer id)
   * and how far up from the window's (the sheet's) bottom its scroll area gives way (`toastBand`), and the place it was
   * made for (a keyboard that opens or closes is another place, so the band is made again). In a sheet whose top is
   * high, `sink` is how far below the sheet's top edge the toast rests (`sheetToastPlace`). Cleared with the toast.
   */
  band: { scope: string; fromBottom: number; key?: string; sink?: number } | null;
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
  band: null,
  show: (message, options) =>
    set({ id: get().id + 1, message, actionLabel: options?.label && options.onPress ? options.label : undefined, onAction: options?.label ? options.onPress : undefined, tint: options?.tint, short: options?.short, toScreen: handingToScreen > 0 }),
  hide: () => set({ message: null, actionLabel: undefined, onAction: undefined, tint: undefined, short: undefined, toScreen: undefined, band: null }),
}));

/** How deep the calls of `toastToScreen` are now (a toast raised meanwhile goes to the screen). */
let handingToScreen = 0;

/**
 * Runs `log` and hands every toast it raises to the screen under the open sheet: no sheet shows it, and the
 * screen shows it once every sheet has gone, once, in its own place. For a sheet that closes right after a
 * one-tap log (the + sheet's tiles and glasses): shown by the sheet first, the toast stood above the sheet's
 * top edge for half a second and then jumped down onto the screen as the sheet left.
 */
export function toastToScreen<T>(log: () => T): T {
  handingToScreen += 1;
  try {
    return log();
  } finally {
    handingToScreen -= 1;
  }
}

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
export function useToastDock(height: number, active = true, keyboard?: { cover: number; rides: boolean }, scope?: string) {
  const [id] = useState(() => ++dockSeq);
  const cover = keyboard?.cover ?? 0;
  const rides = keyboard?.rides ?? false;
  useEffect(() => {
    useToast.setState((s) => {
      const others = s.docks.filter((d) => d.id !== id);
      return { docks: active ? [...others, { id, height, cover, rides, scope }] : others };
    });
  }, [id, height, active, cover, rides, scope]);
  useEffect(() => () => useToast.setState((s) => ({ docks: s.docks.filter((d) => d.id !== id) })), [id]);
}

/**
 * How far up from the window's bottom this screen's scroll area gives way while a toast shows (0: not at all). The
 * toast always rests in one place; when a control of the screen lies under it (`toastCovers`), it asks for this band
 * (`toastBand`) and `Screen` ends its scroll area there, so no control is under the toast and nothing moves. A `Sheet`
 * reads the same for its body, by its layer id, while its toast rests at its bottom.
 */
export function useToastBand(scope: string): number {
  return useToast((s) => (s.band && s.band.scope === scope ? s.band.fromBottom : 0));
}

/** A sheet's toast: how far below the sheet's top edge it rests (0: above the sheet). `Sheet` moves its toast layer there. */
export function useToastSink(scope: string): number {
  return useToast((s) => (s.band && s.band.scope === scope ? (s.band.sink ?? 0) : 0));
}

/**
 * The toast's action (Undo) takes no press in its first 600 ms on screen: a quick second tap meant for
 * the button the toast rose beside (Today's "+ 250 ml", a "+" on a row) must never undo the first one.
 * The stamp is taken when the toast is first shown, and the clock is read in the press handler.
 * Scripts that tap `toast-action` wait for this (scripts/dev/toastGuard.cjs reads the number here).
 */
export const TOAST_ACTION_GUARD_MS = 600;

/**
 * How long a toast stays on screen. A message alone: 2.2 s. One with an action (Undo): 5 s on a phone and in a
 * browser; 20 s while a screen reader runs (natively: a browser cannot tell), and on Android never less than the
 * person's own "Time to take action" setting. Whatever the length, the timer stops while the action has the focus
 * or a finger, a finger is on the toast, or a mouse rests on it, and starts again with at least `TOAST_RESUME_MS`
 * left (WCAG 2.2.1), so an Undo never leaves from under the person. A toast can always be put away sooner: a flick
 * down or sideways, a tap on its words, Escape on the web, or the accessibility action "Dismiss".
 */
export const TOAST_MS = 2200;
export const TOAST_ACTION_MS = 5000;
export const TOAST_READER_MS = 20000;
export const TOAST_RESUME_MS = 2000;

async function lifetime(action: boolean): Promise<number> {
  if (!action) return TOAST_MS;
  if (Platform.OS === 'web') return TOAST_ACTION_MS;
  const reader = await AccessibilityInfo.isScreenReaderEnabled().catch(() => false);
  const ms = reader ? TOAST_READER_MS : TOAST_ACTION_MS;
  const recommended = (AccessibilityInfo as { getRecommendedTimeoutMillis?: (ms: number) => Promise<number> }).getRecommendedTimeoutMillis;
  if (Platform.OS !== 'android' || typeof recommended !== 'function') return ms;
  const asked = await recommended.call(AccessibilityInfo, ms).catch(() => ms);
  return Math.max(ms, Number.isFinite(asked) ? asked : ms);
}

/** One toast's timer: what is left of it, and what holds it (hover, focus, a finger on the action). */
interface Life {
  id: number;
  holds: Set<string>;
  left: number;
  deadline: number;
  timer?: ReturnType<typeof setTimeout>;
  close?: () => void;
}

/** Hold a toast's timer for a reason (hover, focus, press); it starts again when nothing holds it. */
function holdLife(l: Life, reason: string) {
  if (l.holds.has(reason)) return;
  l.holds.add(reason);
  if (l.timer) {
    clearTimeout(l.timer);
    l.timer = undefined;
    l.left = Math.max(0, l.deadline - monotonicNow());
  }
}
function releaseLife(l: Life, reason: string) {
  if (!l.holds.delete(reason) || l.holds.size || !l.close) return;
  l.left = Math.max(l.left, TOAST_RESUME_MS);
  runLife(l);
}

function runLife(l: Life) {
  if (l.timer) clearTimeout(l.timer);
  l.timer = undefined;
  if (!l.close || l.holds.size) return;
  l.deadline = monotonicNow() + l.left;
  const close = l.close;
  l.timer = setTimeout(close, l.left);
}

/**
 * Web only: where keyboard focus was last outside a toast, so focus that was on the toast's action goes
 * back there when the toast leaves (or, when that control is gone, to the control that now carries its
 * testID: the trash can of a row an Undo brought back), never to the page.
 */
let lastFocus: { el: HTMLElement; testId: string | null } | null = null;
let focusWatch = false;
function watchFocus() {
  if (focusWatch || Platform.OS !== 'web' || typeof document === 'undefined') return;
  focusWatch = true;
  document.addEventListener('focusin', (e) => {
    const el = e.target;
    if (!(el instanceof HTMLElement) || el.closest('[data-testid="toast"]')) return;
    lastFocus = { el, testId: el.getAttribute('data-testid') };
  });
}
function returnFocus() {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  const now = document.activeElement;
  if (now && now !== document.body && now.isConnected) return;
  const back = lastFocus;
  if (!back) return;
  let el: HTMLElement | null = back.el.isConnected ? back.el : null;
  if (!el && back.testId) el = document.querySelector<HTMLElement>(`[data-testid="${back.testId.replace(/["\\]/g, '\\$&')}"]`);
  el?.focus();
}

/** The controls a toast is never over: everything a person can press, type in or pick. */
const CONTROLS = 'button,a[href],input,textarea,select,[role="button"],[role="link"],[role="switch"],[role="checkbox"],[role="radio"],[role="tab"],[role="slider"],[role="adjustable"],[tabindex="0"]';

function controlBoxes(scope: Element, skip: Element, skipFields = false): ControlBox[] {
  const out: ControlBox[] = [];
  // What shows of a control: its box cut by every box above it that clips (a scroll area, a card that hides its
  // overflow), up to the screen. A row scrolled out of the scroll area's view is not under the toast.
  const clips = new Map<Element, DOMRect | null>();
  const clipOf = (a: Element): DOMRect | null => {
    if (!clips.has(a)) {
      const cs = getComputedStyle(a);
      clips.set(a, cs.overflowX !== 'visible' || cs.overflowY !== 'visible' ? a.getBoundingClientRect() : null);
    }
    return clips.get(a) ?? null;
  };
  for (const el of Array.from(scope.querySelectorAll(CONTROLS))) {
    if (skip.contains(el) || el.getAttribute('data-testid') === 'sheet-backdrop') continue;
    if (skipFields && el.matches('input, textarea')) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    let { top, bottom, left, right } = r;
    for (let a = el.parentElement; a && a !== scope.parentElement; a = a.parentElement) {
      const c = clipOf(a);
      if (!c) continue;
      top = Math.max(top, c.top);
      bottom = Math.min(bottom, c.bottom);
      left = Math.max(left, c.left);
      right = Math.min(right, c.right);
    }
    if (bottom - top < 2 || right - left < 2) continue;
    out.push({ top, bottom, left, right });
  }
  return out;
}

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

/** Where a sheet's toast may rest: the sheet tells its host (the layer id it reads its band by, and its box). */
export interface SheetToastBox {
  /** The sheet's layer id: its body reads its band by it (`useToastBand`), its toast layer its sink (`useToastSink`). */
  scope: string;
  /** The window's height less what the keyboard covers, the sheet's top edge in the window, and its height. */
  windowHeight: number;
  top: number;
  height: number;
  /** How far above the sheet's bottom edge the toast's bottom rests when it rests in the sheet (above its footer). */
  lift: number;
}

/**
 * Shows the current toast: an ink cup (square shoulders, round base) with a
 * 3 px level line along its top edge in the colour of what was logged.
 *
 * Mounted once at the app root ('screen'), and once inside every open Sheet
 * ('sheet'): a native modal covers the app's own layer, so a sheet has to show
 * the toast itself. On a screen it always rests in one place: 12 px above the
 * bottom chrome the screen reported with `useToastDock` (tab bar, footer or
 * home indicator). While the on-screen keyboard is up it rests 12 px above the
 * footer that rides on the keyboard, or 12 px above the keyboard when the
 * screen has no footer, by the same measure the screen pads itself with, and
 * moves above the focused field when it would cover it and there is room
 * (`toastBottom`). It is drawn at once. When a control of the screen lies under
 * that place (`toastCovers`: in a browser every control of the focused screen,
 * cut to what its scroll area shows; on a phone the kit's controls of the
 * focused screen, ./toastControls), the screen's scroll area ends 8 px above
 * the toast while it shows (`toastBand`, `useToastBand`), so nothing is under
 * it and nothing moves. The root host is outside every ScrollView, so a tap on
 * its action is never taken for a tap that dismisses the keyboard (only a
 * ScrollView does that, by its keyboardShouldPersistTaps).
 *
 * In a sheet it sits just above the sheet's top edge, or, on a sheet whose top is high in the window, at the
 * bottom of the sheet above its footer, with the sheet's body ending 8 px above it (`sheetToastPlace`); the host
 * underneath steps aside so there is only ever one toast on screen.
 *
 * A person can put it away at any time: a flick or drag down or sideways (it follows the finger and settles back
 * when the move was too small; `toastGesture`), a tap on its words (not on its action), Escape on the web (while no
 * sheet is open: with one, Escape closes the sheet), and the
 * accessibility action "Dismiss" (VoiceOver's escape gesture too).
 */
export function ToastHost({ placement = 'screen', sheet }: { placement?: 'screen' | 'sheet'; sheet?: SheetToastBox }) {
  const { colors, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const { id, message, actionLabel, onAction, tint, short, toScreen, hide } = useToast();
  // Large text: the short words when the caller gave them, and the toast closer to the window's sides.
  const large = useLargeText();
  const drawn = large && short ? short : message;
  const side = large ? 12 : 20;
  const sheetHosts = useToast((s) => s.sheetHosts);
  const inSheet = placement === 'sheet';
  const docks = useToast((s) => s.docks);
  const last = docks.length ? docks[docks.length - 1] : null;
  // The screen whose controls the toast is never over: the newest dock that names one (the tab bar's
  // own dock, registered beside a tab screen's, names none).
  const scopeId = [...docks].reverse().find((d) => d.scope)?.scope;
  const placed = last ? { dock: last.height, ridesKeyboard: last.rides, cover: last.cover } : { dock: insets.bottom, ridesKeyboard: false, cover: 0 };
  const keyboardUp = !inSheet && placed.cover > 0;
  // With the keyboard up: the focused field, as distances from the bottom of the host, and how
  // high the host is (the toast may not rise into the status bar). Measured, so null until then.
  // Kept with the toast and keyboard it was measured for, so a stale one is never used.
  const [field, setField] = useState<{ top: number; bottom: number; hostBottom: number; key: string } | null>(null);
  const key = `${id}:${placed.cover}:${placed.dock}`;
  const [toastH, setToastH] = useState(0);
  const [toastW, setToastW] = useState(0);
  const outer = useRef<React.ComponentRef<typeof View>>(null);
  const toastRef = useRef<React.ComponentRef<typeof View>>(null);
  const bottomNow = useRef(0);
  const [anim] = useState(() => new Animated.Value(0));
  // Where a finger has dragged the toast (it follows the finger on its way to being flicked away).
  const [drag] = useState(() => new Animated.ValueXY({ x: 0, y: 0 }));
  const [hostId] = useState(() => ++hostSeq);
  // The toast that is on its way out (its action pressed, or put away): it takes no second press.
  const [closingId, setClosingId] = useState(0);
  const life = useRef<Life>({ id: 0, holds: new Set(), left: 0, deadline: 0 });
  // Whether keyboard focus is on the action (web): it goes back where it came from when the toast leaves.
  const focusOn = useRef(false);
  // Web: this host's polite live region (below), mounted before any toast shows: a region added together with its
  // words is often not read, and the web's announceForAccessibility does nothing. A new toast's words go in as a new
  // text node, so the same words twice are read twice.
  const live = useRef<React.ComponentRef<typeof View>>(null);
  const { height: winH } = useWindowDimensions();

  useEffect(() => {
    if (!inSheet) return;
    useToast.setState((s) => ({ sheetHosts: [...s.sheetHosts, hostId] }));
    return () => useToast.setState((s) => ({ sheetHosts: s.sheetHosts.filter((h) => h !== hostId) }));
  }, [inSheet, hostId]);

  const top = sheetHosts[sheetHosts.length - 1];
  // Before a new sheet host has registered itself (its first render), it already counts as the one on top.
  // A toast handed to the screen (`toastToScreen`) waits for every sheet to go and is shown by the screen.
  const active = inSheet ? !toScreen && (top === hostId || !sheetHosts.includes(hostId)) : sheetHosts.length === 0;

  // Puts this toast away now (a flick, a tap on its words, Escape, "Dismiss"): it fades and sinks as it always leaves.
  const dismiss = () => {
    if (closingId === id || useToast.getState().id !== id || !useToast.getState().message) return;
    setClosingId(id);
    closeToast(anim, id, hide);
  };
  // The responder below is made once; it reaches this render's functions through a ref set after each render.
  const toastBox = () => (outer.current as unknown as HTMLElement | null)?.querySelector?.('[data-testid="toast"]')?.getBoundingClientRect();
  const gesture = useRef({ dismiss, width: 0, box: toastBox });
  useEffect(() => {
    gesture.current = { dismiss, width: toastW, box: toastBox };
  });
  // Made once, after the first render (the responder reads this render's functions through the ref above).
  const [pan, setPan] = useState<PanResponderInstance | null>(null);
  useEffect(() => {
    const settle = () => {
      if (isReducedMotion()) return drag.setValue({ x: 0, y: 0 });
      Animated.timing(drag, { toValue: { x: 0, y: 0 }, duration: motion.duration.fade, easing: Easing.bezier(...motion.easing.enter), useNativeDriver: Platform.OS !== 'web' }).start();
    };
    setPan(PanResponder.create({
      // A touch on the words (the action, deeper, takes its own touch first), or a move that starts on the action.
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 6 || g.dy > 6,
      onPanResponderGrant: () => holdLife(life.current, 'finger'),
      onPanResponderMove: (_e, g) => {
        // It follows the finger down or sideways (never up); under reduced motion it stays still and just goes.
        if (!isReducedMotion()) drag.setValue({ x: g.dx, y: Math.max(0, g.dy) });
      },
      onPanResponderRelease: (_e, g) => {
        releaseLife(life.current, 'finger');
        const did = toastGesture(g, gesture.current.width);
        if (did === 'back') return settle();
        // Web: the browser sends a click after a tap; the toast is gone by then, so it would land on what was under it.
        if (did === 'tap') swallowClick(gesture.current.box());
        gesture.current.dismiss();
      },
      onPanResponderTerminate: () => {
        releaseLife(life.current, 'finger');
        settle();
      },
    }));
  }, [drag]);

  useEffect(() => {
    if (!message || !active) return;
    if (announcedId !== id) {
      announcedId = id;
      shownAt = monotonicNow();
      // Live regions are Android-only; announcing explicitly covers iOS as well. A name isolated for
      // drawing (`isolateRtl`) is announced raw: screen readers get no direction marks. Units are said in
      // full ("250 millilitres added to Water"); the toast drawn keeps its short units.
      const spoken = spokenUnits(withoutMarks(message));
      const line = actionLabel ? `${spoken}. ${actionLabel} available.` : spoken;
      if (Platform.OS === 'web') speakIn(live.current, line);
      else AccessibilityInfo.announceForAccessibility(line);
    }
    // A new toast stands where it rests, whatever a finger did to the one before.
    drag.setValue({ x: 0, y: 0 });
    // Rises 16 px and fades in, ease-out, no bounce; instant under reduced motion. A toast raised while the
    // one before is fading out rises back from where that fade had got to.
    if (isReducedMotion()) anim.setValue(1);
    else Animated.timing(anim, { toValue: 1, duration: motion.duration.row, easing: Easing.bezier(...motion.easing.enter), useNativeDriver: Platform.OS !== 'web' }).start();
    let cancelled = false;
    const l: Life = life.current.id === id ? life.current : { id, holds: new Set(), left: 0, deadline: 0 };
    life.current = l;
    // Someone using a screen reader needs longer to reach the action (see TOAST_ACTION_MS).
    void lifetime(!!actionLabel).then((ms) => {
      if (cancelled) return;
      l.left = ms;
      l.close = () => closeToast(anim, id, hide);
      runLife(l);
    });
    return () => {
      cancelled = true;
      if (l.timer) clearTimeout(l.timer);
      l.timer = undefined;
      l.close = undefined;
    };
  }, [id, message, actionLabel, anim, drag, hide, active]);

  // Web: a mouse resting on the toast holds its timer, wherever on the toast it rests; Escape puts it away.
  const shownNow = !!message && active;
  useEffect(() => {
    if (!shownNow || Platform.OS !== 'web' || typeof document === 'undefined' || typeof window === 'undefined') return;
    watchFocus();
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      const el = (outer.current as unknown as HTMLElement | null)?.querySelector?.('[data-testid="toast"]');
      const r = el?.getBoundingClientRect();
      const over = !!r && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (over) holdLife(life.current, 'hover');
      else releaseLife(life.current, 'hover');
    };
    // Escape puts a screen's toast away. While a sheet is open Escape is the sheet's (it closes the sheet, and the
    // toast fades with it): a toast a sheet shows may have been raised before the sheet opened.
    const onKey = (e: KeyboardEvent) => {
      if (inSheet || e.key !== 'Escape' || useToast.getState().id !== id) return;
      e.stopImmediatePropagation();
      gesture.current.dismiss();
    };
    document.addEventListener('pointermove', onMove);
    window.addEventListener('keyup', onKey, true);
    return () => {
      document.removeEventListener('pointermove', onMove);
      window.removeEventListener('keyup', onKey, true);
      life.current.holds.delete('hover');
    };
  }, [shownNow, id, inSheet]);

  // Web: the live region holds nothing once its toast has gone (the words are said once, as it arrives).
  useEffect(() => {
    if (!shownNow) speakIn(live.current, '');
  }, [shownNow]);

  // Web: focus that was on the action goes back to where it came from when the toast leaves.
  useEffect(() => {
    if (shownNow || !focusOn.current) return;
    focusOn.current = false;
    const frame = requestAnimationFrame(returnFocus);
    return () => cancelAnimationFrame(frame);
  }, [shownNow]);

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

  const resting = toastBottom(
    placed,
    keyboardUp && field && field.key === key && toastH > 0 ? { top: field.top, bottom: field.bottom, toastHeight: toastH, limit: field.hostBottom - insets.top } : null,
    TOAST_GAP,
  );
  useEffect(() => {
    bottomNow.current = resting;
  }, [resting]);

  // A screen's toast always rests where it is (`resting`) and is drawn at once. When a control of the screen lies under
  // it, the screen's scroll area ends 8 px above the toast while it shows (`toastBand`), so nothing is under it and
  // nothing moves. A browser asks the page; a phone measures the focused screen's kit controls (./toastControls). With
  // the keyboard up and no footer riding on it (Water's "Other amount"), the toast stands over the keyboard beside the
  // field being typed in and asks for no band (it would put that field out of view); there it can be flicked away. A
  // phone with the keyboard up asks for none either (the screen is already padded for the keyboard).
  const bandKey = `${key}:${scopeId ?? ''}:${winH}:${drawn}:${resting}`;
  const wantsBand = shownNow && !inSheet && !!scopeId && (keyboardUp ? Platform.OS === 'web' && placed.ridesKeyboard : true);
  // Web: looked at before the browser paints, so the toast's first frame already has the room it needs.
  useLayoutEffect(() => {
    if (!wantsBand) return;
    // A band made for another place (the keyboard has opened or closed since) is let go first.
    const made = useToast.getState().band;
    if (made && made.scope === scopeId && made.key !== bandKey) useToast.setState({ band: null });
    const makeBand = (h: number) => {
      if (!scopeId || !(h > 0)) return;
      const fromBottom = toastBand(resting, h);
      useToast.setState((st) => {
        const same = st.band?.scope === scopeId && st.band.key === bandKey;
        if (same && st.band!.fromBottom >= fromBottom) return {};
        return { band: { scope: scopeId, key: bandKey, fromBottom: Math.max(fromBottom, same ? st.band!.fromBottom : 0) } };
      });
    };
    let stopped = false;
    const look = () => {
      if (Platform.OS === 'web') {
        const host = outer.current as unknown as HTMLElement | null;
        const toastEl = host?.querySelector?.('[data-testid="toast"]');
        const scope = scopeId ? document.getElementById(scopeId) : null;
        if (!host || !toastEl || !scope || typeof window === 'undefined') return;
        const r = toastEl.getBoundingClientRect();
        const h = Math.round(r.height);
        // Where it rests, whatever its rise-in has got to (the rise moves it, not its place).
        const at = window.innerHeight - resting - h;
        if (toastCovers({ top: at, height: h, left: r.left, right: r.right, controls: controlBoxes(scope, host, keyboardUp) })) makeBand(h);
        return;
      }
      void (async () => {
        if (!scopeId) return;
        const [hostBox, box] = await Promise.all([measureBox(outer.current), measureRect(toastRef.current)]);
        if (stopped || !hostBox || !box) return;
        const rects = await Promise.all(controlsIn(scopeId).map((n) => measureRect(n)));
        if (stopped) return;
        const windowBottom = hostBox.y + hostBox.h + resting;
        if (toastCoversAmong({ windowBottom, resting, toast: box, controls: rects.filter((r): r is WindowBox => !!r) })) makeBand(Math.round(box.height));
      })();
    };
    look();
    // Once more after the screen has settled (a list still arriving, a screen fading in): the band only ever grows.
    const again = setTimeout(look, LOOK_AGAIN_MS);
    return () => {
      stopped = true;
      clearTimeout(again);
    };
  }, [wantsBand, bandKey, toastH, keyboardUp, resting, scopeId]);

  // A sheet's toast: above the sheet's top edge, or at its bottom when that edge is high (`sheetToastPlace`).
  const sheetPlace = inSheet && sheet ? sheetToastPlace({ windowHeight: sheet.windowHeight, sheetTop: sheet.top, sheetHeight: sheet.height, toastHeight: toastH, lift: sheet.lift }) : null;
  const sheetScope = sheet?.scope;
  const sink = shownNow && sheetPlace?.sink != null ? sheetPlace.sink : null;
  const sheetBand = sink != null && sheetPlace ? sheetPlace.band : 0;
  useEffect(() => {
    if (!sheetScope) return;
    const st = useToast.getState();
    if (sink == null) {
      if (st.band?.scope === sheetScope) useToast.setState({ band: null });
      return;
    }
    if (st.band?.scope === sheetScope && st.band.sink === sink && st.band.fromBottom === sheetBand) return;
    useToast.setState({ band: { scope: sheetScope, key: `${id}`, fromBottom: sheetBand, sink } });
  }, [sheetScope, sink, sheetBand, id]);

  // Web: one polite live region per host, mounted while the host is (the app's root, an open sheet). Its words are
  // written by `speakIn`, never rendered, and it stays the same element whether a toast shows or not (the same
  // two children below either way).
  const region = Platform.OS === 'web' ? <View ref={live} testID="toast-live" pointerEvents="none" style={SPOKEN_ONLY} {...({ role: 'status', 'aria-live': 'polite', 'aria-atomic': true } as object)} /> : null;
  if (!message || !active) {
    return (
      <>
        {region}
        {null}
      </>
    );
  }
  const spokenMessage = spokenUnits(withoutMarks(message));
  return (
    <>
    {region}
    <View
      ref={outer}
      pointerEvents="box-none"
      style={[
        inSheet
          ? // Above the sheet's top edge; in the sheet, its layer (moved down by `useToastSink`) carries it there.
            { alignSelf: 'stretch', alignItems: 'center', paddingHorizontal: side, marginBottom: sink != null ? 0 : 12 }
          : { position: 'absolute', left: 0, right: 0, bottom: resting, alignItems: 'center', paddingHorizontal: side },
        // A sheet's toast is drawn once it is laid out, so it never shows for a frame above a sheet it rests in.
        inSheet && toastH <= 0 ? { opacity: 0 } : null,
      ]}>
      <Animated.View
        ref={toastRef}
        testID="toast"
        // The toast takes its own touches: a tap on its words or a flick puts it away. On its way out it takes none.
        pointerEvents={closingId === id ? 'none' : 'auto'}
        {...pan?.panHandlers}
        // Android reads the toast as it appears; the web reads the host's live region instead (above).
        accessibilityLiveRegion={Platform.OS === 'web' ? undefined : 'polite'}
        onLayout={(e) => {
          setToastH(Math.round(e.nativeEvent.layout.height));
          setToastW(Math.round(e.nativeEvent.layout.width));
        }}
        style={{
          maxWidth: MAX_CONTENT_WIDTH - 2 * side,
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
          transform: [{ translateX: drag.x }, { translateY: Animated.add(anim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }), drag.y) }],
          // Web: a finger dragging the toast moves the toast, never the page under it.
          ...(Platform.OS === 'web' ? ({ touchAction: 'none', cursor: 'default' } as object) : null),
        }}>
        {/* The level line: what was logged, in its own colour. */}
        <View
          pointerEvents="none"
          style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 3, borderTopLeftRadius: radius.shoulder, borderTopRightRadius: radius.shoulder, backgroundColor: tint ? ((colors as unknown as Record<string, string>)[tint] ?? tint) : colors.primary }}
        />
        <View
          pointerEvents="none"
          style={{ flexShrink: 1 }}
          {...figure(spokenMessage)}
          // A screen reader puts it away with the action "Dismiss" (or VoiceOver's escape gesture).
          accessibilityActions={DISMISS_ACTIONS}
          onAccessibilityAction={(e) => {
            if (e.nativeEvent.actionName === 'dismiss') dismiss();
          }}
          onAccessibilityEscape={dismiss}>
          <Text variant="label" color={colors.bg}>
            {drawn}
          </Text>
        </View>
        {actionLabel ? (
          <PressableScale
            testID="toast-action"
            accessibilityLabel={actionLabel}
            // Wider to touch, never taller: the action is already 44 px tall inside the toast's own box, so its touch
            // area ends where the toast does.
            hitSlop={{ left: 10, right: 10, top: 0, bottom: 0 }}
            // The timer waits while the action has the focus or a finger on it.
            onFocus={() => {
              focusOn.current = true;
              holdLife(life.current, 'focus');
            }}
            onBlur={() => {
              focusOn.current = false;
              releaseLife(life.current, 'focus');
            }}
            onPressIn={() => holdLife(life.current, 'press')}
            onPressOut={() => releaseLife(life.current, 'press')}
            onPress={() => {
              // A press in the toast's first moments was meant for what it rose beside: ignored, the toast stays.
              if (monotonicNow() - shownAt < TOAST_ACTION_GUARD_MS) return;
              if (closingId === id) return;
              onAction?.();
              // A toast the action raised itself stays; otherwise this one leaves as it always does, fading and
              // sinking (160 ms), never cut away in one frame.
              if (useToast.getState().id !== id) return;
              setClosingId(id);
              closeToast(anim, id, hide);
            }}
            style={{ minHeight: 44, paddingHorizontal: 10, marginVertical: -12, marginRight: -6, justifyContent: 'center' }}>
            <Text variant="label" color={colors.bg} style={{ textDecorationLine: 'underline' }}>
              {actionLabel}
            </Text>
          </PressableScale>
        ) : null}
      </Animated.View>
    </View>
    </>
  );
}

/**
 * Web: the click a browser sends after a tap on the toast's words would land on whatever lies under the toast once it
 * has gone (its screen's scroll area grows back at once): the next click within 500 ms inside the box the toast had
 * is caught before anything hears it. A click anywhere else is a new tap and goes through.
 */
function swallowClick(box: DOMRect | null | undefined) {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !box) return;
  const stop = (e: MouseEvent) => {
    if (e.clientX < box.left - 2 || e.clientX > box.right + 2 || e.clientY < box.top - 2 || e.clientY > box.bottom + 2) return;
    e.preventDefault();
    e.stopPropagation();
    window.removeEventListener('click', stop, true);
  };
  window.addEventListener('click', stop, true);
  setTimeout(() => window.removeEventListener('click', stop, true), 500);
}

/** The one accessibility action a toast's words carry. */
const DISMISS_ACTIONS = [{ name: 'dismiss', label: 'Dismiss' }];

/** Web: puts `text` in a live region as a new text node (read out once), or empties it. */
function speakIn(node: unknown, text: string) {
  const el = node as { replaceChildren?: (...nodes: unknown[]) => void } | null;
  if (Platform.OS !== 'web' || typeof document === 'undefined' || !el || typeof el.replaceChildren !== 'function') return;
  if (text) el.replaceChildren(document.createTextNode(text));
  else el.replaceChildren();
}

/** Heard, never seen: a 1 px box with nothing drawn (the browser scans skip what is fully transparent). */
const SPOKEN_ONLY = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', opacity: 0, left: 0, top: 0 } as const;

/**
 * The toast leaves: it fades and sinks 16 px evenly over the whole of `motion.duration.fade` (160 ms), then is
 * cleared, but only while it is still the toast showing. The fade is linear, so its last frames hold the last
 * few percent of the toast and nothing is cut away at the end (an ease-in fade still showed 29% of the toast
 * one frame before it was cleared), and it starts on the frame after the press, so the work the action does
 * (an Undo's re-render) does not use up its first half. A toast raised during the fade stops it and rises back
 * from there; the fade it interrupted ends then too, and must not clear it (a glass tapped in a toast's last
 * 160 ms used to log with no toast and no Undo). A fade stopped any other way (its host going away) still
 * clears its own toast. Instant under reduced motion.
 */
function closeToast(anim: Animated.Value, id: number, hide: () => void) {
  const done = () => {
    if (useToast.getState().id === id) hide();
  };
  if (isReducedMotion()) return done();
  const fade = () => Animated.timing(anim, { toValue: 0, duration: motion.duration.fade, easing: Easing.linear, useNativeDriver: Platform.OS !== 'web' }).start(done);
  if (typeof requestAnimationFrame !== 'function') return fade();
  // A toast raised before that frame (the action's own, or a quick next log) is not faded.
  requestAnimationFrame(() => {
    if (useToast.getState().id === id) fade();
  });
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

/** A box in window coordinates with its left edge and width as well (a toast and the controls it keeps clear of). */
function measureRect(node: unknown): Promise<WindowBox | null> {
  return new Promise((resolve) => {
    const m = (node as Measurable | null)?.measureInWindow;
    if (!node || typeof m !== 'function') return resolve(null);
    try {
      m.call(node as Measurable, (x, y, width, height) => resolve([x, y, width, height].every(Number.isFinite) ? { x, y, width, height } : null));
    } catch {
      resolve(null);
    }
  });
}

/** When a toast looks again at what lies under it, once the screen has settled (it is drawn at once either way). */
const LOOK_AGAIN_MS = 450;

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
