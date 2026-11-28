/**
 * The Friends screen's feed: what friends chose to show, meals and workouts side by side, from the last 7
 * days, newest first. The server sends it merged and ordered (by day, then meals before workouts); this
 * module trims it to the phone's own calendar, applies a switch the person has just changed before the
 * next reload, and says which friends have something new since the last look. Ordered by time only, never
 * by a figure: nothing here ranks anyone. Pure.
 */
import { addDays } from '@/lib/dates';
import type { ISODate } from '@/types';

import type { FeedItem, FeedMeal } from './contract';

/** The feed's span: today and the six days before (a meal planned for tomorrow included). */
export const FEED_DAYS = 7;

/** A stable key for one feed item. */
export function feedKey(item: FeedItem): string {
  return `${item.kind}-${item.userId}-${item.ref}`;
}

/** Whether `day` is in the feed's span on `today`. */
export function inFeedSpan(day: ISODate, today: ISODate): boolean {
  return day > addDays(today, -FEED_DAYS) && day <= addDays(today, 1);
}

/**
 * The feed as this phone draws it: items of friends only, in the local 7 days (a workout never dated
 * ahead), meals left out while "Friends' meals in my feed" is off or that friend's meals are off for me.
 * The server's order is kept (it is by time only).
 */
export function localFeed(input: { feed: readonly FeedItem[]; today: ISODate; seeMeals: boolean; friends: readonly { userId: string; seeMeals?: boolean }[] }): FeedItem[] {
  const friends = new Map(input.friends.map((f) => [f.userId, f]));
  const seen = new Set<string>();
  return input.feed.filter((item) => {
    const f = friends.get(item.userId);
    if (!f || !inFeedSpan(item.day, input.today)) return false;
    if (item.kind === 'workout' && item.day > input.today) return false;
    if (item.kind === 'meal' && (!input.seeMeals || f.seeMeals === false)) return false;
    const key = feedKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** One friend's shown meals, for their page, in the feed's order. */
export function mealsOf(feed: readonly FeedItem[], userId: string): FeedMeal[] {
  return feed.filter((i): i is FeedMeal => i.kind === 'meal' && i.userId === userId);
}

/**
 * Friends with something in the feed that was not there at the last look (`seenKeys`, kept on this phone).
 * Nothing is new before there was a first look, so a first visit marks no one.
 */
export function friendsWithNew(feed: readonly FeedItem[], seenKeys: ReadonlySet<string> | null): Set<string> {
  const out = new Set<string>();
  if (!seenKeys) return out;
  for (const item of feed) if (!seenKeys.has(feedKey(item))) out.add(item.userId);
  return out;
}

/** One day of the feed: its items in the server's order. */
export interface FeedDay {
  day: ISODate;
  items: FeedItem[];
}

/** The feed as cards by day ("Today", "Yesterday", "Thursday"), newest day first, each day's items in the feed's order. */
export function feedByDay(items: readonly FeedItem[]): FeedDay[] {
  const days = new Map<ISODate, FeedItem[]>();
  for (const item of items) {
    const list = days.get(item.day);
    if (list) list.push(item);
    else days.set(item.day, [item]);
  }
  return [...days.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([day, list]) => ({ day, items: list }));
}

/**
 * How many of today's items are new since the last look (`seenKeys`); before a first look, every item of
 * today. The header's line says it ("2 new today"), so it counts things, never a figure about anyone.
 */
export function newTodayCount(items: readonly FeedItem[], seenKeys: ReadonlySet<string> | null, today: ISODate): number {
  return items.filter((i) => i.day === today && (!seenKeys || !seenKeys.has(feedKey(i)))).length;
}

/**
 * Everything one friend shows you, for their page: the meals they show (`mealsOf`) and the recent workouts of their
 * week card, as feed items, newest day first and meals before workouts on a day (the server's own order). A workout
 * is cheered by the reference the card carries.
 */
export function friendShows(meals: readonly FeedMeal[], friend: { userId: string; displayName: string; avatar: string; cheered: readonly string[] }, workouts: readonly { id: string; name: string; emoji: string; minutes: number; date: ISODate; distanceKm?: number }[]): FeedItem[] {
  const person = { userId: friend.userId, displayName: friend.displayName, avatar: friend.avatar };
  const ws: FeedItem[] = workouts
    .filter((w) => w && w.id && w.date)
    .map((w) => ({ kind: 'workout' as const, ...person, ref: w.id, day: w.date, name: w.name, emoji: w.emoji, minutes: w.minutes, ...(w.distanceKm ? { distanceKm: w.distanceKm } : null), cheered: friend.cheered.includes(w.id) }));
  const all: FeedItem[] = [...meals, ...ws];
  return all
    .map((item, i) => ({ item, i }))
    .sort((a, b) => b.item.day.localeCompare(a.item.day) || (a.item.kind === b.item.kind ? a.i - b.i : a.item.kind === 'meal' ? -1 : 1))
    .map((x) => x.item);
}
