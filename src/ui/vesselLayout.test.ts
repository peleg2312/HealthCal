import { describe, expect, it } from 'vitest';

import { fillRatio, levelY, placeLabels } from './vesselLayout';

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
