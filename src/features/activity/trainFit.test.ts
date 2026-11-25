import { describe, expect, it } from 'vitest';

import { actionChrome, actionsLayout, stripColumnMin, weekRangeShort } from './trainFit';

describe("Train's two actions with text grown", () => {
  it('counts the large kit button around its label', () => {
    expect(actionChrome(20)).toBe(71);
    expect(actionChrome(20, 14)).toBe(59);
  });
  it('keeps the designed halves until both labels and the row are measured', () => {
    expect(actionsLayout([], 20, 341, 12)).toBe('halves');
    expect(actionsLayout([0, 60], 20, 341, 12)).toBe('halves');
    expect(actionsLayout([90, 60], 20, 0, 12)).toBe('halves');
  });
  it('keeps the halves while the wider label fits its half', () => {
    // 381 px wide (the owner's phone): a row of 341, halves of 164.5.
    expect(actionsLayout([92, 66], 20, 341, 12)).toBe('halves');
    expect(actionsLayout([93, 66], 20, 341, 12)).toBe('own');
    // 412 px at 130%: halves of 180.
    expect(actionsLayout([108, 80], 20, 372, 12)).toBe('halves');
  });
  it('gives each its own width, then the tighter side room, before the two would stack', () => {
    // 381 px at 115%: "Log activity" about 98 px, "Workout" about 72: 170 + 144 + 12 fits 341.
    expect(actionsLayout([98, 72], 20, 341, 12)).toBe('own');
    // 381 px at 130%: about 111 and 81: 183 + 153 + 12 = 348 does not fit 341; with 14 px a side they do.
    expect(actionsLayout([111, 81], 20, 341, 12)).toBe('tight');
  });
  it('counts a whole pixel more on a width measured in whole pixels, so a row never wraps by itself', () => {
    // 92 + 1 + 71 = 164 fits 164.5; 92.5 measured as 93 does not.
    expect(actionsLayout([92], 20, 341, 12)).toBe('halves');
    expect(actionsLayout([93], 20, 341, 12)).toBe('own');
  });
});

describe("the week card's strip with text grown", () => {
  it('shares the row while seven columns of the widest number fit, as designed', () => {
    expect(stripColumnMin(0, 244)).toBe(0);
    // "75" at 130%: about 20 px, in a 32 px column: 224 fits a 301 px row (381 px phone).
    expect(stripColumnMin(20, 301)).toBe(0);
  });
  it('gives each column room for its number and scrolls where three-figure days do not fit (320 px at 130%)', () => {
    // "240" about 29 px: 29 + 1 + 8 = 38 a column, 266 > 244.
    expect(stripColumnMin(29, 244)).toBe(38);
    // Two figures keep sharing the narrow row: a 32 px column holds "75" with room to spare.
    expect(stripColumnMin(20, 244)).toBe(0);
  });
});

describe("Train's header overline in short", () => {
  it('says the week by its dates, with the month once unless the week crosses one', () => {
    expect(weekRangeShort('2026-11-23')).toBe('Nov 23–29');
    expect(weekRangeShort('2026-11-30')).toBe('Nov 30–Dec 6');
    expect(weekRangeShort('2026-12-28')).toBe('Dec 28–Jan 3');
  });
});
