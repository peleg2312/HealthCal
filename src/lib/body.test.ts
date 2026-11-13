import { describe, expect, it } from 'vitest';

import { bmi, bmiCategory, ffmi, healthyWeightRangeKg, navyBodyFatPct, waistToHeight } from './body';

describe('bmi', () => {
  it('70 kg / 1.75 m: 70 / 3.0625 = 22.857', () => {
    expect(bmi(70, 175)).toBeCloseTo(22.857, 3);
  });
  it('is 0 for a zero height instead of Infinity', () => {
    expect(bmi(70, 0)).toBe(0);
  });
});

describe('bmiCategory boundaries', () => {
  it.each([
    [18.49, 'underweight'],
    [18.5, 'healthy'],
    [24.99, 'healthy'],
    [25, 'overweight'],
    [29.99, 'overweight'],
    [30, 'obese'],
    [45, 'obese'],
    [10, 'underweight'],
  ])('%s -> %s', (v, c) => expect(bmiCategory(v)).toBe(c));
});

describe('healthyWeightRangeKg', () => {
  it('170 cm: 18.5*2.89 = 53.465 to 24.9*2.89 = 71.961', () => {
    const [lo, hi] = healthyWeightRangeKg(170);
    expect(lo).toBeCloseTo(53.465, 3);
    expect(hi).toBeCloseTo(71.961, 3);
  });
  it('the low end lands on the healthy side of the category boundary', () => {
    const [lo, hi] = healthyWeightRangeKg(180);
    expect(bmiCategory(bmi(lo, 180))).toBe('healthy');
    expect(bmiCategory(bmi(hi, 180))).toBe('healthy');
  });
});

describe('ffmi', () => {
  it('180 cm: 80 kg at 15% -> lean 68 / 3.24 = 20.988 (height term 0)', () => {
    expect(ffmi(80, 180, 15)).toBeCloseTo(20.9877, 3);
  });
  it('normalises to 1.80 m: 190 cm, 90 kg, 10% -> 81/3.61 + 6.1*(1.8-1.9) = 22.438 - 0.61 = 21.828', () => {
    expect(ffmi(90, 190, 10)).toBeCloseTo(21.828, 3);
  });
});

describe('waistToHeight', () => {
  it('85 / 170 = 0.5, zero height -> 0', () => {
    expect(waistToHeight(85, 170)).toBe(0.5);
    expect(waistToHeight(85, 0)).toBe(0);
  });
});

describe('navyBodyFatPct (US Navy, inches)', () => {
  // Man: waist 85 cm = 33.4646 in, neck 38 cm = 14.9606 in, height 180 cm = 70.8661 in.
  // waist - neck = 18.5039 in; log10 = 1.267264; log10(70.8661) = 1.850439
  // 86.010*1.267264 = 109.0003+... = 109.0031 ; 70.041*1.850439 = 129.6126
  // BF = 109.0031 - 129.6126 + 36.76 = 16.1505 -> 16.2 (one decimal)
  it('male: 85/38/180 cm -> 16.2 %', () => {
    expect(navyBodyFatPct({ sex: 'male', heightCm: 180, neckCm: 38, waistCm: 85 })).toBe(16.2);
  });
  // Woman: waist 75 = 29.5276 in, hip 100 = 39.3701 in, neck 33 = 12.9921 in, height 165 = 64.9606 in.
  // waist + hip - neck = 55.9055 in; log10 = 1.747455; log10(64.9606) = 1.812650
  // 163.205*1.747455 = 285.1933 ; 97.684*1.812650 = 177.0669
  // BF = 285.1933 - 177.0669 - 78.387 = 29.7394 -> 29.7 %
  it('female: 75/100/33/165 cm -> 29.7 %', () => {
    expect(navyBodyFatPct({ sex: 'female', heightCm: 165, neckCm: 33, waistCm: 75, hipCm: 100 })).toBe(29.7);
  });
  it('a leaner man (waist 80, neck 40, 180 cm) gives a lower value than the 85/38 man', () => {
    const a = navyBodyFatPct({ sex: 'male', heightCm: 180, neckCm: 38, waistCm: 85 })!;
    const b = navyBodyFatPct({ sex: 'male', heightCm: 180, neckCm: 40, waistCm: 80 })!;
    expect(b).toBeLessThan(a);
  });
  it('the male result ignores the hip', () => {
    const a = navyBodyFatPct({ sex: 'male', heightCm: 180, neckCm: 38, waistCm: 85, hipCm: 100 });
    expect(a).toBe(16.2);
  });
  it('null for a woman without a hip measurement', () => {
    expect(navyBodyFatPct({ sex: 'female', heightCm: 165, neckCm: 33, waistCm: 75 })).toBeNull();
    expect(navyBodyFatPct({ sex: 'female', heightCm: 165, neckCm: 33, waistCm: 75, hipCm: 0 })).toBeNull();
  });
  it('null for non-positive measurements', () => {
    expect(navyBodyFatPct({ sex: 'male', heightCm: 0, neckCm: 38, waistCm: 85 })).toBeNull();
    expect(navyBodyFatPct({ sex: 'male', heightCm: 180, neckCm: 0, waistCm: 85 })).toBeNull();
    expect(navyBodyFatPct({ sex: 'male', heightCm: 180, neckCm: 38, waistCm: -1 })).toBeNull();
  });
  it('null when the neck is as large as the waist (log of zero or negative)', () => {
    expect(navyBodyFatPct({ sex: 'male', heightCm: 180, neckCm: 85, waistCm: 85 })).toBeNull();
    expect(navyBodyFatPct({ sex: 'male', heightCm: 180, neckCm: 90, waistCm: 85 })).toBeNull();
  });
  it('null for results outside 2..65 % (implausible tape readings)', () => {
    // waist - neck of 1 cm: girth 0.39 in -> strongly negative log -> huge negative value? -> null
    expect(navyBodyFatPct({ sex: 'male', heightCm: 180, neckCm: 84, waistCm: 85 })).toBeNull();
    // absurdly large waist drives it above 65
    expect(navyBodyFatPct({ sex: 'male', heightCm: 150, neckCm: 30, waistCm: 400 })).toBeNull();
  });
  it('NaN input returns null', () => {
    expect(navyBodyFatPct({ sex: 'male', heightCm: NaN, neckCm: 38, waistCm: 85 })).toBeNull();
  });
});
