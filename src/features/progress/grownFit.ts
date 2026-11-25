/**
 * Progress through the phone's common text steps (the app's 115% and 130%, Android's 1.15 and 1.3, a reader's own text
 * spacing; under `VERY_LARGE_TEXT`): the overview's tiles stay two a row, a reached milestone stays two a row and an
 * "Up next" row keeps its share beside its title while their words, measured as drawn on the device, fit; each gives
 * way only where they do not, never by a guessed width (as Today and Water do: @/features/today/fit,
 * @/features/drinks/grownFit). Until a part is measured its designed shape is drawn. Pure, so the rules are tested
 * (grownFit.test.ts); the cards only measure (`./Probe`) and place.
 */
import { MEASURE_SLACK } from '@/features/drinks/grownFit';

/** A line drawn unseen at its natural width fits its room (whole pixels on the web: one more). Null until measured. */
export function lineFits(width: number, room: number): boolean | null {
  if (!(width > 0 && room > 0)) return null;
  return width + MEASURE_SLACK <= room;
}

/**
 * Words laid out unseen in a box `room` wide, as they would wrap there (`WrapProbe`): they fit when no word is wider
 * than the room (the box then reports the room or less) and they take at most `maxLines` lines of `lineHeight`.
 * Null until measured.
 */
export function wrapFits(m: { width: number; height: number; lineHeight: number; room: number; maxLines: number }): boolean | null {
  if (!(m.width > 0 && m.height > 0 && m.lineHeight > 0 && m.room > 0)) return null;
  return m.width <= m.room && Math.round(m.height / m.lineHeight) <= m.maxLines;
}

/** All of a part's verdicts: false as soon as one does not fit, null while one is still to be measured, else true. */
export function allFit(verdicts: readonly (boolean | null | undefined)[]): boolean | null {
  if (verdicts.some((v) => v === false)) return false;
  if (verdicts.some((v) => v === null || v === undefined)) return null;
  return true;
}

/**
 * The designed shape (two a row, a share beside its title) unless one part's words, measured, do not fit it: then
 * every part gives way together (one a row, the share under its title), so the parts of a card keep one layout. The
 * designed shape while parts are still being measured.
 */
export function keepsShape(verdicts: readonly (boolean | null | undefined)[]): boolean {
  return !verdicts.some((v) => v === false);
}

/**
 * The room for the words of an overview tile two a row: half the card's width inside its edge, less the hairline
 * between the two tiles and the tile's 16 px padding each side. 0 until the card is measured.
 */
export function tileRoom(cardInner: number, pad: number): number {
  if (!(cardInner > 0)) return 0;
  return Math.max(0, Math.floor(cardInner / 2 - 1 - 2 * pad));
}

/**
 * The room for a reached milestone's title two a row: half the row, less the 12 px on the hairline's side and the
 * hairline, the cup and the 12 px between the cup and the words. 0 until the row is measured.
 */
export function milestoneRoom(rowWidth: number, cup: number, gap: number): number {
  if (!(rowWidth > 0)) return 0;
  return Math.max(0, Math.floor(rowWidth / 2 - gap - 1 - cup - gap));
}

/**
 * The room for an "Up next" title with its share beside it: the row, less the cup, the share as drawn and the 12 px
 * between each. 0 until both are measured.
 */
export function besideRoom(rowWidth: number, cup: number, shareWidth: number, gap: number): number {
  if (!(rowWidth > 0 && shareWidth > 0)) return 0;
  return Math.max(0, Math.floor(rowWidth - cup - gap - (shareWidth + MEASURE_SLACK) - gap));
}
