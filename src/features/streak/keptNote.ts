/**
 * The one-time line on Today the first time a kept day shows on this device: "Kept: one quiet day does not break your
 * streak." It sits in the week strip's caption row (it moves nothing) with a hide X, and is said once: once it has
 * been in front for `KEPT_SEEN_MS` in all it is kept as said on this device, stays while Today is in front and never
 * comes back after that; the X puts it away at once. Covered sooner (the morning page rises over Today 900 ms after a
 * morning start), it is not said and shows again when Today is back in front. The run is the pure `keptRunStep`.
 *
 * - Kept on the device under its own key (`KEPT_NOTE_KEY`), never in the store (a per-device convenience, like the
 *   coach's moved notice and the save hint: never synced, never a settings write). Unreadable storage counts as
 *   said, so a broken storage never repeats it on every start; nothing shows until the answer is read.
 * - Only while a kept day is in the week shown on Today, on today, with Today in front; time counts only while the
 *   app is in front and no sheet is on screen.
 * - Never in an automated browser or a test build unless the page sets `window.__healthcalKeptDay = true` before
 *   the app loads (a state's `flags`), so no scripted run meets it unasked.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useIsFocused } from 'expo-router';
import { useEffect, useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';

import { sheetOnScreen } from '@/ui';

import { KEPT_HIDE, KEPT_LINE, KEPT_LINE_SHORT, keptLineDue, keptRunStep, type KeptRunEvent, type KeptRunState } from './kept';

declare global {
  interface Window {
    /** Tests: true lets Today's one-time kept-day line show in an automated browser or a test build. */
    __healthcalKeptDay?: boolean;
  }
}

export const KEPT_NOTE_KEY = 'healthcal.keptDaySaid';
/** How often the time in front is counted while the line is drawn (a fixed step: a test's fixed clock still counts). */
const TICK_MS = 250;

function automated(): boolean {
  const driven = Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.webdriver === true;
  // Written out in full: Expo inlines EXPO_PUBLIC_ values only where they appear literally.
  return driven || process.env.EXPO_PUBLIC_E2E === '1';
}

/** Whether the line may show here at all (the test-hook gate). Never throws. */
export function keptNoteAllowed(): boolean {
  try {
    if (!automated()) return true;
    return typeof window !== 'undefined' && window.__healthcalKeptDay === true;
  } catch {
    return false;
  }
}

/** What this device holds and where the line is in this run: one object, replaced on every change. */
let state: KeptRunState = { run: 'idle', shownMs: 0, said: null };
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

/** One step of the run; keeps the answer on the device the moment it turns to said. */
function step(e: KeptRunEvent) {
  const next = keptRunStep(state, e);
  if (next === state) return;
  const nowSaid = next.said === true && state.said !== true && e.type !== 'read';
  state = next;
  if (nowSaid) keepSaid();
  for (const l of listeners) l();
}

function load(): Promise<void> {
  if (!loading) {
    loading = (async () => {
      let stored = true;
      try {
        stored = (await AsyncStorage.getItem(KEPT_NOTE_KEY)) === '1';
      } catch {
        // Unreadable: treat as said.
      }
      step({ type: 'read', said: stored });
    })();
  }
  return loading;
}

function keepSaid(): void {
  try {
    AsyncStorage.setItem(KEPT_NOTE_KEY, '1').catch((e: unknown) => {
      if (typeof __DEV__ !== 'undefined' && __DEV__) console.warn('[kept day] could not keep the answer', e);
    });
  } catch {
    // Storage is not there (a private window): it may show again next time, which is harmless.
  }
}

/** The app in front and nothing over Today: only then does the time count. */
function inFront(): boolean {
  try {
    const active = AppState.currentState === 'active' || AppState.currentState == null;
    const visible = Platform.OS !== 'web' || typeof document === 'undefined' || document.visibilityState !== 'hidden';
    return active && visible && !sheetOnScreen();
  } catch {
    return false;
  }
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export interface KeptNote {
  text: string;
  short: string;
  testID: string;
  hide: { label: string; testID: string; onPress: () => void };
}

/**
 * Today's one-time kept-day line, or null. `keptInWeek`: a kept day is in the week Today's strip opens on;
 * `onToday`: Today shows today.
 */
export function useKeptNote(keptInWeek: boolean, onToday: boolean): KeptNote | null {
  const focused = useIsFocused();
  const s = useSyncExternalStore(subscribe, () => state, () => state);
  useEffect(() => {
    void load();
  }, []);
  const due = s.run === 'idle' && focused && keptLineDue({ allowed: keptNoteAllowed(), said: s.said, keptInWeek, onToday });
  useEffect(() => {
    if (due) step({ type: 'show' });
  }, [due]);
  const showing = s.run === 'showing';
  useEffect(() => {
    // Today left (another screen, a tab or the morning page in front): seen, it is done; not seen yet, it waits.
    if (showing && !focused) step({ type: 'left' });
  }, [focused, showing]);
  const drawn = showing && keptInWeek && onToday;
  // Time counts only while the line is drawn on Today in front, until it is said.
  const counting = drawn && focused && s.said !== true;
  useEffect(() => {
    if (!counting) return;
    const timer = setInterval(() => step({ type: 'tick', ms: TICK_MS, inFront: inFront() }), TICK_MS);
    return () => clearInterval(timer);
  }, [counting]);
  if (!drawn) return null;
  return {
    text: KEPT_LINE,
    short: KEPT_LINE_SHORT,
    testID: 'today-kept-line',
    hide: {
      label: KEPT_HIDE,
      testID: 'today-kept-hide',
      onPress: () => step({ type: 'hide' }),
    },
  };
}

/** For tests: forget what was read and shown. */
export function resetKeptNoteForTests(): void {
  state = { run: 'idle', shownMs: 0, said: null };
  loading = null;
}
