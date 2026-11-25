/**
 * Train's measured fit for its two actions, "Log activity" and "Workout" (or "Resume"), through the phone's common
 * text steps (the app's 115% and 130%, Android's 1.15 and 1.3, a reader's own text spacing; under `VERY_LARGE_TEXT`).
 * As designed (360 px and wider) they share the row in two equal halves. With text grown they keep the halves while
 * each, as drawn on the device, fits its half; where one does not, each is as wide as its own words ('own'), and
 * where the two do not fit side by side even so, each keeps the tighter side room it has under 360 px ('tight', 14
 * px a side for 20). They stack only where even that does not fit (the layout engine wraps them by the widths they
 * are drawn at). Never by a guessed width. Pure, so the rule is tested (trainFit.test.ts).
 */
import { MEASURE_SLACK } from '@/features/drinks/grownFit';
import { fitsRoom } from '@/features/today/fit';
import { addDays, formatShortDate, fromISODate } from '@/lib/dates';
import type { ISODate } from '@/types';

/** A large kit Button's side padding as designed, and the tighter one Train gives it under 360 px. */
export const ACTION_PAD = 20;
export const ACTION_PAD_TIGHT = 14;

/**
 * A large kit Button's room around its label: its side padding (`pad` each side), its 1.5 px edge each side, its
 * icon (`BUTTON_ICON.lg`, 20 px) and the 8 px between icon and label (src/ui/Button.tsx).
 */
export function actionChrome(icon: number, pad = ACTION_PAD): number {
  return 2 * pad + 2 * 1.5 + icon + 8;
}

/**
 * How the two actions share their row with text grown, from both labels as drawn (`labelWs`, measured), the
 * buttons' icon size, the row's width and the gap between them: 'halves' while each fits half the row; 'own' while
 * both, each as wide as its words, fit the row side by side; else 'tight'. 'halves' until everything is measured.
 */
export function actionsLayout(labelWs: readonly number[], icon: number, rowW: number, gap: number): 'halves' | 'own' | 'tight' {
  if (!labelWs.length || labelWs.some((w) => !(w > 0)) || !(rowW > 0)) return 'halves';
  const need = (pad: number) => labelWs.map((w) => Math.ceil(w + MEASURE_SLACK + actionChrome(icon, pad)));
  if (fitsRoom(Math.max(...need(ACTION_PAD)), (rowW - gap) / 2)) return 'halves';
  const sum = need(ACTION_PAD).reduce((a, w) => a + w, 0) + gap * (labelWs.length - 1);
  return fitsRoom(sum, rowW) ? 'own' : 'tight';
}

/** The least room between two day numbers side by side in the week card's strip (text a few px apart reads as one). */
export const STRIP_NUMBER_ROOM = 8;
/** A day number's box in the strip: at least 32 px, its 2 px side padding and today's 1.5 px outline each side. */
export const STRIP_BOX_MIN = 32;
export const STRIP_BOX_CHROME = 2 * 2 + 2 * 1.5;

/**
 * How much of the last column a scrolling strip shows at its edge, as a share of a column: enough that its day
 * letter and its cup are seen cut (so the strip plainly goes on), never so little that the column looks absent.
 */
export const STRIP_PEEK_MIN = 0.35;
export const STRIP_PEEK_MAX = 0.65;

/**
 * The week card's strip with text grown: the width of a day's column. At least the width at which the widest day
 * number as drawn (`numberW`, measured) keeps `STRIP_NUMBER_ROOM` from the next and its box (today's outline) fits
 * the column. 0 while seven such columns fit the row (they share it, as designed); else the strip scrolls sideways,
 * and its columns are widened, where needed, until the last one in view shows between `STRIP_PEEK_MIN` and
 * `STRIP_PEEK_MAX` of itself (about half), so no column is hidden whole behind the card's edge with nothing of it
 * seen (320 px at 130%: 40 px columns left 4 px of Sunday in a 244 px row; 44 px columns show Saturday cut in
 * half). Never narrower than the least width: the numbers keep their room. 0 until measured.
 */
export function stripColumnMin(numberW: number, rowW: number, days = 7): number {
  if (!(numberW > 0 && rowW > 0)) return 0;
  const drawn = numberW + MEASURE_SLACK;
  const column = Math.ceil(Math.max(STRIP_BOX_MIN, drawn + STRIP_BOX_CHROME, drawn + STRIP_NUMBER_ROOM));
  if (fitsRoom(column * days, rowW)) return 0;
  const inView = rowW / column;
  const whole = Math.floor(inView);
  const peek = inView - whole;
  if (peek >= STRIP_PEEK_MIN && peek <= STRIP_PEEK_MAX) return column;
  // Too little of the last column shows: one whole column fewer and half of the next; too much: half of the next.
  const target = Math.max(1, peek < STRIP_PEEK_MIN ? whole - 1 : whole) + 0.5;
  return Math.max(column, Math.round(rowW / target));
}

/**
 * Where a scrolling strip opens (its scroll offset, px), so today's column is whole in view: at the start while it
 * is whole there, else at the end (the last columns whole, the first in view cut), else, on a row too narrow for
 * either, centred. 0 when today is not in the strip (a past week) or the strip does not scroll.
 */
export function stripScrollTo(todayIndex: number, column: number, rowW: number, days = 7): number {
  if (todayIndex < 0 || !(column > 0 && rowW > 0)) return 0;
  const end = Math.max(0, column * days - rowW);
  if (end === 0) return 0;
  const left = todayIndex * column;
  const right = left + column;
  if (right <= rowW) return 0;
  if (left >= end) return end;
  return Math.min(end, Math.max(0, Math.round(left + column / 2 - rowW / 2)));
}

/**
 * Train's header overline in short, for text grown where "Week of Nov 23", measured as drawn, does not fit its line
 * beside the header's cups (`overlineTight` on `TabHeader`): the week's dates, "Nov 23–29", or "Nov 30–Dec 6" across
 * a month.
 */
export function weekRangeShort(start: ISODate): string {
  const end = addDays(start, 6);
  const sameMonth = fromISODate(end).getMonth() === fromISODate(start).getMonth();
  return `${formatShortDate(start)}–${sameMonth ? fromISODate(end).getDate() : formatShortDate(end)}`;
}
