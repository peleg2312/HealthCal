import AsyncStorage from '@react-native-async-storage/async-storage';
import { beforeEach, describe, expect, it } from 'vitest';

import { AI_CONSENT_KEY, agreeToAi, resetAiConsentForTests } from '@/features/ai/consent';

import { ageOn, coachAgeAllowed } from './age';
import {
  agreeToCoach,
  clearCoachConsent,
  COACH_CONSENT_KEY,
  COACH_CONSENT_VERSION,
  coachAgreed,
  loadCoachConsent,
  readCoachConsent,
  resetCoachConsentForTests,
  setCoachShare,
  useCoachConsent,
} from './consent';

beforeEach(async () => {
  await AsyncStorage.clear();
  resetCoachConsentForTests();
  resetAiConsentForTests();
});

describe("the coach's consent", () => {
  it('has its own key and version, never the food estimate’s', async () => {
    expect(COACH_CONSENT_KEY).not.toBe(AI_CONSENT_KEY);
    expect(COACH_CONSENT_VERSION).toBe(1);
    await agreeToAi(1000);
    await loadCoachConsent();
    expect(coachAgreed(useCoachConsent.getState())).toBe(false);
    await agreeToCoach(false, 2000);
    expect(JSON.parse((await AsyncStorage.getItem(COACH_CONSENT_KEY))!)).toEqual({ version: 1, agreedAt: 2000, share: false });
    await clearCoachConsent();
    // Withdrawing the coach leaves the food estimate's agreement.
    expect(await AsyncStorage.getItem(AI_CONSENT_KEY)).not.toBeNull();
  });

  it('reads a broken or older value as nothing agreed', () => {
    expect(readCoachConsent(null)).toEqual({ consent: null, share: false });
    expect(readCoachConsent('{')).toEqual({ consent: null, share: false });
    expect(coachAgreed(readCoachConsent(JSON.stringify({ version: 0, agreedAt: 5 })))).toBe(false);
    expect(coachAgreed(readCoachConsent(JSON.stringify({ version: 1, agreedAt: 5 })))).toBe(true);
  });

  it('"Share my week" is off until turned on, remembered, and cleared with the consent', async () => {
    await loadCoachConsent();
    expect(useCoachConsent.getState().share).toBe(false);
    await setCoachShare(true);
    resetCoachConsentForTests();
    await loadCoachConsent();
    expect(useCoachConsent.getState().share).toBe(true);
    expect(coachAgreed(useCoachConsent.getState())).toBe(false);
    await agreeToCoach(true, 3000);
    await clearCoachConsent();
    resetCoachConsentForTests();
    await loadCoachConsent();
    expect(useCoachConsent.getState()).toMatchObject({ consent: null, share: false });
    expect(await AsyncStorage.getItem(COACH_CONSENT_KEY)).toBeNull();
  });
});

describe('the age rule (fails closed)', () => {
  const today = '2026-11-23';
  it('18 and over may ask', () => {
    expect(coachAgeAllowed('2008-11-23', today)).toBe(true); // 18 today
    expect(coachAgeAllowed('1990-05-01', today)).toBe(true);
  });
  it('under 18 may not', () => {
    expect(coachAgeAllowed('2008-11-24', today)).toBe(false); // 18 tomorrow
    expect(coachAgeAllowed('2010-01-01', today)).toBe(false);
    expect(ageOn('2008-11-24', today)).toBe(17);
  });
  it('anything that is not a real past date counts as under 18', () => {
    for (const bad of [undefined, null, '', 'yesterday', '1990-02-30', '1990-13-01', '1990-1-1', '2026-11-23', '2030-01-01', 19900101, '1800-01-01'])
      expect(coachAgeAllowed(bad, today)).toBe(false);
    expect(coachAgeAllowed('1990-05-01', 'not a day')).toBe(false);
  });
  it('a birthday on 29 February', () => {
    // Not a leap year: 18 on 1 March, never a day early.
    expect(coachAgeAllowed('2008-02-29', '2026-02-28')).toBe(false);
    expect(coachAgeAllowed('2008-02-29', '2026-03-01')).toBe(true);
    expect(coachAgeAllowed('2008-03-01', '2026-02-28')).toBe(false);
  });
});
