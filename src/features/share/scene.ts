/**
 * The share cards as a list of flat drawing primitives, in card units
 * (a day card is 360 x 640, a week card 360 x 450; the image is 3x that).
 * Pure: the same scene is drawn on screen by `CardArt` (react-native-svg) and
 * painted into a PNG on web by `paint.ts` (canvas), so the preview and the
 * saved image are one design.
 *
 * The Pour rules hold here too: flat fills, the 3 px level line on every fill
 * (2.5 in small cups), cups with square shoulders and a round base and no lip,
 * the empty part in `vesselEmpty` outlined in `vesselEdge`, amber only for the
 * part over a budget, numbers in ink (calories in `caloriesInk`).
 */
import { formatNumber } from '@/lib/units';
import type { ThemeColors } from '@/theme/tokens';
import { fonts } from '@/theme/tokens';

import type { DayCardContent, ShareStat, WeekCardContent, WeekCup } from './content';

export type FontRole = keyof typeof fonts;

export interface Run {
  text: string;
  font: FontRole;
  size: number;
  fill: string;
  letterSpacing?: number;
}

export type Prim =
  | { k: 'rect'; x: number; y: number; w: number; h: number; fill: string; opacity?: number }
  | { k: 'path'; d: string; fill?: string; stroke?: string; sw?: number; dash?: number[]; opacity?: number }
  | { k: 'text'; x: number; y: number; runs: Run[]; anchor?: 'start' | 'middle' | 'end' }
  | { k: 'clip'; d: string; children: Prim[] };

export interface Scene {
  width: number;
  height: number;
  prims: Prim[];
}

export type CardColors = Pick<
  ThemeColors,
  | 'bg'
  | 'surface'
  | 'border'
  | 'text'
  | 'textSecondary'
  | 'primary'
  | 'calories'
  | 'caloriesInk'
  | 'water'
  | 'exercise'
  | 'warning'
  | 'rim'
  | 'headroom'
  | 'vesselEdge'
  | 'vesselEmpty'
  | 'borderStrong'
>;

export const DAY_SIZE = { width: 360, height: 640 };
export const WEEK_SIZE = { width: 360, height: 450 };
/** Pixels per card unit in the saved image: 1080 x 1920 and 1080 x 1350. */
export const EXPORT_SCALE = 3;

const PAD = 28;
const MEAL_LABEL = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snacks' } as const;
/** The meal bands from breakfast up: the calorie colour at 100, 85, 70 and 55%. */
export const BAND_OPACITY = [1, 0.85, 0.7, 0.55];
/** A partly logged day in a week row: the recap's lighter fill. */
export const PARTIAL_OPACITY = 0.45;
/** Height of one meal label beside the cup. */
const LABEL_STEP = 16;


const r1 = (n: number) => Math.round(n * 100) / 100;

/** The open cup's outline: two sides and a round base, no top edge. */
export function cupOutline(x: number, y: number, w: number, h: number, base: number): string {
  const r = Math.min(base, w / 2, h);
  return `M ${r1(x)} ${r1(y)} L ${r1(x)} ${r1(y + h - r)} Q ${r1(x)} ${r1(y + h)} ${r1(x + r)} ${r1(y + h)} L ${r1(x + w - r)} ${r1(y + h)} Q ${r1(x + w)} ${r1(y + h)} ${r1(x + w)} ${r1(y + h - r)} L ${r1(x + w)} ${r1(y)}`;
}

/** The cup's inside as a closed shape (for the empty fill and for clipping). */
export function cupShape(x: number, y: number, w: number, h: number, base: number): string {
  return `${cupOutline(x, y, w, h, base)} Z`;
}

/** "/" hatch lines over a box, to be clipped. */
function hatch(x: number, y: number, w: number, h: number, color: string, step = 5): Prim[] {
  const out: Prim[] = [];
  for (let i = -h; i < w + step; i += step) out.push({ k: 'path', d: `M ${r1(x + i)} ${r1(y + h)} L ${r1(x + i + h)} ${r1(y)}`, stroke: color, sw: 1.4 });
  return out;
}

/**
 * A cup filled to `level` (0..1 of its height; above 1 it stays full with an
 * amber band over the top part). Fill bands go bottom first.
 */
