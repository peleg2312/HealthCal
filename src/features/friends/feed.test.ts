import { describe, expect, it } from 'vitest';

import type { FeedItem, FeedMeal, FeedWorkout } from './contract';
import { feedKey, friendsWithNew, inFeedSpan, localFeed, mealsOf } from './feed';

const TODAY = '2026-11-25';
const person = (userId: string) => ({ userId, displayName: userId, avatar: '' });
const meal = (userId: string, day: string, ref = `${userId}m${day}`): FeedMeal => ({
  kind: 'meal',
  ...person(userId),
  ref,
  day,
  meal: 'lunch',
  items: [{ name: 'Rice', portion: '1 cup', source: 'builtin' }],
  showKcal: false,
  cheered: false,
});
const workout = (userId: string, day: string, ref = `${userId}w${day}`): FeedWorkout => ({ kind: 'workout', ...person(userId), ref, day, name: 'Running', emoji: '🏃', minutes: 30, cheered: false });

describe('localFeed', () => {
  const feed: FeedItem[] = [meal('maya', '2026-11-26'), meal('maya', TODAY), workout('sam', TODAY), workout('sam', '2026-11-26'), meal('jo', '2026-11-24'), workout('maya', '2026-11-18'), meal('stranger', TODAY)];
  const friends = [{ userId: 'maya' }, { userId: 'sam' }, { userId: 'jo' }];

  it('keeps the server’s order, friends only, in the local 7 days, never a workout dated ahead', () => {
    expect(localFeed({ feed, today: TODAY, seeMeals: true, friends }).map(feedKey)).toEqual([
      'meal-maya-mayam2026-11-26',
      'meal-maya-mayam2026-11-25',
      'workout-sam-samw2026-11-25',
      'meal-jo-jom2026-11-24',
    ]);
  });

  it('leaves out every meal while meals are off in my feed, and one friend’s while switched off for them', () => {
    expect(localFeed({ feed, today: TODAY, seeMeals: false, friends }).every((i) => i.kind === 'workout')).toBe(true);
    const off = localFeed({ feed, today: TODAY, seeMeals: true, friends: [{ userId: 'maya', seeMeals: false }, { userId: 'sam' }, { userId: 'jo' }] });
    expect(off.filter((i) => i.kind === 'meal').map((i) => i.userId)).toEqual(['jo']);
  });

  it('draws one item once, whatever the server sent twice', () => {
    expect(localFeed({ feed: [meal('jo', TODAY), meal('jo', TODAY)], today: TODAY, seeMeals: true, friends })).toHaveLength(1);
  });

  it('spans the last 7 days and tomorrow', () => {
    expect(inFeedSpan('2026-11-19', TODAY)).toBe(true);
    expect(inFeedSpan('2026-11-18', TODAY)).toBe(false);
    expect(inFeedSpan('2026-11-26', TODAY)).toBe(true);
    expect(inFeedSpan('2026-11-27', TODAY)).toBe(false);
  });
});

describe('a friend’s page and the new mark', () => {
  it('lists one friend’s meals', () => {
    expect(mealsOf([meal('maya', TODAY), workout('maya', TODAY), meal('sam', TODAY)], 'maya').map((m) => m.ref)).toEqual(['mayam2026-11-25']);
  });

  it('marks friends with something not seen at the last look, and nobody on a first visit', () => {
    const feed = [meal('maya', TODAY), workout('sam', TODAY)];
    expect([...friendsWithNew(feed, null)]).toEqual([]);
    expect([...friendsWithNew(feed, new Set([feedKey(feed[1])]))]).toEqual(['maya']);
  });
});
