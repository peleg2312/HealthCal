import { describe, expect, it } from 'vitest';

import type { FriendsOverview } from '@/services/friends';

import { mealsOverview } from './overview';

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
    expect(mealsOverview(null)).toEqual({ me: null, friends: [], feed: [], myMeals: [] });
  });
});
