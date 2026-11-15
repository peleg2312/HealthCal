/**
 * The small count on the Friends button in every tab header: requests waiting for
 * an answer plus cheers received since the Friends screen was last opened on this
 * phone (and in the last three days, so an old cheer never lingers as "new").
 *
 * Nothing is counted while friends are off, signed out, unavailable or still
 * loading: the button then carries no count at all. When the Friends screen was
 * last seen is kept on this device only (never synced).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import type { FriendsOverview, FriendsStatus } from '@/services/friends';

export const FRIENDS_SEEN_KEY = 'healthcal-friends-seen';
/** A cheer older than this is not new, whenever the screen was last opened. */
export const RECENT_CHEER_MS = 3 * 24 * 60 * 60 * 1000;

/** How many things on the Friends screen want a look. 0 means show nothing. */
export function friendsAttention(status: FriendsStatus, overview: FriendsOverview | null, seenAt: number, now: number): number {
  if (status !== 'ready' || !overview?.me) return 0;
  const since = Math.max(seenAt, now - RECENT_CHEER_MS);
  const cheers = overview.cheers.filter((c) => {
    const at = Date.parse(c.createdAt);
    return Number.isFinite(at) && at > since;
  }).length;
  return overview.incoming.length + cheers;
}

type Seen = { seenAt: number };
export const useFriendsSeen = create<Seen>(() => ({ seenAt: 0 }));

let loaded = false;
/** Read when the Friends screen was last opened on this phone, once. */
export function loadFriendsSeen(): void {
  if (loaded) return;
  loaded = true;
  void (async () => {
    try {
      const raw = await AsyncStorage.getItem(FRIENDS_SEEN_KEY);
      const at = Number(raw);
      if (Number.isFinite(at) && at > useFriendsSeen.getState().seenAt) useFriendsSeen.setState({ seenAt: at });
    } catch {
      /* no storage: every recent cheer counts as new, which is harmless */
    }
  })();
}

/** The Friends screen is on screen: what it shows is no longer new. */
export function markFriendsSeen(now = Date.now()): void {
  loaded = true;
  useFriendsSeen.setState({ seenAt: now });
  AsyncStorage.setItem(FRIENDS_SEEN_KEY, String(now)).catch(() => undefined);
}
