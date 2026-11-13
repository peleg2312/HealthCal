/**
 * Where a signed-in person belongs once the first sync has had its say.
 * Pure, so the rules can be tested without a backend.
 */
export type SignInOutcome = 'cancelled' | 'restoring' | 'switchBlocked' | 'restoreFailed' | 'home' | 'onboarding';

export interface OutcomeInput {
  signedIn: boolean;
  restoring: boolean;
  restoreFailed: boolean;
  switchBlocked: number | null;
  /** A finished profile is on this device. */
  onboarded: boolean;
}

export function signInOutcome(s: OutcomeInput): SignInOutcome {
  if (!s.signedIn) return 'cancelled';
  if (s.restoring) return 'restoring';
  if (s.switchBlocked !== null) return 'switchBlocked';
  if (s.onboarded) return 'home';
  // Unknown whether the account already has a plan: onboarding could overwrite it.
  if (s.restoreFailed) return 'restoreFailed';
  return 'onboarding';
}
