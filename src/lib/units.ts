import type { UnitSystem } from '@/types';

export const KG_PER_LB = 0.45359237;
export const CM_PER_IN = 2.54;
export const ML_PER_FLOZ = 29.5735;
export const KM_PER_MI = 1.609344;

export const kgToLb = (kg: number) => kg / KG_PER_LB;
export const lbToKg = (lb: number) => lb * KG_PER_LB;
export const cmToIn = (cm: number) => cm / CM_PER_IN;
export const inToCm = (inch: number) => inch * CM_PER_IN;
export const mlToFlOz = (ml: number) => ml / ML_PER_FLOZ;
export const flOzToMl = (oz: number) => oz * ML_PER_FLOZ;
export const kmToMi = (km: number) => km / KM_PER_MI;
export const miToKm = (mi: number) => mi * KM_PER_MI;

export function cmToFtIn(cm: number): { ft: number; inch: number } {
  const totalIn = Math.round(cmToIn(cm));
  return { ft: Math.floor(totalIn / 12), inch: totalIn % 12 };
}

export function ftInToCm(ft: number, inch: number): number {
  return inToCm(ft * 12 + inch);
}

/** Fixed decimals without trailing zeros: 2.30 -> "2.3", 3.00 -> "3". */
function trim(n: number, digits: number): string {
  const fixed = n.toFixed(digits);
  return fixed.includes('.') ? fixed.replace(/0+$/, '').replace(/\.$/, '') : fixed;
}

export function formatWeight(kg: number, units: UnitSystem, digits = 1): string {
  return units === 'imperial' ? `${trim(kgToLb(kg), digits)} lb` : `${trim(kg, digits)} kg`;
}

export function weightValue(kg: number, units: UnitSystem): number {
  return units === 'imperial' ? kgToLb(kg) : kg;
}

export function weightToKg(value: number, units: UnitSystem): number {
  return units === 'imperial' ? lbToKg(value) : value;
}

export const weightUnit = (units: UnitSystem) => (units === 'imperial' ? 'lb' : 'kg');

export function formatHeight(cm: number, units: UnitSystem): string {
  if (units === 'imperial') {
    const { ft, inch } = cmToFtIn(cm);
    return `${ft}'${inch}"`;
  }
  return `${Math.round(cm)} cm`;
}

export function lengthValue(cm: number, units: UnitSystem): number {
  return units === 'imperial' ? cmToIn(cm) : cm;
}

export function lengthToCm(value: number, units: UnitSystem): number {
  return units === 'imperial' ? inToCm(value) : value;
}

export const lengthUnit = (units: UnitSystem) => (units === 'imperial' ? 'in' : 'cm');

export function formatVolume(ml: number, units: UnitSystem): string {
  if (units === 'imperial') return `${Math.round(mlToFlOz(ml))} fl oz`;
  return ml >= 1000 ? `${trim(ml / 1000, 2)} L` : `${Math.round(ml)} ml`;
}

export function volumeValue(ml: number, units: UnitSystem): number {
  return units === 'imperial' ? mlToFlOz(ml) : ml;
}

export function volumeToMl(value: number, units: UnitSystem): number {
  return units === 'imperial' ? flOzToMl(value) : value;
}

export const volumeUnit = (units: UnitSystem) => (units === 'imperial' ? 'fl oz' : 'ml');

export function formatDistance(km: number, units: UnitSystem): string {
  return units === 'imperial' ? `${trim(kmToMi(km), 2)} mi` : `${trim(km, 2)} km`;
}

export function distanceValue(km: number, units: UnitSystem): number {
  return units === 'imperial' ? kmToMi(km) : km;
}

export function distanceToKm(value: number, units: UnitSystem): number {
  return units === 'imperial' ? miToKm(value) : value;
}

export const distanceUnit = (units: UnitSystem) => (units === 'imperial' ? 'mi' : 'km');

/** Thousands separator without relying on Intl availability on every engine. */
export function formatNumber(n: number, digits = 0): string {
  const fixed = Math.abs(n).toFixed(digits);
  const [int, frac] = fixed.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  // A value that rounds to zero must not print as "-0".
  const negative = n < 0 && Number(fixed) !== 0;
  return `${negative ? '-' : ''}${grouped}${frac ? `.${frac}` : ''}`;
}

export const round = (n: number, digits = 0) => {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
};

export const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
