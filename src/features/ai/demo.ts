/**
 * Sample mode. When this build has no backend, or nobody is signed in, the
 * photo flow still works end to end with a canned result so it can be
 * explored. Everything here is labelled as a sample in the UI: it is never
 * based on the user's photo or words.
 */
import type { AiFoodResult } from '@/types';

import type { AiErrorCode } from './api';

export type AiAvailability =
  | { live: true }
  | { live: false; reason: 'no_backend' | 'signed_out' };

export function availability(backendConfigured: boolean, signedIn: boolean): AiAvailability {
  if (!backendConfigured) return { live: false, reason: 'no_backend' };
  if (!signedIn) return { live: false, reason: 'signed_out' };
  return { live: true };
}

export const DEMO_MODEL = 'sample';

/** A typical plated dinner with values from standard reference data. */
export function demoResult(): AiFoodResult {
  return {
    dish: 'Chicken, rice and salad',
    items: [
      { name: 'Grilled chicken breast', grams: 150, kcal: 248, protein: 46.5, carbs: 0, fat: 5.4, fiber: 0, confidence: 0.85 },
      { name: 'White rice, cooked', grams: 180, kcal: 234, protein: 4.9, carbs: 50.8, fat: 0.5, fiber: 0.7, confidence: 0.7 },
      { name: 'Mixed green salad', grams: 80, kcal: 14, protein: 1, carbs: 2.6, fat: 0.2, fiber: 1.5, confidence: 0.9 },
      { name: 'Cherry tomatoes', grams: 60, kcal: 11, protein: 0.5, carbs: 2.3, fat: 0.1, fiber: 0.7, confidence: 0.8 },
    ],
    hiddenFatQuestion: 'Was the chicken cooked in oil, or the salad dressed?',
    note: 'Portion of rice is hard to judge without something for scale.',
    model: DEMO_MODEL,
    demo: true,
  };
}

/** Delay that keeps the sample from feeling instant without wasting time. */
export const DEMO_DELAY_MS = 1400;

/**
 * Development aid: `?demoError=<code>` on the photo route makes the sample
 * analysis fail with that code, so every error screen can be looked at
 * without a backend. Ignored outside development builds.
 */
export const DEMO_ERROR_CODES: AiErrorCode[] = [
  'daily_limit',
  'not_food',
  'declined',
  'truncated',
  'rate_limited',
  'unauthorized',
  'not_configured',
  'bad_request',
  'upstream',
  'network',
  'timeout',
  'unknown',
];
