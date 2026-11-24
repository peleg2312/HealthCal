import { describe, expect, it } from 'vitest';

import { yearSaving } from './saving';
import type { PlanOffer } from './view';
import { savingAndTax, yearSavingLine } from './words';

const offer = (period: 'month' | 'year', amount: number, currency = 'USD', taxIncluded: boolean | null = false): PlanOffer => ({ id: `${period}-${amount}`, plan: 'plus', period, amount, currency, taxIncluded });

describe('what a year costs less than twelve months', () => {
  it('is the plain sum of the two prices', () => {
    expect(yearSaving(offer('month', 399), offer('year', 2999))).toBe(1789);
    expect(yearSavingLine(offer('month', 399), offer('year', 2999))).toBe('Yearly costs $17.89 less than 12 monthly payments.');
    expect(yearSavingLine(offer('month', 1490, 'ILS', true), offer('year', 11900, 'ILS', true))).toBe('Yearly costs ₪59.80 less than 12 monthly payments.');
  });
  it('reads a currency with no minor unit', () => {
    expect(yearSavingLine(offer('month', 500, 'JPY'), offer('year', 4800, 'JPY'))).toBe('Yearly costs ¥1,200 less than 12 monthly payments.');
  });
  it('says nothing when the two cannot be compared', () => {
    expect(yearSavingLine(offer('month', 399, 'EUR'), offer('year', 2999, 'USD'))).toBe(null);
    expect(yearSavingLine(offer('month', 399, 'USD', true), offer('year', 2999, 'USD', false))).toBe(null);
    expect(yearSavingLine(offer('month', 399, 'USD', null), offer('year', 2999, 'USD', false))).toBe(null);
    expect(yearSavingLine(offer('month', 399), null)).toBe(null);
    expect(yearSavingLine(null, offer('year', 2999))).toBe(null);
    // The periods the wrong way round.
    expect(yearSavingLine(offer('year', 2999), offer('month', 399))).toBe(null);
  });
  it('says nothing when the year is not the smaller sum', () => {
    expect(yearSavingLine(offer('month', 200), offer('year', 2999))).toBe(null);
    expect(yearSavingLine(offer('month', 250), offer('year', 3000))).toBe(null);
  });
  it('joins the saving and the tax note of the price chosen', () => {
    const m = offer('month', 399);
    const y = offer('year', 2999);
    expect(savingAndTax(m, y, m)).toBe('Yearly costs $17.89 less than 12 monthly payments. Tax is added where it applies.');
    expect(savingAndTax(offer('month', 399, 'USD', true), offer('year', 2999, 'USD', true), { taxIncluded: true })).toBe('Yearly costs $17.89 less than 12 monthly payments.');
    expect(savingAndTax(m, null, m)).toBe('Tax is added where it applies.');
    expect(savingAndTax(null, null, { taxIncluded: true })).toBe(null);
  });
});
