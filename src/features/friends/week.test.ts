import { describe, expect, it } from 'vitest';

import { activityNoun, cheerTarget, dayLabel, friendWeek, initialsFor, isCurrentWeek, isEmojiAvatar, latestWorkout, outcomeMessage, personMark, sharesAnything, sharingSentence } from './week';

const TODAY = '2026-11-14'; // Saturday; the week starts Monday 2026-11-09

describe('friendWeek', () => {
  it('is null when workouts are not shared, so no empty row is drawn', () => {
    expect(friendWeek({ minutes: 90, sessions: 2 }, TODAY)).toBeNull();
  });
  it('sums shared workouts per day of this week and marks future days', () => {
    const week = friendWeek(
      {
        workouts: [
          { id: 'a', name: 'Running', emoji: '🏃', minutes: 30, date: '2026-11-09' },
          { id: 'b', name: 'Yoga', emoji: '🧘', minutes: 45, date: '2026-11-09' },
          { id: 'c', name: 'Walking', emoji: '🚶', minutes: 20, date: '2026-11-13' },
          { id: 'old', name: 'Walking', emoji: '🚶', minutes: 50, date: '2026-11-05' },
        ],
      },
      '2026-11-13',
    )!;
    expect(week.map((d) => d.date)).toEqual(['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15']);
    expect(week[0]).toMatchObject({ minutes: 75, progress: 1 });
    expect(week[4]).toMatchObject({ minutes: 20 });
    expect(week[4].progress).toBeCloseTo(1 / 3);
    expect(week.filter((d) => d.future).map((d) => d.date)).toEqual(['2026-11-14', '2026-11-15']);
  });
});

describe('summary parts', () => {
  it('knows whether the numbers are for this week', () => {
    expect(isCurrentWeek({ week: '2026-11-09' }, TODAY)).toBe(true);
    expect(isCurrentWeek({ week: '2026-11-02' }, TODAY)).toBe(false);
    expect(isCurrentWeek({}, TODAY)).toBe(true);
  });
  it('finds the newest workout and whether anything is shared', () => {
    const s = { workouts: [{ id: 'a', name: 'A', emoji: '', minutes: 1, date: '2026-11-10' }, { id: 'b', name: 'B', emoji: '', minutes: 1, date: '2026-11-12' }] };
    expect(latestWorkout(s)?.id).toBe('b');
    expect(latestWorkout({})).toBeNull();
    expect(sharesAnything({ week: '2026-11-09' })).toBe(false);
    expect(sharesAnything({ streak: 0 })).toBe(true);
  });
});

describe('labels', () => {
  it('names days relative to today without reading the clock', () => {
    expect(dayLabel(TODAY, TODAY)).toBe('Today');
    expect(dayLabel('2026-11-13', TODAY)).toBe('Yesterday');
    expect(dayLabel('2026-11-10', TODAY)).toBe('Tuesday');
    expect(dayLabel('2026-11-01', TODAY)).toBe('Nov 1');
  });
  it('matches a cheer to the workout it was for', () => {
    const own = new Map([['w1', { name: 'Running' }], ['w2', { name: 'Strength training' }]]);
    expect(cheerTarget('w1', own, TODAY)).toBe('your run');
    expect(cheerTarget('w2', own, TODAY)).toBe('your strength training');
    expect(cheerTarget('gone', own, TODAY)).toBe('a workout of yours');
    expect(cheerTarget('day:2026-11-14', own, TODAY)).toBe('your day today');
    expect(cheerTarget('day:2026-11-11', own, TODAY)).toBe('your day on Wednesday');
    expect(activityNoun('Walking')).toBe('walk');
  });
  it('says every request outcome in plain words', () => {
    for (const o of ['sent', 'accepted', 'already_friends', 'not_found', 'self', 'too_many', 'limit', 'setup_needed']) {
      const m = outcomeMessage(o, 'Maya');
      expect(m.title.length).toBeGreaterThan(3);
      expect(m.message).not.toMatch(/!/);
    }
    expect(outcomeMessage('accepted', 'Maya').message).toMatch(/Maya had already asked/);
    expect(outcomeMessage('sent').good).toBe(true);
    expect(outcomeMessage('not_found').good).toBe(false);
  });
});

describe('person marks', () => {
  it('uses an emoji, chosen letters or initials', () => {
    expect(isEmojiAvatar('🏃')).toBe(true);
    expect(isEmojiAvatar('AB')).toBe(false);
    expect(initialsFor('Sam Ortiz')).toBe('SO');
    expect(initialsFor('maya')).toBe('M');
    expect(personMark('Sam Ortiz', '')).toEqual({ kind: 'initials', text: 'SO' });
    expect(personMark('Sam', 'x')).toEqual({ kind: 'initials', text: 'X' });
    expect(personMark('Sam', '🚴')).toEqual({ kind: 'emoji', text: '🚴' });
  });
});

describe('sharingSentence', () => {
  it('lists only what is shared and always says what never is', () => {
    expect(sharingSentence({ minutes: true, streak: true, workouts: true })).toBe('Friends see your minutes and sessions, streak and workouts. Never calories, weight or food.');
    expect(sharingSentence({ minutes: true, streak: false, workouts: false })).toBe('Friends see your minutes and sessions. Never calories, weight or food.');
    expect(sharingSentence({ minutes: false, streak: false, workouts: false })).toBe('Friends see only your name. Never calories, weight or food.');
  });
});
