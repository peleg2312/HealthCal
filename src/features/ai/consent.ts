/**
 * Whether this device has agreed to send meal photos and descriptions out for
 * an AI estimate.
 *
 * An estimate sends the photo, or the words typed, to HealthCal's server, which
 * passes them to Anthropic (Claude) to estimate the food. Apple's guideline
 * 5.1.2 asks for clear, explicit permission before personal data goes to a
 * third-party AI, and it is the honest thing to do: the first live estimate on
 * a device asks first (`AiConsentSheet`), and the answer is kept here.
 *
 * Kept on this device only, under its own key, never in the synced settings:
 * a new phone asks again. Withdrawing removes it, so the next estimate asks
 * again. Sample mode sends nothing and never asks.
 *
 * `version` is the wording that was agreed to. If what is sent or who receives
 * it ever changes, raise AI_CONSENT_VERSION and everyone is asked again.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

export const AI_CONSENT_KEY = 'healthcal-ai-consent';
export const AI_CONSENT_VERSION = 1;

export type AiConsent = { version: number; agreedAt: number };

/** The stored value if it is a well-formed agreement; otherwise null (nothing agreed). */
export function readAiConsent(raw: string | null): AiConsent | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<AiConsent> | null;
    if (!v || typeof v !== 'object') return null;
    const { version, agreedAt } = v;
    if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) return null;
    if (typeof agreedAt !== 'number' || !Number.isFinite(agreedAt) || agreedAt <= 0) return null;
    return { version, agreedAt };
  } catch {
    return null;
  }
}

/** Agreed to the current wording (an agreement to an older wording does not count). */
export function hasAgreed(consent: AiConsent | null, version = AI_CONSENT_VERSION): boolean {
  return !!consent && consent.version >= version;
}

/** The record saved when someone taps "Agree and continue". */
export function agreement(now: number, version = AI_CONSENT_VERSION): AiConsent {
  return { version, agreedAt: now };
}

/** Whether an estimate must ask first: only a live estimate sends anything. */
export function mustAsk(s: { live: boolean; consent: AiConsent | null }): boolean {
  return s.live && !hasAgreed(s.consent);
}

// ------------------------------------------------------------ device store

type State = { loaded: boolean; consent: AiConsent | null };
export const useAiConsentStore = create<State>(() => ({ loaded: false, consent: null }));

/** True once this device has agreed to the current wording. */
export const useAiConsent = (): boolean => useAiConsentStore((s) => hasAgreed(s.consent));

let loading: Promise<void> | null = null;
/** Read the stored answer once. A broken value counts as not agreed and is removed. */
export function loadAiConsent(): Promise<void> {
  if (!loading) {
    loading = (async () => {
      let raw: string | null = null;
      try {
        raw = await AsyncStorage.getItem(AI_CONSENT_KEY);
      } catch {
        raw = null;
      }
      const consent = readAiConsent(raw);
      // An answer given meanwhile (tapped while this was reading) wins.
      if (!useAiConsentStore.getState().loaded) useAiConsentStore.setState({ loaded: true, consent });
      if (raw && !consent) await AsyncStorage.removeItem(AI_CONSENT_KEY).catch(() => {});
    })();
  }
  return loading;
}

/** Whether this device has agreed, reading storage first if it has not been read yet. */
export async function checkAiConsent(): Promise<boolean> {
  await loadAiConsent();
  return hasAgreed(useAiConsentStore.getState().consent);
}

export async function agreeToAi(now = Date.now()): Promise<void> {
  const consent = agreement(now);
  useAiConsentStore.setState({ loaded: true, consent });
  await AsyncStorage.setItem(AI_CONSENT_KEY, JSON.stringify(consent)).catch(() => {});
}

/** Withdraw: nothing more is sent until the person agrees again. */
export async function withdrawAiConsent(): Promise<void> {
  useAiConsentStore.setState({ loaded: true, consent: null });
  await AsyncStorage.removeItem(AI_CONSENT_KEY).catch(() => {});
}

/** Only for tests: forget what was read so the next load reads storage again. */
export function resetAiConsentForTests(): void {
  loading = null;
  useAiConsentStore.setState({ loaded: false, consent: null });
}
