import { describe, expect, it } from 'vitest';

import type { FriendsOverview } from '@/services/friends';

import { mealsInWords, mealsOverview } from './overview';

const me = { code: 'ABCD2345', displayName: 'Dana', avatar: '', sharing: { workouts: true, streak: true, minutes: true }, shareKey: 'k' };

describe('mealsOverview', () => {
  it('reads every meal field as its default when an overview leaves it out: no meal control, nothing shown', () => {
    const o = mealsOverview({ me, friends: [], incoming: [], outgoing: [], cheers: [] } as FriendsOverview);
    expect(o.me?.mealsAllowed).toBe(false);
    expect(o.me?.mealSettings).toEqual({ auto: [], kcal: false, see: true });
    expect(o.me?.audience).toEqual([]);
    expect(o.feed).toEqual([]);
    expect(o.myMeals).toEqual([]);
  });

  it('keeps what the service sent, and no card means no me', () => {
    const o = mealsOverview({ me: { ...me, mealsAllowed: true, audience: ['u1'], mealSettings: { auto: ['lunch'], kcal: true, see: false } }, friends: [], incoming: [], outgoing: [], cheers: [], feed: [], myMeals: [] } as FriendsOverview);
    expect(o.me).toMatchObject({ mealsAllowed: true, audience: ['u1'], mealSettings: { auto: ['lunch'], kcal: true, see: false } });
    expect(mealsOverview(null)).toEqual({ me: null, friends: [], feed: [], myMeals: [], mealsAvailable: true, mealWords: true });
  });

  it('allows no meal at all on a server without meals, whatever else the overview holds', () => {
    const shown = { ref: 'r', day: '2026-11-25', meal: 'lunch', items: [], showKcal: false, shownAt: '', expiresAt: '', viewers: [], cheers: 0 } as const;
    const o = mealsOverview({ me: { ...me, mealsAllowed: true }, friends: [], incoming: [], outgoing: [], cheers: [], feed: [], myMeals: [{ ...shown, items: [], viewers: [] }], mealsAvailable: false });
    expect(o.mealsAvailable).toBe(false);
    expect(o.me?.mealsAllowed).toBe(false);
    expect(o.myMeals).toEqual([]);
  });
});

describe('mealsInWords', () => {
  const full = (o: Partial<FriendsOverview>) => mealsOverview({ me: { ...me, mealsAllowed: true }, friends: [], incoming: [], outgoing: [], cheers: [], feed: [], myMeals: [], ...o } as FriendsOverview);
  it('speaks of meals where they work: a server with meals and an adult card', () => {
    expect(mealsInWords(full({}))).toBe(true);
  });
  it('never on a server without meals, with or without a card', () => {
    expect(mealsInWords(full({ mealsAvailable: false }))).toBe(false);
    expect(mealsInWords(full({ mealsAvailable: false, me: null }))).toBe(false);
  });
  it('never for someone meals are not allowed to (under 18, or no birth date)', () => {
    expect(mealsInWords(full({ me: { ...me, mealsAllowed: false } }))).toBe(false);
  });
  it('before the card loads (set-up, signed out, loading) it follows the server alone', () => {
    expect(mealsInWords(full({ me: null }))).toBe(true);
    expect(mealsInWords(mealsOverview(null))).toBe(true);
  });
  it('is what mealsOverview hands the screens', () => {
    for (const o of [full({}), full({ mealsAvailable: false }), full({ me: { ...me, mealsAllowed: false } }), full({ me: null }), mealsOverview(null)]) expect(o.mealWords).toBe(mealsInWords(o));
    expect(full({ mealsAvailable: false }).mealWords).toBe(false);
  });
});
