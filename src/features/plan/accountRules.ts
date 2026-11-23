/**
 * The pure decisions of ./account.ts (deleting an account that holds a plan, "Add a password"),
 * kept apart so they are tested without the session.
 */
import type { Session } from '@supabase/supabase-js';

import type { BillingAnswer } from './api';
import { holdsPlus, type PlanView } from './view';
import { deleteBlockedLine } from './words';

/** Whether the plan must be ended before the account can go. */
export function needsCancel(v: Pick<PlanView, 'known' | 'plan' | 'state' | 'canManage'>): boolean {
  return v.known && (holdsPlus(v) || v.canManage);
}

/** Codes that mean there is no account on the server to hold a plan, so nothing to end. */
const NOTHING_THERE = new Set(['signed_out', 'no_backend', 'unauthorized', 'unconfirmed']);

export type CancelDecision = { next: 'delete'; released: boolean } | { next: 'blocked'; message: string; offerForce: boolean };

/** What to do after `cancel-now` answered. */
export function decideAfterCancel(a: Pick<BillingAnswer, 'ok'> & { data?: Record<string, unknown>; code?: string; source?: string }): CancelDecision {
  if (a.ok) {
    const d = a.data ?? {};
    // Decided on `cancelled` alone: true means nothing paid keeps running (also when there was nothing
    // to end). False comes only with `force`, when the server released a plan it could not end.
    if (d.cancelled === true) return { next: 'delete', released: false };
    if (d.cancelled === false && d.released === true) return { next: 'delete', released: true };
    return { next: 'blocked', message: deleteBlockedLine('bad_answer'), offerForce: true };
  }
  const code = a.code ?? 'unknown';
  if (NOTHING_THERE.has(code)) return { next: 'delete', released: false };
  return { next: 'blocked', message: deleteBlockedLine(code, a.source), offerForce: true };
}

/** The delete itself was refused because a plan is still held (ruling R5). */
export function isPlanActiveRefusal(message: string): boolean {
  return /plan_active/i.test(message);
}

// ------------------------------------------------------------------ add a password (R20)

type UserLike = Pick<Session['user'], 'email'> & { identities?: { provider: string }[] | null; app_metadata?: { provider?: string; providers?: string[] } };

/**
 * True for an account that cannot sign in with a password yet: it has an email address, and its
 * identities (or, without them, its providers) name no 'email' identity.
 */
export function needsPassword(user: UserLike | null | undefined): boolean {
  if (!user?.email) return false;
  const ids = user.identities;
  if (Array.isArray(ids) && ids.length > 0) return !ids.some((i) => i.provider === 'email');
  const providers = user.app_metadata?.providers;
  if (Array.isArray(providers) && providers.length > 0) return !providers.includes('email');
  return false;
}

