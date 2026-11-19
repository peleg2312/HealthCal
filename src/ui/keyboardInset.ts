/**
 * The arithmetic behind `Screen`'s keyboard handling in phone browsers, and where the
 * toast rests while a keyboard is up (on every platform). No React, no DOM, unit-tested.
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

/** Space between the toast and the chrome (or keyboard) under it. */
export const TOAST_GAP = 12;

/**
 * Where the screen toast rests: its distance from the bottom of the window, in px. The toast
 * host sits at the app's root, so it has to be told what the focused screen draws at the bottom.
 *
 *   dock          the height of the screen's bottom chrome as laid out without a keyboard: its
 *                 pinned footer, or the tab bar with its + cup and the home indicator, or just
 *                 the home indicator.
 *   ridesKeyboard true when the dock is a pinned footer, which the screen lifts on top of the
 *                 keyboard; the tab bar and the home indicator stay where they are, behind it.
 *   cover         the px the keyboard covers at the bottom of the screen: exactly what `Screen`
 *                 pads its bottom by (natively KeyboardAvoidingView's "padding", in a phone
 *                 browser `keyboardCover`). 0 with no keyboard, with a hardware keyboard, and
 *                 when the window has already shrunk for the keyboard (nothing is covered then:
 *                 the chrome is drawn above it and the toast stays on the chrome).
 *   avoid         optional: the focused field, as distances from the bottom of the window
 *                 (`bottom` < `top`), with the toast's height and the highest the toast may
 *                 reach (`limit`, the window less the top inset). Only read with the keyboard up:
 *                 a toast that would lie over the field moves to 12 px above it when it fits.
 *
 * With no keyboard this is `dock + 12`, the same as before the keyboard counted.
 */
export function toastBottom(
  v: { dock: number; ridesKeyboard: boolean; cover: number },
  avoid?: { top: number; bottom: number; toastHeight: number; limit: number } | null,
  gap = TOAST_GAP,
): number {
  const cover = v.cover > 0 ? v.cover : 0;
  if (!cover) return v.dock + gap;
  // A footer rides on the keyboard; anything else is behind it, unless it reaches higher than it.
  const base = (v.ridesKeyboard ? v.dock + cover : Math.max(v.dock, cover)) + gap;
  if (!avoid || !(avoid.top > avoid.bottom) || !(avoid.toastHeight > 0)) return base;
  const overlaps = base < avoid.top && base + avoid.toastHeight > avoid.bottom;
  if (!overlaps) return base;
  const above = Math.round(avoid.top + gap);
  return above + avoid.toastHeight <= avoid.limit ? above : base;
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
