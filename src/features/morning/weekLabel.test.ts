import { describe, expect, it } from 'vitest';

import type { WeekCell, WeekCells } from './weekCells';
import { weekLabel } from './weekLabel';

function c(date: string, over: Partial<WeekCell> = {}): WeekCell {
  return { date, kcal: 2062, budget: 2170, headroom: 0, foodLogged: true, partial: false, over: false, approx: false, workout: false, kept: false, ...over };
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

  it('says above the budget for anything over it, in neutral words, never "within 10%"', () => {
    expect(weekLabel(cells([], c('2026-11-18', { kcal: 2900, over: true })))).toContain('Yesterday 2,900 of 2,170 kilocalories, above the budget.');
    expect(weekLabel(cells([], c('2026-11-18', { kcal: 2300, over: true })))).toContain('Yesterday 2,300 of 2,170 kilocalories, above the budget.');
    expect(weekLabel(cells([], c('2026-11-18', { kcal: 2300, over: true })))).not.toMatch(/within 10%/);
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

  it('names the days before yesterday that went above their budget, as the amber caps show them', () => {
    // 2026-11-14 is a Saturday, 2026-11-15 a Sunday, 2026-11-12 a Thursday.
    const two = six.map((x) => (x.date === '2026-11-14' || x.date === '2026-11-15' ? { ...x, kcal: 2600, over: true } : x));
    expect(weekLabel(cells(two, c('2026-11-18')))).toBe(
      'Your week: 7 of 7 days logged. Saturday and Sunday above the budget. Yesterday 2,062 of 2,170 kilocalories, within the budget. Today so far, nothing logged.',
    );
    const one = six.map((x) => (x.date === '2026-11-15' ? { ...x, kcal: 2600, over: true } : x));
    expect(weekLabel(cells(one, c('2026-11-18')))).toContain('Your week: 7 of 7 days logged. Sunday above the budget. Yesterday');
    const three = six.map((x) => (['2026-11-12', '2026-11-14', '2026-11-15'].includes(x.date) ? { ...x, kcal: 2600, over: true } : x));
    expect(weekLabel(cells(three, c('2026-11-18')))).toContain('Thursday, Saturday and Sunday above the budget.');
    // A partly logged day is never named above its budget (the picture draws it pale, with no cap).
    const pale = six.map((x) => (x.date === '2026-11-14' ? { ...x, kcal: 2600, partial: true } : x));
    expect(weekLabel(cells(pale, c('2026-11-18')))).not.toContain('above the budget');
  });

  it('names a kept day in the words the week strip ends its name with', () => {
    // 2026-11-12 is a Thursday, 2026-11-14 a Saturday.
    const one = six.map((x) => (x.date === '2026-11-14' ? { ...x, ...nothing, kept: true } : x));
    expect(weekLabel(cells(one, c('2026-11-18')))).toBe(
      'Your week: 6 of 7 days logged. Saturday, nothing logged, kept: one quiet day does not break your streak. Yesterday 2,062 of 2,170 kilocalories, within the budget. Today so far, nothing logged.',
    );
    const two = six.map((x) => (x.date === '2026-11-12' || x.date === '2026-11-14' ? { ...x, ...nothing, kept: true } : x));
    expect(weekLabel(cells(two, c('2026-11-18')))).toContain('Thursday and Saturday, nothing logged, kept: one quiet day does not break your streak.');
    expect(weekLabel(cells(six, c('2026-11-18', { ...nothing, kept: true })))).toContain('Yesterday, nothing logged, kept: one quiet day does not break your streak.');
    // A quiet day the streak did not keep is said as before.
    const plain = six.map((x) => (x.date === '2026-11-14' ? { ...x, ...nothing } : x));
    expect(weekLabel(cells(plain, c('2026-11-18', nothing)))).not.toContain('kept');
  });

  it('has no exclamation mark and no blame word', () => {
    const label = weekLabel(cells(six, c('2026-11-18', { kcal: 4000, over: true })));
    expect(label).not.toMatch(/!|\bover\b|bad|fail|cheat/i);
  });
});
