/**
 * Measured fits for the screens that keep their designed shape through the phone's common text steps (the app's 115%
 * and 130%, Android's 1.15 and 1.3; text grown, under `VERY_LARGE_TEXT`): food detail, food search's tiles, the meal
 * choice, Profile's figures and looks, and Weight's history. A part keeps its designed shape (cells side by side, a
 * figure beside its words) while its words, measured as drawn on the device (`MeasureWidth`, `SizeProbe` in
 * @/features/today/MeasureWidth), fit their room, and gives way only where they do not, never by a guessed width (as
 * Today, Water, Train and Progress do). Until a part is measured its designed shape is drawn: every rule answers null
 * until then, and a screen reads null as "fits". Pure, so the rules are tested (grownFit.test.ts).
 *
 * A width measured on the web is whole pixels, so every measured width here counts `MEASURE_SLACK` more, and a row
 * never wraps by itself after being laid out.
 */
import { MEASURE_SLACK } from '@/features/drinks/grownFit';

/**
 * Whether `count` equal cells, `gap` apart across `room`, each hold words `widest` wide (the widest of them, as drawn)
 * plus `extra` (the cell's own side padding and edges, both sides together). Null until measured.
 */
export function cellsFit(widest: number, count: number, room: number, gap = 0, extra = 0): boolean | null {
  if (!(widest > 0 && room > 0 && count > 0)) return null;
  const cell = (room - gap * (count - 1)) / count;
  return widest + MEASURE_SLACK + extra <= cell;
}

/** The most equal cells, `max` at most and 1 at least, a row `room` wide holds with words `widest` wide. Null until measured. */
export function mostCells(widest: number, room: number, max: number, gap = 0, extra = 0): number | null {
  if (!(widest > 0 && room > 0)) return null;
  for (let n = max; n > 1; n--) if (cellsFit(widest, n, room, gap, extra)) return n;
  return 1;
}

/**
 * Cells each as wide as its own words with its padding, in one row: `total` is their widths together as drawn. They
 * fit while that, with a whole pixel spare for each of the `count` cells, fits `room`. Null until measured.
 */
export function ownCellsFit(total: number, count: number, room: number): boolean | null {
  if (!(total > 0 && room > 0 && count > 0)) return null;
  return total + count * MEASURE_SLACK <= room;
}

/** Whether parts drawn side by side, `gap` apart, fit `room` (each measured width as drawn). Null until all are measured. */
export function besideFits(widths: readonly number[], room: number, gap = 0): boolean | null {
  if (!(room > 0) || widths.length === 0 || widths.some((w) => !(w > 0))) return null;
  const need = widths.reduce((sum, w) => sum + w + MEASURE_SLACK, 0) + gap * (widths.length - 1);
  return need <= room;
}

/** Null read as the designed shape: true unless measured and found not to fit. */
export function keepsDesign(verdict: boolean | null): boolean {
  return verdict !== false;
}

/**
 * `count` equal tiles in rows of at most `perRow`, as few rows as that takes and as even as they can be, the longer
 * rows first (7 tiles three a row: 3, 2, 2; four a row: 4, 3, as designed), so no tile is left alone on a row where
 * that can be helped. (A plain balance of equal widths keeps its first even cut, 1, 3, 3, leaving the first tile alone.)
 * Each row lists its tiles' indexes in order.
 */
export function tileRows(count: number, perRow: number): number[][] {
  if (!(count > 0)) return [];
  const per = Math.max(1, Math.floor(perRow) || 1);
  const rows = Math.ceil(count / per);
  const base = Math.floor(count / rows);
  const longer = count % rows;
  const out: number[][] = [];
  for (let r = 0, next = 0; r < rows; r++) {
    const n = base + (r < longer ? 1 : 0);
    out.push(Array.from({ length: n }, (_, j) => next + j));
    next += n;
  }
  return out;
}

/**
 * The width of a value column of food detail's nutrition facts with text grown: the designed width, or wider where its
 * widest words as drawn (its values and its head, "This portion") and `room` (the least room at their left, so a value
 * never meets the name before it) need more. The designed width until measured.
 */
export function factColumn(designed: number, widest: number, room: number): number {
  if (!(widest > 0)) return designed;
  return Math.max(designed, Math.ceil(widest + MEASURE_SLACK + room));
}
