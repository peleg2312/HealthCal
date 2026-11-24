import { describe, expect, it } from 'vitest';

import { contrast } from './contrast';
import { cssRgbToHex, forcedColorsPalette, mix, moreContrastChartFill, moreContrastColors } from './contrastMore';
import { PALETTES, type ThemeColors } from './tokens';

const NAMES = Object.keys(PALETTES) as (keyof typeof PALETTES)[];

function under(rows: [string, string, string, number][]): string[] {
  return rows.filter(([, a, b, min]) => contrast(a, b) < min).map(([what, a, b, min]) => `${what}: ${contrast(a, b).toFixed(2)} < ${min}`);
}

describe.each(NAMES)('%s with more contrast', (name) => {
  const base = PALETTES[name];
  const c = moreContrastColors(base);
  const grounds = ['bg', 'bgElevated', 'surface', 'surfaceAlt'] as const;
  const pages = ['bg', 'bgElevated', 'surface'] as const;
  const rows = (k: keyof ThemeColors, on: readonly (keyof ThemeColors)[], min: number) => on.map((g) => [`${name} ${k} on ${g}`, c[k], c[g], min] as [string, string, string, number]);

  it('puts secondary text and the accent and status inks at 7:1, and the tertiary text at 4.5:1 on every surface', () => {
    expect(under([...rows('text', grounds, 7), ...rows('textSecondary', grounds, 7), ...rows('primaryInk', grounds, 7), ...rows('warningInk', grounds, 7), ...rows('danger', grounds, 7), ...rows('textTertiary', grounds, 4.5), ...rows('caloriesInk', pages, 7)])).toEqual([]);
  });

  it('draws card hairlines at 3:1 and every outline at 4.5:1', () => {
    expect(under([...rows('border', pages, 3), ...rows('borderStrong', pages, 4.5), ...rows('fieldEdge', pages, 4.5), ...rows('vesselEdge', pages, 4.5)])).toEqual([]);
  });

  it('changes something the person can see, and keeps the data colours and the level line', () => {
    expect(c.textSecondary).not.toBe(base.textSecondary);
    for (const k of ['calories', 'protein', 'carbs', 'fat', 'water', 'exercise', 'sleep', 'weight', 'rim', 'bg', 'surface'] as const) expect(c[k], k).toBe(base[k]);
  });
});

describe('bar tints with more contrast', () => {
  it('are drawn at least at 70%', () => {
    expect(moreContrastChartFill(0.42)).toBe(0.7);
    expect(moreContrastChartFill(1)).toBe(1);
  });
});

describe('forced colours', () => {
  const light = { Canvas: '#FFFFFF', CanvasText: '#000000', LinkText: '#0000EE', Highlight: '#3390FF', HighlightText: '#FFFFFF', Mark: '#FFFF00' };
  const dark = { Canvas: '#000000', CanvasText: '#FFFFFF', LinkText: '#FFFF00', Highlight: '#1AEBFF', HighlightText: '#000000' };

  it.each(NAMES)('%s: the system colours on every token, with every fill drawn and told from the page', (name) => {
    for (const sys of [light, dark]) {
      const c = forcedColorsPalette(sys, PALETTES[name]);
      expect([c.bg, c.surface, c.vesselEmpty, c.track, c.tabBar]).toEqual(Array(5).fill(sys.Canvas));
      expect([c.text, c.textSecondary, c.textTertiary, c.rim, c.vesselEdge, c.fieldEdge]).toEqual(Array(6).fill(sys.CanvasText));
      for (const k of ['calories', 'water', 'protein', 'primary'] as const) expect(c[k], k).toBe(sys.Highlight);
      // The over mark differs from the fill under it and from the page.
      expect(c.warning).not.toBe(c.calories);
      expect(c.warning).not.toBe(c.bg);
      expect(contrast(c.onPrimary, c.primary)).toBeGreaterThanOrEqual(3);
    }
  });

  it('reads a computed colour as hex', () => {
    expect(cssRgbToHex('rgb(255, 255, 0)')).toBe('#FFFF00');
    expect(cssRgbToHex('rgba(0, 0, 0, 0.5)')).toBe('#000000');
    expect(cssRgbToHex('Canvas')).toBeNull();
    expect(mix('#000000', '#FFFFFF', 0.5)).toBe('#808080');
  });
});
