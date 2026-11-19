/**
 * The words of one line of a saved meal (the saved meals screen, the search's Saved meals tab, the
 * meal builder), pure so they are tested (itemLine.test.ts). A serving that is itself an amount
 * ("50 g", or "500 ml", the pack serving of an online drink) is said as its total, never "2 × 500 ml",
 * and without a weight beside it ("500 ml · 235 kcal", never "500 ml · 500 g").
 */
import { withoutMarks } from '@/lib/bidi';
import type { SavedMealItem } from '@/types';

import { amountTotal, formatQty, kcal, labelAmount, portionLabel, servingText } from './helpers';

/** "1 cup · 205 kcal" for a saved-meal line, with "~" for an estimate. */
export function itemLine(it: Pick<SavedMealItem, 'servingLabel' | 'quantity' | 'grams' | 'kcalRange' | 'nutrients'>): string {
  const portion = portionLabel(it.servingLabel, it.quantity);
  const g = Math.round(it.grams);
  // Show the weight too when the portion is a household measure ("1.5 × 1 cup · 240 g"), not when it is itself an amount ("500 ml").
  const weight = g > 0 && labelAmount(it.servingLabel) === null && !/\bg$/.test(withoutMarks(portion)) && it.servingLabel !== '1 g' ? ` · ${g} g` : '';
  return `${portion}${weight} · ${it.kcalRange ? '~' : ''}${kcal(it.nutrients.kcal)} kcal`;
}

/** The amount sheet's stepper for one line: "1000 ml", "150 g", or "1.5 × 1 cup". */
export function itemStepText(servingLabel: string, quantity: number): string {
  return amountTotal(servingLabel, quantity) ?? `${formatQty(quantity)} × ${servingText(servingLabel)}`;
}
