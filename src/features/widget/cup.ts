/**
 * The Pour cup as an SVG string for the widget's `SvgWidget` (the widget is a picture, so the kit's
 * `Vessel` cannot draw it). Pure, tested (cup.test.ts). The same rules as `Vessel` (src/ui/Vessel.tsx):
 *
 * - an open tumbler: straight sides and a round base outlined in `vesselEdge` (never the top), the
 *   empty part in `vesselEmpty`, a flat fill rising from the base with the level line (`rim`) on it;
 * - a budget ('limit'): exercise headroom hatched at the top in `headroom` above a dashed line, and
 *   past the budget an amber cap (`warning`) across the cup at its own width, never past its walls;
 * - a goal to reach ('reach'): at or past it the cup is brim-full and the level line becomes the brim
 *   line, wider than the cup and heavier. Never amber.
 *
 * The SVG's box is the cup plus room above its open top for the cap or the brim (`CUP_TOP`) and room
 * at each side for the brim (`cupSide`): draw it at `cupBox(width, height)`.
 */
import { vesselBase } from '@/theme/tokens';
import { brimOverhang, fillRatio, goalState, type GoalKind } from '@/ui/vesselLayout';

const EDGE = 1.5;
/** Room above the cup's open top, for the amber cap and the brim line. */
export const CUP_TOP = 4;

export interface CupColors {
  fill: string;
  empty: string;
  edge: string;
  rim: string;
  headroom: string;
  warning: string;
}

export interface CupSpec {
  /** The cup itself, in dp: the box is wider and taller (`cupBox`). */
  width: number;
  height: number;
  value: number;
  max: number;
  kind: GoalKind;
  /** Calories added by workouts at the top of a budget, hatched. */
  headroom?: number;
  /** Level line thickness: 3 on a cup over 40 tall, 2.5 below. */
  rimWidth?: number;
  colors: CupColors;
  /** Pixels per dp, so the picture is drawn at the size it is shown (no scaling). */
  density?: number;
}

/** The room at each side of the cup: the brim line's overhang. */
export function cupSide(width: number): number {
  return brimOverhang(width);
}

/** The SVG's box for a cup of `width` x `height`: the cup, the brim's room at each side and the room above its top. */
export function cupBox(width: number, height: number): { width: number; height: number } {
  return { width: width + 2 * cupSide(width), height: height + CUP_TOP };
}

const n = (v: number) => String(Math.round(v * 100) / 100);
const esc = (c: string) => c.replace(/[^#0-9A-Za-z(),. ]/g, '');

/** The SVG text of one cup. */
export function cupSvg(spec: CupSpec): string {
  const { width: w, height: h, value, max, kind, colors } = spec;
  const rimW = spec.rimWidth ?? (h > 40 ? 3 : 2.5);
  const side = cupSide(w);
  const box = cupBox(w, h);
  const density = spec.density && spec.density > 0 ? spec.density : 1;
  const x0 = side;
  const x1 = side + w;
  const y0 = CUP_TOP;
  const y1 = CUP_TOP + h;
  const r = vesselBase(h, w);
  const ratio = fillRatio(value, max);
  const state = goalState(value, max, kind);
  const level = y0 + (1 - ratio) * h;
  // An id of its own, so two cups drawn into one document never share a clip.
  const clip = `in-${kind}-${n(w)}x${n(h)}`;
  const parts: string[] = [];

  const inside = `M${n(x0)},${n(y0)} H${n(x1)} V${n(y1 - r)} A${n(r)},${n(r)} 0 0 1 ${n(x1 - r)},${n(y1)} H${n(x0 + r)} A${n(r)},${n(r)} 0 0 1 ${n(x0)},${n(y1 - r)} Z`;
  parts.push(`<defs><clipPath id="${clip}"><path d="${inside}"/></clipPath></defs>`);
  parts.push(`<path d="${inside}" fill="${esc(colors.empty)}"/>`);

  // Hatched headroom: what workouts add to the budget, at the top of the cup above a dashed line.
  const headH = kind === 'limit' && max > 0 ? Math.min(h, (Math.max(0, spec.headroom ?? 0) / max) * h) : 0;
  if (headH > 0.5) {
    const lines: string[] = [];
    for (let x = -headH; x < w + 6; x += 6) lines.push(`<line x1="${n(x0 + x)}" y1="${n(y0 + headH)}" x2="${n(x0 + x + headH)}" y2="${n(y0)}"/>`);
    parts.push(`<g clip-path="url(#${clip})"><g stroke="${esc(colors.headroom)}" stroke-width="1.5" opacity="0.75">${lines.join('')}</g>`);
    parts.push(`<line x1="${n(x0)}" y1="${n(y0 + headH)}" x2="${n(x1)}" y2="${n(y0 + headH)}" stroke="${esc(colors.edge)}" stroke-width="${EDGE}" stroke-dasharray="3 3"/></g>`);
  }

  // The fill and its level line. At 0 nothing is drawn, so no hairline of colour sits on the base.
  if (ratio > 0) {
    parts.push(`<g clip-path="url(#${clip})"><rect x="${n(x0)}" y="${n(level)}" width="${n(w)}" height="${n(y1 - level)}" fill="${esc(colors.fill)}"/>`);
    if (state !== 'reached') parts.push(`<rect x="${n(x0)}" y="${n(level - rimW / 2)}" width="${n(w)}" height="${n(rimW)}" fill="${esc(colors.rim)}"/>`);
    parts.push('</g>');
  }

  // The outline: the sides and the round base, never the open top.
  const e = EDGE / 2;
  const re = Math.max(0, r - e);
  parts.push(
    `<path d="M${n(x0 + e)},${n(y0)} V${n(y1 - r)} A${n(re)},${n(re)} 0 0 0 ${n(x0 + r)},${n(y1 - e)} H${n(x1 - r)} A${n(re)},${n(re)} 0 0 0 ${n(x1 - e)},${n(y1 - r)} V${n(y0)}" fill="none" stroke="${esc(colors.edge)}" stroke-width="${EDGE}"/>`,
  );

  if (state === 'over') {
    // The amber cap across the open top at the cup's own width: only the brim line reaches past the walls.
    parts.push(`<rect x="${n(x0)}" y="${n(y0 - 2.5)}" width="${n(w)}" height="5" rx="1" fill="${esc(colors.warning)}"/>`);
  } else if (state === 'reached') {
    // The brim line: the level line lying across the open top, wider than the cup and heavier.
    const brimH = rimW + (side >= 5 ? 2 : 1);
    parts.push(`<rect x="0" y="${n(y0 - brimH / 2)}" width="${n(box.width)}" height="${n(brimH)}" rx="1" fill="${esc(colors.rim)}"/>`);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${n(box.width * density)}" height="${n(box.height * density)}" viewBox="0 0 ${n(box.width)} ${n(box.height)}">${parts.join('')}</svg>`;
}
