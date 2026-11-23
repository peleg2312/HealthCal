/**
 * What a typed question sends, and what every answer of coach-chat becomes in the app. The rule
 * proved first: an answer given on the phone (built here from a synced workout) and its button's
 * question are never in a request, wherever they sit in the chat.
 */
import { describe, expect, it, vi } from 'vitest';

import type { ActivityEntry } from '@/types';

import { trainingAnswer } from './local';
import {
  buildCoachRequest,
  coachErrorFrom,
  CoachError,
  cutAtSentence,
  historyFor,
  postCoach,
  shownAnswer,
  type CoachMessage,
} from './request';
import { LOCAL_TRAINING_QUESTION, NOTICE } from './words';

const TODAY = '2026-11-23';
let seq = 0;
const typed = (text: string): CoachMessage => ({ id: `u${seq++}`, role: 'user', source: 'typed', text, at: seq });
const ai = (q: CoachMessage, text: string, extra: Partial<Extract<CoachMessage, { source: 'ai' }>> = {}): CoachMessage => ({
  id: `a${seq++}`,
  role: 'assistant',
  source: 'ai',
  replyTo: q.id,
  text,
  at: seq,
  ...extra,
});

// A workout synced from Health Connect (Garmin through the phone): its numbers must stay on the phone.
const synced: ActivityEntry = {
  id: 'health-1',
  updatedAt: '2026-11-22T10:00:00Z',
  date: '2026-11-22',
  activityId: 'running',
  name: 'Running',
  emoji: '🏃',
  category: 'cardio',
  intensity: 'vigorous',
  durationMin: 73,
  met: 9.8,
  kcalNet: 811,
  kcalGross: 902,
  source: 'health',
  externalId: 'garmin:1763805600000',
  loggedAt: '2026-11-22T10:00:00Z',
} as ActivityEntry;

function localPair(): CoachMessage[] {
  const q: CoachMessage = { id: `l${seq++}`, role: 'user', source: 'local', text: LOCAL_TRAINING_QUESTION, at: seq };
  const a: CoachMessage = { id: `m${seq++}`, role: 'assistant', source: 'local', replyTo: q.id, topic: 'training', text: trainingAnswer([synced], TODAY), at: seq };
  return [q, a];
}

