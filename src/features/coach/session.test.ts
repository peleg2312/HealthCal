/**
 * The coach's session (spec r14, section 7): the draft is kept, `unread` is set only while the coach is
 * not on screen, a question with no consent writes nothing and waits for the sheet, and what is sent
 * is still `buildCoachRequest`'s body.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The plan cache and the backend client load the app's auth module (expo-linking), which tests do not run.
vi.mock('@/features/plan/cache', () => ({ planNow: () => ({ limits: { memoryPairs: 3 } }), refreshPlanAfterLimit: async () => ({}) }));
vi.mock('./send', () => ({ coachConnection: async () => null }));

import { useStore } from '@/store';
import type { Profile } from '@/types';

import { agreeToCoach, resetCoachConsentForTests } from './consent';
import { useCoachHistory } from './history';
import { CoachError, type CoachAnswer, type CoachBody } from './request';
import { askCoach, keepDraftForSignIn, leaveCoachForSignIn, returnsToCoach, takeReturnToCoach, markCoachMounted, markCoachRead, resetCoachSessionForTests, setCoachDepsForTests, restoreDraftAfterSignIn, setCoachDraft, useCoachSession } from './session';

const profile = (birthDate = '1990-05-01'): Profile =>
  ({
    name: 'Dana',
    sex: 'female',
    birthDate,
    heightCm: 168,
    weightKg: 64,
    activityLevel: 'moderate',
    goal: 'maintain',
    weeklyRateKg: 0,
    units: 'metric',
    eatBackExercise: true,
    useAdaptiveTdee: false,
    onboardedAt: '2026-01-02T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
  }) as Profile;

const flush = async () => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
};
const connection = { functionsUrl: 'https://x.test/functions/v1', accessToken: 't' };

let sent: CoachBody[] = [];
let reply: () => Promise<CoachAnswer> = async () => ({ text: 'Rest one day.', remaining: 5, truncated: false, refer: false });

beforeEach(async () => {
  await AsyncStorage.clear();
  useStore.getState().resetAll();
  useStore.getState().setProfile(profile());
  useCoachHistory.setState({ loaded: true, owner: 'profile:2026-01-02T00:00:00Z', messages: [] });
  resetCoachConsentForTests();
  resetCoachSessionForTests();
  sent = [];
  reply = async () => ({ text: 'Rest one day.', remaining: 5, truncated: false, refer: false });
  setCoachDepsForTests({
    connection: async () => connection,
    post: (body) => {
      sent.push(body);
      return reply();
    },
  });
});
afterEach(() => setCoachDepsForTests(null));

const chat = () => useCoachHistory.getState().messages;

describe('the draft', () => {
  it('is kept across a close and a re-open (the store outlives the screen)', () => {
    markCoachMounted(true);
    setCoachDraft('How many rest days');
    markCoachMounted(false);
    markCoachMounted(true);
    expect(useCoachSession.getState().draft).toBe('How many rest days');
  });
  it('is capped at the field’s 500 characters', () => {
    setCoachDraft('x'.repeat(600));
    expect(useCoachSession.getState().draft).toHaveLength(500);
  });
  it('signed out (X11): kept for sign-in through a page reload, given back once to an empty field, and nothing is sent', async () => {
    const mem = new Map<string, string>();
    vi.stubGlobal('sessionStorage', { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) });
    try {
      setCoachDraft('How many rest days');
      keepDraftForSignIn();
      expect(useCoachSession.getState().draft).toBe('How many rest days');
      expect(chat()).toEqual([]);
      // The page reloads (Google's redirect): the session starts empty.
      resetCoachSessionForTests();
      restoreDraftAfterSignIn();
      expect(useCoachSession.getState().draft).toBe('How many rest days');
      // Once only, and never over words already in the field.
      setCoachDraft('Something else');
      restoreDraftAfterSignIn();
      expect(useCoachSession.getState().draft).toBe('Something else');
      expect(chat()).toEqual([]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('a sign-in that began in the coach', () => {
  it('is marked when the coach sends the person to sign-in, seen without being cleared, and cleared when taken', () => {
    expect(returnsToCoach()).toBe(false);
    setCoachDraft('How many rest days a week?');
    leaveCoachForSignIn();
    expect(returnsToCoach()).toBe(true);
    expect(returnsToCoach()).toBe(true);
    expect(takeReturnToCoach()).toBe(true);
    expect(returnsToCoach()).toBe(false);
    expect(takeReturnToCoach()).toBe(false);
    // The words were kept for the field and never sent.
    expect(useCoachSession.getState().draft).toBe('How many rest days a week?');
    expect(sent).toHaveLength(0);
  });
});

describe('askCoach', () => {
  it('without the consent: writes nothing, sends nothing, and holds the question for the sheet', async () => {
    setCoachDraft('Plan my week');
    expect(await askCoach('Plan my week')).toBe('consent');
    expect(chat()).toEqual([]);
    expect(sent).toEqual([]);
    expect(useCoachSession.getState().pending).toEqual({ text: 'Plan my week', id: undefined });
    expect(useCoachSession.getState().draft).toBe('Plan my week');
  });

  it('with the consent: the question at once, the field cleared, the body as buildCoachRequest makes it', async () => {
    await agreeToCoach(false);
    markCoachMounted(true);
    setCoachDraft('Plan my week');
    let release: (a: CoachAnswer) => void = () => {};
    reply = () => new Promise((r) => (release = r));
    expect(await askCoach('Plan my week')).toBe('sent');
    expect(chat().map((m) => m.role)).toEqual(['user']);
    expect(useCoachSession.getState()).toMatchObject({ draft: '', busyFor: chat()[0].id });
    release({ text: 'Rest one day.', remaining: 5, truncated: false, refer: false });
    await flush();
    expect(sent).toEqual([{ message: 'Plan my week', consentVersion: 1 }]);
    expect(chat().map((m) => m.source)).toEqual(['typed', 'ai']);
    expect(useCoachSession.getState()).toMatchObject({ busyFor: null, unread: false, arrived: { id: chat()[1].id, kind: 'answer' } });
  });

  it('an answer that arrives after the coach closed marks it unread; opening reads it', async () => {
    await agreeToCoach(false);
    markCoachMounted(true);
    let release: (a: CoachAnswer) => void = () => {};
    reply = () => new Promise((r) => (release = r));
    await askCoach('Plan my week');
    markCoachMounted(false);
    release({ text: 'Two easy runs.', remaining: 4, truncated: false, refer: false });
    await flush();
    expect(useCoachSession.getState().unread).toBe(true);
    markCoachMounted(true);
    expect(useCoachSession.getState().unread).toBe(false);
    markCoachRead();
    expect(useCoachSession.getState().unread).toBe(false);
  });

  it('a second question while one is on its way is not sent', async () => {
    await agreeToCoach(false);
    reply = () => new Promise(() => {});
    expect(await askCoach('One')).toBe('sent');
    expect(await askCoach('Two')).toBe('none');
    await flush();
    expect(sent).toHaveLength(1);
  });

  it('two asks in the same tick (a double tap on Send or on Try again) send once, even when the first answer is fast', async () => {
    await agreeToCoach(false);
    const [first, second] = await Promise.all([askCoach('One'), askCoach('One')]);
    expect([first, second].sort()).toEqual(['none', 'sent']);
    await flush();
    expect(sent).toHaveLength(1);
    // And a retry of a question already in the chat, tapped twice.
    const said = useCoachHistory.getState().messages.find((m) => m.role === 'user');
    sent = [];
    const again = await Promise.all([askCoach('One', said?.id), askCoach('One', said?.id)]);
    expect(again.filter((r) => r === 'sent')).toHaveLength(1);
    await flush();
    expect(sent).toHaveLength(1);
  });

  it('no account: the account notice, no request; under 18: the under-18 notice, no request', async () => {
    setCoachDepsForTests({ connection: async () => null, post: vi.fn() });
    expect(await askCoach('Hi')).toBe('notice');
    expect(chat().map((m) => (m.source === 'notice' ? m.notice : m.source))).toEqual(['typed', 'account']);
    useCoachHistory.setState({ messages: [] });
    useStore.getState().setProfile({ ...profile(), birthDate: '2015-01-01' });
    expect(await askCoach('Hi')).toBe('notice');
    expect(chat().map((m) => (m.source === 'notice' ? m.notice : m.source))).toEqual(['typed', 'under18']);
  });

  it('a failure becomes the app’s line, marked unread while closed', async () => {
    await agreeToCoach(false);
    reply = async () => {
      throw new CoachError('network');
    };
    await askCoach('Hi');
    await flush();
    expect(chat().map((m) => (m.source === 'notice' ? m.notice : m.source))).toEqual(['typed', 'network']);
    expect(useCoachSession.getState().unread).toBe(true);
  });

  it('a phone answer in the chat is never part of what is sent', async () => {
    await agreeToCoach(false);
    useCoachHistory.setState({
      messages: [
        { id: 'lq', role: 'user', source: 'local', text: 'How is my training week?', at: 1 },
        { id: 'la', role: 'assistant', source: 'local', topic: 'training', replyTo: 'lq', text: '95 min', at: 2 },
      ],
    });
    await askCoach('And next week?');
    await flush();
    expect(sent[0]).toEqual({ message: 'And next week?', consentVersion: 1 });
  });
});
