/**
 * How the widget is laid out in the size the launcher gives it (dp) at the phone's font scale. Pure,
 * tested (layout.test.ts). The widget is a picture drawn at that size, so what does not fit is left
 * out, in this order, rather than cut: the hairline between the halves, the "eaten of" line, the date
 * line. The big figure, the water figures and the glass always stay. Small text grows with the
 * phone's font size (sp); the big figure is already large and keeps its size, so the halves keep
 * their room at every scale.
 */
import { CUP_TOP } from './cup';

/** Text sizes in sp and their line heights at the designed size. */
export const TYPE = {
  date: { size: 11, line: 14 },
  figure: { size: 30, line: 32 },
  unit: { size: 12, line: 14 },
  caption: { size: 12, line: 16 },
  water: { size: 16, line: 20 },
  button: { size: 14, line: 18 },
} as const;

export interface WidgetLayout {
  pad: number;
  /** Space between the calorie half and the water row (each side of the hairline when it shows). */
  gap: number;
  date: boolean;
  eaten: boolean;
  divider: boolean;
  /** Heights of the two halves, in dp. */
  calH: number;
  waterH: number;
  /** The glass button's height. */
  glassH: number;
  /** The calorie cup and the water cup (the cups themselves; their SVG boxes add `cupBox`'s room). */
  calCup: { width: number; height: number };
  waterCup: { width: number; height: number };
  /** The text column beside the calorie cup holds this many dp: the "eaten of" line is left out when it would not fit. */
  textW: number;
}

/** About how wide `chars` characters of text `size` sp are, at `fontScale` (a sans at about 0.55 em a character). */
export function textWidth(chars: number, size: number, fontScale = 1, em = 0.55): number {
  return chars * size * em * fontScale;
}

const UNDO_W = 60;

/**
 * The layout for a widget `width` x `height` dp at `fontScale`, with the "eaten of" line `eatenChars`
 * long and the Undo beside the calorie half (`undo`) or not.
 */
export function widgetLayout(width: number, height: number, fontScale = 1, opts: { eatenChars?: number; undo?: boolean } = {}): WidgetLayout {
  const f = Math.max(1, Number.isFinite(fontScale) ? fontScale : 1);
  const w = Math.max(160, width || 0);
  const h = Math.max(90, height || 0);
  const glassH = Math.max(40, Math.ceil(TYPE.button.line * f + 16));
  const waterText = Math.ceil((TYPE.water.line + TYPE.caption.line) * f);
  const waterH = Math.max(glassH, waterText);
  const figureH = Math.max(TYPE.figure.line, Math.ceil(2 * TYPE.unit.line * f));
  const dateH = Math.ceil(TYPE.date.line * f) + 2;
  const eatenH = Math.ceil(TYPE.caption.line * f) + 2;

  // Richest first; the first that fits is used, else the last.
  const tiers = [
    { date: true, eaten: true, divider: true, pad: 14, gap: 10 },
    { date: true, eaten: true, divider: false, pad: 12, gap: 10 },
    { date: true, eaten: false, divider: false, pad: 12, gap: 8 },
    { date: false, eaten: false, divider: false, pad: 10, gap: 8 },
  ];
  const need = (t: (typeof tiers)[number]) => 2 * t.pad + (t.date ? dateH : 0) + figureH + (t.eaten ? eatenH : 0) + (t.divider ? 2 * t.gap + 1 : t.gap) + waterH;
  const tier = tiers.find((t) => need(t) <= h) ?? tiers[tiers.length - 1];

  const calH = (tier.date ? dateH : 0) + figureH + (tier.eaten ? eatenH : 0);
  const calCupW = 30;
  const textW = w - 2 * tier.pad - calCupW - 6 - 10 - (opts.undo ? UNDO_W + 8 : 0);
  // The "eaten of" line keeps its words whole: where it would not fit beside the cup, it is left out.
  const eatenFits = !opts.eatenChars || textWidth(opts.eatenChars, TYPE.caption.size, f) <= textW;
  const eaten = tier.eaten && eatenFits;
  const calHeight = eaten === tier.eaten ? calH : calH - eatenH;
  return {
    pad: tier.pad,
    gap: tier.gap,
    date: tier.date,
    eaten,
    divider: tier.divider,
    calH: calHeight,
    waterH,
    glassH,
    // The cup stands in its half: its box (the cup and the room above its open top, `CUP_TOP`) is the half's height.
    calCup: { width: calCupW, height: Math.max(24, calHeight - CUP_TOP) },
    waterCup: { width: 22, height: Math.max(24, Math.min(36, waterH - 8)) },
    textW,
  };
}
