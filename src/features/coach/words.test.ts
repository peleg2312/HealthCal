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
    else if (Array.isArray(v)) for (const p of v as { title: string; body: string }[]) out.push(p.title, p.body);
    else if (v && typeof v === 'object') for (const n of Object.values(v as Record<string, { text: string }>)) out.push(n.text);
  }
  for (const m of ['breakfast', 'lunch', 'dinner', 'snack'] as MealType[]) out.push(W.localIdeasQuestion(m));
  out.push(W.aboutStatus(null), W.aboutStatus('Nov 23, 2026'));
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
    expect(W.COACH_LINE).toBe('AI coach · not medical advice');
    expect(W.COACH_LINE_SHARING).toBe('AI coach · not medical advice · sees your week');
    expect(W.REFER_LINE).toBe('If you are in danger now, call your local emergency number. findahelpline.com lists free lines in every country.');
    expect(W.NOTICE.daily_limit.text).toBe('30 questions today. They reset at midnight UTC.');
    expect(W.LOCAL_MARK).toBe('From your data, on this phone');
    expect(W.localIdeasQuestion('dinner')).toBe('Ideas for dinner');
  });
});
