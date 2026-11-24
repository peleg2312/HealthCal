/**
 * The fill and the drop of the AI's cup (./AiMark.tsx; the coach's mark is the same cup), worked out
 * from the palette so the cup shows its level line in every look: the level line (`rim`) at 3:1 on the
 * fill, and the fill at 3:1 on the page it sits on. Pure.
 *
 * The fill is a tint of the look's cup colour over the page, the way bar charts tint theirs
 * (`withOpacity(colors.primary, chartFill)`): of the tints that hold both rules, the one closest to the
 * theme's chart opacity. The cup colour is the primary, unless the primary is an ink (as dark as the
 * text, luminance under `INK_LUMINANCE`: Butter's and Honey's Sceptre Red), whose tints read as mud
 * brown on butter paper; such a look's cup is its calorie colour (Butter's raspberry, Honey's gold).
 * - Primary looks: the primary's tints, else the calorie colour's; a palette where no tint can hold
 *   both (Blossom: its level line is only 4.7:1 on its page, and both rules at 3:1 need 9:1) takes the
 *   primary tint that keeps the two ratios as even as possible (about 2.1:1 each); the cup's outline
 *   (`vesselEdge`, 3:1 on the page) still draws its shape.
 * - Ink-primary looks: the calorie colour's tints; where even the solid colour is too light for the
 *   page (Honey's gold is 2.8:1 on butter paper), it is darkened toward the level line by the least
 *   that holds (`shade`, a few per cent, so the gold stays gold).
 * src/theme/contrast.test.ts checks every palette.
 *
 * The drop (`dropColor`) is the level line's colour wherever that is 3:1 on the page and on a card,
 * else the text colour (./mark.test.ts holds it for all six palettes).
 */
import { contrast, luminance, over } from '@/theme/contrast';

export interface MarkPalette {
  primary: string;
  calories: string;
  rim: string;
  bg: string;
}

export interface MarkFill {
  /** The opaque fill colour (the tint already laid over the page). */
  color: string;
  /** Which colour it is a tint of, at what opacity, and how far it was darkened toward the level line (0: not). */
  of: 'primary' | 'calories';
  opacity: number;
  shade: number;
  /** The level line on the fill, and the fill on the page. */
  rimOnFill: number;
  fillOnPage: number;
  /** Both at 3:1. */
  holds: boolean;
}

const STEPS = Array.from({ length: 41 }, (_, i) => Math.round((0.2 + i * 0.02) * 100) / 100);
/** Darkening toward the level line, for a cup colour too light for its page: 2% steps, at most 30%. */
const SHADES = Array.from({ length: 15 }, (_, i) => Math.round((i + 1) * 0.02 * 100) / 100);
/** A primary darker than this is an ink (the text's darkness), not a cup colour: its tints read as mud. */
export const INK_LUMINANCE = 0.05;

function measured(p: MarkPalette, of: 'primary' | 'calories', opacity: number, shade: number, color: string): MarkFill {
  const rimOnFill = contrast(p.rim, color);
  const fillOnPage = contrast(color, p.bg);
  return { color, of, opacity, shade, rimOnFill, fillOnPage, holds: rimOnFill >= 3 && fillOnPage >= 3 };
}

function tint(p: MarkPalette, of: 'primary' | 'calories', opacity: number): MarkFill {
  return measured(p, of, opacity, 0, over(p[of], p.bg, opacity));
}

function shaded(p: MarkPalette, of: 'primary' | 'calories', shade: number): MarkFill {
  return measured(p, of, 1, shade, over(p.rim, p[of], shade));
}

/** The colour the AI's cup is a tint of in this look: the primary, or the calorie colour where the primary is an ink. */
export function markColorOf(p: Pick<MarkPalette, 'primary'>): 'primary' | 'calories' {
  return luminance(p.primary) < INK_LUMINANCE ? 'calories' : 'primary';
}

const cache = new WeakMap<object, MarkFill>();

/** The AI cup's fill for this palette and chart opacity (`useTheme().chartFill`). The coach's mark is the same cup. */
export function coachMarkFill(p: MarkPalette, chartFill: number): MarkFill {
  // A palette object always comes with its own chart opacity, so the palette alone is the key.
  const hit = cache.get(p);
  if (hit) return hit;
  const byNearness = [...STEPS].sort((a, b) => Math.abs(a - chartFill) - Math.abs(b - chartFill) || a - b);
  const own = markColorOf(p);
  let found: MarkFill | null = null;
  // An ink primary's tints are never the cup: only the calorie colour, tinted, else darkened a little.
  for (const of of own === 'calories' ? (['calories'] as const) : (['primary', 'calories'] as const)) {
    for (const o of byNearness) {
      const t = tint(p, of, o);
      if (t.holds) {
        found = t;
        break;
      }
    }
    if (found) break;
  }
  if (!found && own === 'calories') found = SHADES.map((s) => shaded(p, 'calories', s)).find((t) => t.holds) ?? null;
  if (!found) {
    // No tint holds both: the tint of the cup colour whose weaker ratio is the strongest.
    for (const o of STEPS) {
      const t = tint(p, own, o);
      if (!found || Math.min(t.rimOnFill, t.fillOnPage) > Math.min(found.rimOnFill, found.fillOnPage)) found = t;
    }
  }
  const result = found as MarkFill;
  cache.set(p, result);
  return result;
}

export { coachMarkFill as aiMarkFill };

/**
 * The colour of the drop above the AI's cup: the level line's colour where it can be seen (3:1) on
 * the page and on a card, else the text colour.
 */
export function dropColor(p: { rim: string; text: string; bg: string; surface: string }): string {
  return contrast(p.rim, p.bg) >= 3 && contrast(p.rim, p.surface) >= 3 ? p.rim : p.text;
}
