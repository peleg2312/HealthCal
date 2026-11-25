/**
 * The month's and the year's cups as geometry and flat drawing primitives (the share card's `Prim`s), so the
 * screen and the shared image draw one design. Pure.
 *
 * Each row is drawn in four layers, bottom first, so the screen can pour a whole row with one transform:
 *   under  the empty inside of every cup (`vesselEmpty`)
 *   fills  each day's fill as a plain rectangle up to its level, with the level line on top (`rim`); a partly
 *          logged day in the lighter fill, today hatched. On screen this layer slides up from below the row,
 *          clipped at the cups' base, so every cup fills from the bottom with its level line riding on top.
 *   frame  the round base's two corners in the colour behind the cups (so a rectangle never shows past the
 *          curve), the outline in `vesselEdge`, and a day still to come as a dashed outline (`dashEdge`)
 *   marks  amber at the top of a day above its budget (across the cup's own width, never past its walls) and,
 *          in a month, the check over a fully logged day on budget; on screen they appear as the pour lands
 *
 * Pour's rules hold: flat fills, the level line on every fill (2.5 px in a month's cups, thinner in a year's
 * tiny ones), square shoulders and a round base with no lip, the empty part in `vesselEmpty`.
 */
import { cupOutline, cupShape, type CardColors, type Prim } from '@/features/share/scene';

import { YEAR_SLOTS, type CupCell, type CupRow, type PeriodKind } from './period';

/** The lighter fill of a partly logged day, as on the check-in, the calendar and the week card. */
export const PARTIAL_OPACITY = 0.45;

export type GridColors = Pick<CardColors, 'calories' | 'rim' | 'warning' | 'vesselEdge' | 'vesselEmpty' | 'dashEdge' | 'text'>;

