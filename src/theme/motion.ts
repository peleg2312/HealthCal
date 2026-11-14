/**
 * Motion for Pour: three verbs and nothing else.
 *
 * - Pour: a level rises (or falls) to its new value. Ease-out, never linear, never bouncy.
 * - Settle: the level line overshoots by a pixel or two and rests (a liquid surface).
 * - Tick: a number counts to its new value in step with the pour.
 *
 * Everything else is quiet support (a screen's content fading up 8 px, rows
 * sliding in and collapsing, a sheet's backdrop fading as it slides).
 *
 * One hook decides reduced motion for the whole app: `useReducedMotion()`.
 * It is true when the system asks for less motion (iOS/Android setting, or
 * the prefers-reduced-motion media query on web), and also when the web page
 * is driven by automation (navigator.webdriver, as under Playwright), so tests
 * and screenshots are deterministic. A test opts in to motion by setting
 * `window.__healthcalMotion = true` before the app loads; `false` forces
 * reduced motion anywhere (handy in a browser console).
 *
 * This file holds no Reanimated import so it stays safe for plain unit tests.
 * The animated pieces that use these tokens live in `src/ui/motion.tsx`.
 */
import { useSyncExternalStore } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

/** Durations in ms. */
export const duration = {
  /** A big vessel's pour (the hero cup on Today, the plan reveal). */
  pour: 620,
  /** Small cups, progress bars, troughs and chart columns. */
  pourSmall: 360,
  /** The rim's overshoot and rest after a pour, added at the end of the pour. */
  settle: 260,
  /** Delay between neighbours in a row of cups or chart columns. */
  stagger: 40,
  /** A screen's content fading up. */
  enter: 180,
  /** Rows sliding in, list reflow. */
  row: 220,
  /** Rows leaving. */
  rowExit: 160,
  /** A sheet sliding up (the backdrop fades over the same time). */
  sheetIn: 280,
  sheetOut: 200,
  /** Small state changes: a lip or hatch fading in, a toast. */
  fade: 160,
  /** A line chart drawing left to right. */
  draw: 700,
  /** The active-tab mark sliding between tabs. */
  slide: 220,
} as const;

/**
 * Easing curves as cubic-bezier control points, so they can be used by
 * Reanimated (`Easing.bezier(...)`) and by CSS alike. None of them overshoots:
 * the only overshoot in Pour is the settle, which is a few pixels, not a curve.
 */
export const easing = {
  /** The pour: fast start, long gentle arrival (close to ease-out cubic). */
  pour: [0.22, 0.61, 0.36, 1] as const,
  /** Content entering: ease-out. */
  enter: [0.2, 0, 0, 1] as const,
  /** Content leaving: ease-in. */
  exit: [0.4, 0, 1, 1] as const,
  /** Movement between two resting places (tab mark, reorder). */
  move: [0.3, 0, 0, 1] as const,
};

/** Distances in px. */
export const distance = {
  /** A screen's content rises this far as it fades in. */
  enter: 8,
  /** The rim's overshoot past the new level before it rests. */
  settle: 1.5,
  /** A new row slides this far as it fades in. */
  row: 6,
  /** The + cup dips this far while pressed. */
  dip: 2,
};

export const motion = { duration, easing, distance };

// ------------------------------------------------------------ reduced motion

declare global {
  interface Window {
    /** Tests: true opts in to motion under automation, false forces reduced motion. */
    __healthcalMotion?: boolean;
  }
}

let systemReduced = false;
let started = false;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function optIn(): boolean | undefined {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
  const v = window.__healthcalMotion;
  return typeof v === 'boolean' ? v : undefined;
}

function automated(): boolean {
  return Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.webdriver === true;
}

function start() {
  if (started) return;
  started = true;
  if (Platform.OS === 'web') {
    const mq = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    if (!mq) return;
    systemReduced = mq.matches;
    mq.addEventListener?.('change', (e) => {
      systemReduced = e.matches;
      emit();
    });
    return;
  }
  AccessibilityInfo?.isReduceMotionEnabled?.()
    .then((v) => {
      if (v !== systemReduced) {
        systemReduced = v;
        emit();
      }
    })
    .catch(() => {});
  AccessibilityInfo?.addEventListener?.('reduceMotionChanged', (v: boolean) => {
    systemReduced = v;
    emit();
  });
}

/**
 * Whether motion should be instant right now. Safe outside React (event
 * handlers, effects, navigator options). Prefer the hook in components so they
 * re-render when the setting changes.
 */
export function isReducedMotion(): boolean {
  start();
  const o = optIn();
  if (o === false) return true;
  if (o !== true && automated()) return true;
  return systemReduced;
}

// Lets a browser test confirm which mode the app is in: window.__healthcalMotionOn() is true when animation runs.
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  (window as unknown as { __healthcalMotionOn?: () => boolean }).__healthcalMotionOn = () => !isReducedMotion();
}

function subscribe(l: () => void) {
  start();
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/**
 * True when every animation should be an instant change: the system's reduce
 * motion setting, prefers-reduced-motion on web, or a browser driven by
 * automation that has not opted in with `window.__healthcalMotion = true`.
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, isReducedMotion, isReducedMotion);
}
