import { describe, expect, it } from 'vitest';

import { amountRowWraps, GLASS_TILE_MIN, glassTileMin, measuredLines, titleRowLayout } from './grownFit';

describe('glassTileMin', () => {
  it('is the designed 72 px until the words are measured, and while they fit it', () => {
    expect(glassTileMin(0, 3)).toBe(GLASS_TILE_MIN);
    expect(glassTileMin(Number.NaN, 3)).toBe(GLASS_TILE_MIN);
    // "500 ml" at the designed size, 55 px: 55 + 1 + 2 * (3 + 4) = 70, under 72.
    expect(glassTileMin(55, 3)).toBe(72);
  });
  it('grows to the widest words, their room and the water edge where they need more', () => {
    // "500 ml" at 130%, about 70 px: 85 px, so four tiles do not fit a 381 px window (79 px each) but do at 412 (87).
    expect(glassTileMin(70, 3)).toBe(85);
    // At 115%, about 63 px: 78 px, four a row at 381.
    expect(glassTileMin(63, 3)).toBe(78);
  });
});

describe('titleRowLayout', () => {
  const base = { titleW: 122, buttonsW: 212, buttonsShort: false, fullW: 70, shortW: 38, rowW: 372, gap: 8 };
  it('keeps the designed line until everything is measured', () => {
    expect(titleRowLayout({ ...base, titleW: 0 })).toBe('full');
    expect(titleRowLayout({ ...base, rowW: 0 })).toBe('full');
    expect(titleRowLayout({ ...base, shortW: 0, rowW: 100 })).toBe('full');
  });
  it('keeps "Edit sizes" while the title and both buttons fit the row, a whole pixel spare for each', () => {
    expect(titleRowLayout(base)).toBe('full');
    // 122 + 1 + 8 + 212 + 1 = 344.
    expect(titleRowLayout({ ...base, rowW: 344 })).toBe('full');
  });
  it('says "Sizes" first where the full label does not fit, then wraps', () => {
    expect(titleRowLayout({ ...base, rowW: 343 })).toBe('short');
    expect(titleRowLayout({ ...base, rowW: 312 })).toBe('short');
    expect(titleRowLayout({ ...base, rowW: 311 })).toBe('wrap');
  });
  it('reads buttons measured with the short label against the full one, so it never flips back and forth', () => {
    const short = { ...base, buttonsW: 180, buttonsShort: true };
    expect(titleRowLayout({ ...short, rowW: 372 })).toBe('full');
    expect(titleRowLayout({ ...short, rowW: 343 })).toBe('short');
    expect(titleRowLayout({ ...short, rowW: 311 })).toBe('wrap');
  });
});

describe('amountRowWraps', () => {
  it('keeps Add beside the field until measured and while both fit', () => {
    expect(amountRowWraps(0, 70, 8, 200)).toBe(false);
    expect(amountRowWraps(110, 0, 8, 200)).toBe(false);
    expect(amountRowWraps(110, 70, 8, 0)).toBe(false);
    expect(amountRowWraps(110, 70, 8, 190)).toBe(false);
  });
  it('sends Add under the field only where the two do not fit side by side', () => {
    expect(amountRowWraps(110, 70, 8, 189)).toBe(true);
  });
});

describe('measuredLines', () => {
  const items = ['a', 'b', 'c', 'd'];
  it('waits for every width', () => {
    expect(measuredLines(items, (k) => k, { a: 50, b: 50, c: 50 }, 300)).toBeNull();
    expect(measuredLines(items, (k) => k, { a: 50, b: 50, c: 50, d: 0 }, 300)).toBeNull();
  });
  it('counts a whole pixel more for each width, as the web measures whole pixels', () => {
    // The drink chips at 130% on a 360 px phone: 99 + 55 + 55 + 87 and their gaps is 320 measured, 320.6 drawn.
    const milk = { semi: 178, whole: 77, skim: 99, oat: 55, soy: 55, almond: 87 };
    // Greedy would leave Almond alone on a third line; balanced, the widest line is the narrowest it can be.
    expect(measuredLines(Object.keys(milk), (k) => k, milk, 320)).toEqual([[0], [1, 2], [3, 4, 5]]);
  });
  it('lays the items out by their widths as drawn, never one alone on the last line', () => {
    expect(measuredLines(items, (k) => k, { a: 60, b: 60, c: 60, d: 60 }, 300)).toEqual([[0, 1, 2, 3]]);
    // Three fit a line: a plain wrap would leave d alone, so two and two.
    expect(measuredLines(items, (k) => k, { a: 90, b: 90, c: 90, d: 90 }, 300)).toEqual([
      [0, 1],
      [2, 3],
    ]);
    expect(measuredLines(items, (k) => k, { a: 90, b: 90, c: 90, d: 90 }, 300, 12)).toEqual([
      [0, 1],
      [2, 3],
    ]);
  });
});
