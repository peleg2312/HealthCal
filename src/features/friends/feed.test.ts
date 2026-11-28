import { describe, expect, it } from 'vitest';

import type { FeedItem, FeedMeal, FeedWorkout } from './contract';
import { feedByDay, feedKey, friendShows, friendsWithNew, inFeedSpan, localFeed, mealsOf, newTodayCount } from './feed';

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

describe('the feed by day, and what is new today', () => {
  it('groups items by their day, newest day first, keeping the feed’s order within a day', () => {
    const items = [meal('a', TODAY), workout('b', TODAY), meal('c', '2026-11-24'), workout('a', '2026-11-22'), workout('c', TODAY)];
    const days = feedByDay(items);
    expect(days.map((d) => d.day)).toEqual([TODAY, '2026-11-24', '2026-11-22']);
    expect(days[0].items.map(feedKey)).toEqual([items[0], items[1], items[4]].map(feedKey));
    expect(feedByDay([])).toEqual([]);
  });

  it('counts today’s items not seen at the last look, and every item of today before a first look', () => {
    const items = [meal('a', TODAY), workout('b', TODAY), meal('c', '2026-11-24')];
    expect(newTodayCount(items, null, TODAY)).toBe(2);
    expect(newTodayCount(items, new Set([feedKey(items[0])]), TODAY)).toBe(1);
    expect(newTodayCount(items, new Set(items.map(feedKey)), TODAY)).toBe(0);
  });
});

describe('what one friend shows you', () => {
  it('puts their meals and workouts together, newest day first, meals before workouts on a day', () => {
    const meals = [meal('a', '2026-11-24'), meal('a', TODAY)];
    const ws = [{ id: 'w1', name: 'Running', emoji: '🏃', minutes: 30, date: '2026-11-24' }, { id: 'w2', name: 'Walking', emoji: '🚶', minutes: 20, date: TODAY }];
    const out = friendShows(meals, { userId: 'a', displayName: 'a', avatar: '', cheered: ['w1'] }, ws);
    expect(out.map((i) => `${i.kind}-${i.day}`)).toEqual([`meal-${TODAY}`, `workout-${TODAY}`, 'meal-2026-11-24', 'workout-2026-11-24']);
    expect(out.find((i) => i.ref === 'w1')?.cheered).toBe(true);
    expect(out.find((i) => i.ref === 'w2')?.cheered).toBe(false);
  });
});
