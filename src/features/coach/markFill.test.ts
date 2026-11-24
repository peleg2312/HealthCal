import { describe, expect, it } from 'vitest';

import { contrast } from '@/theme/contrast';
import { blossomColors, butterColors, chartFillOpacity, darkColors, honeyColors, javaColors, lightColors } from '@/theme/tokens';

import { coachMarkFill } from './markFill';

const PALETTES = { dark: darkColors, light: lightColors, blossom: blossomColors, butter: butterColors, honey: honeyColors, java: javaColors } as const;

describe('coachMarkFill', () => {
  it('holds the level line and the fill at 3:1 in every palette where it can be done', () => {
    for (const [name, c] of Object.entries(PALETTES)) {
      const f = coachMarkFill(c, chartFillOpacity[name as keyof typeof PALETTES]);
      // The numbers it reports are the real ones.
      expect(f.rimOnFill).toBeCloseTo(contrast(c.rim, f.color), 5);
      expect(f.fillOnPage).toBeCloseTo(contrast(f.color, c.bg), 5);
      if (name === 'blossom') continue;
      expect(f.holds, name).toBe(true);
      expect(f.of, name).toBe('primary');
    }
  });

  it('in Blossom, where no tint can hold both, keeps the two as even as they go', () => {
    const c = blossomColors;
    // Both at 3:1 would need the line 9:1 off the page.
    expect(contrast(c.rim, c.bg)).toBeLessThan(9);
    const f = coachMarkFill(c, chartFillOpacity.blossom);
    expect(f.holds).toBe(false);
    expect(Math.min(f.rimOnFill, f.fillOnPage)).toBeGreaterThanOrEqual(2);
  });

  it('is a tint, never the solid primary where that hides the level line', () => {
    for (const c of [blossomColors, butterColors, honeyColors]) expect(coachMarkFill(c, 0.42).rimOnFill).toBeGreaterThan(1.5);
  });
});
