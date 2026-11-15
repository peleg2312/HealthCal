import AsyncStorage from '@react-native-async-storage/async-storage';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  AI_CONSENT_KEY,
  AI_CONSENT_VERSION,
  agreement,
  agreeToAi,
  checkAiConsent,
  hasAgreed,
  loadAiConsent,
  mustAsk,
  readAiConsent,
  resetAiConsentForTests,
  useAiConsentStore,
  withdrawAiConsent,
} from './consent';

const NOW = Date.UTC(2026, 10, 15, 9);

describe('readAiConsent', () => {
  it('reads a stored agreement', () => {
    expect(readAiConsent(JSON.stringify({ version: 1, agreedAt: NOW }))).toEqual({ version: 1, agreedAt: NOW });
  });

  it('treats nothing, broken JSON and a malformed record as not agreed', () => {
    expect(readAiConsent(null)).toBeNull();
    expect(readAiConsent('')).toBeNull();
    expect(readAiConsent('{nope')).toBeNull();
    expect(readAiConsent('null')).toBeNull();
    expect(readAiConsent('true')).toBeNull();
    expect(readAiConsent(JSON.stringify({ agreedAt: NOW }))).toBeNull();
    expect(readAiConsent(JSON.stringify({ version: 0, agreedAt: NOW }))).toBeNull();
    expect(readAiConsent(JSON.stringify({ version: 1.5, agreedAt: NOW }))).toBeNull();
    expect(readAiConsent(JSON.stringify({ version: 1, agreedAt: 'yesterday' }))).toBeNull();
    expect(readAiConsent(JSON.stringify({ version: 1, agreedAt: -5 }))).toBeNull();
  });

  it('keeps only the two known fields', () => {
    expect(readAiConsent(JSON.stringify({ version: 1, agreedAt: NOW, extra: 'x' }))).toEqual({ version: 1, agreedAt: NOW });
  });
});

describe('hasAgreed and mustAsk', () => {
  it('an agreement to the current wording counts', () => {
    expect(hasAgreed(agreement(NOW))).toBe(true);
    expect(agreement(NOW)).toEqual({ version: AI_CONSENT_VERSION, agreedAt: NOW });
  });

  it('an agreement to an older wording does not', () => {
    expect(hasAgreed({ version: 1, agreedAt: NOW }, 2)).toBe(false);
    expect(hasAgreed(null)).toBe(false);
  });

  it('asks only before a live estimate on a device that has not agreed', () => {
    expect(mustAsk({ live: true, consent: null })).toBe(true);
    expect(mustAsk({ live: true, consent: agreement(NOW) })).toBe(false);
    // Sample mode sends nothing, so there is nothing to agree to.
    expect(mustAsk({ live: false, consent: null })).toBe(false);
  });
});

describe('the device store', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    resetAiConsentForTests();
  });

  it('starts not agreed', async () => {
    expect(await checkAiConsent()).toBe(false);
    expect(useAiConsentStore.getState()).toEqual({ loaded: true, consent: null });
  });

  it('agreeing is saved under its own key and read back on the next start', async () => {
    await agreeToAi(NOW);
    expect(JSON.parse((await AsyncStorage.getItem(AI_CONSENT_KEY)) ?? 'null')).toEqual({ version: AI_CONSENT_VERSION, agreedAt: NOW });
    resetAiConsentForTests();
    expect(await checkAiConsent()).toBe(true);
  });

  it('withdrawing removes it, so the next estimate asks again', async () => {
    await agreeToAi(NOW);
    await withdrawAiConsent();
    expect(await AsyncStorage.getItem(AI_CONSENT_KEY)).toBeNull();
    expect(useAiConsentStore.getState().consent).toBeNull();
    resetAiConsentForTests();
    expect(await checkAiConsent()).toBe(false);
  });

  it('a broken stored value counts as not agreed and is removed', async () => {
    await AsyncStorage.setItem(AI_CONSENT_KEY, '{broken');
    await loadAiConsent();
    expect(useAiConsentStore.getState().consent).toBeNull();
    expect(await AsyncStorage.getItem(AI_CONSENT_KEY)).toBeNull();
  });

  it('an answer given while storage is still being read wins', async () => {
    await AsyncStorage.setItem(AI_CONSENT_KEY, JSON.stringify(agreement(NOW)));
    const reading = loadAiConsent();
    await withdrawAiConsent();
    await reading;
    expect(useAiConsentStore.getState().consent).toBeNull();
  });
});
