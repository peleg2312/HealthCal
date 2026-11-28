import { describe, expect, it } from 'vitest';

import type { ActivityEntry, FoodEntry } from '@/types';

import { buildFriendSignals, LOGGED_DAYS, signalsSignature } from './signals';

// Saturday 28 Nov 2026; its week starts Monday the 23rd.
const TODAY = '2026-11-28';

const act = (date: string, durationMin: number, patch: Partial<ActivityEntry> = {}): ActivityEntry =>
  ({ id: `a-${date}-${durationMin}`, date, activityId: 'running', name: 'Morning run in the park', emoji: '🏃', category: 'cardio', intensity: 'moderate', durationMin, met: 9.8, kcalNet: 300, kcalGross: 360, loggedAt: `${date}T07:12:00.000Z`, updatedAt: `${date}T07:12:00.000Z`, ...patch }) as ActivityEntry;
const food = (date: string, patch: Partial<FoodEntry> = {}): FoodEntry =>
  ({ id: `f-${date}`, updatedAt: `${date}T12:00:00.000Z`, date, meal: 'lunch', name: 'Chicken breast', source: 'builtin', verified: true, servingLabel: '100 g', quantity: 1, grams: 100, nutrients: { kcal: 165, protein: 31, carbs: 0, fat: 3.6 }, loggedAt: `${date}T12:31:00.000Z`, ...patch }) as FoodEntry;

const activities = [act('2026-11-23', 30), act('2026-11-28', 20), act('2026-11-20', 45), act('2026-11-29', 60), act('2026-11-24', 30, { deleted: true })];
const foods = [
  food('2026-11-28'),
  food('2026-11-27'),
  food('2026-11-26', { via: 'water' }),
  food('2026-11-25', { deleted: true }),
  food('2026-10-24'),
  food('2026-10-25'),
  food('2026-11-29'),
];

describe('buildFriendSignals', () => {
  it('sends only the day when nothing is wanted', () => {
    expect(buildFriendSignals({ activities, foodEntries: foods, today: TODAY, want: { minutes: false, logged: false } })).toEqual({ today: TODAY });
  });

  it('sends this and last week’s active minutes, counted as Train counts them, for a minutes circle', () => {
    const s = buildFriendSignals({ activities, foodEntries: foods, today: TODAY, want: { minutes: true, logged: false } });
    expect(Object.keys(s).sort()).toEqual(['last_minutes', 'minutes', 'today']);
    // Moderate minutes count once; a future day, a deleted workout and last week stay out of this week.
    expect(s.minutes).toBe(50);
    expect(s.last_minutes).toBe(45);
  });

  it('sends the days with food logged in the last 35 days: never a drink from Water, a deleted entry or a day to come', () => {
    const s = buildFriendSignals({ activities, foodEntries: foods, today: TODAY, want: { minutes: false, logged: true } });
    expect(s.logged).toEqual(['2026-10-25', '2026-11-27', '2026-11-28']);
    expect(LOGGED_DAYS).toBe(35);
    expect(s).not.toHaveProperty('minutes');
  });

  it('never carries a food, a calorie, a weight, a workout’s name or a time', () => {
    const text = JSON.stringify(buildFriendSignals({ activities, foodEntries: foods, today: TODAY, want: { minutes: true, logged: true } }));
    for (const never of ['Chicken', 'kcal', '165', 'protein', 'park', 'running', 'T07', '12:31', 'lunch', 'weight']) expect(text).not.toContain(never);
  });

  it('has a signature that changes with the figures only', () => {
    const a = buildFriendSignals({ activities, foodEntries: foods, today: TODAY, want: { minutes: true, logged: true } });
    const b = buildFriendSignals({ activities: [...activities, act('2026-11-27', 10)], foodEntries: foods, today: TODAY, want: { minutes: true, logged: true } });
    expect(signalsSignature(a)).toBe(signalsSignature({ ...a }));
    expect(signalsSignature(a)).not.toBe(signalsSignature(b));
  });
});
