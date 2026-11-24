/**
 * The looks under the system's contrast settings (./legibility.ts). Pure functions on a palette, tested in
 * contrastMore.test.ts for all six looks.
 *
 * `moreContrastColors`: the same look, with every secondary ink pulled toward the text colour until it
 * reaches its mark (secondary and tertiary text a third further still): secondary text, accent and status inks 7:1 on the page, the card and the soft surface
 * (WCAG's enhanced level), the tertiary text 4.5:1 there too (also on the soft surface, where it is not
 * allowed in the plain looks), card hairlines 3:1 and every outline (fields, cups, strong borders, the dash
 * that carries meaning) 4.5:1.
 * Data fills keep their colours (they are already 3:1 on the card), and bar tints are drawn at least at 70%.
 *
 * `forcedColorsPalette`: the person's own system colours (Windows contrast themes, `forced-colors: active`)
 * mapped onto the tokens: the page and every surface Canvas, all text and outlines CanvasText, the accent
 * and every data fill Highlight (with HighlightText on it), links LinkText and the over mark Mark. Data
 * colours become one, as forced colours mean; the level line, the outlines and the words still tell them apart.
 */
import { contrast } from './contrast';
import type { ThemeColors } from './tokens';

const hex = (v: string) => v.slice(0, 7).toUpperCase();

function channels(h: string): [number, number, number] {
  const s = h.replace('#', '');
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}

/** `from` moved toward `to` by `t` (0..1), as '#RRGGBB'. */
export function mix(from: string, to: string, t: number): string {
  const a = channels(hex(from));
  const b = channels(hex(to));
  return `#${a.map((c, i) => Math.round(c + (b[i] - c) * t).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

/** `color` pulled toward `toward` in small steps until it is at least `min`:1 on every ground. */
export function strengthen(color: string, toward: string, grounds: string[], min: number): string {
  for (let i = 0; i <= 50; i++) {
    const c = i === 0 ? hex(color) : mix(color, toward, i / 50);
    if (grounds.every((g) => contrast(c, hex(g)) >= min)) return c;
  }
  return hex(toward);
}

/** The look drawn for more contrast (iOS Increase Contrast, Android high contrast text, prefers-contrast: more). */
export function moreContrastColors(c: ThemeColors): ThemeColors {
  const grounds = [c.bg, c.bgElevated, c.surface, c.surfaceAlt];
  const pages = [c.bg, c.bgElevated, c.surface];
  const ink = (k: keyof ThemeColors, min: number, on = grounds) => strengthen(c[k], c.text, on, min);
  const edge = ink('vesselEdge', 4.5, pages);
  return {
    ...c,
    // Secondary words always move a third of the way further toward the text, so a look whose secondary
    // text is already 7:1 (Dark, Java) still shows the setting.
    textSecondary: mix(ink('textSecondary', 7), c.text, 1 / 3),
    textTertiary: mix(ink('textTertiary', 4.5), c.text, 1 / 3),
    primaryInk: ink('primaryInk', 7),
    actionInk: ink('actionInk', 7),
    caloriesInk: ink('caloriesInk', 7, pages),
    warningInk: ink('warningInk', 7),
    danger: ink('danger', 7),
    border: ink('border', 3, pages),
    borderStrong: ink('borderStrong', 4.5, pages),
    fieldEdge: ink('fieldEdge', 4.5, pages),
    dashEdge: ink('dashEdge', 4.5, pages),
    vesselEdge: edge,
  };
}

/** The opacity of a bar's tint under more contrast: at least 70%. */
export function moreContrastChartFill(chartFill: number): number {
  return Math.max(chartFill, 0.7);
}

/** The system colours a forced-colours page is drawn with (CSS system colour keywords, read as '#RRGGBB'). */
export interface SystemColors {
  Canvas: string;
  CanvasText: string;
  LinkText: string;
  Highlight: string;
  HighlightText: string;
  Mark?: string;
}

/** The tokens drawn in the person's forced colours. */
export function forcedColorsPalette(s: SystemColors, base: ThemeColors): ThemeColors {
  const page = s.Canvas;
  const ink = s.CanvasText;
  const fill = s.Highlight;
  // The over mark must differ from the fill it sits on: Mark when the system has one apart from Highlight.
  const over = s.Mark && s.Mark !== fill && s.Mark !== page ? s.Mark : s.LinkText !== fill ? s.LinkText : ink;
  return {
    ...base,
    bg: page,
    bgElevated: page,
    surface: page,
    surfaceAlt: page,
    surfacePressed: page,
    border: ink,
    borderStrong: ink,
    fieldEdge: ink,
    dashEdge: ink,
    text: ink,
    textSecondary: ink,
    textTertiary: ink,
    primary: fill,
    onPrimary: s.HighlightText,
    primarySoft: page,
    primaryInk: s.LinkText,
    actionInk: s.LinkText,
    calories: fill,
    caloriesBar: fill,
    protein: fill,
    carbs: fill,
    fat: fill,
    water: fill,
    exercise: fill,
    sleep: fill,
    weight: fill,
    success: ink,
    warning: over,
    warningInk: ink,
    danger: ink,
    overlay: `${ink}B3`,
    track: page,
    vesselEmpty: page,
    tabBar: page,
    rim: ink,
    headroom: fill,
    vesselEdge: ink,
    caloriesInk: ink,
    // On the overlay (CanvasText): the page colour reads on it in a light or a dark system theme.
    cameraInk: page,
    heroStart: page,
    heroEnd: page,
    ringEnd: fill,
  };
}

/** 'rgb(r, g, b)' or 'rgba(r, g, b, a)' (as getComputedStyle gives a colour) to '#RRGGBB'; null for anything else. */
export function cssRgbToHex(v: string): string | null {
  const m = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(v.trim());
  if (!m) return null;
  return `#${[m[1], m[2], m[3]].map((n) => Math.min(255, Number(n)).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

/** The system colours on the web, read from a probe element; null where they cannot be read. */
export function readSystemColors(): SystemColors | null {
  if (typeof document === 'undefined' || typeof getComputedStyle !== 'function') return null;
  const probe = document.createElement('div');
  probe.style.position = 'absolute';
  probe.style.visibility = 'hidden';
  document.body.appendChild(probe);
  const read = (keyword: string): string | null => {
    probe.style.color = '';
    probe.style.color = keyword;
    if (!probe.style.color) return null;
    return cssRgbToHex(getComputedStyle(probe).color);
  };
  try {
    const Canvas = read('Canvas');
    const CanvasText = read('CanvasText');
    const LinkText = read('LinkText');
    const Highlight = read('Highlight');
    const HighlightText = read('HighlightText');
    const Mark = read('Mark');
    if (!Canvas || !CanvasText || !LinkText || !Highlight || !HighlightText) return null;
    return { Canvas, CanvasText, LinkText, Highlight, HighlightText, Mark: Mark ?? undefined };
  } finally {
    probe.remove();
  }
}
