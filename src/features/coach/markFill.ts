/**
 * The fill of the coach's cup (./CoachMark.tsx), worked out from the palette so the cup shows its
 * level line in every look (fix X6): the level line (`rim`) at 3:1 on the fill, and the fill at 3:1
 * on the page it sits on. Pure.
 *
 * The fill is a tint of the primary colour over the page, the way bar charts tint theirs
 * (`withOpacity(colors.primary, chartFill)`): of the tints that hold both rules, the one closest to the
 * theme's chart opacity; else the same search on the calorie colour. A palette where no tint can hold
 * both (Blossom: its level line is only 4.7:1 on its page, and both rules at 3:1 need 9:1) takes the
 * primary tint that keeps the two ratios as even as possible (about 2.1:1 each); the cup's outline
 * (`vesselEdge`, 3:1 on the page) still draws its shape. src/theme/contrast.test.ts checks every palette.
 */
import { contrast, over } from '@/theme/contrast';

export interface MarkPalette {
  primary: string;
  calories: string;
  rim: string;
  bg: string;
}

export interface MarkFill {
  /** The opaque fill colour (the tint already laid over the page). */
  color: string;
  /** Which data colour it is a tint of, and at what opacity. */
  of: 'primary' | 'calories';
  opacity: number;
  /** The level line on the fill, and the fill on the page. */
  rimOnFill: number;
  fillOnPage: number;
  /** Both at 3:1. */
  holds: boolean;
}

const STEPS = Array.from({ length: 41 }, (_, i) => Math.round((0.2 + i * 0.02) * 100) / 100);

function tint(p: MarkPalette, of: 'primary' | 'calories', opacity: number): MarkFill {
  const color = over(p[of], p.bg, opacity);
  const rimOnFill = contrast(p.rim, color);
  const fillOnPage = contrast(color, p.bg);
  return { color, of, opacity, rimOnFill, fillOnPage, holds: rimOnFill >= 3 && fillOnPage >= 3 };
}

const cache = new WeakMap<object, MarkFill>();

/** The coach cup's fill for this palette and chart opacity (`useTheme().chartFill`). */
export function coachMarkFill(p: MarkPalette, chartFill: number): MarkFill {
  // A palette object always comes with its own chart opacity, so the palette alone is the key.
  const hit = cache.get(p);
  if (hit) return hit;
  const byNearness = [...STEPS].sort((a, b) => Math.abs(a - chartFill) - Math.abs(b - chartFill) || a - b);
  let found: MarkFill | null = null;
  for (const of of ['primary', 'calories'] as const) {
    for (const o of byNearness) {
      const t = tint(p, of, o);
      if (t.holds) {
        found = t;
        break;
      }
    }
    if (found) break;
  }
  if (!found) {
    // No tint holds both: the primary tint whose weaker ratio is the strongest.
    for (const o of STEPS) {
      const t = tint(p, 'primary', o);
      if (!found || Math.min(t.rimOnFill, t.fillOnPage) > Math.min(found.rimOnFill, found.fillOnPage)) found = t;
    }
  }
  const result = found as MarkFill;
  cache.set(p, result);
  return result;
}