function cup(
  c: CardColors,
  o: {
    x: number;
    y: number;
    w: number;
    h: number;
    base: number;
    level: number;
    color: string;
    bands?: { top: number; opacity: number }[];
    headroom?: number;
    rim?: number;
    edge?: number;
    future?: boolean;
    hatchFill?: boolean;
    /** Width of the level line between bands (default a 1.2 px hairline). */
    seam?: number;
  },
): Prim[] {
  const { x, y, w, h, base } = o;
  const rim = o.rim ?? 3;
  const edge = o.edge ?? 1.5;
  if (o.future) return [{ k: 'path', d: cupOutline(x, y, w, h, base), stroke: c.borderStrong, sw: edge, dash: [3, 3] }];
  const shape = cupShape(x, y, w, h, base);
  const level = Math.max(0, o.level);
  const shown = Math.min(1, level);
  const top = y + h - shown * h;
  const inner: Prim[] = [];
  // Hatched exercise headroom at the top of the budget, above the fill.
  if (o.headroom && o.headroom > 0) {
    const hy = y;
    const hh = Math.min(h, o.headroom * h);
    const visible = Math.max(0, Math.min(hh, top - hy));
    if (visible > 0) inner.push(...hatch(x, hy, w, visible, c.headroom));
  }
  if (shown > 0) {
    const bands = o.bands?.length ? o.bands : [{ top: level, opacity: 1 }];
    let prevTop = y + h;
    for (const b of bands) {
      const bt = y + h - Math.min(1, b.top) * h;
      if (bt >= prevTop) continue;
      if (o.hatchFill) inner.push(...hatch(x, bt, w, prevTop - bt, o.color, 4));
      else inner.push({ k: 'rect', x, y: bt, w, h: prevTop - bt, fill: o.color, opacity: b.opacity });
      // A thin level line between meals (o.seam px), the full level line on top.
      if (bt > top + 0.5) inner.push({ k: 'rect', x, y: bt - (o.seam ?? 1.2) / 2, w, h: o.seam ?? 1.2, fill: c.rim, opacity: o.seam ? 1 : 0.55 });
      prevTop = bt;
      if (bt <= top) break;
    }
    // Over the budget: the amber part sits at the top, scaled to how far over it is.
    if (level > 1) inner.push({ k: 'rect', x, y, w, h: Math.max(rim + 3, Math.min(h * 0.35, (level - 1) * h)), fill: c.warning });
  }
  const out: Prim[] = [
    { k: 'path', d: shape, fill: c.vesselEmpty },
    { k: 'clip', d: shape, children: inner },
  ];
  if (shown > 0) out.push({ k: 'rect', x, y: top - rim / 2, w, h: rim, fill: c.rim });
  out.push({ k: 'path', d: cupOutline(x, y, w, h, base), stroke: c.vesselEdge, sw: edge });
  return out;
}

/** Estimated text width (Hanken / Bricolage average glyph widths), for layout only. */
export function textWidth(text: string, size: number, font: FontRole): number {
  const factor = font === 'extrabold' ? 0.6 : font.startsWith('display') || font.startsWith('num') ? 0.57 : font === 'bold' || font === 'semibold' ? 0.56 : 0.53;
  return text.length * size * factor;
}

