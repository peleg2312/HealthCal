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

/** A control's box in window coordinates (y grows down). */
export interface ControlBox {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** A toast's action must have its centre in the lower 60% of the window: one hand reaches it (thumb reach). */
export const TOAST_REACH_FROM = 0.4;
/** Room kept between a resting toast and any control above or below it. */
export const TOAST_CLEAR = 4;

/**
 * The lowest place a toast can rest without lying over a control: the top of the toast, in window
 * coordinates, or null when no place in the range is clear.
 *
 *   lowest     the lowest top allowed (a screen: 12 px above its chrome; a sheet: 12 px above the window's
 *              bottom inset). Tried first, so a toast that is clear where it always rested stays there.
 *   highest    the highest top allowed: the action's centre stays in the lower 60% of the window
 *              (`toastReachTop`), and a caller may pass a higher floor of its own.
 *   height     the toast's height; left and right its sides (only controls it would cross sideways count).
 *   controls   every control on the screen or in the sheet; each is kept `clear` px away.
 *   above      optional: the highest top allowed when no band in thumb reach is clear (the top of the screen
 *              or the window's top inset). Being over a control is worse than being out of thumb reach: a
 *              tall toast (large text) often finds no clear band in the lower 60%, and then takes the lowest
 *              clear band higher up rather than lie over the button just pressed.
 *
 * The answer is the lowest clear top, so the toast stays as close to the thumb and the chrome as it can.
 */
export function toastSpot(v: { lowest: number; highest: number; height: number; left: number; right: number; controls: ControlBox[]; clear?: number; above?: number }): number | null {
  const clear = v.clear ?? TOAST_CLEAR;
  if (!(v.height > 0) || !(v.lowest >= v.highest)) return null;
  const blocks = v.controls.filter((c) => c.right - c.left >= 2 && c.bottom - c.top >= 2 && c.left < v.right && c.right > v.left).map((c) => ({ top: c.top - clear, bottom: c.bottom + clear }));
  const free = (top: number) => blocks.every((b) => !(top < b.bottom && top + v.height > b.top));
  const lowestClear = (hi: number, lo: number) => {
    const tries = [lo, ...blocks.map((b) => b.top - v.height)].filter((t) => t <= lo && t >= hi).sort((a, b) => b - a);
    for (const t of tries) if (free(t)) return Math.round(t);
    return null;
  };
  const near = lowestClear(v.highest, v.lowest);
  if (near !== null || typeof v.above !== 'number' || !(v.above < v.highest)) return near;
  return lowestClear(v.above, v.highest);
}

/** The highest top a toast of this height may have in a window this tall, with its action in thumb reach. */
export function toastReachTop(windowHeight: number, height: number): number {
  return Math.ceil(windowHeight * TOAST_REACH_FROM - height / 2);
}

/** A box as a phone measures it (`measureInWindow`): its left and top edge in the window, and its size. */
export interface WindowBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Phones: where the screen toast rests, by the same rule as the web (`toastSpot`), from boxes a phone
 * measures in window coordinates. The toast host sits at the app's root, so the answer is a distance from
 * the bottom of the root (`windowBottom`, the root's bottom edge in the window), or null when the toast
 * should rest where it always rests (`resting`, its usual distance: 12 px above the screen's chrome),
 * because that place is clear or no clear band is in thumb reach or, with `above` (the window's top
 * inset), anywhere below that. `controls` are the screen's own kit
 * controls (every PressableScale and text field inside its `Screen`, measured as the toast shows).
 */
export function toastBottomAmong(v: { windowBottom: number; resting: number; toast: WindowBox; controls: WindowBox[]; above?: number }): number | null {
  const h = Math.round(v.toast.height);
  const H = v.windowBottom;
  if (!(h > 0) || !(H > 0) || !(v.toast.width > 0)) return null;
  const lowest = H - v.resting - h;
  const controls = v.controls
    .filter((c) => [c.x, c.y, c.width, c.height].every(Number.isFinite))
    .map((c) => ({ top: c.y, bottom: c.y + c.height, left: c.x, right: c.x + c.width }));
  const top = toastSpot({ lowest, highest: toastReachTop(H, h), height: h, left: v.toast.x, right: v.toast.x + v.toast.width, controls, above: v.above });
  if (top === null || top === Math.round(lowest)) return null;
  return Math.round(H - top - h);
}
