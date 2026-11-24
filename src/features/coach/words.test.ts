/**
 * No shame (product principle 4): every fixed string the coach shows passes the morning page's
 * banned list (src/features/morning/words.test.ts), has no exclamation mark and starts with a
 * capital (sentence case), and the answers worked out on the phone do too over a grid of inputs.
 */
import { describe, expect, it } from 'vitest';

import { addDays } from '@/lib/dates';
import type { MealIdea } from '@/features/today/ideas';
import type { ActivityEntry, MealType } from '@/types';

import { ideasAnswer, trainingAnswer } from './local';
import * as W from './words';

// The morning page's list, word for word.
const BANNED =
  /\b(bad|fail|failed|failure|cheat|cheated|should|guilty|lazy|great|amazing|well done|keep it up|too much|missed your|goal missed|over budget|make up|only|unfortunately|oops|sorry)\b/i;

function strings(): string[] {
  const out: string[] = [];
  for (const v of Object.values(W)) {
    if (typeof v === 'string') out.push(v);
    else if (Array.isArray(v)) for (const p of v as (string | { title: string; body: string })[]) out.push(...(typeof p === 'string' ? [p] : [p.title, p.body]));
    else if (v && typeof v === 'object') for (const n of Object.values(v as Record<string, { text: string }>)) out.push(n.text);
  }
  for (const m of ['breakfast', 'lunch', 'dinner', 'snack'] as MealType[]) out.push(W.localIdeasQuestion(m));
  out.push(W.aboutStatus(null), W.aboutStatus('Nov 23, 2026'));
  for (const m of ['breakfast', 'lunch', 'dinner', 'snack'] as MealType[]) out.push(W.ideasHead(941, m), W.ideasHead(-20, m), W.ideaAddLabel('Tuesday’s dinner', m));
  out.push(W.countLine(460));
  return out;
}

