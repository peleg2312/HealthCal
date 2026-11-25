import { describe, expect, it } from 'vitest';

import { cameBack, withReturning } from './rowMotionRules';

const r = (id: string) => ({ id });

describe('cameBack: rows that come back from their Restore rows', () => {
  it('an Undo of the one row removed: it comes back from its place', () => {
    const before = { live: ['b', 'c'], removed: [r('a')] };
    const now = { live: ['a', 'b', 'c'], removed: [] };
    expect(cameBack(before, now)).toEqual([{ item: r('a'), index: 0 }]);
  });

  it('a Restore of the second of three Restore rows keeps its place among them', () => {
    const before = { live: ['x'], removed: [r('a'), r('b'), r('c')] };
    const now = { live: ['x', 'b'], removed: [r('a'), r('c')] };
    expect(cameBack(before, now)).toEqual([{ item: r('b'), index: 1 }]);
  });

  it('a delete is not a return: nothing comes back', () => {
    const before = { live: ['a', 'b'], removed: [] };
    const now = { live: ['b'], removed: [r('a')] };
    expect(cameBack(before, now)).toEqual([]);
  });

  it('another day: none of its removed items is live in the new list', () => {
    const before = { live: ['a'], removed: [r('z')] };
    const now = { live: ['m', 'n'], removed: [r('y')] };
    expect(cameBack(before, now)).toEqual([]);
  });

  it('a row live before and after is not coming back, even if a stale Restore row named it', () => {
    const before = { live: ['a'], removed: [r('a')] };
    const now = { live: ['a'], removed: [] };
    expect(cameBack(before, now)).toEqual([]);
  });

  it('an item still listed as removed is not coming back', () => {
    const before = { live: [], removed: [r('a')] };
    const now = { live: ['a'], removed: [r('a')] };
    expect(cameBack(before, now)).toEqual([]);
  });
});

describe('withReturning: the Restore rows drawn while one folds out', () => {
  it('the returning row stays at its place, leaving', () => {
    expect(withReturning([r('a'), r('c')], [{ item: r('b'), index: 1 }])).toEqual([
      { item: r('a'), leaving: false },
      { item: r('b'), leaving: true },
      { item: r('c'), leaving: false },
    ]);
  });

  it('the last Restore row folding out is the only row', () => {
    expect(withReturning([], [{ item: r('a'), index: 0 }])).toEqual([{ item: r('a'), leaving: true }]);
  });

  it('an index past the end goes last', () => {
    expect(withReturning([r('a')], [{ item: r('b'), index: 5 }])).toEqual([
      { item: r('a'), leaving: false },
      { item: r('b'), leaving: true },
    ]);
  });

  it('removed again before its fold ends: drawn once, as removed', () => {
    expect(withReturning([r('a')], [{ item: r('a'), index: 0 }])).toEqual([{ item: r('a'), leaving: false }]);
  });

  it('two coming back at once keep their order', () => {
    expect(withReturning([r('c')], [{ item: r('b'), index: 1 }, { item: r('a'), index: 0 }])).toEqual([
      { item: r('a'), leaving: true },
      { item: r('b'), leaving: true },
      { item: r('c'), leaving: false },
    ]);
  });
});
