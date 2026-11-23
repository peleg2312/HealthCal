/**
 * Whether this device has agreed to send questions to the AI coach, and whether "Share my week" is on.
 *
 * Its own key and version, apart from the food estimate's (`@/features/ai/consent`): one person can
 * agree to one and not the other, and withdrawing one leaves the other. The pure readers of the food
 * estimate's agreement are reused; the stored record adds `share`.
 *
 * Kept on this device only, never in the synced settings: a new phone asks again. "Share my week" is
 * off until the person turns it on, is remembered with the agreement and goes with it: withdrawing,
 * erasing the device, signing out or deleting the account clear both (`clearCoach`, ./history.ts).
 *
 * COACH_CONSENT_VERSION is sent with every question and the server (coach-chat's coach.ts) refuses an
 * older one, so the two are raised together whenever what is sent or who receives it changes.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import { agreement, hasAgreed, readAiConsent, type AiConsent } from '@/features/ai/consent';

export const COACH_CONSENT_KEY = 'healthcal-coach-consent';
export const COACH_CONSENT_VERSION = 1;

export interface CoachConsent {
  /** Null until the person agrees (an agreement to an older wording reads as null too, see `agreed`). */
  consent: AiConsent | null;
  /** "Share my week with the coach": off unless the person turned it on. */
  share: boolean;
}

export const NO_CONSENT: CoachConsent = { consent: null, share: false };

/** The stored value, or nothing agreed and sharing off when it is missing or broken. */
export function readCoachConsent(raw: string | null): CoachConsent {
  if (!raw) return NO_CONSENT;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return NO_CONSENT;
  }
  if (!v || typeof v !== 'object') return NO_CONSENT;
  const share = (v as { share?: unknown }).share === true;
  return { consent: readAiConsent(raw), share };
}

/** What is stored: the agreement's fields (when there is one) and the switch. */
export function writeCoachConsent(c: CoachConsent): string {
  return JSON.stringify({ ...(c.consent ?? {}), share: c.share });
}

/** Agreed to the coach's current wording. */
export function coachAgreed(c: Pick<CoachConsent, 'consent'>): boolean {
  return hasAgreed(c.consent, COACH_CONSENT_VERSION);
}

// ------------------------------------------------------------ device store

type State = CoachConsent & { loaded: boolean };
export const useCoachConsent = create<State>(() => ({ loaded: false, ...NO_CONSENT }));

async function save(c: CoachConsent): Promise<void> {
  if (!c.consent && !c.share) await AsyncStorage.removeItem(COACH_CONSENT_KEY).catch(() => {});
  else await AsyncStorage.setItem(COACH_CONSENT_KEY, writeCoachConsent(c)).catch(() => {});
}

let loading: Promise<void> | null = null;
/** Read the stored answer once. An answer given meanwhile wins. */
export function loadCoachConsent(): Promise<void> {
  if (!loading) {
    loading = (async () => {
      let raw: string | null = null;
      try {
        raw = await AsyncStorage.getItem(COACH_CONSENT_KEY);
      } catch {
        raw = null;
      }
      if (!useCoachConsent.getState().loaded) useCoachConsent.setState({ loaded: true, ...readCoachConsent(raw) });
    })();
  }
  return loading;
}

/** "Agree and send". `share` is the switch as the sheet showed it. */
export async function agreeToCoach(share: boolean, now = Date.now()): Promise<void> {
  const next: CoachConsent = { consent: agreement(now, COACH_CONSENT_VERSION), share };
  useCoachConsent.setState({ loaded: true, ...next });
  await save(next);
}

/** The "Share my week" switch, in the consent sheet and in "What the coach sees". */
export async function setCoachShare(share: boolean): Promise<void> {
  const next: CoachConsent = { consent: useCoachConsent.getState().consent, share };
  useCoachConsent.setState({ loaded: true, ...next });
  await save(next);
}

/** Withdraw the agreement and switch sharing off: nothing more is sent until the person agrees again. */
export async function clearCoachConsent(): Promise<void> {
  useCoachConsent.setState({ loaded: true, ...NO_CONSENT });
  await AsyncStorage.removeItem(COACH_CONSENT_KEY).catch(() => {});
}

/** Only for tests: forget what was read so the next load reads storage again. */
export function resetCoachConsentForTests(): void {
  loading = null;
  useCoachConsent.setState({ loaded: false, ...NO_CONSENT });
}
