/**
 * How the widget is laid out in the size the launcher gives it (dp) at the phone's font scale.
 * Pure, tested (layout.test.ts). The widget is a picture of Android TextViews, so a line that does
 * not fit is cut, not wrapped tidily: every line here is measured (`fonts.ts`: the bundled fonts'
 * own widths and line boxes) at the size it is really drawn (`fontScale.ts`: Android's own curve;
 * the drawing passes these dp sizes with font scaling off, so what is measured is what is drawn),
 * and each line gets a box it fits in.
 *
 * Plans are tried richest first and the first that fits is drawn (`widgetLayout`'s loops, outermost
 * first: font scale, figure size, `TIERS`, `ARRANGEMENTS`, the Undo's place):
 *
 * 1. At the phone's font scale, with the 30 dp figure, the parts are given up in this order: the
 *    hairline between the halves, then the "eaten of" line, then the date line; at each step the
 *    card's padding is tried from roomy (14) to tight before the next part goes. A line also goes,
 *    whole, where it is wider than its column. The figure with its "kcal left", the water figures
 *    with their "Water" label and the glass always stay.
 * 2. Width is found without giving anything up where it can be: "kcal left" stands on the figure's
 *    line and moves under "kcal" only when the line is too narrow; the glass's side padding narrows,
 *    then the small water cup goes, then the glass moves under the water figures (which costs
 *    height, so it is tried after the roomy cards with the glass beside). "213 ml of 2.9 L" is always
 *    one line, never split from its number.
 * 3. Where even the sparest tier does not fit (one row), the figure steps down (27, 24, 22 dp).
 * 4. Only where none of that fits is the text drawn one of Android's font size steps smaller, down
 *    to the designed size (never smaller than that, unless the phone's own size is).
 *
 * The Undo, while a glass can be undone, sits beside the calorie half when the figure's line still
 * fits beside it, else beside the glass when the glass is under the water figures. Only below the
 * widget's least size, where nothing else would fit, is it left out (the glass can be removed on
 * Water).
 */
import { CUP_TOP, cupBox } from './cup';
import { cleanScale, scaleSteps, spToDp } from './fontScale';
import { baselineOf, lineHeight, textWidth, wrapWords, type WidgetFont } from './fonts';

/** Text sizes in sp at the designed size. The figure is in dp: it is already large and does not grow. */
export const TYPE = {
  date: 11,
  unit: 12,
  eaten: 12,
  water: 16,
  caption: 12,
  button: 14,
  undo: 13,
  title: 18,
  line: 13,
} as const;

/** The big figure's sizes in dp, the first the designed one; a short widget steps down. */
export const FIGURE_SIZES = [30, 27, 24, 22] as const;

/** Letter spacing in em: the date's overline tracking, and the figure drawn a little tighter. */
export const DATE_TRACKING = 0.9 / 11;
export const FIGURE_TRACKING = -0.6 / 30;

/** Fixed room in dp. */
export const ROOM = {
  border: 1,
  calCup: 30,
  waterCup: 22,
  /** Between a cup and its words. */
  cupGap: 10,
  /** Between the figure and "kcal left". */
  unitGap: 6,
  /** Before the Undo and before the glass, beside what they sit next to. */
  buttonGap: 8,
  /** Between the water figures and the glass under them. */
  underGap: 6,
  glassBorder: 1.5,
  undoBorder: 1,
  undoPad: 12,
  /** A button is its words plus this above and below, and never shorter than its least height. */
  buttonPadV: 8,
  glassMinH: 40,
  undoMinH: 36,
  /** Pixel rounding across the stacked parts. */
  slack: 2,
} as const;

/**
 * What is shown, richest first: the hairline goes first, then the "eaten of" line, then the date.
 * Each is tried with the card's padding from roomy to tight (the hairline only with a roomy card).
 */
const TIERS = [
  { divider: true, eaten: true, date: true, pads: [14, 12] },
  { divider: false, eaten: true, date: true, pads: [14, 12, 10, 8] },
  { divider: false, eaten: false, date: true, pads: [14, 12, 10, 8] },
  { divider: false, eaten: false, date: false, pads: [14, 12, 10, 8, 6, 5] },
] as const;

/**
 * Within a tier, the card's padding and where the glass goes, in order: the glass beside the water
 * figures in a roomy card, then under them in a roomy card, then the tighter cards.
 */
const ARRANGEMENTS = [
  { pad: 14, glass: 'beside' },
  { pad: 12, glass: 'beside' },
  { pad: 10, glass: 'beside' },
  { pad: 14, glass: 'under' },
  { pad: 12, glass: 'under' },
  { pad: 10, glass: 'under' },
  { pad: 8, glass: 'beside' },
  { pad: 8, glass: 'under' },
  { pad: 6, glass: 'beside' },
  { pad: 6, glass: 'under' },
  { pad: 5, glass: 'beside' },
  { pad: 5, glass: 'under' },
] as const;

