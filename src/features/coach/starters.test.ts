/** The coach's first view and its follow-ups (spec r14, section 7): pure rules, every branch. */
import { describe, expect, it } from 'vitest';

import type { CoachMessage } from './request';
import { coachHello, coachStarters, followUps, helloLine, shareLine, weekNumbers } from './starters';
import { HELLO_FRESH, PHONE_ONLY_LINE, SHARE_OFF_LINE, SHARE_ON_LINE, STARTER_AFTER_WORKOUT, STARTER_PLAN, STARTER_PROTEIN, STARTER_WATER } from './words';

const BANNED =
  /\b(bad|fail|failed|failure|cheat|cheated|should|guilty|lazy|great|amazing|well done|keep it up|too much|missed your|goal missed|over budget|make up|only|unfortunately|oops|sorry)\b/i;

describe('shareLine', () => {
  it('names what a typed question takes with it', () => {
    expect(shareLine({ signedIn: false, ageOk: true, agreed: true, share: true })).toBe(PHONE_ONLY_LINE);
    expect(shareLine({ signedIn: true, ageOk: false, agreed: true, share: true })).toBe(PHONE_ONLY_LINE);
    expect(shareLine({ signedIn: true, ageOk: true, agreed: true, share: true })).toBe(SHARE_ON_LINE);
    expect(shareLine({ signedIn: true, ageOk: true, agreed: false, share: true })).toBe(SHARE_OFF_LINE);
    expect(shareLine({ signedIn: true, ageOk: true, agreed: true, share: false })).toBe(SHARE_OFF_LINE);
  });
});

describe('the greeting and its line', () => {
  it('greets by name, or with the greeting alone', () => {
    expect(coachHello('Good afternoon', 'Alex')).toBe('Good afternoon, Alex');
    expect(coachHello('Good afternoon', '  ')).toBe('Good afternoon');
    expect(coachHello('Good afternoon', null)).toBe('Good afternoon');
  });

  it('counts the last 7 days only (today and the 6 before)', () => {
    const acts = [
      { date: '2026-11-23', durationMin: 30 },
      { date: '2026-11-17', durationMin: 65 },
      { date: '2026-11-16', durationMin: 500 },
      { date: '2026-11-24', durationMin: 40 },
    ] as const;
    expect(weekNumbers(acts as never, '2026-11-23')).toEqual({ sessions: 2, minutes: 95 });
    expect(weekNumbers([], '2026-11-23')).toEqual({ sessions: 0, minutes: 0 });
  });

  it('states only figures from the person’s data, in neutral words', () => {
    expect(helloLine({ sessions: 2, minutes: 95, kcalLeft: 941, foodToday: true })).toBe('2 workouts, 95 min in 7 days · 941 kcal left today');
    expect(helloLine({ sessions: 1, minutes: 30, kcalLeft: 941, foodToday: true })).toBe('1 workout, 30 min in 7 days · 941 kcal left today');
    expect(helloLine({ sessions: 0, minutes: 0, kcalLeft: 941, foodToday: true })).toBe('No workouts in the last 7 days · 941 kcal left today');
    expect(helloLine({ sessions: 2, minutes: 95, kcalLeft: -120, foodToday: true })).toBe('2 workouts, 95 min in 7 days · 120 kcal above today’s budget');
    expect(helloLine({ sessions: 2, minutes: 95, kcalLeft: 2100, foodToday: false })).toBe('2 workouts, 95 min in 7 days · 2,100 kcal left today');
    expect(helloLine({ sessions: 2, minutes: 95, kcalLeft: null, foodToday: true })).toBe('2 workouts, 95 min in 7 days');
    expect(helloLine({ sessions: 1, minutes: 30, kcalLeft: Number.NaN, foodToday: true })).toBe('1 workout, 30 min in 7 days');
  });

  it('reads well with nothing logged yet, and never states an empty figure', () => {
    const fresh = helloLine({ sessions: 0, minutes: 0, kcalLeft: 2100, foodToday: false });
    expect(fresh).toBe(HELLO_FRESH);
    expect(fresh).not.toMatch(/\d/);
  });

  it('every line passes the banned list', () => {
    const lines: string[] = [];
    for (const sessions of [0, 1, 3]) for (const k of [-300, 0, 900, null]) for (const foodToday of [true, false]) lines.push(helloLine({ sessions, minutes: sessions * 30, kcalLeft: k, foodToday }));
    expect(lines.filter((s) => BANNED.test(s) || s.includes('!'))).toEqual([]);
  });
});

