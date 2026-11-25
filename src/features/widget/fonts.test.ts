/**
 * The bundled fonts' widths and line boxes, as read from the TTF files, and the measures the layout
 * builds on them. The checks against the owner's screenshot (Pixel 10, font size 1.15) are the
 * evidence that the line boxes are the ones Android draws.
 */
import { describe, expect, it } from 'vitest';

import { advance, baselineOf, HEIGHT_PAD, lineHeight, textWidth, WIDTH_PAD, WIDTH_SLACK, wrapWords } from './fonts';

describe('advance', () => {
  it('sums the fonts’ own advance widths (em)', () => {
    expect(advance('2,239', 'numbers')).toBeCloseTo(2.66, 3);
    expect(advance('213 ml of 2.9 L', 'numbers')).toBeCloseTo(6.699, 3);
    expect(advance('+ 250 ml', 'strong')).toBeCloseTo(3.881, 3);
    expect(advance('Water', 'words')).toBeCloseTo(2.812, 3);
  });

  it('counts a no-break space as a space, direction marks and joiners as nothing, and an unknown letter as the widest', () => {
    expect(advance('1 L', 'numbers')).toBeCloseTo(advance('1 L', 'numbers'), 6);
    expect(advance('‎2,239⁠', 'numbers')).toBeCloseTo(advance('2,239', 'numbers'), 6);
    expect(advance('é', 'words')).toBeCloseTo(0.964, 3);
  });
});

describe('textWidth', () => {
  it('adds the slack for kerning and a pad for pixels, and the letter spacing after each character', () => {
    expect(textWidth('Water', 'words', 12)).toBeCloseTo(2.812 * 12 * WIDTH_SLACK + WIDTH_PAD, 3);
    expect(textWidth('WED', 'strong', 11, 0.1)).toBeCloseTo((advance('WED', 'strong') + 0.3) * 11 * WIDTH_SLACK + WIDTH_PAD, 3);
    expect(textWidth('', 'words', 12)).toBe(0);
  });

  it('is wider than the owner’s phone drew each line (screenshot at font size 1.15, measured ink widths)', () => {
    // "+ 250 ml" at 16 dp: 62.7 dp of ink; "213 ml of 2.9 L" was cut at its 85 dp column although it needs about 121 dp.
    expect(textWidth('+ 250 ml', 'strong', 16)).toBeGreaterThan(62.7);
    expect(textWidth('213 ml of 2.9 L', 'numbers', 18)).toBeGreaterThan(120);
  });
});

describe('lineHeight', () => {
  it('is the TextView line box: max(bbox top, ascender) plus max(bbox bottom, descender), and a pad', () => {
    expect(lineHeight('numbers', 30)).toBeCloseTo(1.532 * 30 + HEIGHT_PAD, 3);
    expect(lineHeight('words', 12)).toBeCloseTo(1.303 * 12 + HEIGHT_PAD, 3);
    expect(lineHeight('strong', 12)).toBeCloseTo(1.303 * 12 + HEIGHT_PAD, 3);
  });

  it('holds the lines as the owner’s phone stacked them (screenshot at font size 1.15)', () => {
    // "kcal" over "left" at 13.8 dp: baselines 18.5 dp apart, one line box each.
    expect(lineHeight('strong', 13.8)).toBeGreaterThanOrEqual(18.5);
    // The 30 dp figure's line reaches 11.7 dp below its baseline: the old layout gave the whole figure 32 dp.
    expect(lineHeight('numbers', 30) - baselineOf('numbers', 30)).toBeGreaterThanOrEqual(11.4);
    expect(lineHeight('numbers', 30)).toBeGreaterThan(46);
  });
});

describe('wrapWords', () => {
  it('breaks at spaces as a TextView does, and keeps a word that is too long whole on its own line', () => {
    expect(wrapWords('Calories left and water show here after set-up.', 'words', 13, 120)).toEqual(['Calories left and', 'water show here', 'after set-up.']);
    expect(wrapWords('Set up HealthCal', 'numbers', 18, 400)).toEqual(['Set up HealthCal']);
    expect(wrapWords('Supercalifragilistic', 'words', 13, 40)).toEqual(['Supercalifragilistic']);
  });
});