/** The room between the halves for a card padding: less in a tighter card. */
export function gapFor(pad: number): number {
  return pad >= 12 ? 10 : pad >= 10 ? 8 : pad >= 8 ? 6 : 4;
}

/** The glass's side padding, roomy then narrow. */
const GLASS_PADS = [14, 8] as const;

/** The words the widget draws for one day, as drawn. */
export interface WidgetTexts {
  /** "WED, NOV 25" (upper case, as drawn). */
  date: string;
  /** "2,239". */
  figure: string;
  /** "left" or "above", after "kcal". */
  word: string;
  /** "782 eaten of 3,020". */
  eaten: string;
  /** "213 ml of 2.9 L". */
  water: string;
  /** "Water", "Goal reached" or "250 ml added". */
  caption: string;
  /** "+ 250 ml". */
  glass: string;
  /** "Undo" while a glass can be undone, else null. */
  undo: string | null;
}

/** One line of text with the box it is drawn in (dp): `width` is the room its words take. */
export interface LineBox {
  text: string;
  font: WidgetFont;
  /** The size it is drawn at, in dp (font scaling off). */
  size: number;
  /** Letter spacing in em. */
  tracking: number;
  width: number;
  height: number;
}

export interface WidgetLayout {
  /** Whether everything fits; false only where even the sparest plan at the designed size does not (below the widget's least size). */
  fits: boolean;
  /** The font scale the text is drawn at: the phone's, or a smaller step of Android's ladder. */
  scale: number;
  pad: number;
  gap: number;
  divider: boolean;
  date: boolean;
  eaten: boolean;
  units: 'inline' | 'stacked';
  /** Beside the calorie half, or beside the glass in the glass's row under the water figures. */
  undo: 'beside' | 'glass' | null;
  glass: 'beside' | 'under';
  glassPad: number;
  waterCup: boolean;
  /** The calorie half's text column and its width. */
  calH: number;
  calTextW: number;
  /** The figure's row (the figure and "kcal left", or "kcal" over "left"). */
  figureH: number;
  /** For stacked units: how far their column stands above the row's foot, so "left" sits on the figure's baseline. */
  unitsDrop: number;
  /** The water figures with their label, and the whole water block (with the glass under it, when it is). */
  waterTextH: number;
  waterTextW: number;
  waterH: number;
  glassW: number;
  glassH: number;
  undoW: number;
  undoH: number;
  calCup: { width: number; height: number };
  waterCupSize: { width: number; height: number };
  lines: {
    date: LineBox;
    figure: LineBox;
    /** "kcal left" on the figure's line. */
    units: LineBox;
    /** "kcal" and "left" when stacked. */
    kcal: LineBox;
    word: LineBox;
    eaten: LineBox;
    water: LineBox;
    caption: LineBox;
    glass: LineBox;
    undo: LineBox | null;
  };
  /** The height the plan takes, in dp (at most the widget's height when it fits). */
  used: number;
}

function box(text: string, font: WidgetFont, size: number, tracking = 0): LineBox {
  return { text, font, size, tracking, width: textWidth(text, font, size, tracking), height: lineHeight(font, size) };
}

/** The sizes in dp at `scale`, whole numbers (the drawing's size steps are whole dp). */
function sizesAt(scale: number) {
  const dp = (sp: number) => Math.max(1, Math.round(spToDp(sp, scale)));
  return {
    date: dp(TYPE.date),
    unit: dp(TYPE.unit),
    eaten: dp(TYPE.eaten),
    water: dp(TYPE.water),
    caption: dp(TYPE.caption),
    button: dp(TYPE.button),
    undo: dp(TYPE.undo),
  };
}

interface Attempt {
  width: number;
  height: number;
  scale: number;
  figure: number;
  tier: { divider: boolean; eaten: boolean; date: boolean };
  pad: number;
  glass: 'beside' | 'under';
  undoAt: 'beside' | 'glass' | null;
  texts: WidgetTexts;
  /** Measure it even where a line that must stay is too wide (the last resort below the widget's least size): it then does not fit. */
  force?: boolean;
}

