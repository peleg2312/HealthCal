import { spokenUnits } from '@/lib/spokenUnits';
import { formatNumber } from '@/lib/units';
import type { Nutrients } from '@/types';

/**
 * The line under a diary meal's name: its protein, carbs and fat in whole grams, in that order, as the
 * day's macros are listed ("P 31 g · C 52 g · F 18 g"). Drawn with plain spaces: the kit `Text` keeps each
 * letter with its number and unit, so the line breaks only at its separators; a screen reader hears
 * `mealMacroSpoken`. None (null) for a meal with no macros at all, such as quick adds of calories alone:
 * three zeros would read as a fact about the food.
 */
export function mealMacroLine(total: Pick<Nutrients, 'protein' | 'carbs' | 'fat'>): string | null {
  const g = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0);
  const [p, c, f] = [g(total.protein), g(total.carbs), g(total.fat)];
  if (p === 0 && c === 0 && f === 0) return null;
  return `P ${formatNumber(p)} g · C ${formatNumber(c)} g · F ${formatNumber(f)} g`;
}

/** The same line as a screen reader hears it: each macro named, its unit in full, commas for the dots ("protein 31 grams, carbs 52 grams, fat 18 grams"). */
export function mealMacroSpoken(total: Pick<Nutrients, 'protein' | 'carbs' | 'fat'>): string | null {
  const line = mealMacroLine(total);
  return line ? spokenUnits(line.split(' · ').join(', ')) : null;
}
