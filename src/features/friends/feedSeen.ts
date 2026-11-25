/**
 * What the feed held at the last look, kept on this phone only (never synced), so the row of people can
 * mark a friend with something new since then: a short level line inside their cup, never a number. The
 * keys are the feed's own (`feedKey`): opaque references, never a record id or a date of a meal.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export const FEED_SEEN_KEY = 'healthcal.friendsFeedSeen';
/** Enough for a full feed (the server sends at most 100 items). */
const MAX_KEYS = 200;

/** The keys seen at the last look, or null before a first look (then nothing is marked new). */
export async function readFeedSeen(): Promise<Set<string> | null> {
  try {
    const raw = await AsyncStorage.getItem(FEED_SEEN_KEY);
    if (!raw) return null;
    const list = JSON.parse(raw) as unknown;
    return Array.isArray(list) ? new Set(list.filter((k): k is string => typeof k === 'string')) : null;
  } catch {
    return null;
  }
}

/** The feed is on screen: remember what it holds for the next look. */
export function writeFeedSeen(keys: readonly string[]): void {
  AsyncStorage.setItem(FEED_SEEN_KEY, JSON.stringify(keys.slice(0, MAX_KEYS))).catch(() => undefined);
}