/** Break text into lines that fit `width`, at most `max` lines (the last one ends in an ellipsis when cut). */
export function wrap(text: string, width: number, size: number, font: FontRole, max = 2): string[] {
  // Split on plain spaces only: a no-break space keeps a number with its unit.
  const words = text.split(/ +/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (textWidth(next, size, font) <= width || !line) line = next;
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  if (lines.length > max) {
    const kept = lines.slice(0, max);
    kept[max - 1] = `${kept[max - 1].replace(/[,.;:]?$/, '')}…`;
    return kept;
  }
  return lines;
}

/** The HealthCal mark: a small cup in the primary with its level line, and the wordmark. */
function mark(c: CardColors, x: number, baseline: number): Prim[] {
  return [
    ...cup(c, { x, y: baseline - 17, w: 14, h: 18, base: 5, level: 0.62, color: c.primary, rim: 2, edge: 1.3 }),
    { k: 'text', x: x + 22, y: baseline, runs: [{ text: 'HealthCal', font: 'display', size: 17, fill: c.text, letterSpacing: -0.2 }] },
  ];
}

function statColor(c: CardColors, s: ShareStat): string {
  return s.key === 'water' ? c.water : s.key === 'activity' ? c.exercise : s.key === 'kcal' || s.key === 'budget' ? c.calories : c.text;
}

/** Rows of stats: a small key and a number with its unit, the label under it (up to two lines). */
export const STAT_ROW_H = 64;

function statRow(c: CardColors, stats: ShareStat[], x: number, y: number, width: number): { prims: Prim[]; height: number } {
  const prims: Prim[] = [];
  const perRow = stats.length === 4 ? 2 : 3;
  const rows = Math.ceil(stats.length / perRow);
  stats.forEach((s, i) => {
    const row = Math.floor(i / perRow);
    const inRow = Math.min(perRow, stats.length - row * perRow);
    const col = i % perRow;
    const colW = width / Math.max(inRow, perRow === 2 ? 2 : Math.min(3, stats.length));
    const cx = x + col * colW;
    const cy = y + row * STAT_ROW_H;
    if (col > 0) prims.push({ k: 'rect', x: cx - 10, y: cy + 2, w: 1, h: STAT_ROW_H - 16, fill: c.border });
    // The key: a tiny cup in the stat's colour (the number itself stays ink).
    prims.push({ k: 'path', d: cupShape(cx, cy + 9, 10, 12, 4), fill: statColor(c, s) });
    // Step the number down until it and its unit fit the column (never cut a unit).
    const room = colW - 28;
    const size = [26, 22, 18, 15].find((n) => textWidth(s.value, n, 'numBold') + textWidth(` ${s.unit}`, n < 20 ? 11 : 13, 'semibold') <= room) ?? 15;
    prims.push({
      k: 'text',
      x: cx + 16,
      y: cy + 22,
      runs: [
        { text: s.value, font: 'numBold', size, fill: c.text, letterSpacing: -0.4 },
        { text: s.unit ? ` ${s.unit}` : '', font: 'semibold', size: size < 20 ? 11 : 13, fill: c.text },
      ],
    });
    wrap(s.label, colW - 14, 12, 'semibold', 2).forEach((line, j) =>
      prims.push({ k: 'text', x: cx, y: cy + 40 + j * 15, runs: [{ text: line, font: 'semibold', size: 12, fill: c.textSecondary }] }),
    );
  });
  return { prims, height: rows * STAT_ROW_H - 6 };
}

/** The week's seven cups with the weekday under each. `highlight` puts the day in an ink box. */
function weekRow(c: CardColors, cups: WeekCup[], x: number, y: number, width: number, cupW: number, cupH: number, highlight?: string, checks = false): Prim[] {
  const prims: Prim[] = [];
  const slot = width / 7;
  cups.forEach((d, i) => {
    const cx = x + i * slot + (slot - cupW) / 2;
    prims.push(
      ...cup(c, {
        x: cx,
        y,
        w: cupW,
        h: cupH,
        base: Math.min(10, cupW / 3),
        level: d.ratio,
        color: c.calories,
        // The recap's rule: today is hatched (still open), a partly logged day is the lighter fill.
        bands: [{ top: d.ratio, opacity: d.partial ? PARTIAL_OPACITY : 1 }],
        hatchFill: d.isToday,
        rim: 2.5,
        edge: 1.3,
        future: d.future,
      }),
    );
    if (checks && d.inBand) {
      const mx = cx + cupW / 2;
      prims.push({ k: 'path', d: `M ${r1(mx - 4.5)} ${r1(y - 9)} l 3.2 3.2 l 5.8 -6.6`, stroke: c.text, sw: 2 });
    }
    const isDay = highlight === d.date;
    const ly = y + cupH + 17;
    if (isDay) prims.push({ k: 'path', d: cupShape(x + i * slot + slot / 2 - 10, ly - 13, 20, 18, 7), fill: c.text });
    prims.push({ k: 'text', x: x + i * slot + slot / 2, y: ly, anchor: 'middle', runs: [{ text: d.letter, font: 'bold', size: 12, fill: isDay ? c.bg : c.textSecondary }] });
  });
  return prims;
}

interface MealLabel {
  text: string;
  kcal: string | null;
  opacity: number;
  /** Baseline at the middle of the band. */
  want: number;
}

/** One label per meal band, bottom first, wanting the middle of its band. */
function mealLabels(content: DayCardContent, cupTop: number, cupH: number): MealLabel[] {
  let prev = cupTop + cupH;
  return content.cup.bands.map((b, i) => {
    const top = cupTop + cupH - Math.min(1, b.top) * cupH;
    const want = (top + prev) / 2 + 4;
    prev = top;
    return { text: MEAL_LABEL[b.meal], kcal: b.kcal ? formatKcal(b.kcal) : null, opacity: BAND_OPACITY[Math.min(i, BAND_OPACITY.length - 1)], want };
  });
}

const formatKcal = (n: number) => `${formatNumber(n)} kcal`;

/**
 * Baselines for the meal labels between `min` and `max`: each as near the
 * middle of its band as it can be, never closer than one line to the next,
 * in band order. When there is not room for all of them they are spaced
 * evenly from `min` down (a label is never dropped).
 */
export function placeLabels(labels: MealLabel[], min: number, max: number): (MealLabel & { y: number })[] {
  const n = labels.length;
  if (!n) return [];
  if ((n - 1) * LABEL_STEP > max - min) return labels.map((l, i) => ({ ...l, y: min + (n - 1 - i) * LABEL_STEP }));
  // Bottom first: each label as low as its band wants, but at least a line above the one below it.
  const ys: number[] = [];
  labels.forEach((l, i) => ys.push(Math.min(Math.max(l.want, min), max, i ? ys[i - 1] - LABEL_STEP : Infinity)));
  // Then top down: anything pushed above `min` comes back down, a line apart.
  for (let i = n - 1; i >= 0; i--) {
    const floor = i === n - 1 ? min : ys[i + 1] + LABEL_STEP;
    if (ys[i] < floor) ys[i] = floor;
  }
  return labels.map((l, i) => ({ ...l, y: ys[i] }));
}

export function dayScene(content: DayCardContent, c: CardColors): Scene {
  const { width: W, height: H } = DAY_SIZE;
  const inner = W - 2 * PAD;
  const prims: Prim[] = [{ k: 'rect', x: 0, y: 0, w: W, h: H, fill: c.bg }];

  prims.push({ k: 'text', x: PAD, y: 54, runs: [{ text: content.overline, font: 'bold', size: 11, fill: c.textSecondary, letterSpacing: 1.3 }] });
  prims.push({ k: 'text', x: PAD, y: 96, runs: [{ text: content.title, font: 'extrabold', size: 40, fill: c.text, letterSpacing: -1.2 }] });

  // What goes under the cup decides how tall the cup can be.
  const foodLines = content.foods ? wrap(content.foods, inner, 13.5, 'regular', 2) : [];
  const below =
    16 + 30 + // verdict
    (content.stats.length ? 36 + STAT_ROW_H : 0) +
    (foodLines.length ? 26 + 14 + foodLines.length * 19 : 0) +
    (content.week ? 30 + 34 + 22 : 0);
  const footer = 56;
  const cupTop = 128;
  const cupH = Math.max(120, Math.min(250, H - footer - below - cupTop));
  const cupW = Math.round(cupH * 0.56);

  // The hero cup, filled in meal bands from breakfast up, each a step lighter, with a level line between them.
  const level = content.cup.level;
  const bands = content.cup.bands.map((b, i) => ({ top: b.top, opacity: BAND_OPACITY[Math.min(i, BAND_OPACITY.length - 1)] }));
  prims.push(
    ...cup(c, {
      x: PAD,
      y: cupTop,
      w: cupW,
      h: cupH,
      base: 26,
      level,
      color: c.calories,
      bands,
      headroom: content.cup.headroom,
      hatchFill: false,
      seam: 2,
    }),
  );

  // Beside the cup: the headline at the height it describes, and every meal named
  // at the height of its band, with a key in that band's strength.
  const lx = PAD + cupW + 22;
  const cupBottom = cupTop + cupH;
  const levelY = cupTop + cupH - Math.min(1, level) * cupH;
  const valueSize = textWidth(content.headline.value, 52, 'extrabold') > W - PAD - lx ? 40 : 52;
  const unitLines = wrap(content.headline.unit, W - PAD - lx, 14, 'semibold', 2);
  const blockH = 66 + (unitLines.length - 1) * 18 + 8;
  const labels = mealLabels(content, cupTop, cupH);
  // The labels sit under the headline; when they need the room, the headline moves up (never above the title).
  const preferred = Math.max(cupTop + 6, Math.min(cupTop + cupH - 62, levelY - 22));
  const blockTop = labels.length ? Math.max(cupTop - 20, Math.min(preferred, cupBottom + 4 - (labels.length - 1) * LABEL_STEP - 10 - blockH)) : preferred;
  const blockBottom = blockTop + blockH;
  prims.push({ k: 'rect', x: PAD + cupW + 4, y: Math.max(cupTop, levelY) - 0.75, w: 12, h: 1.5, fill: c.borderStrong });
  prims.push({
    k: 'text',
    x: lx,
    y: blockTop + 44,
    runs: [{ text: content.headline.value, font: 'extrabold', size: valueSize, fill: c.caloriesInk, letterSpacing: -1.6 }],
  });
  unitLines.forEach((line, i) =>
    prims.push({ k: 'text', x: lx, y: blockTop + 66 + i * 18, runs: [{ text: line, font: 'semibold', size: 14, fill: c.textSecondary }] }),
  );
  for (const l of placeLabels(labels, blockBottom + 10, cupBottom + 4)) {
    prims.push({ k: 'path', d: cupShape(lx, l.y - 9, 8, 10, 3), fill: c.calories, opacity: l.opacity });
    prims.push({
      k: 'text',
      x: lx + 14,
      y: l.y,
      runs: [
        { text: l.text, font: 'semibold', size: 12, fill: c.textSecondary },
        { text: l.kcal ? ` ${l.kcal}` : '', font: 'semibold', size: 12, fill: c.text },
      ],
    });
  }

  let y = cupTop + cupH + 16 + 26;
  prims.push({ k: 'text', x: PAD, y, runs: [{ text: content.verdict, font: 'display', size: 22, fill: c.text, letterSpacing: -0.3 }] });
  y += 4;

  if (content.stats.length) {
    y += 20;
    prims.push({ k: 'rect', x: PAD, y, w: inner, h: 1, fill: c.border });
    y += 16;
    const row = statRow(c, content.stats, PAD, y, inner);
    prims.push(...row.prims);
    y += row.height;
  }

  if (foodLines.length) {
    y += 26;
    prims.push({ k: 'text', x: PAD, y, runs: [{ text: 'ON THE PLATE', font: 'bold', size: 10.5, fill: c.textSecondary, letterSpacing: 1.2 }] });
    foodLines.forEach((line, i) => prims.push({ k: 'text', x: PAD, y: y + 20 + i * 19, runs: [{ text: line, font: 'regular', size: 13.5, fill: c.text }] }));
    y += 14 + foodLines.length * 19;
  }

  if (content.week) {
    y += 30;
    prims.push(...weekRow(c, content.week, PAD, y, inner, 22, 28, content.date));
  }

  prims.push(...mark(c, PAD, H - 30));
  if (content.inProgress) {
    prims.push({ k: 'text', x: W - PAD, y: H - 31, anchor: 'end', runs: [{ text: 'Day in progress', font: 'semibold', size: 12, fill: c.textSecondary }] });
  }
  return { width: W, height: H, prims };
}

export function weekScene(content: WeekCardContent, c: CardColors): Scene {
  const { width: W, height: H } = WEEK_SIZE;
  const inner = W - 2 * PAD;
  const prims: Prim[] = [{ k: 'rect', x: 0, y: 0, w: W, h: H, fill: c.bg }];
  prims.push({ k: 'text', x: PAD, y: 50, runs: [{ text: content.overline, font: 'bold', size: 11, fill: c.textSecondary, letterSpacing: 1.3 }] });
  prims.push({ k: 'text', x: PAD, y: 90, runs: [{ text: content.title, font: 'extrabold', size: 38, fill: c.text, letterSpacing: -1.1 }] });
  const lines = wrap(content.headline, inner, 19, 'display', 2);
  lines.forEach((line, i) => prims.push({ k: 'text', x: PAD, y: 122 + i * 24, runs: [{ text: line, font: 'display', size: 19, fill: c.text, letterSpacing: -0.2 }] }));
  const cupsY = 122 + lines.length * 24 + 24;
  // Two rows of stats leave less room for the cups.
  const cupH = content.stats.length > 3 ? 46 : 62;
  prims.push(...weekRow(c, content.cups, PAD, cupsY, inner, 30, cupH, undefined, true));
  const statsY = cupsY + cupH + 36;
  prims.push({ k: 'rect', x: PAD, y: statsY - 12, w: inner, h: 1, fill: c.border });
  prims.push(...statRow(c, content.stats, PAD, statsY, inner).prims);
  prims.push(...mark(c, PAD, H - 20));
  if (content.inProgress) {
    prims.push({ k: 'text', x: W - PAD, y: H - 21, anchor: 'end', runs: [{ text: 'Week in progress', font: 'semibold', size: 12, fill: c.textSecondary }] });
  }
  return { width: W, height: H, prims };
}