export interface GridGeometry {
  kind: PeriodKind;
  width: number;
  /** A year's month names at the left of each row; 0 for a month. */
  labelW: number;
  /** A month's weekday letters over the columns; 0 for a year. */
  headerH: number;
  /** Width given to each day. */
  slot: number;
  cupW: number;
  cupH: number;
  /** Room above the cups in a row (the check, the amber cap, a full cup's level line). */
  top: number;
  /** A row's box: `top` + `cupH`. */
  rowH: number;
  rowGap: number;
  base: number;
  rim: number;
  edge: number;
  /** The whole grid, header included. */
  height: number;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * Sizes for `rowCount` rows drawn `width` wide: at most `maxHeight` tall when given (the share card); `labelW`
 * (a year's month names), `headerH` (a month's weekday letters) and `minPitch` (a year's rows, top to top) grow on
 * screen with the text size.
 */
export function gridGeometry(kind: PeriodKind, rowCount: number, width: number, o: { maxHeight?: number; labelW?: number; headerH?: number; minPitch?: number } = {}): GridGeometry {
  const n = Math.max(1, rowCount);
  const { maxHeight } = o;
  if (kind === 'month') {
    const headerH = o.headerH ?? 18;
    const top = 14;
    const rowGap = 4;
    const slot = width / 7;
    let cupW = clamp(slot * 0.62, 12, 32);
    if (maxHeight) {
      // cupH = 1.27 cupW: shrink the cups until the weeks fit.
      const room = (maxHeight - headerH - n * top - (n - 1) * rowGap) / n;
      cupW = clamp(Math.min(cupW, room / 1.27), 12, 32);
    }
    const cupH = Math.round(cupW * 1.27);
    cupW = Math.round(cupW);
    const rowH = top + cupH;
    return { kind, width, labelW: 0, headerH, slot, cupW, cupH, top, rowH, rowGap, base: Math.min(9, cupW / 3), rim: 2.5, edge: 1.3, height: headerH + n * rowH + (n - 1) * rowGap };
  }
  const labelW = o.labelW ?? 30;
  const slot = (width - labelW) / YEAR_SLOTS;
  const cupW = Math.max(3, slot - Math.max(1.5, slot * 0.24));
  let cupH = clamp(Math.round(cupW * 2.1), 10, 26);
  let rowGap = Math.max(4, Math.round(cupH * 0.35));
  const top = 2;
  if (maxHeight) {
    const room = (maxHeight - n * top - (n - 1) * rowGap) / n;
    if (room < cupH) {
      cupH = Math.max(7, Math.floor(room));
      rowGap = Math.max(3, Math.min(rowGap, Math.floor((maxHeight - n * (top + cupH)) / Math.max(1, n - 1))));
    }
  }
  const rowH = top + cupH;
  // Rows never closer than their month names' line (large text), so the names keep their room.
  if (o.minPitch) rowGap = Math.max(rowGap, Math.ceil(o.minPitch - rowH));
  return { kind, width, labelW, headerH: 0, slot, cupW, cupH, top, rowH, rowGap, base: Math.min(2.5, cupW / 2.5), rim: cupW >= 8 ? 2 : 1.5, edge: 1, height: n * rowH + (n - 1) * rowGap };
}

/** Where a row's top sits in the grid. */
export const rowTop = (g: GridGeometry, i: number): number => g.headerH + i * (g.rowH + g.rowGap);

/** The left edge of a day's cup in its row (the year's month label to its left included). */
export const cupLeft = (g: GridGeometry, col: number): number => g.labelW + col * g.slot + (g.slot - g.cupW) / 2;

/** A weekday's centre over a month's columns. */
export const columnCentre = (g: GridGeometry, col: number): number => g.labelW + col * g.slot + g.slot / 2;

export interface RowPrims {
  under: Prim[];
  fills: Prim[];
  frame: Prim[];
  marks: Prim[];
}

const r1 = (n: number) => Math.round(n * 100) / 100;

/** "/" lines over a box, as the day and week cards hatch today. */
function hatchLines(x: number, y: number, w: number, h: number, color: string, step: number): Prim[] {
  const out: Prim[] = [];
  for (let i = -h; i < w + step; i += step) out.push({ k: 'path', d: `M ${r1(x + i)} ${r1(y + h)} L ${r1(x + i + h)} ${r1(y)}`, stroke: color, sw: 1.1 });
  return out;
}

/** The two corners of the round base outside the curve, filled with what lies behind the cup. */
function corners(x: number, y: number, w: number, h: number, r: number, color: string): Prim[] {
  const b = y + h;
  return [
    { k: 'path', d: `M ${r1(x)} ${r1(b - r)} L ${r1(x)} ${r1(b)} L ${r1(x + r)} ${r1(b)} Q ${r1(x)} ${r1(b)} ${r1(x)} ${r1(b - r)} Z`, fill: color },
    { k: 'path', d: `M ${r1(x + w)} ${r1(b - r)} L ${r1(x + w)} ${r1(b)} L ${r1(x + w - r)} ${r1(b)} Q ${r1(x + w)} ${r1(b)} ${r1(x + w)} ${r1(b - r)} Z`, fill: color },
  ];
}

/**
 * One row's four layers, in row coordinates moved by (ox, oy): the row's box starts at oy, its cups' tops at
 * oy + g.top. `behind` is the colour the grid sits on (the card's surface on screen, the card's paper in the image).
 */
export function rowPrims(c: GridColors, g: GridGeometry, row: CupRow, behind: string, ox = 0, oy = 0): RowPrims {
  const out: RowPrims = { under: [], fills: [], frame: [], marks: [] };
  const y = oy + g.top;
  row.cells.forEach((cell, col) => {
    if (!cell) return;
    const x = ox + cupLeft(g, col);
    const { cupW: w, cupH: h, base } = g;
    if (cell.future) {
      out.frame.push({ k: 'path', d: cupOutline(x, y, w, h, base), stroke: c.dashEdge, sw: g.edge, dash: g.kind === 'month' ? [3, 3] : [1.5, 1.5] });
      return;
    }
    out.under.push({ k: 'path', d: cupShape(x, y, w, h, base), fill: c.vesselEmpty });
    pushFill(out.fills, c, g, cell, x, y);
    out.frame.push(...corners(x, y, w, h, Math.min(base, w / 2, h), behind));
    out.frame.push({ k: 'path', d: cupOutline(x, y, w, h, base), stroke: c.vesselEdge, sw: g.edge });
    if (cell.over) {
      const capH = g.kind === 'month' ? 5 : Math.max(2, Math.min(3, h * 0.2));
      out.marks.push({ k: 'rect', x, y: y - capH / 2, w, h: capH, fill: c.warning });
    }
    // The check is the recap's: a fully logged day on budget, never a day above it. Too small to draw in a year.
    if (g.kind === 'month' && cell.onBudget) {
      const mx = x + w / 2;
      const s = Math.min(1, w / 26);
      out.marks.push({ k: 'path', d: `M ${r1(mx - 4.5 * s)} ${r1(y - 8 * s)} l ${r1(3.2 * s)} ${r1(3.2 * s)} l ${r1(5.8 * s)} ${r1(-6.6 * s)}`, stroke: c.text, sw: 2 });
    }
  });
  return out;
}

function pushFill(fills: Prim[], c: GridColors, g: GridGeometry, cell: CupCell, x: number, y: number) {
  const level = Math.min(1, Math.max(0, cell.ratio));
  if (level <= 0) return;
  const top = y + g.cupH * (1 - level);
  const h = y + g.cupH - top;
  if (cell.isToday) {
    // Today is still open: hatched, as the check-in draws it.
    const box = `M ${r1(x)} ${r1(top)} L ${r1(x + g.cupW)} ${r1(top)} L ${r1(x + g.cupW)} ${r1(top + h)} L ${r1(x)} ${r1(top + h)} Z`;
    fills.push({ k: 'clip', d: box, children: hatchLines(x, top, g.cupW, h, c.calories, g.kind === 'month' ? 4 : 3) });
  } else {
    fills.push({ k: 'rect', x, y: top, w: g.cupW, h, fill: c.calories, opacity: cell.partial ? PARTIAL_OPACITY : 1 });
  }
  fills.push({ k: 'rect', x, y: top - g.rim / 2, w: g.cupW, h: g.rim, fill: c.rim });
}

/** The whole grid at rest, every layer in order (the shared image, which does not pour). */
export function gridPrims(c: GridColors, g: GridGeometry, rows: CupRow[], behind: string, ox: number, oy: number): Prim[] {
  const layers = rows.map((row, i) => rowPrims(c, g, row, behind, ox, oy + rowTop(g, i)));
  return [...layers.flatMap((l) => l.under), ...layers.flatMap((l) => l.fills), ...layers.flatMap((l) => l.frame), ...layers.flatMap((l) => l.marks)];
}
