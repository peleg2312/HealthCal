import { describe, expect, it } from 'vitest';

import { lbToKg } from '@/lib/units';

import { formatLiftWeight, formatPreviousSets } from './strengthFormat';

// Non-breaking spaces keep a value with its unit; compare with plain spaces.
const plain = (s: string) => s.replace(/ /g, ' ');

describe('formatPreviousSets', () => {
  it('puts the unit on the weight, then the reps, for one set', () => {
    expect(plain(formatPreviousSets([{ weightKg: 60, reps: 8 }], 'metric'))).toBe('60 kg × 8');
  });

  it('writes every weighted set with its own unit', () => {
    expect(plain(formatPreviousSets([{ weightKg: 60, reps: 8 }, { weightKg: 62.5, reps: 6 }], 'metric'))).toBe('60 kg × 8, 62.5 kg × 6');
  });

  it('uses pounds in imperial', () => {
    const sets = [{ weightKg: lbToKg(135), reps: 8 }, { weightKg: lbToKg(155), reps: 5 }];
    expect(plain(formatPreviousSets(sets, 'imperial'))).toBe('135 lb × 8, 155 lb × 5');
  });

  it('writes a bodyweight set as reps with no weight unit', () => {
    expect(plain(formatPreviousSets([{ weightKg: 0, reps: 10 }], 'metric'))).toBe('10 reps');
    expect(plain(formatPreviousSets([{ weightKg: 0, reps: 10 }, { weightKg: 10, reps: 8 }], 'imperial'))).toBe('10 reps, 22 lb × 8');
  });

  it('never ends on a unit after the count of hidden sets', () => {
    const sets = Array.from({ length: 7 }, () => ({ weightKg: 40, reps: 10 }));
    const text = plain(formatPreviousSets(sets, 'metric'));
    expect(text).toBe('40 kg × 10, 40 kg × 10, 40 kg × 10, 40 kg × 10, 40 kg × 10 +2 more');
    expect(text.endsWith('kg')).toBe(false);
  });
});

describe('formatLiftWeight', () => {
  it('drops a trailing .0 and keeps one decimal', () => {
    expect(formatLiftWeight(60, 'metric')).toBe('60');
    expect(formatLiftWeight(132.5, 'metric')).toBe('132.5');
    expect(formatLiftWeight(1000, 'metric')).toBe('1,000');
  });
});
