import { describe, expect, it } from 'vitest';

import { atScreenEdge, EDGE, stepDay, swipeStep, SWIPE_MIN } from './daySwipe';

describe('swipeStep', () => {
  it('moves to the next day when the finger goes left far enough', () => {
    expect(swipeStep(-SWIPE_MIN, 0)).toBe(1);
    expect(swipeStep(-120, 20)).toBe(1);
  });
  it('moves to the day before when the finger goes right', () => {
    expect(swipeStep(SWIPE_MIN, 10)).toBe(-1);
  });
  it('needs 56 px of sideways travel', () => {
    expect(swipeStep(-(SWIPE_MIN - 1), 0)).toBe(0);
    expect(swipeStep(40, 0)).toBe(0);
  });
  it('needs the sideways travel to be at least twice the vertical', () => {
    expect(swipeStep(-100, 51)).toBe(0);
    expect(swipeStep(-100, 50)).toBe(1);
    expect(swipeStep(100, -60)).toBe(0);
  });
});

describe('stepDay', () => {
  const limits = { earliest: '2026-11-01', latest: '2026-11-15' };
  it('steps one day either way inside the limits', () => {
    expect(stepDay('2026-11-10', 1, limits)).toBe('2026-11-11');
    expect(stepDay('2026-11-10', -1, limits)).toBe('2026-11-09');
  });
  it('never passes the latest day the screen allows', () => {
    expect(stepDay('2026-11-15', 1, limits)).toBeNull();
  });
  it('never goes before the earliest day', () => {
    expect(stepDay('2026-11-01', -1, limits)).toBeNull();
  });
  it('has no earliest day when none is given', () => {
    expect(stepDay('2020-01-01', -1, { latest: '2026-11-15' })).toBe('2019-12-31');
  });
  it('crosses months and years on the local calendar', () => {
    expect(stepDay('2026-03-01', -1, { latest: '2026-11-15' })).toBe('2026-02-28');
    expect(stepDay('2025-12-31', 1, { latest: '2026-11-15' })).toBe('2026-01-01');
  });
});

describe('atScreenEdge', () => {
  it('leaves the 24 px at each side of the screen to the system back gesture', () => {
    expect(atScreenEdge(EDGE - 1, 360)).toBe(true);
    expect(atScreenEdge(EDGE, 360)).toBe(false);
    expect(atScreenEdge(360 - EDGE, 360)).toBe(false);
    expect(atScreenEdge(360 - EDGE + 1, 360)).toBe(true);
  });
});
