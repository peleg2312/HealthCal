import { describe, expect, it } from 'vitest';

import { atScreenEdge, EDGE, stepDay, swipeDayLabel, swipeStep, SWIPE_MAX_MS, SWIPE_MIN } from './daySwipe';

describe('swipeStep', () => {
  it('moves to the next day on a quick flick left', () => {
    expect(swipeStep(-SWIPE_MIN, 0, 200)).toBe(1);
    expect(swipeStep(-120, 20, 150)).toBe(1);
  });
  it('moves to the day before on a quick flick right', () => {
    expect(swipeStep(SWIPE_MIN, 10, 300)).toBe(-1);
  });
  it('needs 96 px of sideways travel: a 70 px drag is not a swipe', () => {
    expect(swipeStep(-(SWIPE_MIN - 1), 0, 100)).toBe(0);
    expect(swipeStep(-70, 4, 100)).toBe(0);
    expect(swipeStep(70, 0, 100)).toBe(0);
  });
  it('needs the sideways travel to be at least three times the vertical', () => {
    expect(swipeStep(-120, 41, 200)).toBe(0);
    expect(swipeStep(-120, 40, 200)).toBe(1);
    expect(swipeStep(120, -60, 200)).toBe(0);
  });
  it('is a flick: a finger down longer than 500 ms is a drag, not a swipe', () => {
    expect(swipeStep(-200, 0, SWIPE_MAX_MS)).toBe(1);
    expect(swipeStep(-200, 0, SWIPE_MAX_MS + 1)).toBe(0);
    expect(swipeStep(-200, 0, 2000)).toBe(0);
  });
  it('ignores a touch with no sensible duration', () => {
    expect(swipeStep(-200, 0, -5)).toBe(0);
    expect(swipeStep(-200, 0, Number.NaN)).toBe(0);
  });
});

describe('swipeDayLabel', () => {
  it('names the day it landed on in full', () => {
    expect(swipeDayLabel('2026-11-14', '2026-11-16')).toBe('Saturday, Nov 14');
    expect(swipeDayLabel('2026-11-17', '2026-11-16')).toBe('Tuesday, Nov 17');
  });
  it('says yesterday and today by name', () => {
    expect(swipeDayLabel('2026-11-15', '2026-11-16')).toBe('Yesterday, Nov 15');
    expect(swipeDayLabel('2026-11-16', '2026-11-16')).toBe('Today, Nov 16');
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
