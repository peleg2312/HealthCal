import { describe, expect, it } from 'vitest';

import { SPREAD_HINT_MAX, parseShownCount, spreadHintCounts, spreadHintVisible, type SpreadHintState } from './spreadHintRule';

const base: SpreadHintState = { done: false, shown: 0, sameDay: true, countedHere: false };

describe('spreadHintVisible', () => {
  it('shows on the first three visits in all, then never again', () => {
    expect(SPREAD_HINT_MAX).toBe(3);
    let shown = 0;
    const seen: boolean[] = [];
    for (let visit = 0; visit < 6; visit++) {
      const s = { ...base, shown };
      const visible = spreadHintVisible(s);
      seen.push(visible);
      if (spreadHintCounts(s)) shown += 1;
      // The visit that counted it keeps it until the screen is left.
      if (visible) expect(spreadHintVisible({ ...s, shown, countedHere: true })).toBe(true);
    }
    expect(seen).toEqual([true, true, true, false, false, false]);
    expect(shown).toBe(3);
  });

  it('never shows once dealt with, while reading storage, or on the week rule', () => {
    expect(spreadHintVisible({ ...base, done: true })).toBe(false);
    expect(spreadHintVisible({ ...base, done: null })).toBe(false);
    expect(spreadHintVisible({ ...base, shown: null })).toBe(false);
    expect(spreadHintVisible({ ...base, sameDay: false })).toBe(false);
    expect(spreadHintVisible({ ...base, done: true, countedHere: true })).toBe(false);
  });

  it('counts a visit once', () => {
    expect(spreadHintCounts(base)).toBe(true);
    expect(spreadHintCounts({ ...base, countedHere: true })).toBe(false);
    expect(spreadHintCounts({ ...base, shown: 3 })).toBe(false);
  });
});

describe('parseShownCount', () => {
  it('reads a stored count, anything else as none', () => {
    expect(parseShownCount('2')).toBe(2);
    expect(parseShownCount(null)).toBe(0);
    expect(parseShownCount('')).toBe(0);
    expect(parseShownCount('x')).toBe(0);
    expect(parseShownCount('-1')).toBe(0);
    expect(parseShownCount('1.5')).toBe(0);
  });
});
