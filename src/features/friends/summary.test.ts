import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import type { ActivityEntry, FoodEntry } from '@/types';

import { buildFriendSummary, DEFAULT_SHARING, formatCode, isCompleteCode, normalizeCode, ownWorkoutsByRef, shareRef, summarySignature } from './summary';

const TODAY = '2026-11-14'; // a Saturday; the week starts Monday 2026-11-09
/** The secret the server hands only to the owner (64 hex). */
const KEY = '5f1d0c6e2b7a49c8a1e3d4f5061728394a5b6c7d8e9f00112233445566778899';

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
    const s = buildFriendSummary({ activities, foodEntries, today: TODAY, sharing: DEFAULT_SHARING, shareKey: KEY });
    expect(s.week).toBe('2026-11-09');
    expect(s.minutes).toBe(30 + 75); // moderate minutes count once
    expect(s.sessions).toBe(2);
    expect(s.streak).toBe(4); // 14, 13, 12 and 10: the single missed day (11) does not end the run
    expect(s.workouts!.map((w) => w.id)).toEqual(['a', 'b', 'c'].map((id) => shareRef(KEY, id)));
    expect(s.workouts![0]).toEqual({ id: shareRef(KEY, 'a'), name: 'Running', emoji: '🏃', minutes: 30, date: '2026-11-14', distanceKm: 5.2 });
    expect(s.workouts![1]).not.toHaveProperty('distanceKm');
  });

  it('never carries calories, weight, notes or food', () => {
    const text = JSON.stringify(buildFriendSummary({ activities, foodEntries, today: TODAY, sharing: DEFAULT_SHARING, shareKey: KEY }));
    expect(text).not.toMatch(/kcal|weight|notes|71\.2|nutrients|protein/i);
  });

  it('leaves out what the person switched off', () => {
    const s = buildFriendSummary({ activities, foodEntries, today: TODAY, sharing: { workouts: false, streak: false, minutes: true }, shareKey: KEY });
    expect(s).toEqual({ week: '2026-11-09', minutes: 105, sessions: 2 });
    expect(buildFriendSummary({ activities, foodEntries, today: TODAY, sharing: { workouts: false, streak: false, minutes: false }, shareKey: KEY })).toEqual({ week: '2026-11-09' });
  });

  it('has a signature that changes only when what friends see changes', () => {
    const a = buildFriendSummary({ activities, foodEntries, today: TODAY, sharing: DEFAULT_SHARING, shareKey: KEY });
    const sameForFriends = buildFriendSummary({ activities: activities.map((x) => ({ ...x, kcalNet: 1 })), foodEntries, today: TODAY, sharing: DEFAULT_SHARING, shareKey: KEY });
    const longer = buildFriendSummary({ activities: [...activities, act('d', '2026-11-11')], foodEntries, today: TODAY, sharing: DEFAULT_SHARING, shareKey: KEY });
    expect(summarySignature(sameForFriends)).toBe(summarySignature(a));
    expect(summarySignature(longer)).not.toBe(summarySignature(a));
  });
});

describe('workout references friends see', () => {
  // An imported workout's record id is derived from its start time, so publishing it would tell friends when it started.
  const imported = act('8b552e86-b4b0-5c91-a9b5-0267052a9b4f', '2026-11-14', {
    source: 'garmin',
    externalId: 'garmin:2026-11-14T07:05:00Z',
    startedAt: '2026-11-14T07:05:00Z',
    avgHeartRate: 151,
    measured: true,
    loggedAt: '2026-11-14T07:53:00.000Z',
  });

  it('are the first 32 hex characters of sha256(shareKey:recordId)', () => {
    expect(shareRef(KEY, 'abc')).toBe(createHash('sha256').update(`${KEY}:abc`).digest('hex').slice(0, 32));
    expect(shareRef(KEY, 'abc')).toMatch(/^[0-9a-f]{32}$/);
    expect(shareRef(KEY, 'abc')).not.toBe(shareRef(KEY.replace('5f', '6f'), 'abc'));
  });

  it('never carry the record id, the start time, heart rate or anything that dates the session within the day', () => {
    const s = buildFriendSummary({ activities: [imported], foodEntries: [], today: TODAY, sharing: DEFAULT_SHARING, shareKey: KEY });
    const text = JSON.stringify(s);
    expect(s.workouts![0].id).toBe(shareRef(KEY, imported.id));
    expect(text).not.toContain(imported.id);
    expect(text).not.toMatch(/07:05|07:53|T\d\d:|garmin|151|heart|startedAt|loggedAt|externalId/i);
    expect(Object.keys(s.workouts![0]).sort()).toEqual(['date', 'emoji', 'id', 'minutes', 'name']);
  });

  it('leaves workouts out entirely when there is no share key, rather than publish real ids', () => {
    const s = buildFriendSummary({ activities: [imported], foodEntries: [], today: TODAY, sharing: DEFAULT_SHARING, shareKey: '' });
    expect(s.workouts).toBeUndefined();
    expect(s.minutes).toBe(30);
  });

  it("publish the activity's own name, never a title that may name a place", () => {
    const titled = act('t', '2026-11-13', { name: 'Amsterdam Running', emoji: '📍 Vondelpark' });
    const unknown = act('u', '2026-11-12', { activityId: 'no-such-activity', name: 'Run to the office', emoji: '🏢' });
    const s = buildFriendSummary({ activities: [titled, unknown], foodEntries: [], today: TODAY, sharing: DEFAULT_SHARING, shareKey: KEY });
    expect(s.workouts!.map((w) => [w.name, w.emoji])).toEqual([
      ['Running', '🏃'],
      ['Workout', ''],
    ]);
    expect(JSON.stringify(s)).not.toMatch(/Amsterdam|Vondelpark|office/);
  });

  it("let the owner's app match a cheer back to its own workout", () => {
    const own = ownWorkoutsByRef([imported, act('h', '2026-11-12', { name: 'Volleyball', activityId: 'volleyball' })], KEY);
    expect(own.get(shareRef(KEY, imported.id))?.name).toBe('Running');
    expect(own.get(shareRef(KEY, 'h'))?.name).toBe('Volleyball');
    expect(own.has(imported.id)).toBe(false);
    expect(ownWorkoutsByRef([imported], '').size).toBe(0);
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
