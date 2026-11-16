/**
 * The rules of the diary's day swipe (the hook is `useDaySwipe` in ./useDaySwipe):
 * how far, how fast, which way, how far it may go, and where a touch is the
 * system's edge gesture. No React, unit-tested.
 *
 * The swipe is a deliberate flick, never a drag: a person scrolling a meal list or
 * reaching for a row moves sideways by accident (70 px is common), and a day that
 * changes under them shows an empty day where their lunch was. So it needs
 * SWIPE_MIN of sideways travel, three times the vertical, finished within
 * SWIPE_MAX_MS. Today has no page swipe at all: its day changes only from the strip.
 */
import { addDays, formatShortDate, fromISODate } from '@/lib/dates';
import type { ISODate } from '@/types';

/** Sideways travel a day swipe needs, in px. */
export const SWIPE_MIN = 96;
/** The sideways travel must be at least this many times the vertical travel. */
export const SWIPE_RATIO = 3;
/** A day swipe is a flick: the finger is down at most this long, in ms. */
export const SWIPE_MAX_MS = 500;
/** A touch that starts this close to the screen's left or right edge is the system's back gesture. */
export const EDGE = 24;

/**
 * -1 (the day before), 1 (the next day) or 0 (not a day swipe) for a finished touch:
 * `dx`/`dy` the travel in px, `ms` how long the finger was down.
 */
export function swipeStep(dx: number, dy: number, ms: number): -1 | 0 | 1 {
  if (!(ms >= 0) || ms > SWIPE_MAX_MS) return 0;
  if (Math.abs(dx) < SWIPE_MIN || Math.abs(dx) < SWIPE_RATIO * Math.abs(dy)) return 0;
  return dx < 0 ? 1 : -1;
}

/** The day a step lands on, or null when it would pass the screen's first or last day. */
export function stepDay(date: string, step: -1 | 1, limits: { earliest?: ISODate; latest: ISODate }): ISODate | null {
  const next = addDays(date, step);
  if (next > limits.latest) return null;
  if (limits.earliest && next < limits.earliest) return null;
  return next;
}

/** Whether a touch starting at x on a window this wide is the system's edge gesture. */
export function atScreenEdge(x: number, windowWidth: number): boolean {
  return x < EDGE || x > windowWidth - EDGE;
}

const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * What the toast after a day swipe says: the day it landed on, in full, so the change
 * is never silent ("Saturday, Nov 14"; "Yesterday, Nov 15"; "Today, Nov 16").
 */
export function swipeDayLabel(date: ISODate, today: ISODate): string {
  const short = formatShortDate(date);
  if (date === today) return `Today, ${short}`;
  if (date === addDays(today, -1)) return `Yesterday, ${short}`;
  return `${WEEKDAYS_LONG[fromISODate(date).getDay()]}, ${short}`;
}
