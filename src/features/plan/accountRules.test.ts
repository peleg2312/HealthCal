import { describe, expect, it } from 'vitest';

import { decideAfterCancel, isPlanActiveRefusal, needsCancel, needsPassword } from './accountRules';
import { demoView } from './demo';
import { UNKNOWN_PLAN } from './view';

const NOW = Date.parse('2026-11-23T12:00:00Z');

describe('deleting an account with a plan', () => {
  it('ends the plan first only when one is held or can be managed', () => {
    expect(needsCancel(demoView('plus', NOW))).toBe(true);
    expect(needsCancel(demoView('canceling', NOW))).toBe(true);
    expect(needsCancel(demoView('past_due', NOW))).toBe(true);
    expect(needsCancel(demoView('free', NOW))).toBe(false);
    expect(needsCancel({ ...demoView('free', NOW), canManage: true })).toBe(true);
    expect(needsCancel(UNKNOWN_PLAN)).toBe(false);
  });

  it('deletes when cancelled, when there was nothing to cancel, and after a release', () => {
    expect(decideAfterCancel({ ok: true, data: { cancelled: true, released: true, ended: true } })).toEqual({ next: 'delete', released: false });
    expect(decideAfterCancel({ ok: true, data: { cancelled: true, released: true, ended: false } })).toEqual({ next: 'delete', released: false });
    expect(decideAfterCancel({ ok: true, data: { cancelled: false, released: true, ended: false } })).toEqual({ next: 'delete', released: true });
    // Without a release, a plan that was not ended keeps the account.
    expect(decideAfterCancel({ ok: true, data: { cancelled: false, released: false } }).next).toBe('blocked');
  });

  it('keeps the account when ending the plan did not work, and offers Delete anyway', () => {
    for (const code of ['provider_failed', 'not_configured', 'offline', 'timeout', 'cancel_elsewhere', 'store_failed', 'internal']) {
      const d = decideAfterCancel({ ok: false, code, source: code === 'cancel_elsewhere' ? 'app_store' : undefined });
      expect(d.next).toBe('blocked');
      if (d.next === 'blocked') {
        expect(d.offerForce).toBe(true);
        expect(d.message).toMatch(/not deleted/);
      }
    }
    expect(decideAfterCancel({ ok: true, data: {} }).next).toBe('blocked');
  });

  it('deletes when there is no account on the server to hold a plan', () => {
    for (const code of ['signed_out', 'no_backend', 'unauthorized', 'unconfirmed']) expect(decideAfterCancel({ ok: false, code }).next).toBe('delete');
  });

  it("knows the server's plan_active refusal", () => {
    expect(isPlanActiveRefusal('plan_active')).toBe(true);
    expect(isPlanActiveRefusal('P0001: plan_active')).toBe(true);
    expect(isPlanActiveRefusal('No connection.')).toBe(false);
  });
});

describe('Add a password', () => {
  it('is offered to an account with no email identity', () => {
    expect(needsPassword({ email: 'a@b.co', identities: [{ provider: 'google' }] })).toBe(true);
    expect(needsPassword({ email: 'a@b.co', identities: [{ provider: 'google' }, { provider: 'email' }] })).toBe(false);
    expect(needsPassword({ email: 'a@b.co', identities: [{ provider: 'email' }] })).toBe(false);
    expect(needsPassword({ email: 'a@b.co', identities: [], app_metadata: { providers: ['google'] } })).toBe(true);
    expect(needsPassword({ email: 'a@b.co' })).toBe(false);
    expect(needsPassword({ email: undefined, identities: [{ provider: 'google' }] })).toBe(false);
    expect(needsPassword(null)).toBe(false);
  });
});
