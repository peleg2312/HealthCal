import { describe, expect, it } from 'vitest';

import type { WeekCell, WeekCells } from './weekCells';
import { weekLabel } from './weekLabel';

function c(date: string, over: Partial<WeekCell> = {}): WeekCell {
  return { date, kcal: 2062, budget: 2170, headroom: 0, foodLogged: true, partial: false, over: false, approx: false, workout: false, ...over };
}
const nothing = { kcal: 0, foodLogged: false };
const todayEmpty = c('2026-11-19', nothing);
const six = ['12', '13', '14', '15', '16', '17'].map((d) => c(`2026-11-${d}`));

function cells(before: WeekCell[], yesterday: WeekCell | null, today: WeekCell = todayEmpty): WeekCells {
  return { before, yesterday, today, show: true, anyWorkout: false };
}

describe('weekLabel', () => {
  it('reads the example sentence', () => {
    const before = six.map((x, i) => (i === 0 ? { ...x, ...nothing } : x));
    expect(weekLabel(cells(before, c('2026-11-18')))).toBe('Your week: 6 of 7 days logged. Yesterday 2,062 of 2,170 kilocalories, within the budget. Today so far, nothing logged.');
  });

  it('says above the budget and within 10% in neutral words', () => {
    expect(weekLabel(cells([], c('2026-11-18', { kcal: 2900, over: true })))).toContain('Yesterday 2,900 of 2,170 kilocalories, above the budget.');
    expect(weekLabel(cells([], c('2026-11-18', { kcal: 2300, over: true })))).toContain('within 10% of the budget.');
  });

  it('says partly logged, about and a day with no budget', () => {
    expect(weekLabel(cells([], c('2026-11-18', { kcal: 600, partial: true })))).toContain('Yesterday 600 of 2,170 kilocalories, partly logged.');
    expect(weekLabel(cells([], c('2026-11-18', { approx: true })))).toContain('Yesterday about 2,062 of');
    expect(weekLabel(cells([], c('2026-11-18', { budget: 0 })))).toContain('Yesterday 2,062 kilocalories.');
  });

  it('reads one day in the singular, yesterday not logged and today so far', () => {
    const label = weekLabel(cells([], c('2026-11-18', nothing), c('2026-11-19', { kcal: 450, budget: 2100 })));
    expect(label).toBe('Your week: 0 of 1 day logged. Yesterday, nothing logged. Today so far, 450 of 2,100 kilocalories.');
  });

  it('counts the days with a workout', () => {
    const before = six.map((x, i) => (i < 2 ? { ...x, workout: true } : x));
    expect(weekLabel(cells(before, c('2026-11-18', { workout: true })))).toContain('A workout on 3 days.');
    expect(weekLabel(cells([], c('2026-11-18', { workout: true })))).toContain('A workout on 1 day.');
  });

  it('has no exclamation mark and no blame word', () => {
    const label = weekLabel(cells(six, c('2026-11-18', { kcal: 4000, over: true })));
    expect(label).not.toMatch(/!|\bover\b|bad|fail|cheat/i);
  });
});