describe('coachStarters', () => {
  it('a workout today comes first, then protein from 15:00 under 60%, then the plan and water', () => {
    expect(coachStarters({ workoutToday: true, proteinShare: 0.2, hour: 16 })).toEqual([STARTER_AFTER_WORKOUT, STARTER_PROTEIN]);
    expect(coachStarters({ workoutToday: true, proteinShare: 0.9, hour: 16 })).toEqual([STARTER_AFTER_WORKOUT, STARTER_PLAN]);
    expect(coachStarters({ workoutToday: false, proteinShare: 0.2, hour: 16 })).toEqual([STARTER_PROTEIN, STARTER_PLAN]);
    expect(coachStarters({ workoutToday: false, proteinShare: 0.2, hour: 10 })).toEqual([STARTER_PLAN, STARTER_WATER]);
  });

  it('the edges: 15:00 counts, 14:59 does not; 60% is enough protein', () => {
    expect(coachStarters({ workoutToday: false, proteinShare: 0.59, hour: 15 })[0]).toBe(STARTER_PROTEIN);
    expect(coachStarters({ workoutToday: false, proteinShare: 0.59, hour: 14 })[0]).toBe(STARTER_PLAN);
    expect(coachStarters({ workoutToday: false, proteinShare: 0.6, hour: 18 })[0]).toBe(STARTER_PLAN);
  });
});

describe('followUps', () => {
  const at = new Date(2026, 10, 23, 12).getTime();
  const yesterday = new Date(2026, 10, 22, 12).getTime();
  const local = (topic: 'training' | 'ideas', when = at): CoachMessage => ({ id: 'a', role: 'assistant', source: 'local', topic, replyTo: 'q', text: 'x', at: when });
  const ai: CoachMessage = { id: 'b', role: 'assistant', source: 'ai', replyTo: 'q', text: 'x', at };
  const notice: CoachMessage = { id: 'c', role: 'assistant', source: 'notice', notice: 'network', replyTo: 'q', at };
  const question: CoachMessage = { id: 'q', role: 'user', source: 'typed', text: 'x', at };

  it('offers the phone question not just answered', () => {
    expect(followUps(local('training'), '2026-11-23')).toEqual(['ideas']);
    expect(followUps(local('ideas'), '2026-11-23')).toEqual(['training']);
  });
  it('offers both after anything else, or after an answer from another day', () => {
    expect(followUps(ai, '2026-11-23')).toEqual(['training', 'ideas']);
    expect(followUps(notice, '2026-11-23')).toEqual(['training', 'ideas']);
    expect(followUps(local('training', yesterday), '2026-11-23')).toEqual(['training', 'ideas']);
  });
  it('nothing while busy, under a question, or with no chat', () => {
    expect(followUps(ai, '2026-11-23', { busy: true })).toEqual([]);
    expect(followUps(question, '2026-11-23')).toEqual([]);
    expect(followUps(null, '2026-11-23')).toEqual([]);
  });
  it('ruling L6: the share chip first, under an AI answer only, at most two chips', () => {
    expect(followUps(ai, '2026-11-23', { offerShare: true })).toEqual(['share', 'ideas']);
    expect(followUps(local('training'), '2026-11-23', { offerShare: true })).toEqual(['ideas']);
    for (const m of [ai, notice, local('ideas')]) expect(followUps(m, '2026-11-23', { offerShare: true }).length).toBeLessThanOrEqual(2);
  });
});
