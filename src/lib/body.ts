/** Body composition helpers: BMI, FFMI, waist-to-height and the US Navy body fat estimate. */
import type { Sex } from '@/types';

export function bmi(weightKg: number, heightCm: number): number {
  const m = heightCm / 100;
  return m > 0 ? weightKg / (m * m) : 0;
}

export type BmiCategory = 'underweight' | 'healthy' | 'overweight' | 'obese';

export function bmiCategory(value: number): BmiCategory {
  if (value < 18.5) return 'underweight';
  if (value < 25) return 'healthy';
  if (value < 30) return 'overweight';
  return 'obese';
}

export const BMI_LABELS: Record<BmiCategory, string> = {
  underweight: 'Under the healthy range',
  healthy: 'Healthy range',
  overweight: 'Above the healthy range',
  obese: 'Well above the healthy range',
};

/** Weight range for BMI 18.5-24.9 at this height. */
export function healthyWeightRangeKg(heightCm: number): [number, number] {
  const m = heightCm / 100;
  return [18.5 * m * m, 24.9 * m * m];
}

/** Fat-free mass index, normalised to 1.80 m. */
export function ffmi(weightKg: number, heightCm: number, bodyFatPct: number): number {
  const m = heightCm / 100;
  const lean = weightKg * (1 - bodyFatPct / 100);
  return lean / (m * m) + 6.1 * (1.8 - m);
}

/** Waist-to-height ratio; under 0.5 is the usual healthy threshold. */
export function waistToHeight(waistCm: number, heightCm: number): number {
  return heightCm > 0 ? waistCm / heightCm : 0;
}

/**
 * US Navy circumference method (Hodgdon & Beckett 1984). The published
 * coefficients are for inches, so centimetres are converted first.
 * Returns null when the measurements cannot produce a valid result.
 */
export function navyBodyFatPct(input: {
  sex: Sex;
  heightCm: number;
  neckCm: number;
  waistCm: number;
  hipCm?: number;
}): number | null {
  const inch = (cm: number) => cm / 2.54;
  const { sex, heightCm, neckCm, waistCm, hipCm } = input;
  if (heightCm <= 0 || neckCm <= 0 || waistCm <= 0) return null;
  let pct: number;
  if (sex === 'male') {
    const girth = inch(waistCm) - inch(neckCm);
    if (girth <= 0) return null;
    pct = 86.01 * Math.log10(girth) - 70.041 * Math.log10(inch(heightCm)) + 36.76;
  } else {
    if (!hipCm || hipCm <= 0) return null;
    const girth = inch(waistCm) + inch(hipCm) - inch(neckCm);
    if (girth <= 0) return null;
    pct = 163.205 * Math.log10(girth) - 97.684 * Math.log10(inch(heightCm)) - 78.387;
  }
  if (!Number.isFinite(pct) || pct < 2 || pct > 65) return null;
  return Math.round(pct * 10) / 10;
}
