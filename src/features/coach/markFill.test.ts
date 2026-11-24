import { describe, expect, it } from 'vitest';

import { contrast, deltaE, over } from '@/theme/contrast';
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
      // Butter and Honey: their primary is an ink (Sceptre Red), so their cup is their calorie colour.
      expect(f.of, name).toBe(name === 'butter' || name === 'honey' ? 'calories' : 'primary');
    }
  });

  it("in Butter and Honey is the look's own cup colour (raspberry, gold), never a tint of the dark primary", () => {
    for (const [name, c] of [['butter', butterColors], ['honey', honeyColors]] as const) {
      const f = coachMarkFill(c, chartFillOpacity[name]);
      expect(f.of, name).toBe('calories');
      // Close to the look's calorie cup: the same colour, a little lighter (Butter) or darker (Honey).
      expect(deltaE(f.color, c.calories), name).toBeLessThan(10);
      // Far from what it was: the dark primary's tint, a mud brown.
      for (const o of [0.42, 0.5]) expect(deltaE(f.color, over(c.primary, c.bg, o)), name).toBeGreaterThan(15);
    }
    // Honey's gold is too light for butter paper even solid (2.8:1): it is darkened by a few per cent, not swapped.
    const honey = coachMarkFill(honeyColors, chartFillOpacity.honey);
    expect(honey.shade).toBeGreaterThan(0);
    expect(honey.shade).toBeLessThanOrEqual(0.1);
    const butter = coachMarkFill(butterColors, chartFillOpacity.butter);
    expect(butter.shade).toBe(0);
  });

  it('keeps the primary in the other four looks, as before', () => {
    for (const [name, c] of [['dark', darkColors], ['light', lightColors], ['blossom', blossomColors], ['java', javaColors]] as const) {
      expect(coachMarkFill(c, chartFillOpacity[name]).of, name).toBe('primary');
      expect(coachMarkFill(c, chartFillOpacity[name]).shade, name).toBe(0);
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
