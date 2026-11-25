/**
 * A day's eaten share of its own budget, in whole percent: the one figure every screen says for it (the
 * check-in's day by day, the Consistency calendar; the morning page and the share card should read it here
 * too), so one day never reads 89% on one screen and 90% on another. It agrees with `budgetMark`
 * (@/lib/insights) by construction: a day under 90% of its budget never shows 90% or more (floored, and held
 * at 89 at most), a day on budget shows 90 to 100, and a day above its budget never shows 100% or less
 * (at least 101). Pure: no React, no storage.
 */
import { budgetMark } from '@/lib/insights';

export function budgetSharePct(kcal: number, budget: number): number | null {
  if (!(budget > 0)) return null;
  const eaten = Math.max(0, kcal);
  const ratio = (eaten / budget) * 100;
  const mark = budgetMark(eaten, budget);
  if (mark === 'above') return Math.max(101, Math.ceil(ratio));
  // A hair under a whole number from floating point (89.99999999) is that number; the mark below still decides the band.
  const pct = Math.floor(ratio + 1e-9);
  return mark === 'on' ? Math.min(100, Math.max(90, pct)) : Math.min(89, pct);
}
