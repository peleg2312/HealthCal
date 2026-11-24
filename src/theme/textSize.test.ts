import { describe, expect, it } from 'vitest';

import { bolder, MAX_TEXT_GROWTH, normaliseTextSize, phoneCapFor, scaleTextStyle, TEXT_SIZES, textSizeLabel } from './textSize';
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

  it('grows the size, the line height and the letter spacing together', () => {
    expect(scaleTextStyle({ fontSize: 15, lineHeight: 21, letterSpacing: -0.2, color: 'x' }, 2, false)).toEqual({ fontSize: 30, lineHeight: 42, letterSpacing: -0.4, color: 'x', fontFamily: undefined });
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
