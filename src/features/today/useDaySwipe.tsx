/**
 * The diary's day swipe: a quick sideways flick on the page moves one day, finger
 * right to the day before, finger left to the next day but never past today
 * (planning ahead is a tap in the strip). The rules are pure, in ./daySwipe.
 * Today has no page swipe: its day changes only from the week strip.
 *
 * A day never changes without the person meaning it, and never silently:
 * - it needs a flick: SWIPE_MIN (96) px of sideways travel, at least three times the
 *   vertical, with the finger down at most SWIPE_MAX_MS (500 ms). A slow sideways drag
 *   while scrolling or reaching for a row does nothing;
 * - every move shows a toast naming the day it landed on, with "Today" to go back
 *   (the toast is also what a screen reader hears);
 * - a touch that starts within EDGE (24) px of the screen's left or right edge is the
 *   system's back gesture, not ours;
 * - a touch that starts inside a sideways scroller (the week strip, a chip row), on a
 *   chart (on web, an SVG 120 px wide or more), or inside a `DaySwipeGuard` is left alone;
 * - vertical scrolling is untouched: on web the hook only listens (touch events, no
 *   responder, no preventDefault); natively it takes the touch only once it is clearly
 *   sideways (SWIPE_CLAIM, 24 px, and three times the vertical: a tap that wanders a
 *   little stays the row's tap), which also keeps the page's ScrollView from taking it
 *   over half way on Android;
 * - while a sheet is open nothing moves: the sheet covers the page, but its touches still
 *   bubble through the React tree to this View's handlers.
 * One finger only. A move gives a select haptic.
 */
import React from 'react';
import { Dimensions, Platform, View, type GestureResponderEvent, type ViewProps } from 'react-native';

import { today } from '@/lib/dates';
import type { ISODate } from '@/types';
import { haptic, sheetOnScreen, toast } from '@/ui';

import { atScreenEdge, claimsTouch, stepDay, swipeDayLabel, swipeStep } from './daySwipe';

/** On web, an SVG at least this wide is a chart: a finger on it scrubs the chart, not the day. */
const CHART_MIN_W = 120;

// A guard's own touch handler runs before the page's (touch events bubble from the inside out)
// and marks that touch's event, so the page's handler, which gets the same event next, leaves it alone.
let guardedEvent: unknown = null;

/** Wrap anything that pages or scrubs sideways (the week strip, a chart) so a swipe on it is not a day swipe. */
export function DaySwipeGuard({ children, ...rest }: ViewProps & { children: React.ReactNode }) {
  return (
    <View
      {...rest}
      onTouchStart={(e) => {
        guardedEvent = e.nativeEvent;
        rest.onTouchStart?.(e);
      }}>
      {children}
    </View>
  );
}

/** Web only: the touch started in a sideways scroller or on a chart. */
function inSidewaysThing(target: unknown): boolean {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return false;
  let el = target as HTMLElement | null;
  while (el && el !== document.body) {
    if (el instanceof HTMLElement) {
      const cs = getComputedStyle(el);
      if ((cs.overflowX === 'auto' || cs.overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 1) return true;
    }
    if (el.tagName?.toLowerCase() === 'svg' && el.getBoundingClientRect().width >= CHART_MIN_W) return true;
    el = el.parentElement;
  }
  return false;
}

interface Track {
  x0: number;
  y0: number;
  x: number;
  y: number;
  /** When the finger went down (Date.now()). */
  t0: number;
  /** Left alone: an edge, a guard, a sideways scroller, a second finger. */
  skip: boolean;
  done: boolean;
}

function point(e: GestureResponderEvent): { x: number; y: number } | null {
  const n = e.nativeEvent as unknown as { pageX?: number; pageY?: number; changedTouches?: ArrayLike<{ pageX: number; pageY: number }>; touches?: ArrayLike<unknown> };
  const t = n.changedTouches && n.changedTouches.length ? n.changedTouches[0] : null;
  const x = t ? t.pageX : n.pageX;
  const y = t ? t.pageY : n.pageY;
  return typeof x === 'number' && typeof y === 'number' ? { x, y } : null;
}

function fingers(e: GestureResponderEvent): number {
  const n = e.nativeEvent as unknown as { touches?: ArrayLike<unknown> };
  return n.touches ? n.touches.length : 1;
}

/**
 * Props for the View that holds the diary's content: a quick sideways flick on it
 * moves one day. `date` is the day shown, `onChange` shows another; `latest` and
 * `earliest` are the furthest a swipe may go.
 */
export function useDaySwipe({
  date,
  onChange,
  latest,
  earliest,
}: {
  date: ISODate;
  onChange: (d: ISODate) => void;
  latest: ISODate;
  earliest?: ISODate;
}): ViewProps {
  // Plain object per render is fine: the handlers read the latest props when they run.
  const state = trackRef;
  const finish = (e: GestureResponderEvent) => {
    const t = state.current;
    if (!t || t.skip || t.done) return;
    t.done = true;
    const p = point(e) ?? { x: t.x, y: t.y };
    const step = swipeStep(p.x - t.x0, p.y - t.y0, Date.now() - t.t0);
    if (!step) return;
    const next = stepDay(date, step, { latest, earliest });
    if (!next) return;
    haptic.select();
    onChange(next);
    // Never silent: the day it landed on, and the way back.
    const now = today();
    toast(swipeDayLabel(next, now), next === now ? undefined : { label: 'Today', onPress: () => onChange(today()) });
  };
  const props: ViewProps = {
    onTouchStart: (e) => {
      const wasGuarded = guardedEvent === e.nativeEvent;
      guardedEvent = null;
      const p = point(e);
      if (!p) return;
      // A sheet's touches bubble here through the React tree although the sheet covers the page.
      const skip = wasGuarded || sheetOnScreen() || fingers(e) > 1 || atScreenEdge(p.x, Dimensions.get('window').width) || inSidewaysThing((e as unknown as { target?: unknown }).target);
      state.current = { x0: p.x, y0: p.y, x: p.x, y: p.y, t0: Date.now(), skip, done: false };
    },
    onTouchMove: (e) => {
      const t = state.current;
      if (!t) return;
      if (fingers(e) > 1) t.skip = true;
      const p = point(e);
      if (p) {
        t.x = p.x;
        t.y = p.y;
      }
    },
    onTouchCancel: () => {
      if (state.current) state.current.skip = true;
    },
  };
  // On web the end of the touch decides. Natively only a touch this View won as the responder does,
  // so a touch that something inside kept (a chart's scrub, a slider) never also moves the day.
  if (Platform.OS === 'web') Object.assign(props, { onTouchEnd: finish } satisfies ViewProps);
  else {
    Object.assign(props, {
      onMoveShouldSetResponder: (e: GestureResponderEvent) => {
        const t = state.current;
        const p = point(e);
        if (!t || t.skip || !p) return false;
        return claimsTouch(p.x - t.x0, p.y - t.y0);
      },
      // Returning true keeps the page's ScrollView from taking the touch over (Android).
      onResponderGrant: () => true,
      onResponderTerminationRequest: () => false,
      onResponderRelease: finish,
      onResponderTerminate: () => {
        if (state.current) state.current.skip = true;
      },
    } satisfies ViewProps);
  }
  return props;
}

// One touch at a time in the whole app, so the tracking can live outside React (no re-render per move).
const trackRef: { current: Track | null } = { current: null };
