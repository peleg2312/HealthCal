/**
 * Test-hook builds only (a development build, or EXPO_PUBLIC_E2E): `?planDemo=<preset>` shows the
 * plan as one of these, with no backend, as `?updatesDemo=` does for About. Release bundles never
 * read it (`demoPreset` answers null there). The dates are counted from the moment of loading, so a
 * picture always shows a plan that is current.
 */
import { Platform } from 'react-native';

import { UNKNOWN_PLAN, type PlanOffer, type PlanView } from './view';

export const DEMO_PRESETS = ['off', 'free', 'plus', 'canceling', 'past_due', 'grace', 'waiting', 'late'] as const;
export type PlanDemo = (typeof DEMO_PRESETS)[number];

const DAY = 86_400_000;

export const DEMO_OFFERS: PlanOffer[] = [
  { id: 'test-plus-month', plan: 'plus', period: 'month', amount: 399, currency: 'USD', taxIncluded: false },
  { id: 'test-plus-year', plan: 'plus', period: 'year', amount: 2999, currency: 'USD', taxIncluded: false },
];

const FREE_LIMITS = { estimates: 5, questions: 5, memoryPairs: 3 };
const PLUS_LIMITS = { estimates: 40, questions: 30, memoryPairs: 6 };

/** The view a preset shows, at `now`. */
export function demoView(preset: PlanDemo, now: number): PlanView {
  const iso = (ms: number) => new Date(ms).toISOString();
  const free: PlanView = { ...UNKNOWN_PLAN, known: true, plansOn: true, limits: FREE_LIMITS, offers: DEMO_OFFERS, canCheckout: true };
  const started = now - 3 * DAY;
  const plus: PlanView = {
    ...free,
    plan: 'plus',
    state: 'active',
    source: 'test',
    period: 'year',
    startedAt: iso(started),
    periodEnd: iso(started + 365 * DAY),
    limits: PLUS_LIMITS,
    canCheckout: false,
    canManage: true,
  };
  switch (preset) {
    case 'off':
      return { ...UNKNOWN_PLAN, known: true };
    case 'free':
    case 'waiting':
    case 'late':
      return free;
    case 'grace':
      return { ...free, limits: { estimates: 40, questions: 30, memoryPairs: 3 }, graceUntil: iso(now + 69 * DAY) };
    case 'plus':
      return plus;
    case 'canceling':
      return { ...plus, state: 'canceling', cancelAtPeriodEnd: true, startedAt: iso(now - 40 * DAY), periodEnd: iso(now + 30 * DAY), period: 'month' };
    case 'past_due':
      return { ...plus, state: 'past_due', startedAt: iso(now - 365 * DAY), periodEnd: iso(now - 2 * DAY), paymentGraceUntil: iso(now + 5 * DAY) };
  }
}

/** The preset in the address of a test-hook web build, else null. */
export function demoPreset(): PlanDemo | null {
  if (!((typeof __DEV__ !== 'undefined' && __DEV__) || process.env.EXPO_PUBLIC_E2E === '1')) return null;
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const p = /[?&]planDemo=([a-z_]+)/.exec(window.location?.search ?? '')?.[1];
  return p && (DEMO_PRESETS as readonly string[]).includes(p) ? (p as PlanDemo) : null;
}
