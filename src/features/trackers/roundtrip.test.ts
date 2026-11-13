import { describe, expect, it } from 'vitest';

import { lengthToCm, lengthValue, volumeToMl, volumeValue, weightToKg, weightValue } from '@/lib/units';

import { keepOrConvert, latestBodyFat, normalizePresets, splitUnit } from './helpers';

describe('splitUnit', () => {
  it('keeps multi-word units together', () => {
    expect(splitUnit('70 fl oz')).toEqual({ value: '70', unit: 'fl oz' });
    expect(splitUnit('1.25 L')).toEqual({ value: '1.25', unit: 'L' });
    expect(splitUnit('42')).toEqual({ value: '42', unit: '' });
  });
});

describe('keepOrConvert', () => {
  const ozShown = (ml: number) => Math.round(volumeValue(ml, 'imperial'));
  const toMl = (oz: number) => volumeToMl(oz, 'imperial');

  it('re-saving untouched imperial water presets keeps the stored ml', () => {
    const stored = [150, 250, 330, 500];
    const shown = stored.map(ozShown);
    const saved = normalizePresets(shown.map((v, i) => keepOrConvert(v, stored[i], ozShown, toMl)));
    expect(saved).toEqual(stored);
  });

  it('converts a field the user changed', () => {
    expect(Math.round(keepOrConvert(12, 330, ozShown, toMl)!)).toBe(355);
  });

  it('keeps prefilled tape measurements in cm', () => {
    const inch = (cm: number) => Math.round(lengthValue(cm, 'imperial') * 10) / 10;
    const toCm = (v: number) => lengthToCm(v, 'imperial');
    expect(keepOrConvert(inch(38), 38, inch, toCm)).toBe(38);
    expect(keepOrConvert(inch(85), 85, inch, toCm)).toBe(85);
  });

  it('keeps a stored weight when only body fat changes', () => {
    const lb = (kg: number) => Math.round(weightValue(kg, 'imperial') * 10) / 10;
    expect(keepOrConvert(lb(80), 80, lb, (v) => weightToKg(v, 'imperial'))).toBe(80);
  });

  it('returns null for an empty field', () => {
    expect(keepOrConvert(null, 80, (x) => x, (x) => x)).toBeNull();
  });
});

describe('latestBodyFat', () => {
  it('takes the newest weigh-in that has a reading', () => {
    expect(
      latestBodyFat([
        { date: '2026-11-01', bodyFatPct: 20 },
        { date: '2026-11-05', bodyFatPct: 19 },
        { date: '2026-11-10' },
      ]),
    ).toBe(19);
  });
  it('is undefined when none has one', () => {
    expect(latestBodyFat([{ date: '2026-11-10' }])).toBeUndefined();
  });
});
