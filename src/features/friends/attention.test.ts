import { describe, expect, it } from 'vitest';

import type { FriendsOverview } from '@/services/friends';

import { friendsAttention, RECENT_CHEER_MS } from './attention';

const now = Date.parse('2026-11-15T12:00:00Z');
const me = { code: 'ALEX7K2M', displayName: 'Alex', avatar: '', shareKey: 'k', sharing: { workouts: true, streak: true, minutes: true } };
const person = (id: string) => ({ userId: id, displayName: id, avatar: '', createdAt: new Date(now).toISOString() });
const cheer = (msAgo: number) => ({ fromUserId: 'u', displayName: 'Maya', avatar: '', ref: 'day:2026-11-14', createdAt: new Date(now - msAgo).toISOString() });
const overview = (o: Partial<FriendsOverview>): FriendsOverview => ({ me, friends: [], incoming: [], outgoing: [], cheers: [], ...o });

describe('friendsAttention', () => {
  it('counts requests waiting and cheers since Friends was last opened', () => {
    expect(friendsAttention('ready', overview({ incoming: [person('a')], cheers: [cheer(3600e3), cheer(2 * 3600e3)] }), now - 90 * 60e3, now)).toBe(2);
  });
  it('never counts a cheer older than three days', () => {
    expect(friendsAttention('ready', overview({ cheers: [cheer(RECENT_CHEER_MS + 1000)] }), 0, now)).toBe(0);
  });
  it('shows nothing while friends are off, signed out, unavailable or loading', () => {
    const full = overview({ incoming: [person('a')] });
    expect(friendsAttention('ready', { ...full, me: null }, 0, now)).toBe(0);
    expect(friendsAttention('signed-out', null, 0, now)).toBe(0);
    expect(friendsAttention('unavailable', null, 0, now)).toBe(0);
    expect(friendsAttention('loading', full, 0, now)).toBe(0);
  });
});
