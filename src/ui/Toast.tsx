import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';

import { withoutMarks } from '@/lib/bidi';
import { spokenUnits } from '@/lib/spokenUnits';
import { cup, isReducedMotion, MAX_CONTENT_WIDTH, motion, useLargeText, useTheme, type ThemeColors } from '@/theme';

import { type ControlBox, TOAST_CLEAR, TOAST_GAP, toastBottom, toastBottomAmong, toastReachTop, toastSpot, type WindowBox } from './keyboardInset';
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
   * The same news in fewer words, drawn instead of `message` while text is large (`useLargeText`), where a
   * toast of four lines finds no clear band beside the control it rose from (Today's glass at 320 x 640). The
   * spoken label is still the whole `message`.
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
    set({ id: get().id + 1, message, actionLabel: options?.label && options.onPress ? options.label : undefined, onAction: options?.label ? options.onPress : undefined, tint: options?.tint, short: options?.short }),
  hide: () => set({ message: null, actionLabel: undefined, onAction: undefined, tint: undefined, short: undefined }),
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
 * The toast's action (Undo) takes no press in its first 600 ms on screen: a quick second tap meant for
 * the button the toast rose beside (Today's "+ 250 ml", a "+" on a row) must never undo the first one.
 * The stamp is taken when the toast is first shown, and the clock is read in the press handler.
 * Scripts that tap `toast-action` wait for this (scripts/dev/toastGuard.cjs reads the number here).
 */
export const TOAST_ACTION_GUARD_MS = 600;

/**
 * How long a toast stays on screen. A message alone: 2.2 s. One with an action (Undo): 10 s on a phone,
 * 20 s while a screen reader runs, and on Android never less than the person's own "Time to take action"
 * setting; 12 s in a browser (which cannot tell whether a screen reader runs). Whatever the length, the
 * timer stops while the action has the focus or a finger, or a mouse rests on the toast, and starts again
 * with at least `TOAST_RESUME_MS` left (WCAG 2.2.1), so an Undo never leaves from under the person.
 */
export const TOAST_MS = 2200;
export const TOAST_ACTION_MS = 10000;
export const TOAST_READER_MS = 20000;
export const TOAST_WEB_ACTION_MS = 12000;
export const TOAST_RESUME_MS = 4000;

async function lifetime(action: boolean): Promise<number> {
  if (!action) return TOAST_MS;
  if (Platform.OS === 'web') return TOAST_WEB_ACTION_MS;
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

/** The controls a toast keeps clear of: everything a person can press, type in or pick. */
const CONTROLS = 'button,a[href],input,textarea,select,[role="button"],[role="link"],[role="switch"],[role="checkbox"],[role="radio"],[role="tab"],[role="slider"],[role="adjustable"],[tabindex="0"]';

function controlBoxes(scope: Element, skip: Element): ControlBox[] {
  const out: ControlBox[] = [];
  for (const el of Array.from(scope.querySelectorAll(CONTROLS))) {
    if (skip.contains(el) || el.getAttribute('data-testid') === 'sheet-backdrop') continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    out.push({ top: r.top, bottom: r.bottom, left: r.left, right: r.right });
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

/**
 * Shows the current toast: an ink cup (square shoulders, round base) with a
 * 3 px level line along its top edge in the colour of what was logged.
 *
 * Mounted once at the app root ('screen'), and once inside every open Sheet
 * ('sheet'): a native modal covers the app's own layer, so a sheet has to show
 * the toast itself. On a screen it rests 12 px above the bottom chrome the
 * screen reported with `useToastDock` (tab bar, footer or home indicator);
 * when a control lies there, in the lowest band clear of every control with
 * its action in thumb reach (`toastSpot`: in a browser every control on the
 * page, on a phone the kit's controls of the focused screen, measured in the
 * window, ./toastControls and `toastBottomAmong`). While the on-screen keyboard is up it
 * rests 12 px above the footer that rides on the keyboard, or 12 px above the
 * keyboard when the screen has no footer, by the same measure the screen pads
 * itself with, and moves above the focused field when it would cover it and
 * there is room. The root host is outside every ScrollView, so a tap on its
 * action is never taken for a tap that dismisses the keyboard (only a
 * ScrollView does that, by its keyboardShouldPersistTaps). In a sheet it sits in the layout right
 * above the sheet's top edge (in a browser, inside the sheet in its lowest clear band when that edge is
 * out of thumb reach), and the host underneath steps aside so there is only ever one toast on screen.
 */
export function ToastHost({ placement = 'screen' }: { placement?: 'screen' | 'sheet' }) {
  const { colors, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const { id, message, actionLabel, onAction, tint, short, hide } = useToast();
  // Large text: the short words when the caller gave them, and the toast closer to the window's sides.
  const large = useLargeText();
  const drawn = large && short ? short : message;
  const side = large ? 12 : 20;
  const sheetHosts = useToast((s) => s.sheetHosts);
  const inSheet = placement === 'sheet';
  const docks = useToast((s) => s.docks);
  const last = docks.length ? docks[docks.length - 1] : null;
  // The screen whose controls the toast keeps clear of: the newest dock that names one (the tab bar's
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
  const outer = useRef<React.ComponentRef<typeof View>>(null);
  const toastRef = useRef<React.ComponentRef<typeof View>>(null);
  const bottomNow = useRef(0);
  const [anim] = useState(() => new Animated.Value(0));
  const [hostId] = useState(() => ++hostSeq);
  // The toast whose action was pressed: it is on its way out and takes no second press.
  const [closingId, setClosingId] = useState(0);
  const life = useRef<Life>({ id: 0, holds: new Set(), left: 0, deadline: 0 });
  // Whether keyboard focus is on the action (web): it goes back where it came from when the toast leaves.
  const focusOn = useRef(false);
  const { height: winH } = useWindowDimensions();

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
      // drawing (`isolateRtl`) is announced raw: screen readers get no direction marks. Units are said in
      // full ("250 millilitres added to Water"); the toast drawn keeps its short units.
      const spoken = spokenUnits(withoutMarks(message));
      AccessibilityInfo.announceForAccessibility(actionLabel ? `${spoken}. ${actionLabel} available.` : spoken);
    }
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
  }, [id, message, actionLabel, anim, hide, active]);

  // Web: a mouse resting on the toast holds its timer, wherever on the toast it rests.
  const shownNow = !!message && active;
  useEffect(() => {
    if (!shownNow || Platform.OS !== 'web' || typeof document === 'undefined') return;
    watchFocus();
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      const el = (outer.current as unknown as HTMLElement | null)?.querySelector?.('[data-testid="toast"]');
      const r = el?.getBoundingClientRect();
      const over = !!r && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (over) holdLife(life.current, 'hover');
      else releaseLife(life.current, 'hover');
    };
    document.addEventListener('pointermove', onMove);
    return () => {
      document.removeEventListener('pointermove', onMove);
      life.current.holds.delete('hover');
    };
  }, [shownNow, id]);

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
  // Never over a control. Once the toast is laid out, it rests in the lowest band clear of every control on
  // the screen (or, in a browser, in the sheet), its action within thumb reach (`toastSpot`); it is drawn
  // only once that place is known, so it never shows for a frame over a button. A browser asks the page for
  // its controls; a phone measures the kit controls of the focused screen (./toastControls,
  // `toastBottomAmong`). A phone's sheet keeps its toast just above the sheet's top edge.
  const placeKey = `${key}:${inSheet ? 'sheet' : (scopeId ?? '')}:${winH}:${drawn}`;
  const [spot, setSpot] = useState<{ key: string; bottom: number | null } | null>(null);
  const placing = shownNow && !keyboardUp && (Platform.OS === 'web' || !inSheet);
  useEffect(() => {
    if (!placing) return;
    // A toast that is never laid out is shown where it always rests rather than kept out of sight.
    if (toastH <= 0) {
      const late = setTimeout(() => setSpot({ key: placeKey, bottom: null }), PLACE_LATE_MS);
      return () => clearTimeout(late);
    }
    // Phones: the focused screen's kit controls, measured in the window, and the same rule as the web.
    const placeOnPhone = async (): Promise<number | null> => {
      if (!scopeId) return null;
      const [host, box] = await Promise.all([measureBox(outer.current), measureRect(toastRef.current)]);
      if (!host || !box) return null;
      const rects = await Promise.all(controlsIn(scopeId).map((n) => measureRect(n)));
      // With no clear band in thumb reach, any clear band below the status bar, rather than over a control.
      return toastBottomAmong({ windowBottom: host.y + host.h + bottomNow.current, resting, toast: box, controls: rects.filter((r): r is WindowBox => !!r), above: insets.top });
    };
    // The place, as a bottom offset (null: where it always rests), or 'wait' while the screen it belongs to
    // is not laid out yet (a screen coming back into view after the one that raised the toast).
    const place = (): number | null | 'wait' | Promise<number | null> => {
      if (Platform.OS !== 'web') return withTimeout(placeOnPhone(), PLACE_LATE_MS, null);
      const host = outer.current as unknown as HTMLElement | null;
      const toastEl = host?.querySelector?.('[data-testid="toast"]');
      if (!host || !toastEl || typeof window === 'undefined') return null;
      const H = window.innerHeight;
      const r = toastEl.getBoundingClientRect();
      const h = Math.round(r.height);
      if (!inSheet) {
        const scope = scopeId ? document.getElementById(scopeId) : null;
        const box = scope?.getBoundingClientRect();
        if (!scope || !box || box.height < 1 || box.width < 1) return 'wait';
        // With no clear band in thumb reach, any clear band under the screen's header, rather than over a control.
        const head = scope.querySelector('[data-testid="screen-header"], [data-testid="tab-header"]')?.getBoundingClientRect();
        const above = Math.max(box.top, head ? head.bottom + TOAST_CLEAR : 0, insets.top);
        const top = toastSpot({ lowest: H - resting - h, highest: toastReachTop(H, h), height: h, left: r.left, right: r.right, controls: controlBoxes(scope, host), above });
        return top === null ? null : H - top - h;
      }
      // In a sheet: just above its top edge while that is within thumb reach; else the lowest clear band in it.
      let sheet: Element | null = null;
      for (let a: Element | null = host.parentElement; a && !sheet; a = a.parentElement) {
        const found = a.querySelectorAll('[data-testid="sheet"]');
        sheet = found.length ? found[found.length - 1] : null;
      }
      if (!sheet) return null;
      const sheetTop = sheet.getBoundingClientRect().top;
      if (sheetTop - TOAST_GAP - h >= toastReachTop(H, h)) return null;
      const top = toastSpot({ lowest: H - Math.max(insets.bottom, TOAST_GAP) - h, highest: Math.max(toastReachTop(H, h), sheetTop), height: h, left: r.left, right: r.right, controls: controlBoxes(sheet, host) });
      // Measured from the sheet's top edge, where this host sits in the layout.
      return top === null ? null : Math.round(sheetTop - (top + h));
    };
    let tries = 0;
    let looked = false;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = () => {
      void Promise.resolve(place()).then((at) => {
        if (stopped) return;
        if (at === 'wait' && tries++ < 12) {
          timer = setTimeout(run, 80);
          return;
        }
        setSpot({ key: placeKey, bottom: at === 'wait' ? null : at });
        // One more look once the screen has settled (a list that was still arriving, a screen fading in).
        if (!looked) {
          looked = true;
          timer = setTimeout(run, 450);
        }
      });
    };
    const frame = requestAnimationFrame(run);
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [placing, placeKey, toastH, resting, inSheet, scopeId, insets.bottom, insets.top]);
  const spotNow = spot && spot.key === placeKey ? spot : null;
  const hidden = placing && !spotNow;
  const bottom = !inSheet && spotNow?.bottom != null ? spotNow.bottom : resting;
  useEffect(() => {
    bottomNow.current = bottom;
  }, [bottom]);

  if (!message || !active) return null;
  return (
    <View
      ref={outer}
      pointerEvents="box-none"
      style={[
        inSheet
          ? spotNow?.bottom != null
            ? { position: 'absolute', left: 0, right: 0, bottom: spotNow.bottom, alignItems: 'center', paddingHorizontal: side }
            : { alignSelf: 'stretch', alignItems: 'center', paddingHorizontal: side, marginBottom: 12 }
          : { position: 'absolute', left: 0, right: 0, bottom, alignItems: 'center', paddingHorizontal: side },
        hidden ? { opacity: 0 } : null,
      ]}>
      {/* Only the action takes a touch: a tap on the toast's ink body goes through to what is under it (Today's
          "+ 250 ml" sits just above the resting toast at 360 x 740, and a second glass must still log). */}
      <Animated.View
        ref={toastRef}
        testID="toast"
        pointerEvents={closingId === id ? 'none' : 'box-none'}
        accessibilityLiveRegion="polite"
        onLayout={(e) => setToastH(Math.round(e.nativeEvent.layout.height))}
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
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
        }}>
        {/* The level line: what was logged, in its own colour. */}
        <View
          pointerEvents="none"
          style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 3, borderTopLeftRadius: radius.shoulder, borderTopRightRadius: radius.shoulder, backgroundColor: tint ? ((colors as unknown as Record<string, string>)[tint] ?? tint) : colors.primary }}
        />
        <View pointerEvents="none" style={{ flexShrink: 1 }}>
          <Text variant="label" color={colors.bg} accessibilityLabel={spokenUnits(withoutMarks(message))}>
            {drawn}
          </Text>
        </View>
        {actionLabel ? (
          <PressableScale
            testID="toast-action"
            accessibilityLabel={actionLabel}
            // Wider to touch, never taller: the action is already 44 px tall inside the toast's own box, so its touch
            // area ends where the toast does and the toast's 8 px of clear room (`toastSpot`) reaches the touch area
            // of the control it rests beside (Today's "+ 250 ml"), which an area 10 px taller used to cover.
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
  );
}

/**
 * The toast leaves: it fades and sinks 16 px (ease-in, `motion.duration.fade`), then is cleared, but only
 * while it is still the toast showing. A toast raised during the fade stops it and rises back from there;
 * the fade it interrupted ends then too, and must not clear it (a glass tapped in a toast's last 160 ms
 * used to log with no toast and no Undo). A fade stopped any other way (its host going away) still clears
 * its own toast. Instant under reduced motion.
 */
function closeToast(anim: Animated.Value, id: number, hide: () => void) {
  const done = () => {
    if (useToast.getState().id === id) hide();
  };
  if (isReducedMotion()) return done();
  Animated.timing(anim, { toValue: 0, duration: motion.duration.fade, easing: Easing.bezier(...motion.easing.exit), useNativeDriver: Platform.OS !== 'web' }).start(done);
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

/** How long a toast may wait for its place before it shows where it always rests. */
const PLACE_LATE_MS = 400;

/** A promise's answer, or `fallback` when it has not come within `ms` (a measurement a phone never answers). */
function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(fallback), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      () => {
        clearTimeout(t);
        resolve(fallback);
      },
    );
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
