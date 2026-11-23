/**
 * The chat on the phone: its owner, the last 60, and the wipe. The wipe is proved against the real
 * store the way health-sync's memory is: the profile goes away (erase, sign out, delete account,
 * account switch all end in `resetAll`) and the chat and the coach's agreement are gone, in memory
 * and in storage.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useStore } from '@/store';
import type { Profile } from '@/types';

import { agreeToCoach, COACH_CONSENT_KEY, loadCoachConsent, resetCoachConsentForTests, setCoachShare, useCoachConsent } from './consent';
import {
  addCoachMessages,
  capHistory,
  clearCoachHistory,
  COACH_HISTORY_KEY,
  coachOwner,
  HISTORY_MAX,
  loadCoachHistory,
  readHistory,
  restoreCoachMessages,
  startCoach,
  useCoachHistory,
  writeHistory,
} from './history';
import type { CoachMessage } from './request';

const profile = (onboardedAt: string): Profile =>
  ({
    name: 'Dana',
    sex: 'female',
    birthDate: '1990-05-01',
    heightCm: 168,
    weightKg: 64,
    activityLevel: 'moderate',
    goal: 'maintain',
    weeklyRateKg: 0,
    units: 'metric',
    eatBackExercise: true,
    useAdaptiveTdee: false,
    onboardedAt,
    updatedAt: onboardedAt,
  }) as Profile;

let n = 0;
const msg = (text: string): CoachMessage => ({ id: `m${n++}`, role: 'user', source: 'typed', text, at: n });
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(async () => {
  await AsyncStorage.clear();
  useStore.getState().resetAll();
  useCoachHistory.setState({ loaded: false, owner: null, messages: [] });
  resetCoachConsentForTests();
});

describe('the owner', () => {
  it('is the profile the chat belongs to', () => {
    expect(coachOwner({ profile: null })).toBeNull();
    expect(coachOwner({ profile: profile('2026-01-02T00:00:00Z') })).toBe('profile:2026-01-02T00:00:00Z');
  });

  it('a stored chat of another owner is dropped on read; a broken one reads as empty', () => {
    const raw = writeHistory('profile:A', [msg('hello')]);
    expect(readHistory(raw, 'profile:A')).toHaveLength(1);
    expect(readHistory(raw, 'profile:B')).toEqual([]);
    expect(readHistory(raw, null)).toEqual([]);
    expect(readHistory('{nope', 'profile:A')).toEqual([]);
    expect(readHistory(JSON.stringify({ owner: 'profile:A', messages: [{ id: 1 }, msg('kept')] }), 'profile:A')).toHaveLength(1);
  });

  it('keeps the last 60 messages and never starts with an answer', () => {
    const many: CoachMessage[] = [];
    for (let i = 0; i < 40; i++) {
      const q = msg(`q${i}`);
      many.push(q, { id: `a${i}`, role: 'assistant', source: 'ai', replyTo: q.id, text: `a${i}`, at: i });
    }
    const capped = capHistory(many);
    expect(capped.length).toBeLessThanOrEqual(HISTORY_MAX);
    expect(capped[0].role).toBe('user');
    expect(capped[capped.length - 1].id).toBe('a39');
  });

  it('a chat loaded for another profile is not shown: it reads as empty', async () => {
    useStore.getState().setProfile(profile('2026-01-02T00:00:00Z'));
    await AsyncStorage.setItem(COACH_HISTORY_KEY, writeHistory('profile:someone-else', [msg('not yours')]));
    await loadCoachHistory();
    expect(useCoachHistory.getState().messages).toEqual([]);
  });
});

describe('saving and Clear chat', () => {
  it('is saved under its own key with its owner, and read back', async () => {
    useStore.getState().setProfile(profile('2026-01-02T00:00:00Z'));
    addCoachMessages(msg('How many rest days?'));
    await flush();
    const raw = await AsyncStorage.getItem(COACH_HISTORY_KEY);
    expect(JSON.parse(raw!).owner).toBe('profile:2026-01-02T00:00:00Z');
    useCoachHistory.setState({ loaded: false, owner: null, messages: [] });
    await loadCoachHistory();
    expect(useCoachHistory.getState().messages.map((m) => ('text' in m ? m.text : ''))).toEqual(['How many rest days?']);
  });

  it('keeps nothing without a profile', async () => {
    addCoachMessages(msg('x'));
    await flush();
    expect(await AsyncStorage.getItem(COACH_HISTORY_KEY)).toBeNull();
  });

  it('Clear chat removes the messages and keeps the agreement; Undo puts them back', async () => {
    useStore.getState().setProfile(profile('2026-01-02T00:00:00Z'));
    await agreeToCoach(true, 1000);
    addCoachMessages(msg('one'), msg('two'));
    const before = useCoachHistory.getState();
    await clearCoachHistory();
    expect(useCoachHistory.getState().messages).toEqual([]);
    expect(await AsyncStorage.getItem(COACH_HISTORY_KEY)).toBeNull();
    expect(await AsyncStorage.getItem(COACH_CONSENT_KEY)).not.toBeNull();
    restoreCoachMessages(before.owner, before.messages);
    await flush();
    expect(useCoachHistory.getState().messages).toHaveLength(2);
  });
});

describe('the wipe: whenever the profile goes away', () => {
  let stop: (() => void) | null = null;
  afterEach(() => {
    stop?.();
    stop = null;
  });

  it('erase, sign out, delete account and an account switch (resetAll) clear the chat and the agreement with sharing', async () => {
    useStore.getState().setProfile(profile('2026-01-02T00:00:00Z'));
    stop = startCoach();
    await agreeToCoach(true, 1000);
    addCoachMessages(msg('How is my week?'));
    await flush();
    expect(await AsyncStorage.getItem(COACH_HISTORY_KEY)).not.toBeNull();
    expect(useCoachConsent.getState().share).toBe(true);

    useStore.getState().resetAll();
    await flush();
    expect(useCoachHistory.getState().messages).toEqual([]);
    expect(await AsyncStorage.getItem(COACH_HISTORY_KEY)).toBeNull();
    expect(await AsyncStorage.getItem(COACH_CONSENT_KEY)).toBeNull();
    expect(useCoachConsent.getState()).toMatchObject({ consent: null, share: false });
    // A reload after the wipe finds nothing.
    resetCoachConsentForTests();
    await loadCoachConsent();
    expect(useCoachConsent.getState()).toMatchObject({ consent: null, share: false });
  });

  it('a start with no profile (the fresh start after storage could not be read) clears what was kept', async () => {
    await AsyncStorage.setItem(COACH_HISTORY_KEY, writeHistory('profile:old', [msg('left behind')]));
    await AsyncStorage.setItem(COACH_CONSENT_KEY, JSON.stringify({ version: 1, agreedAt: 5, share: true }));
    stop = startCoach();
    await flush();
    expect(await AsyncStorage.getItem(COACH_HISTORY_KEY)).toBeNull();
    expect(await AsyncStorage.getItem(COACH_CONSENT_KEY)).toBeNull();
  });

  it('a change to the profile that keeps it (a Goals save) clears nothing', async () => {
    useStore.getState().setProfile(profile('2026-01-02T00:00:00Z'));
    stop = startCoach();
    await setCoachShare(true);
    addCoachMessages(msg('kept'));
    useStore.getState().setProfile({ goal: 'lose', weeklyRateKg: 0.4 });
    await flush();
    expect(useCoachHistory.getState().messages).toHaveLength(1);
    expect(useCoachConsent.getState().share).toBe(true);
  });
});
