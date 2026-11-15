import { describe, expect, it } from 'vitest';

import { brimOverhang, fillRatio, goalState, levelY, placeLabels, reachedBefore } from './vesselLayout';

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

  it("keeps Today's three cup labels 8 px apart and inside the cup, whatever the day's numbers", () => {
    // Today's cup is 150 tall and carries only its own labels: what exercise added (22), the big
    // number (56 on a 360 px phone, 52 or 44 on others) and eaten (22). Where each wants to sit
    // depends on eaten and exercise, so every combination of wishes is tried, not one day's.
    const zone = 150;
    const gap = 8;
    for (const heights of [
      [22, 56, 22],
      [22, 52, 22],
      [22, 44, 22],
    ]) {
      expect(heights[0] + heights[1] + heights[2] + 2 * gap).toBeLessThanOrEqual(zone);
      for (let a = -12; a <= zone; a += 6) {
        for (let b = a; b <= zone; b += 6) {
          for (let c = b; c <= zone + 12; c += 6) {
            const tops = placeLabels([a, b, c], heights, zone, gap);
            expect(tops[0]).toBeGreaterThanOrEqual(0);
            expect(tops[1] - (tops[0] + heights[0])).toBeGreaterThanOrEqual(gap);
            expect(tops[2] - (tops[1] + heights[1])).toBeGreaterThanOrEqual(gap);
            expect(tops[2] + heights[2]).toBeLessThanOrEqual(zone);
          }
        }
      }
    }
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

describe('a reached goal fills to the brim', () => {
  it('draws 100% and 108% of a reach goal at the same, full level', () => {
    expect(fillRatio(1, 1)).toBe(1);
    expect(fillRatio(1.08, 1)).toBe(1);
    expect(levelY(3560, 3300, 200)).toBe(0);
    // 98% is visibly short of the top and not reached.
    expect(levelY(0.98, 1, 200)).toBeCloseTo(4);
    expect(goalState(0.98, 1, 'reach')).not.toBe(goalState(1, 1, 'reach'));
  });
});

describe('brimOverhang', () => {
  it('is 6 px on the hero vessels and 3 px on mini cups', () => {
    expect(brimOverhang(96)).toBe(6);
    expect(brimOverhang(84)).toBe(6);
    expect(brimOverhang(66)).toBe(5);
    expect(brimOverhang(30)).toBe(3);
    expect(brimOverhang(22)).toBe(3);
  });

  it('never returns less than 3 or a non-number', () => {
    expect(brimOverhang(0)).toBe(3);
    expect(brimOverhang(Number.NaN)).toBe(3);
    expect(brimOverhang(400)).toBe(6);
  });
});

describe('reachedBefore: when reaching a goal counts as a crossing', () => {
  const crossed = (...args: Parameters<typeof reachedBefore>) => args[3] && !reachedBefore(...args);

  it('counts the level passing the goal while the cup is on screen', () => {
    expect(crossed({ key: 'water-mon', reached: false }, 'water-mon', false, true)).toBe(true);
    expect(crossed({ key: undefined, reached: false }, undefined, undefined, true)).toBe(true);
  });

  it('does not count a cup that mounts already full', () => {
    expect(crossed(null, undefined, undefined, true)).toBe(false);
    expect(crossed(null, 'water-mon', undefined, true)).toBe(false);
  });

  it('does not count a remount that was already shown full, and does count one that was last shown short', () => {
    expect(crossed(null, 'water-mon', true, true)).toBe(false);
    expect(crossed(null, 'water-mon', false, true)).toBe(true);
  });

  it('does not count staying full, or anything while short of the goal', () => {
    expect(crossed({ key: 'water-mon', reached: true }, 'water-mon', true, true)).toBe(false);
    expect(crossed({ key: 'water-mon', reached: false }, 'water-mon', false, false)).toBe(false);
    expect(crossed({ key: 'water-mon', reached: true }, 'water-mon', true, false)).toBe(false);
  });

  it('counts dropping below the goal and reaching it again', () => {
    expect(reachedBefore({ key: 'water-mon', reached: true }, 'water-mon', true, false)).toBe(true);
    expect(crossed({ key: 'water-mon', reached: false }, 'water-mon', false, true)).toBe(true);
  });

  it('treats a new key as a mount: paging from a short day to a day that met its goal is not a crossing', () => {
    expect(crossed({ key: 'water-mon', reached: false }, 'water-tue', undefined, true)).toBe(false);
    expect(crossed({ key: 'water-mon', reached: false }, 'water-tue', true, true)).toBe(false);
    // Back on a day whose goal was met while another day was shown.
    expect(crossed({ key: 'water-tue', reached: true }, 'water-mon', false, true)).toBe(true);
  });
});
