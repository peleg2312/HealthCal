import { describe, expect, it } from 'vitest';

import { recapWinFocus, type PeriodSummary } from '@/lib/insights';

import { winTile } from './recapWin';

/** A week with nothing to praise, so each test adds the one win it is about. */
const quiet = (): PeriodSummary => ({
  start: '2026-11-16',
  end: '2026-11-22',
  totalDays: 7,
  effectiveDays: 7,
  loggedDays: 3,
  loggedDaysInclToday: 3,
  completeDays: 0,
  partialDays: 0,
  calories: null,
  macros: null,
  water: null,
  activity: { minutes: 0, guidelineMinutes: 0, sessions: 0, activeDays: 0, weeklyMinutes: 0 },
  sleep: null,
  weight: null,
});

describe('winTile', () => {
  it('finds the active minutes tile in the activity win', () => {
    const s = { ...quiet(), totalDays: 4, activity: { minutes: 305, guidelineMinutes: 305, sessions: 4, activeDays: 4, weeklyMinutes: 305 } };
    const { win } = recapWinFocus(s, 'metric', 'lose');
    expect(win).toBe('305 active minutes in 4 sessions, past the weekly 150.');
    expect(winTile(win)).toBe('activity');
    const one = { ...s, activity: { ...s.activity, minutes: 1240, guidelineMinutes: 1240, sessions: 1 } };
    expect(winTile(recapWinFocus(one, 'metric', 'lose').win)).toBe('activity');
  });

  it('finds the protein tile in the protein win', () => {
    const s = { ...quiet(), macros: { protein: { avg: 150, target: 152 }, carbs: { avg: 1, target: 1 }, fat: { avg: 1, target: 1 }, fiber: null } };
    const { win } = recapWinFocus(s, 'metric', 'lose');
    expect(win).toMatch(/^Protein averaged 150 g/);
    expect(winTile(win)).toBe('protein');
  });

  it('finds the water tile in the water win', () => {
    const s = { ...quiet(), water: { avgMl: 2500, avgGoalMl: 2400, daysAtGoal: 5, daysTracked: 7 } };
    const { win } = recapWinFocus(s, 'metric', 'lose');
    expect(win).toBe('You hit your water goal on 5 of 7 days.');
    expect(winTile(win)).toBe('water');
  });

  it('leaves a win that restates no tile alone', () => {
    expect(winTile(recapWinFocus(quiet(), 'metric', 'lose').win)).toBeNull();
    const logged = { ...quiet(), loggedDaysInclToday: 7 };
    expect(winTile(recapWinFocus(logged, 'metric', 'lose').win)).toBeNull();
    const weight = { ...quiet(), weight: { startTrend: 80, endTrend: 79.6, changeKg: -0.4, spanDays: 7, weeklyRateKg: -0.4, weighIns: 4 } };
    expect(winTile(recapWinFocus(weight, 'metric', 'lose').win)).toBeNull();
    // The focus sentence about activity is not a win.
    expect(winTile('Activity: 90 of the weekly 150 active minutes; 2 brisk 30-minute walks would get you there.')).toBeNull();
  });
});
