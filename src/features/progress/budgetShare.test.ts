import { describe, expect, it } from 'vitest';

import { budgetMark } from '@/lib/insights';

import { budgetSharePct } from './budgetShare';

describe('budgetSharePct', () => {
  it('reads the two days the review found the same on every screen', () => {
    // 2,024 of 2,260 kcal is 89.56%: never 90%, which would read as on budget.
    expect(budgetSharePct(2024, 2260)).toBe(89);
    // 2,029 of 2,030 kcal is 99.95%: on budget, and not yet the whole budget.
    expect(budgetSharePct(2029, 2030)).toBe(99);
  });

  it('shows 90 to 100 only for a day on budget, by budgetMark', () => {
    expect(budgetSharePct(1800, 2000)).toBe(90);
    expect(budgetSharePct(2000, 2000)).toBe(100);
    expect(budgetSharePct(1799, 2000)).toBe(89);
  });

  it('never shows 100% or less for a day above its budget', () => {
    expect(budgetSharePct(2001, 2000)).toBe(101);
    expect(budgetSharePct(2161, 2160)).toBe(101);
    expect(budgetSharePct(2510, 2190)).toBe(115);
  });

  it('has nothing to say without a budget, and counts nothing eaten as 0%', () => {
    expect(budgetSharePct(1200, 0)).toBeNull();
    expect(budgetSharePct(1200, Number.NaN)).toBeNull();
    expect(budgetSharePct(0, 2000)).toBe(0);
    expect(budgetSharePct(-5, 2000)).toBe(0);
  });

  it('agrees with budgetMark for every whole kcal around the bands of many budgets', () => {
    for (let budget = 1200; budget <= 3600; budget += 37) {
      for (let kcal = Math.floor(budget * 0.85); kcal <= Math.ceil(budget * 1.05); kcal++) {
        const pct = budgetSharePct(kcal, budget)!;
        const mark = budgetMark(kcal, budget);
        if (mark === 'on') expect(pct >= 90 && pct <= 100, `${kcal}/${budget} -> ${pct}`).toBe(true);
        else if (mark === 'above') expect(pct, `${kcal}/${budget}`).toBeGreaterThan(100);
        else expect(pct, `${kcal}/${budget}`).toBeLessThan(90);
      }
    }
  });
});
