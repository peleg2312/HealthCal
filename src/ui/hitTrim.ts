/**
 * Web: a control's touch area never takes a tap inside another control's drawn box.
 *
 * On the web a control's slop is an invisible `::after` box reaching past its edges (./Pressable, `useWebHitArea`).
 * It belongs to the control, and a control painted after its neighbour (a later sibling, or one whose press scale
 * gives it a layer of its own) is hit first: its slop then took taps inside the neighbour's own box (the week strip's
 * calendar cup took the bottom of Sunday above it; a day's reach took the next day's edge). So each control's slop
 * is cut, side by side, where it would reach into another control's drawn box (`trimSlop`, pure and tested), and
 * the cut is set on the element (`data-hit-trim` and four custom properties) after the page lays out, again after
 * every render of a kit control, a resize, and once a scroll settles. A slop that reaches no other control is
 * untouched, so nothing changes where nothing was taken. A text field's own button (`TextField`'s `right`, such as
 * food search's clear X) counts only where the field's text goes, not its padding (`fieldTextBox`): the input ends
 * where the button begins, and the input's side room before it holds no text, so the button keeps its 44 px reach
 * there and a tap on the text, or anywhere past that reach, is still the field's. Natively the platform's own hit
 * testing decides.
 */

export type Box = { top: number; right: number; bottom: number; left: number };
export type Slop = { top: number; right: number; bottom: number; left: number };

const intersects = (a: Box, b: Box) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

/**
 * The slop that keeps `own`'s touch area out of every box in `others`: each side reaches at most to the gap
 * between the two drawn boxes (whole px). A neighbour that overlaps `own`'s drawn box is left alone (that is
 * layout, not reach), and a neighbour off a corner is cut on the side that loses less area.
 */
export function trimSlop(own: Box, slop: Slop, others: Box[]): Slop {
  const out = { ...slop };
  const reach = () => ({ top: own.top - out.top, right: own.right + out.right, bottom: own.bottom + out.bottom, left: own.left - out.left });
  for (const o of others) {
    if (o.right - o.left < 1 || o.bottom - o.top < 1) continue;
    if (intersects(o, own)) continue;
    if (!intersects(o, reach())) continue;
    const gaps: [keyof Slop, number][] = [];
    if (o.left >= own.right - 0.5) gaps.push(['right', Math.max(0, Math.floor(o.left - own.right))]);
    if (o.right <= own.left + 0.5) gaps.push(['left', Math.max(0, Math.floor(own.left - o.right))]);
    if (o.top >= own.bottom - 0.5) gaps.push(['bottom', Math.max(0, Math.floor(o.top - own.bottom))]);
    if (o.bottom <= own.top + 0.5) gaps.push(['top', Math.max(0, Math.floor(own.top - o.bottom))]);
    if (!gaps.length) continue;
    // The area each cut gives up: the side's lost depth times the span of that side.
    const w = own.right - own.left + out.left + out.right;
    const h = own.bottom - own.top + out.top + out.bottom;
    let best: [keyof Slop, number] | null = null;
    let bestLoss = Infinity;
    for (const [side, gap] of gaps) {
      if (out[side] <= gap) continue;
      const loss = (out[side] - gap) * (side === 'left' || side === 'right' ? h : w);
      if (loss < bestLoss) {
        bestLoss = loss;
        best = [side, gap];
      }
    }
    if (best) out[best[0]] = best[1];
  }
  return out;
}

/**
 * The part of a text input that a control inside the same field cup leaves alone: where its text goes. Its side
 * padding is room between the text and the field's icon or button, so that button's reach may take it; above and
 * below the text the box is kept, since a tap there still means the field. A padding that leaves no room for
 * text is ignored (the whole box is kept).
 */
export function fieldTextBox(box: Box, padding: { left: number; right: number }): Box {
  const left = box.left + Math.max(0, padding.left || 0);
  const right = box.right - Math.max(0, padding.right || 0);
  return right - left >= 1 ? { ...box, left, right } : box;
}

/** The field cup (`FOCUS_CUP`, ./Pressable) an element is drawn in, if any. */
const fieldCupOf = (el: Element) => el.closest('[data-focus-cup]');

const CONTROLS = '[role="button"],[role="tab"],[role="radio"],[role="switch"],[role="checkbox"],[role="link"],[role="spinbutton"],[role="slider"],button,a[href],input,textarea,select';

