import { describe, expect, it } from 'vitest';

import { LARGE_TEXT, textGrowth } from './textGrowth';

describe('textGrowth', () => {
  it('is 1 at the designed size, with the phone at its own default', () => {
    expect(textGrowth(1)).toBe(1);
    expect(textGrowth(1, 1)).toBe(1);
  });

  it('doubles reading text at 200%, and the phone adds nothing on top of it', () => {
    expect(textGrowth(2)).toBe(2);
    expect(textGrowth(2, 1.5)).toBe(2);
  });

  it("counts the phone's own setting at 100%, up to 2x", () => {
    expect(textGrowth(1, 1.3)).toBe(1.3);
    expect(textGrowth(1, 3)).toBe(2);
  });

  it('turns the large layouts on from 130%, never at 115%', () => {
    expect(textGrowth(1.15)).toBeLessThanOrEqual(LARGE_TEXT);
    expect(textGrowth(1.3)).toBeGreaterThan(LARGE_TEXT);
    expect(textGrowth(1, 1.3)).toBeGreaterThan(LARGE_TEXT);
  });
});
