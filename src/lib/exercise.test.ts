import { describe, expect, it } from 'vitest';

import { estimateOneRepMax, findStrengthRecords, grossKcal, guidelineMinutes, kcalRange, netKcal, paceKmh, sessionGuidelineMinutes, strengthVolumeKg } from './exercise';

describe('grossKcal', () => {
  it('8 MET, 70 kg, 30 min = 8*3.5*70/200 = 9.8 kcal/min -> 294', () => {
    expect(grossKcal(8, 70, 30)).toBeCloseTo(294, 6);
  });
  it('1 MET for 1 h at 70 kg = 1.225 kcal/min * 60 = 73.5', () => {
    expect(grossKcal(1, 70, 60)).toBeCloseTo(73.5, 6);
  });
  it('is linear in each argument', () => {
    expect(grossKcal(4, 80, 60)).toBeCloseTo(2 * grossKcal(4, 80, 30), 9);
    expect(grossKcal(4, 80, 60)).toBeCloseTo(2 * grossKcal(2, 80, 60), 9);
    expect(grossKcal(4, 80, 60)).toBeCloseTo(2 * grossKcal(4, 40, 60), 9);
  });
  it('is zero for zero minutes', () => {
    expect(grossKcal(8, 70, 0)).toBe(0);
  });
});

describe('netKcal', () => {
  it('subtracts the baseline share: 294 - 2400/1440*30 (=50) = 244', () => {
    expect(netKcal(8, 70, 30, 2400)).toBeCloseTo(244, 6);
  });
  it('is never negative (below-baseline activity)', () => {
    // 1 MET 60 min: gross 73.5; baseline 3000/1440*60 = 125 -> would be -51.5
    expect(netKcal(1, 70, 60, 3000)).toBe(0);
  });
  it('net is always less than gross for a positive baseline', () => {
    expect(netKcal(6, 75, 45, 2500)).toBeLessThan(grossKcal(6, 75, 45));
  });
  it('a zero baseline gives gross', () => {
    expect(netKcal(6, 75, 45, 0)).toBeCloseTo(grossKcal(6, 75, 45), 9);
  });
});

describe('kcalRange', () => {
  it('is +-20% rounded', () => {
    expect(kcalRange(500)).toEqual([400, 600]);
    expect(kcalRange(333)).toEqual([266, 400]); // 266.4, 399.6
    expect(kcalRange(0)).toEqual([0, 0]);
  });
});

describe('paceKmh', () => {
  it('10 km in 60 min = 10 km/h; 5 km in 45 min = 6.667', () => {
    expect(paceKmh(10, 60)).toBe(10);
    expect(paceKmh(5, 45)).toBeCloseTo(6.6667, 4);
  });
  it('null for missing, zero or negative inputs', () => {
    expect(paceKmh(undefined, 60)).toBeNull();
    expect(paceKmh(0, 60)).toBeNull();
    expect(paceKmh(5, 0)).toBeNull();
  });
});

describe('strength helpers', () => {
  it('Epley: 100 kg x 5 = 100*(1+5/30) = 116.67; 1 rep is the weight itself', () => {
    expect(estimateOneRepMax(100, 5)).toBeCloseTo(116.6667, 4);
    expect(estimateOneRepMax(100, 1)).toBe(100);
    expect(estimateOneRepMax(60, 10)).toBeCloseTo(80, 9);
  });
  it('returns 0 for invalid input', () => {
    expect(estimateOneRepMax(0, 5)).toBe(0);
    expect(estimateOneRepMax(100, 0)).toBe(0);
    expect(estimateOneRepMax(-5, 5)).toBe(0);
  });
  it('volume = sum(reps*weight): 5*100 + 8*60 + 10*20 = 1180', () => {
    expect(
      strengthVolumeKg([
        { sets: [{ reps: 5, weightKg: 100 }, { reps: 8, weightKg: 60 }] },
        { sets: [{ reps: 10, weightKg: 20 }] },
      ]),
    ).toBe(1180);
    expect(strengthVolumeKg([])).toBe(0);
    expect(strengthVolumeKg([{ sets: [] }])).toBe(0);
  });
});

describe('findStrengthRecords', () => {
  const hist = [[{ name: 'Bench press', sets: [{ reps: 5, weightKg: 80 }, { reps: 3, weightKg: 85 }] }]];
  it('reports a better estimated 1RM against earlier sessions', () => {
    const r = findStrengthRecords([{ name: 'bench press', sets: [{ reps: 5, weightKg: 85 }] }], hist);
    expect(r).toHaveLength(1);
    expect(r[0].kind).toBe('e1rm');
    expect(r[0].valueKg).toBeCloseTo(85 * (1 + 5 / 30), 6);
    expect(r[0].previousKg).toBeCloseTo(85 * 1.1, 6);
  });
  it('falls back to a heavier set when the 1RM did not improve', () => {
    const r = findStrengthRecords([{ name: 'Bench press', sets: [{ reps: 1, weightKg: 90 }] }], [[{ name: 'Bench press', sets: [{ reps: 10, weightKg: 75 }] }]]);
    expect(r).toEqual([{ exercise: 'Bench press', kind: 'heaviest', valueKg: 90, previousKg: 75 }]);
  });
  it('sets no record for a first-time exercise, a tie or a worse session', () => {
    expect(findStrengthRecords([{ name: 'Squat', sets: [{ reps: 5, weightKg: 100 }] }], hist)).toEqual([]);
    expect(findStrengthRecords([{ name: 'Bench press', sets: [{ reps: 3, weightKg: 85 }] }], hist)).toEqual([]);
    expect(findStrengthRecords([{ name: 'Bench press', sets: [{ reps: 5, weightKg: 70 }, { reps: 0, weightKg: 200 }] }], hist)).toEqual([]);
  });
});

describe('weekly guideline minutes', () => {
  it('counts moderate minutes once, vigorous twice and light not at all', () => {
    expect(sessionGuidelineMinutes(2.9, 40)).toBe(0);
    expect(sessionGuidelineMinutes(3, 40)).toBe(40);
    expect(sessionGuidelineMinutes(5.9, 40)).toBe(40);
    expect(sessionGuidelineMinutes(6, 40)).toBe(80);
    expect(guidelineMinutes([{ met: 2.5, durationMin: 60 }, { met: 4, durationMin: 30 }, { met: 9, durationMin: 20 }])).toBe(70);
  });
  it('ignores missing or negative values', () => {
    expect(guidelineMinutes([{}, { met: 7 }, { durationMin: 30 }, { met: 7, durationMin: -10 }])).toBe(0);
  });
});