describe('what a question sends', () => {
  it('the phone answer from a synced workout is real (it names the workout minutes)', () => {
    const [, a] = localPair();
    expect(a.role === 'assistant' && 'text' in a ? a.text : '').toMatch(/146 guideline minutes/);
  });

  it('never sends an answer given on the phone or its button question, in any position', () => {
    const q1 = typed('How many rest days a week?');
    const a1 = ai(q1, 'Most people do well with one or two.');
    const q2 = typed('And stretching?');
    const a2 = ai(q2, 'A few minutes after training is enough for most.');
    const typedChat = [q1, a1, q2, a2];
    // The phone pair at every position: before, between and after the typed pairs, and twice.
    for (let at = 0; at <= typedChat.length; at++) {
      const chat = [...typedChat.slice(0, at), ...localPair(), ...typedChat.slice(at), ...localPair()];
      const body = buildCoachRequest({ message: 'Next?', messages: chat, note: null, consentVersion: 1 });
      const sent = JSON.stringify(body);
      expect(sent).not.toContain(LOCAL_TRAINING_QUESTION);
      expect(sent).not.toMatch(/guideline minutes|146|From the workouts on this phone/);
      expect(body.history).toEqual([
        { role: 'user', text: 'How many rest days a week?' },
        { role: 'assistant', text: 'Most people do well with one or two.' },
        { role: 'user', text: 'And stretching?' },
        { role: 'assistant', text: 'A few minutes after training is enough for most.' },
      ]);
    }
  });

  it('sends only completed typed pairs, user first: an unanswered question and its notice stay out', () => {
    const q1 = typed('First');
    const failed = typed('Did not go through');
    const notice: CoachMessage = { id: 'n1', role: 'assistant', source: 'notice', notice: 'upstream', replyTo: failed.id, at: 1 };
    const unanswered = typed('No answer at all');
    const a1 = ai(q1, 'Answer one.');
    const chat = [q1, failed, notice, unanswered, a1];
    expect(historyFor(chat)).toEqual([
      { role: 'user', text: 'First' },
      { role: 'assistant', text: 'Answer one.' },
    ]);
    // Alternating, even, user first.
    const h = historyFor(chat);
    expect(h.length % 2).toBe(0);
    h.forEach((t, i) => expect(t.role).toBe(i % 2 === 0 ? 'user' : 'assistant'));
  });

  it('sends the last 3 pairs (6 turns) at most', () => {
    const chat: CoachMessage[] = [];
    for (let i = 0; i < 5; i++) {
      const q = typed(`Q${i}`);
      chat.push(q, ai(q, `A${i}.`));
    }
    const h = historyFor(chat);
    expect(h).toHaveLength(6);
    expect(h[0]).toEqual({ role: 'user', text: 'Q2' });
    expect(h[5]).toEqual({ role: 'assistant', text: 'A4.' });
  });

  it('cuts each turn to 1,200 characters at a sentence end', () => {
    const sentence = 'Rest days let the work settle. ';
    const long = sentence.repeat(60);
    const cut = cutAtSentence(long);
    expect(cut.length).toBeLessThanOrEqual(1200);
    expect(cut.endsWith('settle.…')).toBe(true);
    expect(cutAtSentence('short')).toBe('short');
    // No sentence end in the second half: cut at a space.
    const words = 'word '.repeat(400);
    const w = cutAtSentence(words);
    expect(w.length).toBeLessThanOrEqual(1200);
    expect(w.endsWith('word…')).toBe(true);
    // Hebrew is cut the same way, counted in UTF-16 code units as the server counts.
    const he = 'מנוחה עוזרת לגוף להתאושש. '.repeat(80);
    expect(cutAtSentence(he).length).toBeLessThanOrEqual(1200);
    const q = typed(long);
    const body = buildCoachRequest({ message: 'x', messages: [q, ai(q, long)], note: null, consentVersion: 1 });
    for (const t of body.history ?? []) expect(t.text.length).toBeLessThanOrEqual(1200);
  });

  it('carries the note exactly when sharing is on, and the consent version always', () => {
    const off = buildCoachRequest({ message: '  How much protein?  ', messages: [], note: null, consentVersion: 1 });
    expect(off).toEqual({ message: 'How much protein?', consentVersion: 1 });
    expect('note' in off).toBe(false);
    expect('history' in off).toBe(false);
    const on = buildCoachRequest({ message: 'How much protein?', messages: [], note: 'Goal: keep weight steady.', consentVersion: 1 });
    expect(on.note).toBe('Goal: keep weight steady.');
    expect(buildCoachRequest({ message: 'x', messages: [], note: '   ', consentVersion: 1 })).not.toHaveProperty('note');
  });

  it('caps the message at 500 characters', () => {
    expect(buildCoachRequest({ message: 'a'.repeat(700), messages: [], note: null, consentVersion: 1 }).message).toHaveLength(500);
  });
});

