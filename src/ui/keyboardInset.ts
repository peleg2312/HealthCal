/**
 * The arithmetic behind `Screen`'s keyboard handling in phone browsers. No React,
 * no DOM, unit-tested.
 *
 * In a phone browser the page's layout does not shrink when the on-screen keyboard
 * opens (iOS Safari and a Home Screen web app always; Android Chrome by default):
 * only the visual viewport does. So a pinned footer stays under the keyboard and
 * a field low on the page is covered. `Screen` reads `window.visualViewport`, pads
 * its bottom by what the keyboard covers, puts back any scroll the browser left
 * the page at, and scrolls the focused field into the space that is left.
 */

/** Less than this between the layout and the visual viewport is browser chrome (a URL bar), not a keyboard. */
export const KEYBOARD_MIN = 120;
/** Room kept between a revealed field and the edge of what is visible. */
export const REVEAL_MARGIN = 16;

/**
 * How many px at the bottom of the page the keyboard covers: the layout viewport's
 * height less the visual viewport's. 0 when the difference is browser chrome, when
 * the page is pinch-zoomed (the visual viewport is then small for another reason),
 * or when the browser already shrinks the layout for the keyboard.
 */
export function keyboardCover(v: { layoutHeight: number; viewportHeight: number; scale?: number }): number {
  if (!(v.layoutHeight > 0) || !(v.viewportHeight > 0)) return 0;
  if ((v.scale ?? 1) > 1.05) return 0;
  const covered = Math.round(v.layoutHeight - v.viewportHeight);
  return covered >= KEYBOARD_MIN ? covered : 0;
}

/**
 * How far to scroll a scroller (positive: further down) so the field lies inside
 * the part of it that can be seen, with REVEAL_MARGIN to spare. Rects are in the
 * same coordinates (the page's). A field taller than the space keeps its top in view.
 */
export function revealDelta(field: { top: number; bottom: number }, view: { top: number; bottom: number }, margin = REVEAL_MARGIN): number {
  const below = field.bottom + margin - view.bottom;
  const above = field.top - margin - view.top;
  if (below > 0) return Math.round(Math.min(below, Math.max(0, above)));
  if (above < 0) return Math.round(above);
  return 0;
}