describe('the coach’s words', () => {
  it('pass the banned list, with no exclamation mark, in sentence case', () => {
    const all = strings();
    expect(all.length).toBeGreaterThan(40);
    const bad = all.filter((s) => BANNED.test(s) || s.includes('!') || !/^[A-Z0-9"]/.test(s));
    expect(bad).toEqual([]);
  });

  it('the answers given on the phone pass it too', () => {
    const today = '2026-11-23';
    const out = new Set<string>();
    const act = (date: string, activityId: string, durationMin: number, intensity: ActivityEntry['intensity'], met: number) =>
      ({ date, activityId, durationMin, intensity, met }) as ActivityEntry;
    const weeks = [
      [],
      [act(today, 'walking', 30, 'light', 3.5)],
      Array.from({ length: 28 }, (_, i) => act(addDays(today, -i), 'running', 40, 'vigorous', 9.8)),
      Array.from({ length: 28 }, (_, i) => act(addDays(today, -i), 'walking', i < 7 ? 10 : 60, 'moderate', 3.5)),
      [...Array.from({ length: 21 }, (_, i) => act(addDays(today, -7 - i), 'cycling', 40, 'moderate', 6.8)), act(today, 'hiking', 400, 'moderate', 6)],
    ];
    for (const w of weeks) out.add(trainingAnswer(w, today));
    const idea: MealIdea = { key: 'k', kind: 'plate', share: 1, name: 'Chicken, rice and salad', items: [], kcal: 520, protein: 41, foods: ['Chicken breast', 'White rice'] };
    for (const meal of ['breakfast', 'lunch', 'dinner', 'snack'] as MealType[]) {
      out.add(ideasAnswer({ state: 'ideas', ideas: [idea], plates: true }, meal, 640));
      out.add(ideasAnswer({ state: 'few', ideas: [] }, meal, 90));
      out.add(ideasAnswer({ state: 'over', ideas: [], overBy: 180 }, meal, -180));
    }
    const bad = [...out].filter((s) => BANNED.test(s) || s.includes('!'));
    expect(bad).toEqual([]);
  });

  it('the fixed lines of the specification, word for word', () => {
    expect(W.SHARE_ON_LINE).toBe('Sees your week');
    expect(W.SHARE_OFF_LINE).toBe('Does not see your week');
    expect(W.PHONE_ONLY_LINE).toBe('Answers from this phone');
    expect(W.DISCLAIMER).toBe('AI answers can be wrong. Not medical advice.');
    expect(W.AI_MARK).toBe('AI coach');
    expect(W.COACH_OPEN_LABEL).toBe('Coach');
    expect(W.COACH_OPEN_NEW).toBe('Coach, new answer');
    expect(W.ideasHead(941, 'dinner')).toBe('941 kcal left for dinner');
    expect(W.ideasHead(120, 'snack')).toBe('120 kcal left for a snack');
    expect(W.ideaAddLabel('Tuesday’s dinner', 'dinner')).toBe('Add Tuesday’s dinner to dinner');
    expect(W.ideaAddLabel('Yogurt bowl', 'snack')).toBe('Add Yogurt bowl to snacks');
    expect(W.countLine(460)).toBe('460 / 500');
    expect(W.REFER_LINE).toBe('If you are at risk of harm now, call your local emergency number. findahelpline.com lists free lines in every country.');
    // The limit: today's words with plans off (or from an older server), the plan-aware ones with plans on.
    expect(W.NOTICE.daily_limit.text).toBe('30 questions today. They reset at midnight UTC.');
    const free = { limit: 5, plan: 'free' as const, cost: 1, resetsAt: null, graceUntil: null, shared: false };
    expect(W.coachLimitText(free)).toBe('5 questions today. Questions marked From your data still work. More after midnight UTC.');
    expect(W.coachLimitText({ ...free, limit: 30, plan: 'plus' })).toBe('30 questions today. Questions marked From your data still work. More after midnight UTC.');
    expect(W.coachPlansLink(30)).toBe('Plus gives 30 a day');
    expect(W.LOCAL_MARK).toBe('From your data, on this phone');
    expect(W.localIdeasQuestion('dinner')).toBe('Ideas for dinner');
    // Fix X11: the composer signed out and with no backend; X12: the consent's first layer.
    expect(W.INPUT_PLACEHOLDER_SIGN_IN).toBe('Sign in to ask the AI coach');
    expect(W.INPUT_PLACEHOLDER_NO_BACKEND).toBe('Typed questions need the app with an account');
    expect(W.CONSENT_LEAD).toEqual([
      'Your question goes to HealthCal’s server and from there to Anthropic’s AI, Claude, to be answered. Your week goes with it while Share my week is on, and never otherwise.',
      'AI answers can be wrong, and this is not medical advice.',
    ]);
    expect(W.CONSENT_DETAILS).toBe('Details');
  });
});

describe('the consent facts', () => {
  it('are word for word what the user agreed to (version 1)', () => {
    expect(W.COACH_FACTS).toEqual([
      {
        title: 'What is sent',
        body: 'What you type, with your last few questions and the coach’s answers to them. Your week goes with it when "Share my week" is on, exactly as "See what is sent" shows it.',
      },
      {
        title: 'What is not sent',
        body: 'With sharing off, the coach cannot see your diary, workouts or any health data. Answers marked "From your data, on this phone" are worked out here and never sent.',
      },
      { title: 'Who receives it', body: 'HealthCal’s server, which passes it to Anthropic, the maker of Claude, so its AI can answer.' },
      {
        title: 'What happens to it',
        body: 'HealthCal’s server keeps a daily count of your questions, not the words. Anthropic does not use it to train its models and normally deletes it within 30 days (longer if its safety checks flag a message).',
      },
      { title: 'Answers can be wrong', body: 'The coach gives general guidance, not medical advice. The chat is kept on this phone and is not in the export.' },
    ]);
  });

  it('no fixed line still points at "the two buttons above" (they are gone)', () => {
    expect(strings().filter((s) => /two buttons above/i.test(s))).toEqual([]);
    expect(W.coachLimitText({ limit: 5, plan: 'free', cost: 1, resetsAt: null, graceUntil: null, shared: true })).not.toMatch(/two buttons/);
  });
});

describe('what goes with a typed question (R17)', () => {
  it('names the real number of earlier exchanges', () => {
    expect(W.sentWithLine(3)).toBe('Each question you type goes to the AI coach with your last 3 questions and their answers. The summary below goes with it while "Share my week" is on.');
    expect(W.sentWithLine(6)).toContain('your last 6 questions and their answers');
    expect(W.sentWithLine(1)).toContain('your last question and its answer');
    expect(W.sentWithLine(0)).toContain('by itself');
  });
});
