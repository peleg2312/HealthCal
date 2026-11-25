import { describe, expect, it } from 'vitest';

import { isMeasured } from './measured';

describe('isMeasured', () => {
  it('takes a width that was laid out', () => {
    expect(isMeasured(1)).toBe(true);
    expect(isMeasured(0.5)).toBe(true);
    expect(isMeasured(341, 52)).toBe(true);
  });

  it('ignores the 0 a hidden screen reports, for a width and for a box', () => {
    expect(isMeasured(0)).toBe(false);
    expect(isMeasured(0, 0)).toBe(false);
    expect(isMeasured(341, 0)).toBe(false);
    expect(isMeasured(0, 52)).toBe(false);
  });

  it('ignores what is not a size', () => {
    expect(isMeasured(Number.NaN)).toBe(false);
    expect(isMeasured(-4)).toBe(false);
    expect(isMeasured(120, Number.NaN)).toBe(false);
  });
});
