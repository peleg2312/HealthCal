/**
 * The rules of the day swipe on Today and the diary (the hook is `useDaySwipe`
 * in ./useDaySwipe): how far, which way, how far it may go, and where a touch
 * is the system's edge gesture. No React, unit-tested.
 */
import { addDays } from '@/lib/dates';
import type { ISODate } from '@/types';

/** Sideways travel a day swipe needs, in px; it must also be at least twice the vertical travel. */
export const SWIPE_MIN = 56;
/** A touch that starts this close to the screen's left or right edge is the system's back gesture. */
export const EDGE = 24;

/** -1 (the day before), 1 (the next day) or 0 (not a day swipe) for a finished touch. */
export function swipeStep(dx: number, dy: number): -1 | 0 | 1 {
  if (Math.abs(dx) < SWIPE_MIN || Math.abs(dx) < 2 * Math.abs(dy)) return 0;
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
