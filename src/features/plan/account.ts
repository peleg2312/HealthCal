/**
 * The account side of a plan: deleting an account that holds one, and "Add a password" for an account
 * made with Google (ruling R20). The decisions are pure and tested; `deleteAccountWithPlan` runs them.
 *
 * DELETING (rulings R4, R5). With a plan held, the server is asked to end it first (`cancel-now`, no
 * further charge) and the account is deleted only when that answers `cancelled: true` or there was
 * nothing to cancel. When ending it does not work the account is kept, the screen says why, and offers
 * "Delete anyway": `cancel-now` with `force` (the server releases the plan on its side and answers
 * `released: true`), then the delete, then one line that the subscription must also be cancelled at
 * the payment company. A delete the server refuses with `plan_active` (a plan this copy did not know
 * about) ends the plan first and tries once more.
 */
import { deleteAccount, sendPasswordReset } from '@/services/auth';

import { billingCall } from './api';
import { planNow, refreshPlan } from './cache';
import { decideAfterCancel, isPlanActiveRefusal, needsCancel, type CancelDecision } from './accountRules';
import { addPasswordSent, deleteBlockedLine, PLAN_ACTIVE_LINE } from './words';

export type DeleteOutcome =
  | { kind: 'deleted'; released: boolean }
  | { kind: 'blocked'; message: string; offerForce: boolean }
  | { kind: 'failed'; message: string };

async function endPlan(force: boolean): Promise<CancelDecision> {
  const a = await billingCall(force ? { action: 'cancel-now', force: true } : { action: 'cancel-now' }).catch(() => null);
  if (!a) return { next: 'blocked', message: deleteBlockedLine('offline'), offerForce: true };
  return decideAfterCancel(a);
}

/** Delete the account, ending a held plan first. `force` is the second step, "Delete anyway". */
export async function deleteAccountWithPlan(opts: { force?: boolean } = {}): Promise<DeleteOutcome> {
  const force = opts.force === true;
  const view = planNow().known ? planNow() : await refreshPlan();
  let released = false;
  let ended = false;
  if (force || needsCancel(view)) {
    const d = await endPlan(force);
    if (d.next === 'blocked') return { kind: 'blocked', message: d.message, offerForce: d.offerForce };
    released = d.released;
    ended = true;
  }
  let res = await deleteAccount();
  if (!res.ok && isPlanActiveRefusal(res.message) && !ended) {
    const d = await endPlan(false);
    if (d.next === 'blocked') return { kind: 'blocked', message: d.message, offerForce: d.offerForce };
    released = d.released;
    res = await deleteAccount();
  }
  if (!res.ok) {
    if (isPlanActiveRefusal(res.message)) return { kind: 'blocked', message: PLAN_ACTIVE_LINE, offerForce: true };
    return { kind: 'failed', message: res.message };
  }
  return { kind: 'deleted', released };
}

// ------------------------------------------------------------------ add a password (R20)


/** Send the mail that lets the person choose a password; the words say where it went. */
export async function sendAddPassword(email: string): Promise<{ ok: boolean; message: string }> {
  const r = await sendPasswordReset(email);
  return r.ok ? { ok: true, message: addPasswordSent(email) } : { ok: false, message: r.message };
}
