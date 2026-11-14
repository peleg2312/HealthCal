/**
 * Cheers on Today's activity cell: how many arrived in the last two days, and
 * only when friends are on and loaded. Pure, unit-tested.
 */
import type { FriendsOverview, FriendsStatus } from '@/services/friends';

export const CHEER_WINDOW_MS = 2 * 24 * 60 * 60 * 1000;

/** Cheers received in the last two days; 0 when friends are off, signed out or still loading. */
export function recentCheerCount(status: FriendsStatus, overview: FriendsOverview | null, nowMs: number): number {
  if (status !== 'ready' || !overview?.me) return 0;
  return overview.cheers.filter((c) => {
    const at = Date.parse(c.createdAt);
    return Number.isFinite(at) && at >= nowMs - CHEER_WINDOW_MS && at <= nowMs + 60_000;
  }).length;
}

/** "1 cheer", "2 cheers". */
export function cheersLabel(n: number): string {
  return `${n} ${n === 1 ? 'cheer' : 'cheers'}`;
}
