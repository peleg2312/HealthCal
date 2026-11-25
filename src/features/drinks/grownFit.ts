/**
 * The Water screen's measured fits through the phone's common text steps (the app's 115% and 130%, Android's 1.15
 * and 1.3, a reader's own text spacing; under `VERY_LARGE_TEXT`): each part keeps its designed shape while its words,
 * measured as drawn on the device (`MeasureWidth`, `SizeProbe` in @/features/today/MeasureWidth), fit its room, and
 * gives way only where they do not, never by a guessed width. Until a part is measured its designed shape is drawn.
 * Pure, so the rules are tested (grownFit.test.ts); the screens only measure and place.
 *
 * A width measured on the web is whole pixels (react-native-web reads the box's offsetWidth, rounded), so a label
 * drawn 73.1 px wide may be reported as 73: every measured width here counts `MEASURE_SLACK` more, so words that
 * would fit only by that fraction are taken not to fit, and a row never wraps by itself after being laid out.
 */
import { balancedLines } from '@/features/food/chipLines';
import { fitsRoom } from '@/features/today/fit';

/** The most a measured width may be under the drawn one (whole pixels on the web). */
export const MEASURE_SLACK = 1;

/** A glass tile's designed least width, and the least room between its words and its water edge on each side. */
export const GLASS_TILE_MIN = 72;
export const GLASS_TILE_ROOM = 4;

/**
 * A glass tile's least width with text grown: the designed 72 px, or wider where its widest words as drawn (the
 * amount, "500 ml", which never parts from its unit, or a word of its caption), their room and the edge need it.
 * The designed width until the words are measured.
 */
export function glassTileMin(wordsW: number, edge: number): number {
  if (!(wordsW > 0)) return GLASS_TILE_MIN;
  return Math.max(GLASS_TILE_MIN, Math.ceil(wordsW + MEASURE_SLACK + 2 * (edge + GLASS_TILE_ROOM)));
}

/**
 * "Add a drink" and its two buttons on one line: 'full' while the title and both buttons as drawn fit the row,
 * 'short' while they fit with "Sizes" for "Edit sizes", else 'wrap' (the title on its own line, the buttons under
 * it). `buttonsW` is the two buttons as drawn, holding the short label when `buttonsShort`; `fullW` and `shortW` are
 * the two labels' words. 'full' until everything is measured.
 */
export function titleRowLayout(m: { titleW: number; buttonsW: number; buttonsShort: boolean; fullW: number; shortW: number; rowW: number; gap: number }): 'full' | 'short' | 'wrap' {
  if (!(m.titleW > 0 && m.buttonsW > 0 && m.fullW > 0 && m.shortW > 0 && m.rowW > 0)) return 'full';
  const saved = Math.max(0, m.fullW - m.shortW);
  const withFull = m.buttonsShort ? m.buttonsW + saved : m.buttonsW;
  const withShort = m.buttonsShort ? m.buttonsW : m.buttonsW - saved;
  const title = m.titleW + MEASURE_SLACK + m.gap;
  if (fitsRoom(title + withFull + MEASURE_SLACK, m.rowW)) return 'full';
  if (fitsRoom(title + withShort + MEASURE_SLACK, m.rowW)) return 'short';
  return 'wrap';
}

/**
 * Whether "Other amount" sends Add under the field: only where the field's label and Add, as drawn, are wider than
 * their row side by side. False until all three are measured.
 */
export function amountRowWraps(labelW: number, addW: number, gap: number, rowW: number): boolean {
  if (!(labelW > 0 && addW > 0)) return false;
  return !fitsRoom(labelW + MEASURE_SLACK + gap + addW + MEASURE_SLACK, rowW);
}

/**
 * Items in balanced lines from their widths as drawn (by key): the drink chips and the cup's key. Null until every
 * item is measured (the screen draws its estimate meanwhile).
 */
export function measuredLines<T>(items: readonly T[], keyOf: (item: T) => string, widths: Partial<Record<string, number>>, room: number, gap = 8): number[][] | null {
  if (items.some((it) => !(Number(widths[keyOf(it)]) > 0))) return null;
  return balancedLines(
    items.map((it) => (widths[keyOf(it)] ?? 0) + MEASURE_SLACK),
    room,
    gap,
  );
}
