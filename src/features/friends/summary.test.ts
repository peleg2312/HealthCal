import { describe, expect, it } from 'vitest';

import type { ActivityEntry, FoodEntry } from '@/types';

import { buildFriendSummary, DEFAULT_SHARING, formatCode, isCompleteCode, normalizeCode, summarySignature } from './summary';

const TODAY = '2026-11-14'; // a Saturday; the week starts Monday 2026-11-09

const act = (id: string, date: string, patch: Partial<ActivityEntry> = {}): ActivityEntry =>
  ({
    id,
    updatedAt: '',
    date,
    activityId: 'running',
    name: 'Running',
    emoji: '🏃',
    category: 'cardio',
    intensity: 'moderate',
    durationMin: 30,
    met: 9.3,
    kcalGross: 330,
    kcalNet: 290,
    loggedAt: `${date}T08:00:00.000Z`,
    notes: 'felt strong, 71.2 kg this morning',
    ...patch,
  }) as ActivityEntry;

const food = (date: string): FoodEntry => ({ id: `f-${date}`, updatedAt: '', date, meal: 'lunch', name: 'x', source: 'builtin', verified: true, servingLabel: '1', quantity: 1, grams: 100, nutrients: { kcal: 500, protein: 30, carbs: 50, fat: 10 }, loggedAt: '' });

describe('buildFriendSummary', () => {
  const activities = [
    act('a', '2026-11-14', { distanceKm: 5.23 }),
    act('b', '2026-11-12', { name: 'Volleyball', emoji: '🏐', durationMin: 75, met: 4, activityId: 'volleyball' }),
    act('c', '2026-11-08', { durationMin: 40 }),
    act('old', '2026-10-20'),
    act('gone', '2026-11-13', { deleted: true }),
    act('future', '2026-11-20'),
  ];
  const foodEntries = [food('2026-11-14'), food('2026-11-13'), food('2026-11-12'), food('2026-11-10')];

  it('counts this week the way the Train screen does and lists recent workouts, newest first', () => {
    const s = buildFriendSummary({ activities, foodEntries, today: TODAY, sharing: DEFAULT_SHARING });
    expect(s.week).toBe('2026-11-09');
    expect(s.minutes).toBe(30 + 75); // moderate minutes count once
    expect(s.sessions).toBe(2);
    expect(s.streak).toBe(4); // 14, 13, 12 and 10: the single missed day (11) does not end the run
    expect(s.workouts!.map((w) => w.id)).toEqual(['a', 'b', 'c']);
    expect(s.workouts![0]).toEqual({ id: 'a', name: 'Running', emoji: '🏃', minutes: 30, date: '2026-11-14', distanceKm: 5.2 });
    expect(s.workouts![1]).not.toHaveProperty('distanceKm');
  });

  it('never carries calories, weight, notes or food', () => {
    const text = JSON.stringify(buildFriendSummary({ activities, foodEntries, today: TODAY, sharing: DEFAULT_SHARING }));
    expect(text).not.toMatch(/kcal|weight|notes|71\.2|nutrients|protein/i);
  });

  it('leaves out what the person switched off', () => {
    const s = buildFriendSummary({ activities, foodEntries, today: TODAY, sharing: { workouts: false, streak: false, minutes: true } });
    expect(s).toEqual({ week: '2026-11-09', minutes: 105, sessions: 2 });
    expect(buildFriendSummary({ activities, foodEntries, today: TODAY, sharing: { workouts: false, streak: false, minutes: false } })).toEqual({ week: '2026-11-09' });
  });

  it('has a signature that changes only when what friends see changes', () => {
    const a = buildFriendSummary({ activities, foodEntries, today: TODAY, sharing: DEFAULT_SHARING });
    const sameForFriends = buildFriendSummary({ activities: activities.map((x) => ({ ...x, kcalNet: 1 })), foodEntries, today: TODAY, sharing: DEFAULT_SHARING });
    const longer = buildFriendSummary({ activities: [...activities, act('d', '2026-11-11')], foodEntries, today: TODAY, sharing: DEFAULT_SHARING });
    expect(summarySignature(sameForFriends)).toBe(summarySignature(a));
    expect(summarySignature(longer)).not.toBe(summarySignature(a));
  });
});

describe('friend codes', () => {
  it('cleans what was typed or pasted', () => {
    expect(normalizeCode(' abcd-2345 ')).toBe('ABCD2345');
    expect(normalizeCode('healthcal://friends/add?code=abcd2345xyz')).toHaveLength(8);
    expect(formatCode('abcd2345')).toBe('ABCD 2345');
  });
  it('knows a complete code from a partial or impossible one', () => {
    expect(isCompleteCode('ABCD2345')).toBe(true);
    expect(isCompleteCode('ABCD234')).toBe(false);
    expect(isCompleteCode('ABCD2340')).toBe(false); // no zero in the alphabet
    expect(isCompleteCode('ABCDI345')).toBe(false); // no I
  });
});
