import { describe, expect, it } from 'vitest';

import { restingShareKcal, wholeMinutes, workoutEnergy } from './energy';
import { CTX } from './testing';

const SEC = 45 * 60;
const resting = restingShareKcal(CTX.baselineKcalPerDay, SEC);

describe('workoutEnergy', () => {
  it('resting share: the baseline for the whole minutes the session is saved with', () => {
    expect(resting).toBeCloseTo(68.75, 6);
    expect(wholeMinutes(20)).toBe(1);
    expect(wholeMinutes(89)).toBe(1);
    expect(wholeMinutes(90)).toBe(2);
  });

  it('active and total', () => {
    expect(workoutEnergy({ activeKcal: 480, totalKcal: 552 }, SEC, CTX)).toEqual({ basis: 'active-and-total', kcalGross: 552, kcalNet: 480 });
  });

  it('only total: net is the total minus the resting share, never below zero', () => {
    expect(workoutEnergy({ activeKcal: null, totalKcal: 552 }, SEC, CTX)).toEqual({ basis: 'total', kcalGross: 552, kcalNet: 552 - resting });
    // 110 kcal in 45 minutes is 1.8 MET for this weight: above sitting, and above this baseline's share.
    expect(workoutEnergy({ activeKcal: null, totalKcal: 110 }, SEC, { weightKg: 78.8, baselineKcalPerDay: 3800 }).kcalNet).toBe(0);
  });

  it('only active: gross adds the resting share', () => {
    expect(workoutEnergy({ activeKcal: 480, totalKcal: null }, SEC, CTX)).toEqual({ basis: 'active', kcalGross: 480 + resting, kcalNet: 480 });
  });

  it('neither, zero or nonsense: no measurement', () => {
    for (const w of [{ activeKcal: null, totalKcal: null }, { activeKcal: 0, totalKcal: 0 }, { activeKcal: -5, totalKcal: Number.NaN }]) {
      expect(workoutEnergy(w, SEC, CTX).basis).toBe('none');
    }
  });

  it('a total that is not above the active figure is ignored', () => {
    expect(workoutEnergy({ activeKcal: 480, totalKcal: 480 }, SEC, CTX).basis).toBe('active');
    expect(workoutEnergy({ activeKcal: 480, totalKcal: 300 }, SEC, CTX)).toEqual({ basis: 'active', kcalGross: 480 + resting, kcalNet: 480 });
  });

  it('a total on its own at the level of sitting still is not a workout measurement', () => {
    // 1.0 MET for 78.8 kg over 45 min is about 62 kcal; 1.5 MET about 93.
    expect(workoutEnergy({ activeKcal: null, totalKcal: 62 }, SEC, CTX).basis).toBe('none');
    expect(workoutEnergy({ activeKcal: null, totalKcal: 92 }, SEC, CTX).basis).toBe('none');
    expect(workoutEnergy({ activeKcal: null, totalKcal: 95 }, SEC, CTX).basis).toBe('total');
    // With an active figure the same total is fine: active plus resting.
    expect(workoutEnergy({ activeKcal: 20, totalKcal: 82 }, SEC, CTX).basis).toBe('active-and-total');
  });

  it('drops floating point noise from the health store', () => {
    expect(workoutEnergy({ activeKcal: 480.00000001, totalKcal: 551.96 }, SEC, CTX)).toMatchObject({ kcalNet: 480, kcalGross: 552 });
  });
});