/** One plan, measured; null when a line that must stay does not fit its width (unless forced). */
function plan(a: Attempt): WidgetLayout | null {
  const { texts } = a;
  const frame = { ...a.tier, pad: a.pad, gap: gapFor(a.pad) };
  const s = sizesAt(a.scale);
  const inner = a.width - 2 * (frame.pad + ROOM.border);
  // The cup's box is as wide whatever its height (the cup and the brim's room at each side).
  const calCupBox = cupBox(ROOM.calCup, 40).width;
  const calTextFull = inner - calCupBox - ROOM.cupGap;

  const date = box(texts.date, 'strong', s.date, DATE_TRACKING);
  const figure = box(texts.figure, 'numbers', a.figure, FIGURE_TRACKING);
  const units = box(`kcal ${texts.word}`, 'strong', s.unit);
  const kcal = box('kcal', 'strong', s.unit);
  const word = box(texts.word, 'strong', s.unit);
  const eaten = box(texts.eaten, 'words', s.eaten);
  const undoLine = texts.undo ? box(texts.undo, 'strong', s.undo) : null;
  const undoW = undoLine ? undoLine.width + 2 * (ROOM.undoPad + ROOM.undoBorder) : 0;
  const undoH = undoLine ? Math.max(ROOM.undoMinH, undoLine.height + 2 * ROOM.buttonPadV) : 0;

  // The calorie half: the figure's line must fit its column.
  const calTextW = calTextFull - (a.undoAt === 'beside' ? undoW + ROOM.buttonGap : 0);
  const stackedW = Math.max(kcal.width, word.width);
  const unitsFit: 'inline' | 'stacked' | null =
    figure.width + ROOM.unitGap + units.width <= calTextW ? 'inline' : figure.width + ROOM.unitGap + stackedW <= calTextW ? 'stacked' : null;
  if (!unitsFit && !a.force) return null;
  const unitsAt = unitsFit ?? 'stacked';

  const figBase = baselineOf('numbers', a.figure);
  const figDesc = figure.height - figBase;
  const unitBase = baselineOf('strong', s.unit);
  const unitDesc = units.height - unitBase;
  const unitsDrop = unitsAt === 'stacked' ? Math.max(0, figDesc - unitDesc) : 0;
  const figureH = unitsAt === 'inline' ? Math.max(figBase, unitBase) + Math.max(figDesc, unitDesc) : Math.max(figure.height, kcal.height + word.height + unitsDrop);

  // The date stands above the figure, the "eaten of" line under it, each only where it is whole.
  const showDate = frame.date && date.width <= calTextW;
  const showEaten = frame.eaten && eaten.width <= calTextW;
  const calH = (showDate ? date.height : 0) + figureH + (showEaten ? eaten.height : 0);
  const calRowH = a.undoAt === 'beside' ? Math.max(calH, undoH) : calH;

  // The water figures with their label, and the glass beside or under them.
  const water = box(texts.water, 'numbers', s.water);
  const caption = box(texts.caption, 'words', s.caption);
  const glass = box(texts.glass, 'strong', s.button);
  const waterTextW = Math.max(water.width, caption.width);
  const waterTextH = water.height + caption.height;
  const glassH = Math.max(ROOM.glassMinH, glass.height + 2 * ROOM.buttonPadV);
  const glassWith = (pad: number) => glass.width + 2 * (pad + ROOM.glassBorder);
  const cupRoom = cupBox(ROOM.waterCup, 30).width + ROOM.cupGap;
  const options =
    a.glass === 'beside'
      ? [
          { cup: true, pad: GLASS_PADS[0] },
          { cup: true, pad: GLASS_PADS[1] },
          { cup: false, pad: GLASS_PADS[0] },
          { cup: false, pad: GLASS_PADS[1] },
        ].filter((o) => (o.cup ? cupRoom : 0) + waterTextW + ROOM.buttonGap + glassWith(o.pad) <= inner)
      : [
          { cup: true, pad: GLASS_PADS[0] },
          { cup: false, pad: GLASS_PADS[0] },
          { cup: false, pad: GLASS_PADS[1] },
        ].filter((o) => (o.cup ? cupRoom : 0) + waterTextW <= inner && (a.undoAt === 'glass' ? undoW + ROOM.buttonGap : 0) + glassWith(o.pad) <= inner);
  if (!options[0] && !a.force) return null;
  const pick = options[0] ?? { cup: false, pad: GLASS_PADS[1] };
  const waterH = a.glass === 'beside' ? Math.max(waterTextH, glassH) : waterTextH + ROOM.underGap + glassH;

  const used = 2 * (frame.pad + ROOM.border) + calRowH + (frame.divider ? 2 * frame.gap + 1 : frame.gap) + waterH + ROOM.slack;
  return {
    fits: used <= a.height && !!unitsFit && !!options[0],
    scale: a.scale,
    pad: frame.pad,
    gap: frame.gap,
    divider: frame.divider,
    date: showDate,
    eaten: showEaten,
    units: unitsAt,
    undo: texts.undo ? a.undoAt : null,
    glass: a.glass,
    glassPad: pick.pad,
    waterCup: pick.cup,
    calH,
    calTextW,
    figureH,
    unitsDrop,
    waterTextH,
    waterTextW: inner - (pick.cup ? cupRoom : 0) - (a.glass === 'beside' ? ROOM.buttonGap + glassWith(pick.pad) : 0),
    waterH,
    glassW: glassWith(pick.pad),
    glassH,
    undoW,
    undoH,
    // The cup stands in its half: its box (the cup and the room above its open top, `CUP_TOP`) is the half's height.
    calCup: { width: ROOM.calCup, height: Math.max(16, calH - CUP_TOP) },
    waterCupSize: { width: ROOM.waterCup, height: Math.max(16, Math.min(36, waterTextH - CUP_TOP)) },
    lines: { date, figure, units, kcal, word, eaten, water, caption, glass, undo: undoLine },
    used,
  };
}

