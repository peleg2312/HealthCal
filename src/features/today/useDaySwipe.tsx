/**
 * A sideways swipe on Today or the diary moves one day: finger left shows the
 * next day (never past `latest`), finger right the day before (never before
 * `earliest`). The rules are pure, in ./daySwipe.
 *
 * So that it never fights anything else on the page:
 * - it needs SWIPE_MIN (56) px of sideways travel, at least twice the vertical travel;
 * - a touch that starts within EDGE (24) px of the screen's left or right edge is the
 *   system's back gesture, not ours;
 * - a touch that starts inside a sideways scroller (the week strip, a chip row), on a
 *   chart (on web, an SVG 120 px wide or more), or inside a `DaySwipeGuard` is left alone;
 * - vertical scrolling is untouched: on web the hook only listens (touch events, no
 *   responder, no preventDefault); natively it takes the touch only once it is clearly
 *   sideways (10 px, twice the vertical), which also keeps the page's ScrollView from
 *   taking it over half way on Android.
 * One finger only. A move gives a select haptic and is announced to a screen reader.
 */
import React from 'react';
import { AccessibilityInfo, Dimensions, Platform, View, type GestureResponderEvent, type ViewProps } from 'react-native';

import { formatDayLabel } from '@/lib/dates';
import type { ISODate } from '@/types';
import { haptic } from '@/ui';

import { atScreenEdge, stepDay, swipeStep } from './daySwipe';

/** Natively, the sideways travel at which the page takes the touch from the scroll view. */
const CLAIM = 10;
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

/** Web: one polite live region for the whole app, so the new day is read out. */
function announce(text: string) {
  if (Platform.OS !== 'web') {
    AccessibilityInfo.announceForAccessibility(text);
    return;
  }
  if (typeof document === 'undefined') return;
  let el = document.getElementById('day-swipe-live');
  if (!el) {
    el = document.createElement('div');
    el.id = 'day-swipe-live';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;';
    document.body.appendChild(el);
  }
  el.textContent = text;
}

interface Track {
  x0: number;
  y0: number;
  x: number;
  y: number;
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
 * Props for the View that holds a screen's content: a sideways swipe on it
 * moves one day. `date` is the day shown, `onChange` shows another.
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
    const step = swipeStep(p.x - t.x0, p.y - t.y0);
    if (!step) return;
    const next = stepDay(date, step, { latest, earliest });
    if (!next) return;
    haptic.select();
    onChange(next);
    announce(formatDayLabel(next));
  };
  const props: ViewProps = {
    onTouchStart: (e) => {
      const wasGuarded = guardedEvent === e.nativeEvent;
      guardedEvent = null;
      const p = point(e);
      if (!p) return;
      const skip = wasGuarded || fingers(e) > 1 || atScreenEdge(p.x, Dimensions.get('window').width) || inSidewaysThing((e as unknown as { target?: unknown }).target);
      state.current = { x0: p.x, y0: p.y, x: p.x, y: p.y, skip, done: false };
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
    onTouchEnd: finish,
    onTouchCancel: () => {
      if (state.current) state.current.skip = true;
    },
  };
  if (Platform.OS !== 'web') {
    Object.assign(props, {
      onMoveShouldSetResponder: (e: GestureResponderEvent) => {
        const t = state.current;
        const p = point(e);
        if (!t || t.skip || !p) return false;
        const dx = Math.abs(p.x - t.x0);
        return dx > CLAIM && dx > 2 * Math.abs(p.y - t.y0);
      },
      // Returning true keeps the page's ScrollView from taking the touch over (Android).
      onResponderGrant: () => true,
      onResponderTerminationRequest: () => false,
      onResponderRelease: finish,
    } satisfies ViewProps);
  }
  return props;
}

// One touch at a time in the whole app, so the tracking can live outside React (no re-render per move).
const trackRef: { current: Track | null } = { current: null };
