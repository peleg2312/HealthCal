/**
 * The words at an AI limit (./limit.ts) and the coach's (@/features/coach/words.ts): plan-aware with
 * plans on, today's words exactly with plans off or from an older server, and every line held to the
 * morning page's banned list and ruling R19's.
 */
import { describe, expect, it } from 'vitest';

import { coachLimitText, coachPlansLink } from '@/features/coach/words';

import { errorFromResponse } from './api';
import { carefulUses, CAREFUL_COST, estimateLimitWords, graceLine, limitInfoFrom, localClock, moreAfter, plusLimitOf, plusLink, type LimitInfo } from './limit';

const RESETS = '2026-11-24T00:00:00.000Z';
const at = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const answer = (extra: Record<string, unknown> = {}) => ({ error: 'daily_limit', message: "You have used today's AI analyses. They reset at midnight UTC.", remaining: 0, ...extra });
const info = (extra: Partial<LimitInfo> = {}): LimitInfo => ({ limit: 5, plan: 'free', cost: 1, resetsAt: RESETS, graceUntil: null, shared: false, ...extra });

// The morning page's list, and ruling R19's words and marks.
const BANNED =
  /\b(bad|fail|failed|failure|cheat|cheated|should|guilty|lazy|great|amazing|well done|keep it up|too much|missed your|goal missed|over budget|make up|only|unfortunately|oops|sorry)\b/i;
const R19 = /upgrade|unlock|premium|run out|ran out|don't miss|don’t miss|limited time|free users|last chance|!|\d+\s*(h|hours|min|minutes) left/i;

describe('the plan fields of a limit answer', () => {
  it('are read only with plans on and a plan named', () => {
    expect(limitInfoFrom(answer({ limit: 5, plan: 'free', plansOn: true, resetsAt: RESETS, cost: 5 }))).toEqual({
      limit: 5,
      plan: 'free',
      cost: 5,
      resetsAt: RESETS,
      graceUntil: null,
      shared: false,
    });
    // Plans off, an older server, broken fields: today's words.
    expect(limitInfoFrom(answer({ limit: 40, plan: null, plansOn: false, resetsAt: RESETS }))).toBeNull();
    expect(limitInfoFrom(answer())).toBeNull();
    expect(limitInfoFrom(answer({ plansOn: true, plan: 'gold', limit: 5 }))).toBeNull();
    expect(limitInfoFrom(answer({ plansOn: true, plan: 'free', limit: -1 }))).toBeNull();
    expect(limitInfoFrom(answer({ plansOn: true, plan: 'free', limit: 5, resetsAt: 'soon', cost: 'x' }))).toMatchObject({ resetsAt: null, cost: null });
    expect(limitInfoFrom(null)).toBeNull();
    expect(limitInfoFrom(answer({ plansOn: true, plan: 'plus', limit: 40, shared: true }))?.shared).toBe(true);
  });

  it('travel with the error of analyze-food', () => {
    const off = errorFromResponse(429, answer({ limit: 40, plan: null, plansOn: false, resetsAt: RESETS }));
    expect(off.code).toBe('daily_limit');
    expect(off.limit).toBeNull();
    expect(off.message).toBe("You have used today's AI analyses. They reset at midnight UTC.");
    const on = errorFromResponse(429, answer({ limit: 5, plan: 'free', plansOn: true, resetsAt: RESETS, cost: 1 }));
    expect(on.limit).toMatchObject({ limit: 5, plan: 'free' });
  });
});

