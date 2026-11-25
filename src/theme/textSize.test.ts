import { describe, expect, it } from 'vitest';

import {
  bolder,
  drawnFontSize,
  LARGE_TEXT,
  MAX_TEXT_GROWTH,
  normaliseTextSize,
  phoneCapFor,
  scaledFontSize,
  scaleTextStyle,
  TEXT_SIZES,
  textGrowth,
  textSizeLabel,
  VERY_LARGE_TEXT,
} from './textSize';
import { fonts } from './tokens';

describe('the app text size', () => {
  it('offers 100% to 200%', () => {
    expect(TEXT_SIZES[0]).toBe(1);
    expect(TEXT_SIZES[TEXT_SIZES.length - 1]).toBe(2);
    expect(TEXT_SIZES.map(textSizeLabel)).toEqual(['100%', '115%', '130%', '150%', '175%', '200%']);
  });

  it('reads a stored value as the nearest size, and anything else as 100%', () => {
    expect(normaliseTextSize('2')).toBe(2);
    expect(normaliseTextSize(1.6)).toBe(1.5);
    expect(normaliseTextSize(9)).toBe(2);
    expect(normaliseTextSize(null)).toBe(1);
    expect(normaliseTextSize('big')).toBe(1);
    expect(normaliseTextSize(-1)).toBe(1);
  });

  it("lets the phone's setting add only what keeps the two together at 2x", () => {
    expect(MAX_TEXT_GROWTH).toBe(2);
    for (const s of TEXT_SIZES) expect(s * phoneCapFor(s)).toBeGreaterThanOrEqual(1.99);
    for (const s of TEXT_SIZES) expect(s * phoneCapFor(s)).toBeLessThanOrEqual(2.01);
    expect(phoneCapFor(1)).toBe(2);
    expect(phoneCapFor(2)).toBe(1);
  });

  it('doubles every reading size up to 16 px at 200% and grows large text less, as Android 14 does', () => {
    expect(scaledFontSize(12.5, 2)).toBe(25);
    expect(scaledFontSize(13, 2)).toBe(26);
    expect(scaledFontSize(14, 2)).toBe(28);
    expect(scaledFontSize(15, 2)).toBe(30);
    expect(scaledFontSize(16, 2)).toBe(32);
    for (let px = 8; px <= 16; px += 0.5) expect(scaledFontSize(px, 2), `${px} px`).toBe(px * 2);
    expect(scaledFontSize(30, 2)).toBe(50);
    expect(scaledFontSize(60, 2)).toBeLessThan(90);
    expect(scaledFontSize(120, 2)).toBe(120);
    expect(scaledFontSize(14, 1.5)).toBe(21);
    expect(scaledFontSize(14, 1)).toBe(14);
  });

  it('grows the size, the line height and the letter spacing together', () => {
    expect(scaleTextStyle({ fontSize: 12, lineHeight: 17, letterSpacing: -0.2, color: 'x' }, 2, false)).toEqual({ fontSize: 24, lineHeight: 34, letterSpacing: -0.4, color: 'x', fontFamily: undefined });
    const same = { fontSize: 15 };
    expect(scaleTextStyle(same, 1, false)).toBe(same);
  });

  it('steps each family one weight up for Bold Text', () => {
    expect(bolder(fonts.regular)).toBe(fonts.semibold);
    expect(bolder(fonts.semibold)).toBe(fonts.bold);
    expect(bolder(fonts.bold)).toBe(fonts.bold);
    expect(bolder(fonts.display)).toBe(fonts.extrabold);
    expect(scaleTextStyle({ fontFamily: fonts.medium, fontSize: 13 }, 1, true)).toEqual({ fontFamily: fonts.semibold, fontSize: 13, lineHeight: undefined, letterSpacing: undefined });
  });
});

describe('large text (textGrowth, LARGE_TEXT)', () => {
  it('is 1 at the designed size and the app size when the phone adds nothing', () => {
    expect(textGrowth(1)).toBe(1);
    expect(textGrowth(1, 1)).toBe(1);
    expect(textGrowth(1.5, 1)).toBe(1.5);
    expect(textGrowth(2)).toBe(2);
  });

  it("adds the phone's setting only as far as the two together stay at 2x", () => {
    expect(textGrowth(1, 1.3)).toBe(1.3);
    expect(textGrowth(1, 3)).toBe(2);
    expect(textGrowth(2, 1.5)).toBe(2);
    expect(textGrowth(1.5, 2)).toBeCloseTo(2, 1);
  });

  it('reads an unreadable phone scale as 1', () => {
    expect(textGrowth(1.15, Number.NaN)).toBe(1.15);
    expect(textGrowth(1.15, 0)).toBe(1.15);
  });

  it('turns the large layouts on from 130%, never at 115%', () => {
    expect(textGrowth(1.15)).toBeLessThanOrEqual(LARGE_TEXT);
    for (const s of TEXT_SIZES.filter((x) => x >= 1.3)) expect(textGrowth(s)).toBeGreaterThan(LARGE_TEXT);
    expect(textGrowth(1, 1.3)).toBeGreaterThan(LARGE_TEXT);
  });
});

describe('very large text (VERY_LARGE_TEXT) and the drawn size', () => {
  it("keeps the phone's common steps under it: Android's 1.15 and 1.3, iOS up to xxxLarge, the app's 115% and 130%", () => {
    for (const phone of [1.15, 1.3, 1.353]) expect(textGrowth(1, phone)).toBeLessThanOrEqual(VERY_LARGE_TEXT);
    for (const app of [1.15, 1.3]) expect(textGrowth(app)).toBeLessThanOrEqual(VERY_LARGE_TEXT);
    // Both a step up together: 115% here on a phone at 1.15.
    expect(textGrowth(1.15, 1.15)).toBeLessThanOrEqual(VERY_LARGE_TEXT);
  });

  it("is past it from Android's 1.5, iOS's first accessibility size and the app's 150%", () => {
    for (const phone of [1.5, 1.65, 1.8, 2]) expect(textGrowth(1, phone)).toBeGreaterThan(VERY_LARGE_TEXT);
    for (const s of TEXT_SIZES.filter((x) => x >= 1.5)) expect(textGrowth(s)).toBeGreaterThan(VERY_LARGE_TEXT);
    expect(VERY_LARGE_TEXT).toBeGreaterThan(LARGE_TEXT);
  });

  it('draws a size as designed at 100% with no phone scale', () => {
    for (const s of [12, 15, 17, 26, 60]) expect(drawnFontSize(s, 1, 1)).toBe(s);
  });

  it("grows by the app's nonlinear size, then by the phone's scale as far as the two stay at 2x", () => {
    expect(drawnFontSize(15, 1.3)).toBe(19.5);
    expect(drawnFontSize(26, 1.3)).toBe(scaledFontSize(26, 1.3));
    expect(drawnFontSize(26, 1, 1.3)).toBe(33.8);
    expect(drawnFontSize(15, 2, 1.5)).toBe(30);
    expect(drawnFontSize(15, 1, 3)).toBe(30);
    expect(drawnFontSize(15, 1.15, Number.NaN)).toBe(scaledFontSize(15, 1.15));
  });
});
