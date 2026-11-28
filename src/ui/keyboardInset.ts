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

/**
 * Room kept between a resting toast and any control above or below it: 8 px, so the toast stays off the control's
 * touch area too (a 36 px button reaches 44 with 4 px of slop each side, 48 dp on Android with 6; a 32 px chip 6 and 8).
 */
export const TOAST_CLEAR = 8;

/**
 * Whether a toast whose top is at `top` (window coordinates, y down) lies over a control or within `clear` px of one.
 * The toast always rests in one place (`toastBottom`): this only decides whether the screen's scroll area gives way
 * under it (`toastBand`). Only controls it would cross sideways count.
 */
export function toastCovers(v: { top: number; height: number; left: number; right: number; controls: ControlBox[]; clear?: number }): boolean {
  const clear = v.clear ?? TOAST_CLEAR;
  if (!(v.height > 0)) return false;
  return v.controls.some(
    (c) => c.right - c.left >= 2 && c.bottom - c.top >= 2 && c.left < v.right && c.right > v.left && v.top < c.bottom + clear && v.top + v.height > c.top - clear,
  );
}

/** A box as a phone measures it (`measureInWindow`): its left and top edge in the window, and its size. */
export interface WindowBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Phones: `toastCovers` from boxes measured in window coordinates. The toast host sits at the app's root, so
 * where the toast rests is a distance from the bottom of the root (`resting`, 12 px above the screen's chrome)
 * and `windowBottom` is the root's bottom edge in the window. `controls` are the screen's own kit controls
 * (every PressableScale and text field inside its `Screen`, ./toastControls). False before anything is measured.
 */
export function toastCoversAmong(v: { windowBottom: number; resting: number; toast: WindowBox; controls: WindowBox[] }): boolean {
  const h = Math.round(v.toast.height);
  const H = v.windowBottom;
  if (!(h > 0) || !(H > 0) || !(v.toast.width > 0)) return false;
  const controls = v.controls
    .filter((c) => [c.x, c.y, c.width, c.height].every(Number.isFinite))
    .map((c) => ({ top: c.y, bottom: c.y + c.height, left: c.x, right: c.x + c.width }));
  return toastCovers({ top: H - v.resting - h, height: h, left: v.toast.x, right: v.toast.x + v.toast.width, controls });
}

/** The highest a sheet's toast may stand above the sheet: its centre in the lower 60% of the window, in thumb reach. */
export const TOAST_REACH_FROM = 0.4;

/**
 * Where a sheet's toast rests. Just above the sheet's top edge (12 px) while its centre stays in the lower 60% of the
 * window; on a sheet whose top is higher than that, at the bottom of the sheet the way a screen's toast rests: `lift`
 * px above the sheet's bottom edge (above its pinned footer, or above the home indicator), with the sheet's body
 * ending 8 px above the toast (`band`, from the sheet's bottom edge: the sheet's own `toastBand`), so nothing in the
 * body is under it.
 *
 *   windowHeight  the window (or what the keyboard leaves of it)
 *   sheetTop      the sheet's top edge in the window
 *   sheetHeight   the sheet's height
 *   toastHeight   the toast's height (0 before it is laid out: it rests above the sheet until then)
 *   lift          how far above the sheet's bottom edge the toast's bottom rests when it is in the sheet
 *
 * `sink` is how far below the sheet's top edge the toast's bottom rests (null: above the sheet, 12 px over its top
 * edge), and `band` how far up from the sheet's bottom edge its body gives way (0: not at all).
 */
export function sheetToastPlace(v: { windowHeight: number; sheetTop: number; sheetHeight: number; toastHeight: number; lift: number }, gap = TOAST_GAP): { sink: number | null; band: number } {
  const h = v.toastHeight;
  if (!(h > 0) || !(v.sheetHeight > 0) || !(v.windowHeight > 0)) return { sink: null, band: 0 };
  const top = v.sheetTop - gap - h;
  if (top + h / 2 >= v.windowHeight * TOAST_REACH_FROM) return { sink: null, band: 0 };
  return { sink: Math.max(0, Math.round(v.sheetHeight - v.lift)), band: toastBand(v.lift, h) };
}

/** What a finger did on a toast's body when it let go (`toastGesture`). */
export type ToastGesture = 'tap' | 'dismiss' | 'back';

/** A movement under this, both ways, is a tap: a tap on the toast's words dismisses it. */
export const TOAST_TAP_SLOP = 8;
/** A drag down this far, or sideways `TOAST_SWIPE_X` (or 30% of the toast's width, the smaller), dismisses it. */
export const TOAST_SWIPE_Y = 24;
export const TOAST_SWIPE_X = 80;
/** A flick: this fast (px per ms) down or sideways, after at least `TOAST_TAP_SLOP` of travel that way. */
export const TOAST_FLICK_V = 0.5;

/**
 * What a finger lifted from the toast's body did: a tap (it dismisses the toast), a flick or drag down or sideways far
 * or fast enough (it dismisses it), or too little (the toast settles back where it rests). Upward moves count for
 * nothing: the toast only leaves downwards or to a side. `dx`, `dy` and `vx`, `vy` are PanResponder's gesture state.
 */
export function toastGesture(g: { dx: number; dy: number; vx: number; vy: number }, width: number): ToastGesture {
  const ax = Math.abs(g.dx);
  if (ax < TOAST_TAP_SLOP && Math.abs(g.dy) < TOAST_TAP_SLOP) return 'tap';
  const sideways = Math.min(TOAST_SWIPE_X, width > 0 ? width * 0.3 : TOAST_SWIPE_X);
  if (g.dy >= TOAST_SWIPE_Y || (g.dy >= TOAST_TAP_SLOP && g.vy >= TOAST_FLICK_V)) return 'dismiss';
  if (ax >= sideways || (ax >= TOAST_TAP_SLOP && Math.abs(g.vx) >= TOAST_FLICK_V)) return 'dismiss';
  return 'back';
}

/**
 * The toast always rests in one place, just above the screen's bottom chrome. When a control of the screen's scroll
 * area lies under that place (`toastCovers`: a diary row, a "+", a card's link), the screen makes room: its scroll
 * area ends `clear` px above the toast while the toast shows, so nothing a person can press lies under the toast and
 * nothing on screen moves (the rows under the band leave the scroll area's view and are a scroll away). This is how
 * far up from the window's (or a sheet's) bottom the band reaches.
 */
export function toastBand(resting: number, toastHeight: number, clear = TOAST_CLEAR): number {
  if (!(toastHeight > 0) || !(resting >= 0)) return 0;
  return Math.ceil(resting + toastHeight + clear);
}

/** How much a screen's scroll area gives up for that band: the band less what already lies under the scroll area (a pinned footer). */
export function scrollGivesUp(band: number, belowScroll: number): number {
  return band > 0 ? Math.max(0, Math.ceil(band - Math.max(0, belowScroll))) : 0;
}
