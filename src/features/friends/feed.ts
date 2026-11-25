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