describe('every answer of coach-chat in the app', () => {
  const cases: [number, unknown, string][] = [
    [401, { error: 'unauthorized' }, 'account'],
    [403, { error: 'unconfirmed' }, 'unconfirmed'],
    [403, { error: 'under_18' }, 'under18'],
    [403, { error: 'consent_outdated' }, 'consent_outdated'],
    [413, { error: 'body_too_large' }, 'too_large'],
    [400, { error: 'bad_body' }, 'failed'],
    [400, { error: 'message_empty' }, 'failed'],
    [400, { error: 'message_too_long' }, 'failed'],
    [400, { error: 'history_invalid' }, 'failed'],
    [400, { error: 'history_too_long' }, 'failed'],
    [400, { error: 'history_order' }, 'failed'],
    [400, { error: 'history_turn_too_long' }, 'failed'],
    [400, { error: 'note_invalid' }, 'failed'],
    [400, { error: 'note_too_long' }, 'failed'],
    [429, { error: 'daily_limit', remaining: 0 }, 'daily_limit'],
    [429, { error: 'shared_limit', remaining: 0 }, 'shared_limit'],
    [503, { error: 'busy' }, 'busy'],
    [504, { error: 'timeout' }, 'timeout'],
    [502, { error: 'upstream' }, 'upstream'],
    [422, { error: 'declined', remaining: 12 }, 'declined'],
    [500, { error: 'not_configured' }, 'not_configured'],
    [500, { error: 'profile_check_failed' }, 'failed'],
    [500, { error: 'quota_check_failed' }, 'failed'],
    [500, { error: 'internal' }, 'failed'],
    // No body the app knows (the gateway, a proxy).
    [401, null, 'account'],
    [404, null, 'not_configured'],
    [429, 'x', 'busy'],
    [504, null, 'timeout'],
    [502, null, 'upstream'],
    [418, null, 'failed'],
  ];
  it.each(cases)('%i %j -> %s', (status, body, kind) => {
    expect(coachErrorFrom(status, body).kind).toBe(kind);
  });

  it('the limit says the words of the specification; a refusal offers no "Try again", a failure does', () => {
    expect(NOTICE.daily_limit.text).toBe('30 questions today. They reset at midnight UTC.');
    expect(NOTICE.declined.retry).toBe(false);
    for (const k of ['busy', 'timeout', 'upstream', 'network', 'failed'] as const) expect(NOTICE[k].retry).toBe(true);
    expect(coachErrorFrom(422, { error: 'declined', remaining: 12 }).remaining).toBe(12);
    expect(coachErrorFrom(429, { error: 'daily_limit' }).remaining).toBe(0);
  });

  it('posts with the session token and the anon key, and reads an answer', async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ text: 'Two rest days.', remaining: 27, truncated: true, refer: true }), { status: 200 }));
    const a = await postCoach(fetchFn as unknown as typeof fetch, { message: 'q', consentVersion: 1 }, { functionsUrl: 'https://x.supabase.co/functions/v1/', accessToken: 'tok', anonKey: 'anon' });
    expect(a).toEqual({ text: 'Two rest days.', remaining: 27, truncated: true, refer: true });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://x.supabase.co/functions/v1/coach-chat');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect((init.headers as Record<string, string>).apikey).toBe('anon');
    expect(JSON.parse(String(init.body))).toEqual({ message: 'q', consentVersion: 1 });
  });

  it('an empty answer, a dropped connection and the app timer are failures with "Try again"', async () => {
    const empty = vi.fn(async () => new Response(JSON.stringify({ text: '  ' }), { status: 200 }));
    await expect(postCoach(empty as unknown as typeof fetch, { message: 'q', consentVersion: 1 }, { functionsUrl: 'u', accessToken: 't' })).rejects.toMatchObject({ kind: 'upstream' });
    const down = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(postCoach(down as unknown as typeof fetch, { message: 'q', consentVersion: 1 }, { functionsUrl: 'u', accessToken: 't' })).rejects.toMatchObject({ kind: 'network' });
    const slow = vi.fn(
      (_u: string, init: RequestInit) =>
        new Promise<Response>((_, reject) => init.signal?.addEventListener('abort', () => reject(new Error('aborted')))),
    );
    await expect(postCoach(slow as unknown as typeof fetch, { message: 'q', consentVersion: 1 }, { functionsUrl: 'u', accessToken: 't', timeoutMs: 20 })).rejects.toBeInstanceOf(CoachError);
  });

  it('a cut-short answer is shown with "…"', () => {
    expect(shownAnswer({ text: 'Rest one day.', truncated: true })).toBe('Rest one day…');
    expect(shownAnswer({ text: 'Rest one day.' })).toBe('Rest one day.');
  });
});
