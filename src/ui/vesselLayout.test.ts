import { describe, expect, it } from 'vitest';

import { fillRatio, goalState, levelY, placeLabels } from './vesselLayout';

describe('placeLabels', () => {
  it('keeps labels where they want to be when there is room', () => {
    expect(placeLabels([0, 40, 90], [20, 40, 20], 120)).toEqual([0, 40, 90]);
  });

  it('pushes a label down to clear the one above it', () => {
    const tops = placeLabels([10, 15], [20, 20], 100, 2);
    expect(tops).toEqual([10, 32]);
  });

  it('pulls labels up when the lowest would leave the zone', () => {
    // Eaten near zero: its level is at the bottom of the vessel, below the zone.
    const tops = placeLabels([5, 30, 200], [22, 52, 22], 110, 2);
    expect(tops[2]).toBe(88);
    expect(tops[1] + 52 + 2).toBeLessThanOrEqual(tops[2]);
    expect(tops[0] + 22 + 2).toBeLessThanOrEqual(tops[1]);
    expect(tops[0]).toBeGreaterThanOrEqual(0);
  });

  it('stacks from the top when everything wants the top (over budget)', () => {
    const tops = placeLabels([-11, -20, -11], [22, 52, 22], 110, 2);
    expect(tops).toEqual([0, 24, 78]);
  });

  it('never places a label above the zone even when the zone is too small', () => {
    const tops = placeLabels([0, 0, 0], [40, 40, 40], 60, 0);
    expect(Math.min(...tops)).toBe(0);
    expect(tops).toEqual([0, 40, 80]);
  });
});

describe('fillRatio and levelY', () => {
  it('clamps to the vessel', () => {
    expect(fillRatio(50, 100)).toBe(0.5);
    expect(fillRatio(150, 100)).toBe(1);
    expect(fillRatio(-5, 100)).toBe(0);
    expect(fillRatio(10, 0)).toBe(0);
    expect(fillRatio(Number.NaN, 100)).toBe(0);
  });

  it('measures the level from the top', () => {
    expect(levelY(0, 100, 200)).toBe(200);
    expect(levelY(100, 100, 200)).toBe(0);
    expect(levelY(25, 100, 200)).toBe(150);
  });
});

describe('goalState', () => {
  it('keeps a limit within budget up to and at max, over only past it', () => {
    expect(goalState(980, 1000)).toBe('under');
    expect(goalState(1000, 1000, 'limit')).toBe('under');
    expect(goalState(1080, 1000, 'limit')).toBe('over');
  });

  it('marks a reach goal reached from max upward, never over', () => {
    expect(goalState(0.98, 1, 'reach')).toBe('under');
    expect(goalState(1, 1, 'reach')).toBe('reached');
    expect(goalState(1.08, 1, 'reach')).toBe('reached');
  });

  it('treats a missing goal or a bad value as under', () => {
    expect(goalState(5, 0, 'reach')).toBe('under');
    expect(goalState(Number.NaN, 10, 'reach')).toBe('under');
    expect(goalState(5, -1, 'limit')).toBe('under');
  });
});
