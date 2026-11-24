/**
 * What a year of Plus costs less than twelve monthly payments, worked out from the two prices the
 * server sent and nothing else (pure, tested in saving.test.ts). It is a plain sum, said only when it
 * is exact: both offers in the same currency, both with the same answer about tax, and the year the
 * smaller of the two. No percentage, no rounding up, no crossed-out price.
 */
import type { PlanOffer } from './view';

type Priced = Pick<PlanOffer, 'amount' | 'currency' | 'period' | 'taxIncluded'>;

/**
 * Twelve monthly payments less one yearly payment, in the currency's minor unit; null when the two
 * cannot be compared (a missing offer, the wrong periods, different currencies, different tax) or
 * when the year is not the smaller sum.
 */
export function yearSaving(month: Priced | null | undefined, year: Priced | null | undefined): number | null {
  if (!month || !year || month.period !== 'month' || year.period !== 'year') return null;
  if (month.currency.toUpperCase() !== year.currency.toUpperCase()) return null;
  if (month.taxIncluded !== year.taxIncluded) return null;
  if (!Number.isInteger(month.amount) || !Number.isInteger(year.amount) || month.amount <= 0 || year.amount <= 0) return null;
  const less = 12 * month.amount - year.amount;
  return less > 0 ? less : null;
}
