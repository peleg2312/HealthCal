import { describe, expect, it } from 'vitest';

import type { FriendsOverview } from '@/services/friends';

import { cheersLabel, recentCheerCount } from './cheers';

const NOW = Date.parse('2026-11-14T12:00:00Z');
const cheer = (hoursAgo: number) => ({ fromUserId: 'u', displayName: 'Maya', avatar: 'M', ref: 'r', createdAt: new Date(NOW - hoursAgo * 3_600_000).toISOString() });
const overview = (cheers: ReturnType<typeof cheer>[], on = true): FriendsOverview => ({
  me: on ? { code: 'ABC', displayName: 'Alex', avatar: 'A', sharing: {} as never, shareKey: 'k' } : null,
  friends: [],
  incoming: [],
  outgoing: [],
  cheers,
});

describe('recentCheerCount', () => {
  it('counts cheers from the last two days', () => {
    expect(recentCheerCount('ready', overview([cheer(1), cheer(47), cheer(49)]), NOW)).toBe(2);
  });
  it('shows nothing when friends are off, signed out or loading', () => {
    expect(recentCheerCount('ready', overview([cheer(1)], false), NOW)).toBe(0);
    expect(recentCheerCount('signed-out', overview([cheer(1)]), NOW)).toBe(0);
    expect(recentCheerCount('loading', overview([cheer(1)]), NOW)).toBe(0);
    expect(recentCheerCount('unavailable', null, NOW)).toBe(0);
  });
  it('words the count', () => {
    expect(cheersLabel(1)).toBe('1 cheer');
    expect(cheersLabel(2)).toBe('2 cheers');
  });
});
