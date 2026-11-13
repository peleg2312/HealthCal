import { describe, expect, it } from 'vitest';

import { signInOutcome, type OutcomeInput } from './outcome';

const base: OutcomeInput = { signedIn: true, restoring: false, restoreFailed: false, switchBlocked: null, onboarded: false };

describe('signInOutcome', () => {
  it('sends a new account to onboarding and a known one home', () => {
    expect(signInOutcome(base)).toBe('onboarding');
    expect(signInOutcome({ ...base, onboarded: true })).toBe('home');
  });

  it('never sends someone to onboarding when the restore failed and no plan is here', () => {
    expect(signInOutcome({ ...base, restoreFailed: true })).toBe('restoreFailed');
    // With a plan already on the device the failed download is harmless.
    expect(signInOutcome({ ...base, restoreFailed: true, onboarded: true })).toBe('home');
  });

  it('waits for the restore and stops for the account switch question', () => {
    expect(signInOutcome({ ...base, restoring: true })).toBe('restoring');
    expect(signInOutcome({ ...base, switchBlocked: 3, onboarded: true })).toBe('switchBlocked');
    expect(signInOutcome({ ...base, signedIn: false })).toBe('cancelled');
  });
});
