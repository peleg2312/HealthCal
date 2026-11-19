import { describe, expect, it } from 'vitest';

import * as via from '@/features/drinks/via';

import { baseWaterGoalMl, effectiveMl, exerciseWaterMl, glassesLeft, hasWaterTracked, HYDRATION_FACTOR, isTrackedWater } from './hydration';

describe('baseWaterGoalMl', () => {
  it('light man is lifted to the 2000 ml minimum (60 kg * 33 = 1980)', () => {
    expect(baseWaterGoalMl(60, 'male')).toBe(2000);
  });
  it('light woman is lifted to 1600 ml (45 kg * 33 = 1485)', () => {
    expect(baseWaterGoalMl(45, 'female')).toBe(1600);
  });
  it('mid weights scale by 33 ml/kg, rounded to 50: 80 kg man 2640 -> 2650; 70 kg woman 2310 -> 2300', () => {
    expect(baseWaterGoalMl(80, 'male')).toBe(2650);
    expect(baseWaterGoalMl(70, 'female')).toBe(2300);
  });
  it('heavy people are capped: man 3700, woman 3000', () => {
    expect(baseWaterGoalMl(120, 'male')).toBe(3700); // 3960
    expect(baseWaterGoalMl(100, 'female')).toBe(3000); // 3300
    expect(baseWaterGoalMl(200, 'male')).toBe(3700);
  });
  it('is monotonic in weight', () => {
    let prev = 0;
    for (let w = 30; w <= 200; w += 5) {
      const g = baseWaterGoalMl(w, 'male');
      expect(g).toBeGreaterThanOrEqual(prev);
      prev = g;
    }
  });
});

describe('exerciseWaterMl', () => {
  it('no sessions -> 0', () => {
    expect(exerciseWaterMl([])).toBe(0);
  });
  it('1 h moderate = 550 ml; 90 min vigorous = 1.5*800 = 1200 ml', () => {
    expect(exerciseWaterMl([{ durationMin: 60, intensity: 'moderate' }])).toBe(550);
    expect(exerciseWaterMl([{ durationMin: 90, intensity: 'vigorous' }])).toBe(1200);
  });
  it('sessions add: 60 min light (350) + 30 min moderate (275) = 625 -> rounds to 650', () => {
    // 625 / 50 = 12.5 -> Math.round -> 13 -> 650
    expect(
      exerciseWaterMl([
        { durationMin: 60, intensity: 'light' },
        { durationMin: 30, intensity: 'moderate' },
      ]),
    ).toBe(650);
  });
  it('is capped at 2000 ml', () => {
    expect(exerciseWaterMl([{ durationMin: 240, intensity: 'vigorous' }])).toBe(2000); // 3200 raw
  });
});

describe('beverages', () => {
  it('factors: water/tea/sports 1, coffee/milk/other 0.9, juice 0.95', () => {
    expect(effectiveMl(500, 'water')).toBe(500);
    expect(effectiveMl(500, 'tea')).toBe(500);
    expect(effectiveMl(500, 'sports')).toBe(500);
    expect(effectiveMl(500, 'coffee')).toBeCloseTo(450, 9);
    expect(effectiveMl(500, 'milk')).toBeCloseTo(450, 9);
    expect(effectiveMl(500, 'other')).toBeCloseTo(450, 9);
    expect(effectiveMl(500, 'juice')).toBeCloseTo(475, 9);
  });
  it('no beverage hydrates more than water', () => {
    for (const f of Object.values(HYDRATION_FACTOR)) expect(f).toBeLessThanOrEqual(1);
  });
  it('glassesLeft rounds up and never goes negative', () => {
    expect(glassesLeft(0)).toBe(0);
    expect(glassesLeft(1)).toBe(1);
    expect(glassesLeft(250)).toBe(1);
    expect(glassesLeft(251)).toBe(2);
    expect(glassesLeft(-100)).toBe(0);
    expect(glassesLeft(600, 200)).toBe(3);
  });
});

describe('water tracked: water from the diary never makes a day tracked', () => {
  it('only a record not from the diary counts', () => {
    expect(isTrackedWater({})).toBe(true);
    expect(isTrackedWater({ fromEntryId: 'e1' })).toBe(false);
    expect(hasWaterTracked([])).toBe(false);
    expect(hasWaterTracked([{ fromEntryId: 'e1' }, { fromEntryId: 'e2' }])).toBe(false);
    expect(hasWaterTracked([{ fromEntryId: 'e1' }, {}])).toBe(true);
  });
  it('is the same rule under its old import (@/features/drinks/via re-exports it)', () => {
    expect(via.isTrackedWater).toBe(isTrackedWater);
    expect(via.hasWaterTracked).toBe(hasWaterTracked);
  });
});