/**
 * The layout for a widget `width` x `height` dp at the phone's `fontScale`, for the words `texts`
 * (their lengths decide what fits). The first plan that fits, richest first; where none fits (a size
 * below the widget's least), the sparest plan at the smallest step, with `fits` false.
 */
export function widgetLayout(width: number, height: number, fontScale: number, texts: WidgetTexts): WidgetLayout {
  const w = Math.max(1, width || 0);
  const h = Math.max(1, height || 0);
  const steps = scaleSteps(fontScale);
  const search = (t: WidgetTexts): WidgetLayout | null => {
    for (const scale of steps) {
      for (const figure of FIGURE_SIZES) {
        for (const tier of TIERS) {
          for (const { pad, glass } of ARRANGEMENTS) {
            if (!(tier.pads as readonly number[]).includes(pad)) continue;
            const undoPlaces: ('beside' | 'glass' | null)[] = !t.undo ? [null] : glass === 'under' ? ['beside', 'glass'] : ['beside'];
            for (const undoAt of undoPlaces) {
              const p = plan({ width: w, height: h, scale, figure, tier, pad, glass, undoAt, texts: t });
              if (p?.fits) return p;
            }
          }
        }
      }
    }
    return null;
  };
  // Only where nothing fits with the Undo is it left out, before anything would be cut.
  const found = search(texts) ?? (texts.undo ? search({ ...texts, undo: null }) : null);
  if (found) return found;
  // Below the widget's least size nothing fits: the sparest plan at the smallest step, marked as not fitting.
  const sparest = { width: w, height: h, scale: steps[steps.length - 1] ?? cleanScale(fontScale), figure: FIGURE_SIZES[FIGURE_SIZES.length - 1], tier: TIERS[TIERS.length - 1], pad: 5, undoAt: null, texts: { ...texts, undo: null } };
  return plan({ ...sparest, glass: 'beside' }) ?? plan({ ...sparest, glass: 'under', force: true })!;
}

/** The message drawing ("Set up HealthCal", "Not saved"): its title and line broken into lines, each line drawn as its own one-line text. */
export interface MessageLayout {
  fits: boolean;
  scale: number;
  pad: number;
  textW: number;
  title: LineBox[];
  line: LineBox[];
  cup: { width: number; height: number };
}

const MESSAGE_PAD = 14;
const MESSAGE_CUP = { width: 30, height: 44 };
const MESSAGE_CUP_GAP = 12;
/** Between the title and the line under it. */
const MESSAGE_GAP = 2;

/** The message drawing's layout for `width` x `height` dp at `fontScale`: the largest step at which every line fits. */
export function messageLayout(width: number, height: number, fontScale: number, title: string, line: string): MessageLayout {
  const inner = Math.max(1, width || 0) - 2 * (MESSAGE_PAD + ROOM.border);
  const innerH = Math.max(1, height || 0) - 2 * (MESSAGE_PAD + ROOM.border) - ROOM.slack;
  const textW = inner - cupBox(MESSAGE_CUP.width, MESSAGE_CUP.height).width - MESSAGE_CUP_GAP;
  let result: MessageLayout | null = null;
  for (const scale of scaleSteps(fontScale)) {
    const titleSize = Math.round(spToDp(TYPE.title, scale));
    const lineSize = Math.round(spToDp(TYPE.line, scale));
    const titles = wrapWords(title, 'numbers', titleSize, textW).map((t) => box(t, 'numbers', titleSize));
    const lines = wrapWords(line, 'words', lineSize, textW).map((t) => box(t, 'words', lineSize));
    const tall = titles.reduce((n, b) => n + b.height, 0) + MESSAGE_GAP + lines.reduce((n, b) => n + b.height, 0);
    const wide = [...titles, ...lines].every((b) => b.width <= textW);
    result = { fits: wide && tall <= innerH, scale, pad: MESSAGE_PAD, textW, title: titles, line: lines, cup: MESSAGE_CUP };
    if (result.fits) return result;
  }
  return result!;
}
