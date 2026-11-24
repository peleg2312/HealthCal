/**
 * How the training overview's sheet sits in its window. Its body is the answer, the chart, the one
 * action ("Ask the coach") and then the fine print, and the chart is the one part that can give or
 * take a little height. Three things the rule gives, in this order:
 *
 *  1. A body that is at most `SHRINK_MAX_PX` taller than the sheet fits: the chart is drawn that
 *     much shorter (to the whole px above) and nothing scrolls.
 *  2. A body that would scroll by a sliver (`SLIVER_PX` or less hidden: the layout scan's "almost
 *     fits", a last line half cut with nothing to say there is more) gets a chart tall enough to
 *     leave `SLIVER_PX + CLEAR_BY_PX` below the fold, when `GROW_MAX_PX` or less does it.
 *  3. In a body that clearly scrolls, the action is whole in the first view or wholly under the
 *     fold, never cut by the sheet's bottom edge.
 *
 * The chart never grows by more than `GROW_MAX_PX` and never loses more than `SHRINK_MAX_PX`. What
 * neither can cure is left as it is and scrolls: a body between `SHRINK_MAX_PX` and
 * `SLIVER_PX + CLEAR_BY_PX - GROW_MAX_PX` px taller than the sheet.
 *
 * Pure: the sheet measures (its content, the scroller that holds it and the action) and asks here.
 */

/** A body that scrolls by this many px or less reads as cut, not as scrolling. */
export const SLIVER_PX = 80;
/** How far past the sliver the taller chart takes it. */
export const CLEAR_BY_PX = 8;
/** The most the chart grows. */
export const GROW_MAX_PX = 48;
/** The most the chart gives back. */
export const SHRINK_MAX_PX = 32;
/** Hidden px that are rounding, not content: the body fits. */
export const FITS_PX = 0.5;
/** Room kept under the action when the chart gives height back to bring it whole into the first view. */
export const ACTION_ROOM_PX = 8;

/** A body as it is drawn: the content's height, the visible height of its scroller, and the action's edges from the content's top. */
export interface SheetMeasure {
  height: number;
  viewport: number;
  action: { top: number; bottom: number } | null;
}

/**
 * What the chart gets on top of its designed height (negative: that much less), for a body
 * measured with the chart at its designed height.
 */
export function chartChange(natural: SheetMeasure): number {
  const { height, viewport, action } = natural;
  if (!(height > 0) || !(viewport > 0)) return 0;
  const hidden = height - viewport;
  if (hidden <= FITS_PX) return 0;
  if (hidden <= SHRINK_MAX_PX) return -Math.ceil(hidden);
  if (hidden <= SLIVER_PX) {
    const grow = Math.ceil(SLIVER_PX + CLEAR_BY_PX - hidden);
    return grow <= GROW_MAX_PX ? grow : 0;
  }
  // It clearly scrolls. The action may sit across the fold.
  if (!action || !(action.bottom > action.top) || action.top >= viewport) return 0;
  const shrink = Math.ceil(action.bottom + ACTION_ROOM_PX - viewport);
  if (shrink <= 0) return 0;
  // Whole into the first view, as long as the body still clearly scrolls afterwards.
  if (shrink <= SHRINK_MAX_PX && hidden - shrink > SLIVER_PX) return -shrink;
  // Whole already, only close to the edge: left alone.
  if (action.bottom <= viewport) return 0;
  const grow = Math.ceil(viewport - action.top);
  return grow <= GROW_MAX_PX ? grow : 0;
}

/**
 * The step the sheet takes after each layout: `drawn` px are in the chart now, so they are taken
 * off what was measured (the chart is above the action, which moves with it) and the rule is asked
 * about the body as designed. The answer does not depend on `drawn`, so the second layout asks
 * again and gets the same: it settles in one step.
 */
export function nextChange(measured: SheetMeasure, drawn: number): number {
  return chartChange({
    height: measured.height - drawn,
    viewport: measured.viewport,
    action: measured.action ? { top: measured.action.top - drawn, bottom: measured.action.bottom - drawn } : null,
  });
}

/** What is read from a host element: the browser's DOM element on web, React Native's own element natively. */
interface HostBox {
  clientHeight?: unknown;
  parentElement?: unknown;
  getBoundingClientRect?: unknown;
}

interface Rect {
  top?: unknown;
  bottom?: unknown;
  height?: unknown;
}

function rectOf(el: HostBox | null | undefined): Rect | null {
  if (!el || typeof el.getBoundingClientRect !== 'function') return null;
  return (el.getBoundingClientRect as () => Rect).call(el) ?? null;
}

/**
 * The content's drawn height, the visible height of the scroller that holds it (the kit sheet's
 * body: the content's parent is the scroller's content container) and, when given, where the
 * action sits in the content. Null when the element cannot say (not laid out yet, or a host without
 * these getters): then the chart keeps its designed height. An action that cannot say is left out.
 */
export function readFit(content: unknown, action?: unknown): SheetMeasure | null {
  const el = content as HostBox | null | undefined;
  const rect = rectOf(el);
  if (!el || !rect) return null;
  const scroller = (el.parentElement as HostBox | null | undefined)?.parentElement as HostBox | null | undefined;
  const height = typeof rect.height === 'number' ? rect.height : 0;
  const viewport = typeof scroller?.clientHeight === 'number' ? scroller.clientHeight : 0;
  if (!(height > 0) || !(viewport > 0)) return null;
  const a = rectOf(action as HostBox | null | undefined);
  const edges =
    a && typeof a.top === 'number' && typeof a.bottom === 'number' && typeof rect.top === 'number' && a.bottom > a.top
      ? { top: a.top - rect.top, bottom: a.bottom - rect.top }
      : null;
  return { height, viewport, action: edges };
}