describe('the estimate at its limit', () => {
  it('says the reset in the phone’s own clock', () => {
    expect(localClock(RESETS)).toBe(at(RESETS));
    expect(moreAfter(RESETS)).toBe(`More after ${at(RESETS)}.`);
    expect(moreAfter(null)).toBe('More after midnight UTC.');
    expect(localClock('nonsense')).toBeNull();
  });

  it('free: the number, the free way first, the plan link offered', () => {
    const w = estimateLimitWords(info(), 0);
    expect(w.title).toBe("Today's 5 estimates are used");
    expect(w.body).toBe(`Search, scan or quick add still log this meal. More after ${at(RESETS)}.`);
    expect(w.offerPlans).toBe(true);
    expect(plusLink(40)).toBe('Plus gives 40 a day');
  });

  it('Plus: the same words with its own number and no link', () => {
    const w = estimateLimitWords(info({ limit: 40, plan: 'plus' }), 1);
    expect(w.title).toBe("Today's 40 estimates are used");
    expect(w.offerPlans).toBe(false);
  });

  it('an earlier account’s allowance says until when', () => {
    const grace = '2027-01-31T12:00:00.000Z';
    const w = estimateLimitWords(info({ limit: 40, graceUntil: grace }), 0);
    expect(w.body).toBe(`Search, scan or quick add still log this meal. More after ${at(RESETS)}. ${graceLine(grace)}`);
    expect(graceLine(grace)).toMatch(/^Your earlier allowance stays until Jan (30|31|31)\.$/);
  });

  it('a careful estimate that needed more than is left says so, never "used" (ruling R18)', () => {
    const w = estimateLimitWords(info({ cost: 5 }), 3);
    expect(w.title).toBe('Too few left for a careful estimate');
    expect(w.body).toBe(`A careful estimate needs 5 units and fewer are left today. A quick estimate still works. More after ${at(RESETS)}.`);
    expect(w.body).not.toMatch(/used/);
    // Nothing left at all: the plain words.
    expect(estimateLimitWords(info({ cost: 5 }), 0).title).toBe("Today's 5 estimates are used");
    expect(estimateLimitWords(info({ cost: 5 }), null).title).toBe("Today's 5 estimates are used");
  });

  it('the shared ceiling keeps its meaning and never offers the plan', () => {
    const w = estimateLimitWords(info({ shared: true }), 4);
    expect(w.title).toBe('The AI estimate is busy for today');
    expect(w.body).toBe(`Search, scan and quick add work as always. More after ${at(RESETS)}.`);
    expect(w.offerPlans).toBe(false);
  });

  it('the careful option says what it uses on the free plan', () => {
    expect(carefulUses(CAREFUL_COST, 5)).toBe("Uses 5 of today's 5");
  });

  it('Plus’s number comes from what the app was told, never from the app', () => {
    expect(plusLimitOf({ plan: 'free', limits: { estimates: 5, questions: 5 }, offers: [] }, 'estimates')).toBeNull();
    expect(plusLink(null)).toBe('What Plus gives');
    expect(plusLimitOf({ plan: 'plus', limits: { estimates: 40, questions: 30 }, offers: [] }, 'questions')).toBe(30);
    expect(plusLimitOf({ plan: 'free', limits: { estimates: 5, questions: 5 }, offers: [{ limits: { estimates: 40, questions: 30 } }] }, 'estimates')).toBe(40);
    expect(plusLimitOf({ plan: 'free', limits: { estimates: 5, questions: 5 }, offers: [], planLimits: { plus: { estimates: 41, questions: 31 } } }, 'questions')).toBe(31);
  });
});

describe('every limit line', () => {
  it('passes the banned lists, with no exclamation mark, in sentence case', () => {
    const out: string[] = [];
    for (const plan of ['free', 'plus'] as const)
      for (const limit of [1, 5, 30, 40])
        for (const cost of [1, 5, null])
          for (const shared of [false, true])
            for (const graceUntil of [null, '2027-01-31T00:00:00.000Z'])
              for (const resetsAt of [RESETS, null])
                for (const left of [null, 0, 2]) {
                  const i = info({ plan, limit, cost, shared, graceUntil, resetsAt });
                  const w = estimateLimitWords(i, left);
                  out.push(w.title, w.body, coachLimitText(i));
                }
    out.push(plusLink(40), plusLink(null), coachPlansLink(30), carefulUses(5, 5));
    const bad = [...new Set(out)].filter((s) => BANNED.test(s) || R19.test(s) || !/^[A-Z0-9"]/.test(s));
    expect(bad).toEqual([]);
  });
});
