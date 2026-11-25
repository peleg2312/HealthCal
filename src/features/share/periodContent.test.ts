import { describe, expect, it } from 'vitest';

import { monthPeriod, monthRows, periodTally, yearPeriod, yearRows, type DayFacts } from '@/features/recap/period';
import { lightColors } from '@/theme/tokens';

import { DEFAULT_SHARE_CHOICES } from './content';
import { periodCardContent, periodHeadline, type SharePeriodInput } from './periodContent';
import { PERIOD_SIZE, periodScene } from './periodScene';

const today = '2026-11-25';
const days: DayFacts[] = [
  { date: '2026-10-05', logged: true, complete: true, kcal: 1900, budget: 2000 },
  { date: '2026-10-06', logged: true, complete: true, kcal: 2400, budget: 2000 },
  { date: '2026-10-07', logged: true, complete: false, kcal: 300, budget: 2000 },
];
const byDate = new Map(days.map((d) => [d.date, d]));

function input(kind: 'month' | 'year' = 'month'): SharePeriodInput {
  const period = kind === 'month' ? monthPeriod('2026-10') : yearPeriod('2026');
  return {
    period,
    today,
    units: 'metric',
    rows: kind === 'month' ? monthRows(period, byDate, today, '2026-10-01') : yearRows(period, byDate, today, '2026-10-01'),
    tally: periodTally(period, byDate, today, '2026-10-01'),
    avgKcal: 2150,
    activity: { activeMinutes: 640, workouts: 9, days: 8 },
    water: { totalMl: 48_600, daysTracked: 20, daysReached: 12 },
    foods: ['Oats', 'Banana'],
  };
}

describe('a month’s or a year’s share card', () => {
  it('never carries weight, and calorie figures and food names only when chosen', () => {
    const plain = periodCardContent(input(), DEFAULT_SHARE_CHOICES);
    expect(plain.summary).not.toMatch(/kg|lb|weight/i);
    expect(plain.stats.map((s) => s.key)).toEqual(['budget', 'water', 'activity']);
    expect(plain.foods).toBeNull();
    expect(plain.summary).not.toMatch(/kcal|Oats/);
    const all = periodCardContent(input(), { ...DEFAULT_SHARE_CHOICES, kcal: true, foods: true });
    expect(all.stats.map((s) => s.key)).toEqual(['budget', 'kcal', 'water', 'activity']);
    expect(all.foods).toBe('Oats, Banana');
    expect(all.summary).toContain('Logged most: Oats, Banana.');
  });

  it('counts the days on budget by the shared rule, and never says "0 of 0"', () => {
    const c = periodCardContent(input(), DEFAULT_SHARE_CHOICES);
    expect(c.stats[0]).toMatchObject({ value: '1', unit: 'of 2', label: 'full days on budget' });
    const none = periodCardContent({ ...input(), tally: { ...input().tally, counts: { full: 0, on: 0, above: 0 } } }, DEFAULT_SHARE_CHOICES);
    expect(none.stats.some((s) => s.key === 'budget')).toBe(false);
  });

  it('says the days logged once, in the headline, in words', () => {
    const c = periodCardContent(input(), DEFAULT_SHARE_CHOICES);
    expect(c.headline).toBe('Food logged on 3 of 31 days.');
    expect(c.title).toBe('My October');
    expect(c.overline).toBe('OCTOBER 2026');
    expect(periodHeadline(yearPeriod('2026'), { ...input('year').tally, logged: 56, elapsed: 56 }, today)).toBe('Food logged every day so far.');
    expect(periodHeadline(monthPeriod('2026-10'), { ...input().tally, logged: 0 }, today)).toBe('No food logged in October.');
  });

  it('draws a portrait card with the cups inside it, for a month and for a year', () => {
    for (const kind of ['month', 'year'] as const) {
      const c = periodCardContent(input(kind), { ...DEFAULT_SHARE_CHOICES, kcal: true, foods: true });
      const scene = periodScene(c, lightColors);
      expect(scene).toMatchObject(PERIOD_SIZE);
      for (const p of scene.prims) {
        if (p.k === 'rect') {
          expect(p.x).toBeGreaterThanOrEqual(0);
          expect(p.y + p.h).toBeLessThanOrEqual(PERIOD_SIZE.height);
        }
        if (p.k === 'text') expect(p.y).toBeLessThanOrEqual(PERIOD_SIZE.height);
      }
      expect(scene.prims.some((p) => p.k === 'path' && p.fill === lightColors.vesselEmpty)).toBe(true);
    }
  });
});
