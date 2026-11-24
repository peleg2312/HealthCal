/**
 * Test-hook builds only (a development build, or EXPO_PUBLIC_E2E): `?authDemo=<view>` draws one of the
 * account views with no backend, as `?planDemo=` does for the plan screen, so the pictures of sign-in
 * do not need the stand-in backend. Release bundles never read it (`authDemo` answers null there, and
 * so does everything else here: each one asks `demoSearch` first).
 *
 *   /welcome?authDemo=google                       welcome as with accounts and Google on
 *   /welcome?authDemo=declined                     the same, back from a declined Google sign-in (its note)
 *   /auth?authDemo=signin|signup|declined          the form with Continue with Google (declined: its note)
 *   /auth?authDemo=waiting|checking|restoring      the three waits with the waiting cup
 *   /auth?authDemo=inbox                           "Check your inbox"
 *   /settings/account?authDemo=signed-in|signed-out
 *     &syncDemo=synced|waiting|syncing|paused|offline   the sync row in one of its states (./syncRow.ts)
 *     &demoEmail=long                                   a 55-letter address in place of the everyday one
 *
 * A demo view is a picture: its buttons are the real ones, and with no backend behind them they
 * answer as they would offline.
 */
import { Platform } from 'react-native';

import { SYNC_DEMO_STATES, SYNC_DEMOS, type SyncDemo, type SyncDemoState } from './syncRow';

export const AUTH_DEMOS = ['google', 'signin', 'signup', 'declined', 'waiting', 'checking', 'restoring', 'inbox', 'signed-in', 'signed-out'] as const;
export type AuthDemo = (typeof AUTH_DEMOS)[number];

/** The address a demo account shows: an everyday one, which fits one line of Account's card. */
export const DEMO_EMAIL = 'alex.kim@example.com';
/** A long one (`&demoEmail=long`), to prove an address wraps at its @ and dots. */
export const DEMO_EMAIL_LONG = 'bartholomew.christophe.longname@example-family-mail.com';

/** The view a query string asks for, or null. */
export function authDemoFrom(search: string): AuthDemo | null {
  const v = new URLSearchParams(search).get('authDemo');
  return (AUTH_DEMOS as readonly string[]).includes(v ?? '') ? (v as AuthDemo) : null;
}

/** The sync row's state a query string asks for, or null. */
export function syncDemoFrom(search: string): SyncDemoState | null {
  const v = new URLSearchParams(search).get('syncDemo');
  return (SYNC_DEMOS as readonly string[]).includes(v ?? '') ? SYNC_DEMO_STATES[v as SyncDemo] : null;
}

/** The address a query string asks a demo account to show. */
export function demoEmailFrom(search: string): string {
  return new URLSearchParams(search).get('demoEmail') === 'long' ? DEMO_EMAIL_LONG : DEMO_EMAIL;
}

/**
 * The address's query string in a test-hook web build, else null: the one gate every demo reads
 * through, so a release bundle (no `__DEV__`, no EXPO_PUBLIC_E2E) never draws a demo view.
 */
function demoSearch(): string | null {
  if (!((typeof __DEV__ !== 'undefined' && __DEV__) || process.env.EXPO_PUBLIC_E2E === '1')) return null;
  if (Platform.OS !== 'web' || typeof window === 'undefined' || typeof window.location?.search !== 'string') return null;
  return window.location.search;
}

/** The view in the address of a test-hook web build, else null. */
export function authDemo(): AuthDemo | null {
  const search = demoSearch();
  return search === null ? null : authDemoFrom(search);
}

/** The sync row's demo state in the address of a test-hook web build, else null. */
export function syncDemo(): SyncDemoState | null {
  const search = demoSearch();
  return search === null ? null : syncDemoFrom(search);
}

/** The demo account's address in a test-hook web build (the everyday one anywhere else). */
export function demoEmail(): string {
  const search = demoSearch();
  return search === null ? DEMO_EMAIL : demoEmailFrom(search);
}
