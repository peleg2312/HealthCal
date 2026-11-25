/**
 * When the "over 7 days" hint shows (the owner's ruling, loop 3): only while the profile's current rule is
 * 'day', until it is dealt with on this device (a tap on it, its X, or a Goals save with the choice on
 * screen), and on at most `SPREAD_HINT_MAX` visits of a screen in all on this device, then never again, so it
 * never keeps returning over logging. A visit that showed it keeps it until the screen is left.
 */
export const SPREAD_HINT_MAX = 3;

export interface SpreadHintState {
  /** Dealt with on this device; null while the stored answer is being read. */
  done: boolean | null;
  /** How many visits have shown it on this device; null while being read. */
  shown: number | null;
  /** The profile's current rule is 'day'. */
  sameDay: boolean;
  /** This visit already showed it (and counted it). */
  countedHere: boolean;
}

/** Whether the hint is drawn now. Nothing is drawn before both stored values are known, so it never flashes. */
export function spreadHintVisible(s: SpreadHintState): boolean {
  if (s.done !== false || s.shown === null || !s.sameDay) return false;
  return s.countedHere || s.shown < SPREAD_HINT_MAX;
}

/** Whether this visit should count a showing now: visible and not yet counted here. */
export function spreadHintCounts(s: SpreadHintState): boolean {
  return !s.countedHere && spreadHintVisible(s);
}

/** A stored count read back: a whole number from 0, anything else as 0 (unreadable storage shows the hint). */
export function parseShownCount(raw: string | null): number {
  const n = raw === null ? 0 : Number(raw);
  return Number.isInteger(n) && n > 0 ? n : 0;
}
