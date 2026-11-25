/**
 * The figures under the morning page's cups, as plain strings. Pure and unit-tested; the shelf
 * only places them. The number under a cup stands alone (its unit is in the caption), so the
 * number and the goal in the caption must be in the same unit: 800 ml of a 2.6 L goal reads
 * "0.8" over "of 2.6 L", never "800" over "of 2.6 L".
 */
import { formatNumber, mlToFlOz } from '@/lib/units';
import type { MealType, UnitSystem } from '@/types';
import { budgetSharePct } from '@/features/progress/budgetShare';

export interface WaterFigures {
  /** The amount drunk, in the goal's unit, without the unit: "2.4", "0.8", "2.0", "88". Litres always carry one decimal, as the sleep hours do, so the numbers on the shelf read alike. */
  value: string;
  /** The goal with its unit: "2.6 L", "750 ml", "88 fl oz". */
  goal: string;
  /** The unit in words, for a screen reader: "litres", "millilitres", "fluid ounces". */
  spokenUnit: string;
}

const trimmed = (n: number, digits: number) => String(Number(n.toFixed(digits)));

/** Water drunk and the goal in one unit: litres when the goal is a litre or more, else ml; fl oz in imperial. */
export function waterFigures(ml: number, goalMl: number, units: UnitSystem): WaterFigures {
  if (units === 'imperial') {
    const oz = (v: number) => {
      const n = mlToFlOz(v);
      return n < 10 ? trimmed(n, 1) : formatNumber(Math.round(n));
    };
    return { value: oz(ml), goal: `${oz(goalMl)} fl oz`, spokenUnit: 'fluid ounces' };
  }
  if (goalMl >= 1000) {
    return { value: (ml / 1000).toFixed(1), goal: `${trimmed(goalMl / 1000, 2)} L`, spokenUnit: 'litres' };
  }
  return { value: formatNumber(Math.round(ml)), goal: `${formatNumber(Math.round(goalMl))} ml`, spokenUnit: 'millilitres' };
}

/** Hours slept in words for a screen reader: "7 hours 20 minutes", "1 hour", "45 minutes". */
export function spokenHours(hours: number): string {
  const mins = Math.round(hours * 60);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const hPart = h === 1 ? '1 hour' : `${h} hours`;
  const mPart = m === 1 ? '1 minute' : `${m} minutes`;
  if (h === 0) return mPart;
  return m === 0 ? hPart : `${hPart} ${mPart}`;
}

/** The meal the footer offers to log, in the button's words. */
export function logMealTitle(meal: MealType): string {
  return meal === 'snack' ? 'Log a snack' : `Log ${meal}`;
}

/**
 * Yesterday's eaten share of its own budget, in whole percent ("95", "130"), for the Eaten figure
 * when the week picture already shows the calories; null without a budget.
 */
export function budgetShare(kcal: number, budget: number): number | null {
  // The one share every screen says for a day (@/features/progress/budgetShare): never 90% for a day under 90%
  // of its budget, never 100% or less for a day above it, so it always agrees with the on-budget mark.
  return budgetSharePct(kcal, budget);
}

/** Hours of sleep as whole hours and minutes, the form used everywhere on the page ("7 h 30 min"). */
export function hoursAndMinutes(hours: number): { h: number; m: number } {
  const mins = Math.round(Math.max(0, hours) * 60);
  return { h: Math.floor(mins / 60), m: mins % 60 };
}
