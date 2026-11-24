/**
 * The allowance as cups, the pure parts.
 *
 * `shareOfPlus`: the level of a Free cup in the comparison table, its share of what Plus gives.
 *
 * `usedAllowance`: when the estimate's limit view shows the used-up cup (./AllowanceUsed.tsx): only when the person's
 * own daily allowance is fully used. Not at the project's shared ceiling (that is not their allowance),
 * and not when a careful estimate needed more than is left (nothing is fully used then). Pure; its
 * test holds it to the limit's own words (`estimateLimitWords`, @/features/ai/limit): the cup shows
 * exactly when the title says "used".
 *
 * `usedUpNow`: when the coach's limit notice, kept in the chat, still wears the used-up cup: only
 * while the allowance it speaks of is still the one in use, so tomorrow, when the allowance is whole
 * again, yesterday's notice shows the plain info mark.
 */
import type { LimitInfo } from '@/features/ai/limit';
import { toISODate } from '@/lib/dates';

export interface UsedAllowance {
  used: number;
  limit: number;
}

export function usedAllowance(info: LimitInfo | null | undefined, leftBefore: number | null): UsedAllowance | null {
  if (!info || info.shared) return null;
  if (info.cost !== null && info.cost > 1 && leftBefore !== null && leftBefore > 0 && leftBefore < info.cost) return null;
  return { used: info.limit, limit: info.limit };
}

/**
 * A Free cup's level: its share of what Plus gives (5 of 40 fills an eighth). Full when Free gives as
 * much or more (an earlier account's allowance in its grace), empty for nothing.
 */
export function shareOfPlus(free: number, plus: number): number {
  if (!Number.isFinite(free) || !(free > 0)) return 0;
  return Math.min(1, free / Math.max(1, Number.isFinite(plus) ? plus : 1));
}

/**
 * Whether a daily-limit notice written at `at` (ms) still speaks of today's allowance at `now`: the
 * person's own limit (never the shared ceiling), written today (the phone's calendar day), and not
 * yet reset (`resetsAt`, the server's next midnight UTC, when it said).
 */
export function usedUpNow(info: LimitInfo | null | undefined, at: number, now: Date): boolean {
  if (!info || info.shared || !Number.isFinite(at)) return false;
  if (toISODate(new Date(at)) !== toISODate(now)) return false;
  const resets = info.resetsAt ? Date.parse(info.resetsAt) : NaN;
  return !Number.isFinite(resets) || now.getTime() < resets;
}
