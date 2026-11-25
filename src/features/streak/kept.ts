/**
 * Kept days: the quiet days the logging streak bridged. The streak (`computeConsistency` in the store) forgives one
 * day with no food logged between logged days, so such a day is part of the run, not a break; the week strip and the
 * Consistency calendar draw it as its cup with a small dashed "kept" line (`KeptMark`), never as an empty cup that
 * reads as a break. This is the one rule for which days are kept: the strip and the calendar only draw it. Pure,
 * unit-tested against `computeConsistency`.
 */
import { addDays } from '@/lib/dates';
import type { ISODate } from '@/types';

/**
 * Whether `date` is a kept day: before today, nothing logged on it, the day before it logged, and either the day
 * after it logged, or the day after it is today with nothing logged yet (today is still open, so yesterday is kept
 * while the streak still counts it) in a run of at least two logged days (the count the streak mark shows, never a
 * run of one). Two quiet days in a row are never kept: they end the streak.
 */
export function isKeptDay(date: ISODate, logged: ReadonlySet<ISODate>, today: ISODate): boolean {
  if (date >= today || logged.has(date)) return false;
  if (!logged.has(addDays(date, -1))) return false;
  const next = addDays(date, 1);
  if (logged.has(next)) return true;
  // The day after is today, not logged yet: kept while the run before it holds two logged days or more (the day
  // before that logged, or bridged to one logged before it).
  return next === today && (logged.has(addDays(date, -2)) || logged.has(addDays(date, -3)));
}

/** Every kept day on the phone, from the days with food logged (`foodLoggedDates`): only the day after a logged day can be one. */
export function keptDays(logged: ReadonlySet<ISODate>, today: ISODate): Set<ISODate> {
  const kept = new Set<ISODate>();
  for (const d of logged) {
    const next = addDays(d, 1);
    if (isKeptDay(next, logged, today)) kept.add(next);
  }
  return kept;
}

/** The one-time line on Today, the first time a kept day shows on this device. */
export const KEPT_LINE = 'Kept: one quiet day does not break your streak.';
/** The same under 360 px, or where the whole line does not fit its two lines beside the streak (measured as drawn). */
export const KEPT_LINE_SHORT = 'Kept: one quiet day is no break.';
/** The line's hide X, said in full. */
export const KEPT_HIDE = 'Hide the note about kept days';
/** Said at the end of a kept day's name, in the strip and in the calendar. */
export const KEPT_SPOKEN = 'kept: one quiet day does not break your streak';
/** The Consistency legend's key. */
export const KEPT_LEGEND = 'Kept: a quiet day in a streak';

/** The kept line: dashes 3 px long, 2 px apart and 2 px thick (the mini cups' level line is 2.5), in `dashEdge`. */
export const KEPT_DASH = 3;
export const KEPT_GAP = 2;
export const KEPT_THICK = 2;

/**
 * The dashed kept line across a cup's inner width `width` (px, wall to wall): as many whole dashes as fit with their
 * gaps, never fewer than two (the dashes shorten for a cup too narrow for two), and `offset` to centre them, so it
 * reads as a broken level line at every size: three dashes across the slim strip's 16 x 20 cup (13 px inside).
 */
export function keptDashes(width: number, dash = KEPT_DASH, gap = KEPT_GAP): { count: number; dash: number; gap: number; offset: number } {
  const w = Math.max(0, width);
  let count = Math.floor((w + gap) / (dash + gap));
  let d = dash;
  if (count < 2) {
    count = 2;
    d = Math.max(1, (w - gap) / 2);
  }
  const total = count * d + (count - 1) * gap;
  return { count, dash: d, gap, offset: Math.max(0, (w - total) / 2) };
}

/** The one-time line's rule: allowed here, the device's answer read and not yet said, a kept day in the week shown. */
export function keptLineDue(input: { allowed: boolean; said: boolean | null; keptInWeek: boolean; onToday: boolean }): boolean {
  return input.allowed && input.said === false && input.keptInWeek && input.onToday;
}

/**
 * How long the one-time line must have been in front, in all (Today focused, the app in front, no sheet over it),
 * before it counts as seen and is kept as said. Today can be covered as it opens (the morning page rises over it
 * 900 ms after a morning start, later when a sync is waited for): a line covered before this is not said, and shows
 * again when Today is back in front.
 */
export const KEPT_SEEN_MS = 3000;

/**
 * Where the one-time line is in this run: 'idle' (not drawn: not due yet, or Today left before it was seen),
 * 'showing' (drawn while Today is in front; it stays until Today is left, also once it counts as seen) or 'done'
 * (put away by its X, or Today left once it was seen). `shownMs` is how long it has been in front in all; `said`
 * is the device's answer (null until read).
 */
export interface KeptRunState {
  run: 'idle' | 'showing' | 'done';
  shownMs: number;
  said: boolean | null;
}

export type KeptRunEvent =
  /** The device's answer was read. */
  | { type: 'read'; said: boolean }
  /** The line became due and is drawn. */
  | { type: 'show' }
  /** `ms` passed while it was drawn; `inFront`: the app in front and no sheet over Today. */
  | { type: 'tick'; ms: number; inFront: boolean }
  /** Today lost the focus (another screen, a tab or the morning page in front). */
  | { type: 'left' }
  /** Its X. */
  | { type: 'hide' };

/**
 * The one-time line's run, one step at a time (pure; the hook in ./keptNote keeps the state, writes the device key
 * when `said` turns true, and draws the line while `run` is 'showing'). Seen once is dealt with, but only once it
 * was seen: covered before `KEPT_SEEN_MS` in front it goes back to 'idle' and shows again on the next arrival.
 */
export function keptRunStep(s: KeptRunState, e: KeptRunEvent): KeptRunState {
  switch (e.type) {
    case 'read':
      return s.said === null ? { ...s, said: e.said } : s;
    case 'show':
      return s.run === 'idle' ? { ...s, run: 'showing' } : s;
    case 'tick': {
      if (s.run !== 'showing' || !e.inFront || !(e.ms > 0)) return s;
      const shownMs = s.shownMs + e.ms;
      return { ...s, shownMs, said: shownMs >= KEPT_SEEN_MS ? true : s.said };
    }
    case 'left':
      if (s.run !== 'showing') return s;
      return { ...s, run: s.said === true ? 'done' : 'idle' };
    case 'hide':
      return { ...s, run: 'done', said: true };
  }
}
