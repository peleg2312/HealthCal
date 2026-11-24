import { describe, expect, it } from 'vitest';

import { textGrowth } from './textGrowth';

describe('textGrowth', () => {
  it('is the app size when the phone adds nothing', () => {
    expect(textGrowth(1, 1)).toBe(1);
    expect(textGrowth(2, 1)).toBe(2);
    expect(textGrowth(1.5, 1)).toBe(1.5);
  });
  it('adds the phone setting only as far as the two together stay at 2x', () => {
    expect(textGrowth(1, 1.3)).toBe(1.3);
    expect(textGrowth(1, 3)).toBe(2);
    expect(textGrowth(2, 1.5)).toBe(2);
    expect(textGrowth(1.5, 2)).toBeCloseTo(2, 1);
  });
  it('reads an unreadable phone scale as 1', () => {
    expect(textGrowth(1.15, Number.NaN)).toBe(1.15);
    expect(textGrowth(1.15, 0)).toBe(1.15);
  });
});