const tracked = new Set<HTMLElement>();
let frame = 0;
let settle: ReturnType<typeof setTimeout> | undefined;
let listening = false;

function sameSlop(a: Slop, b: Slop) {
  return a.top === b.top && a.right === b.right && a.bottom === b.bottom && a.left === b.left;
}

function run() {
  frame = 0;
  if (typeof document === 'undefined' || !tracked.size) return;
  const boxes: { el: Element; box: Box }[] = [];
  for (const el of Array.from(document.querySelectorAll(CONTROLS))) {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    boxes.push({ el, box: { top: r.top, right: r.right, bottom: r.bottom, left: r.left } });
  }
  for (const el of Array.from(tracked)) {
    if (!el.isConnected) {
      tracked.delete(el);
      continue;
    }
    const key = el.getAttribute('data-hit');
    const r = el.getBoundingClientRect();
    if (!key || r.width < 1 || r.height < 1) {
      el.removeAttribute('data-hit-trim');
      continue;
    }
    const [t, ri, b, l] = key.split('-').map(Number);
    const cs = getComputedStyle(el);
    const border = { top: Math.ceil(parseFloat(cs.borderTopWidth) || 0), right: Math.ceil(parseFloat(cs.borderRightWidth) || 0), bottom: Math.ceil(parseFloat(cs.borderBottomWidth) || 0), left: Math.ceil(parseFloat(cs.borderLeftWidth) || 0) };
    // The slop past the drawn edge (the rule's offsets are from the padding edge, so they hold the border too).
    const slop = { top: Math.max(0, t - border.top), right: Math.max(0, ri - border.right), bottom: Math.max(0, b - border.bottom), left: Math.max(0, l - border.left) };
    const own = { top: r.top, right: r.right, bottom: r.bottom, left: r.left };
    // A text input in the same field cup as this control (the field's own button) counts only where its text goes.
    const cup = fieldCupOf(el);
    const others = boxes
      .filter((o) => o.el !== el && !el.contains(o.el) && !o.el.contains(el))
      .map((o) => {
        if (!cup || !(o.el instanceof HTMLInputElement || o.el instanceof HTMLTextAreaElement) || fieldCupOf(o.el) !== cup) return o.box;
        const ps = getComputedStyle(o.el);
        return fieldTextBox(o.box, { left: parseFloat(ps.paddingLeft) || 0, right: parseFloat(ps.paddingRight) || 0 });
      });
    const cut = trimSlop(own, slop, others);
    if (sameSlop(cut, slop)) {
      el.removeAttribute('data-hit-trim');
      continue;
    }
    el.style.setProperty('--hit-t', `${cut.top + border.top}px`);
    el.style.setProperty('--hit-r', `${cut.right + border.right}px`);
    el.style.setProperty('--hit-b', `${cut.bottom + border.bottom}px`);
    el.style.setProperty('--hit-l', `${cut.left + border.left}px`);
    el.setAttribute('data-hit-trim', '');
  }
}

/** Looks again at every control's reach on the next frame (coalesced: one look a frame at most). */
export function scheduleHitTrim(): void {
  if (typeof window === 'undefined' || frame) return;
  frame = window.requestAnimationFrame(run);
}

function listen() {
  if (listening || typeof window === 'undefined' || typeof document === 'undefined') return;
  listening = true;
  const rule = document.createElement('style');
  rule.id = 'healthcal-hit-trim';
  rule.appendChild(document.createTextNode('[data-hit][data-hit-trim]::after{top:calc(-1 * var(--hit-t));right:calc(-1 * var(--hit-r));bottom:calc(-1 * var(--hit-b));left:calc(-1 * var(--hit-l))}'));
  document.head.appendChild(rule);
  window.addEventListener('resize', scheduleHitTrim);
  // A scroll moves controls past each other (a row under a pinned footer): look again once it settles.
  document.addEventListener(
    'scroll',
    () => {
      clearTimeout(settle);
      settle = setTimeout(scheduleHitTrim, 120);
    },
    true,
  );
}

/** Web: keeps `el`'s touch area out of its neighbours' drawn boxes while it is on the page. Returns the stop. */
export function trackHitArea(el: HTMLElement): () => void {
  listen();
  tracked.add(el);
  scheduleHitTrim();
  return () => {
    tracked.delete(el);
  };
}
