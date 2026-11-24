// One tap, one log. A one-tap logging control (a water glass, a quick tile) ignores a second
// press that arrives within ONE_TAP_GUARD_MS of the first, so a quick double tap logs once.
// The clock is read in the press handler, never while rendering.
import { useRef } from 'react';

export const ONE_TAP_GUARD_MS = 450;

/** True when a press at `now` comes too soon after the last accepted press at `last`. */
export function tooSoon(last: number, now: number, guardMs: number = ONE_TAP_GUARD_MS): boolean {
  return last > 0 && now - last < guardMs;
}

/**
 * Wraps press handlers so that, across every handler made by one hook instance, a press within
 * ONE_TAP_GUARD_MS of the last accepted one does nothing. Use one instance per group of one-tap
 * logging controls (for example Today's glass, the + sheet's glasses, Water's tiles).
 */
export function useOneTap(guardMs: number = ONE_TAP_GUARD_MS) {
  const last = useRef(0);
  return <A extends unknown[]>(fn: (...args: A) => void) =>
    (...args: A) => {
      const now = Date.now();
      if (tooSoon(last.current, now, guardMs)) return;
      last.current = now;
      fn(...args);
    };
}
