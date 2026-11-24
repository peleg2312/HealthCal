import { describe, expect, it } from 'vitest';

import { ACTIVITIES } from '@/data/activities';

import { effortOf, effortSpan } from './effortWords';

describe('effort in plain words', () => {
  it('uses the guideline thresholds', () => {
    expect(effortOf(2.9)).toBe('light');
    expect(effortOf(3)).toBe('moderate');
    expect(effortOf(5.9)).toBe('moderate');
    expect(effortOf(6)).toBe('hard');
    expect(effortSpan(2.8, 4.3)).toBe('light to moderate');
    expect(effortSpan(7, 12)).toBe('hard');
    expect(effortSpan(2, 8)).toBe('light to hard');
  });

  it('gives every bundled activity a span with no "MET"', () => {
    for (const a of ACTIVITIES) expect(effortSpan(a.met.light, a.met.vigorous)).toMatch(/^(light|moderate|hard)( to (moderate|hard))?$/);
  });
});
