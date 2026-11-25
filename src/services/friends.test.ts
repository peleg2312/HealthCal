/**
 * The friends service against a scripted server: what the app says when a request
 * vanished while the screen showed it, and how a device holding an old share key
 * (friends turned off and on on another device) recovers before publishing.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildSharedMeal } from '@/features/friends/meals';
import { shareRef } from '@/features/friends/summary';
import { today } from '@/lib/dates';
import { useStore } from '@/store';
import type { ActivityEntry, FoodEntry, MealType } from '@/types';

const server = vi.hoisted(() => ({
  calls: [] as { fn: string; args: Record<string, unknown> }[],
  answers: {} as Record<string, unknown[]>,
  /** Called as each request reaches the server, before it answers. */
  onCall: null as null | ((fn: string) => void),
}));

vi.mock('./supabase', () => ({
  isBackendConfigured: true,
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: 'user-a' } } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
    rpc: async (fn: string, args: Record<string, unknown> = {}) => {
      server.calls.push({ fn, args });
      server.onCall?.(fn);
      const queue = server.answers[fn] ?? [];
      const data = queue.length > 1 ? queue.shift() : queue[0];
      return { data: data ?? null, error: null };
    },
  },
}));

vi.mock('./sync', async () => {
  const { create } = await import('zustand');
  return { useSyncState: create(() => ({ status: 'idle', lastRunAt: null })) };
});

const { cleanSharedMealItems } = await import('./friendsWire');
const { cheerMeal, publishMeals, publishSummary, refreshFriends, respondToRequest, setFriendMealPrefs, showMeal, stopMeal, undoDecline, useFriends } = await import('./friends');

const card = (key: string) => ({ code: 'ABCD2345', display_name: 'Alex', avatar: '', sharing: { workouts: true, streak: true, minutes: true }, share_key: key });
const overview = (key: string) => ({ me: card(key), friends: [], incoming: [{ user_id: 'tess', display_name: 'Tess', avatar: '', created_at: '2026-11-14T08:00:00Z' }], outgoing: [], cheers: [] });

function run(): ActivityEntry {
  const date = today();
  return {
    id: 'garmin-2026-11-14T06:12:00Z',
    date,
    activityId: 'running',
    name: 'Amsterdam Running',
    emoji: '🏃',
    category: 'cardio',
    intensity: 'moderate',
    durationMin: 32,
    met: 9.8,
    kcalNet: 300,
    kcalGross: 360,
    loggedAt: `${date}T07:00:00.000Z`,
    updatedAt: `${date}T07:00:00.000Z`,
    deleted: false,
  } as ActivityEntry;
}

beforeEach(async () => {
  server.calls = [];
  server.answers = { friends_overview: [overview('old-key')] };
  useFriends.setState({ status: 'idle', overview: null, error: null });
  await refreshFriends();
  server.calls = [];
});

describe('answering a request the screen still shows', () => {
  it('says the request is gone instead of "now friends" when it was taken back', async () => {
    server.answers.friend_respond = ['not_found'];
    const res = await respondToRequest('tess', true);
    expect(res).toEqual({ ok: false, reason: 'failed', message: 'That request is no longer there.' });
    // And the list is reloaded so the stale row goes.
    expect(server.calls.map((c) => c.fn)).toEqual(['friend_respond', 'friends_overview']);
  });

  it('does not claim a decline that recorded nothing', async () => {
    server.answers.friend_respond = ['not_found'];
    const res = await respondToRequest('tess', false);
    expect(res.ok).toBe(false);
  });

  it('reports a decline that worked, and an undo of it', async () => {
    server.answers.friend_respond = ['declined'];
    expect((await respondToRequest('tess', false)).ok).toBe(true);
    server.answers.friend_undecline = ['restored'];
    expect((await undoDecline('tess')).ok).toBe(true);
    expect(server.calls.filter((c) => c.fn === 'friend_undecline')[0].args).toEqual({ p_user: 'tess' });
    server.answers.friend_undecline = ['not_found'];
    expect(await undoDecline('tess')).toMatchObject({ ok: false, message: 'That request is no longer there.' });
  });
});

describe('publishing the week with the share key', () => {
  beforeEach(() => {
    const a = run();
    useStore.setState({ ownerId: 'user-a', activities: { [a.id]: a } });
  });

  it('names the key it used, and the references are made with it', async () => {
    server.answers.social_publish = ['ok'];
    await publishSummary({ force: true });
    const call = server.calls.find((c) => c.fn === 'social_publish')!;
    expect(call.args.p_share_key).toBe('old-key');
    const workouts = (call.args.p_summary as { workouts: { id: string; name: string }[] }).workouts;
    expect(workouts[0].id).toBe(shareRef('old-key', run().id));
    expect(workouts[0].name).toBe('Running');
  });

  it('reloads the card and publishes again when the server says the key is old', async () => {
    server.answers.social_publish = ['stale_key', 'ok'];
    server.answers.friends_overview = [overview('new-key')];
    await publishSummary({ force: true });
    const publishes = server.calls.filter((c) => c.fn === 'social_publish');
    expect(server.calls.map((c) => c.fn)).toEqual(['social_publish', 'friends_overview', 'social_publish']);
    expect(publishes[1].args.p_share_key).toBe('new-key');
    const ids = (publishes[1].args.p_summary as { workouts: { id: string }[] }).workouts.map((w) => w.id);
    expect(ids).toEqual([shareRef('new-key', run().id)]);
    expect(useFriends.getState().overview?.me?.shareKey).toBe('new-key');
  });

  it('stops after one reload, and stops when friends were turned off elsewhere', async () => {
    server.answers.social_publish = ['stale_key'];
    server.answers.friends_overview = [overview('old-key')];
    await publishSummary({ force: true });
    expect(server.calls.filter((c) => c.fn === 'social_publish')).toHaveLength(2);

    server.calls = [];
    server.answers.social_publish = ['no_card'];
    server.answers.friends_overview = [{ me: null, friends: [], incoming: [], outgoing: [], cheers: [] }];
    await publishSummary({ force: true });
    expect(server.calls.map((c) => c.fn)).toEqual(['social_publish', 'friends_overview']);
    expect(useFriends.getState().overview?.me).toBeNull();
  });
});

// ------------------------------------------------------------------ meals

const MEAL_REF = 'ab'.repeat(16);
const FISH_REF = 'ef'.repeat(16);

function entry(id: string, name: string, meal: MealType, extra: Partial<FoodEntry> = {}): FoodEntry {
  const date = today();
  return {
    id,
    date,
    meal,
    name,
    foodId: `b_${id}`,
    source: 'builtin',
    verified: true,
    servingLabel: '1 cup',
    quantity: 1,
    grams: 150,
    nutrients: { kcal: 200, protein: 4, carbs: 40, fat: 1 },
    loggedAt: `${date}T12:0${id.length % 10}:00.000Z`,
    updatedAt: `${date}T12:00:00.000Z`,
    ...extra,
  } as FoodEntry;
}

const mealsOverview = (extra: Record<string, unknown> = {}) => ({
  me: { ...card('key'), meal_settings: { auto: [], kcal: false, see: true }, meals_allowed: true, audience: ['ben'] },
  friends: [{ user_id: 'ben', display_name: 'Ben', avatar: '', since: null, summary: {}, cheered: [], share_meals: true, see_meals: true }],
  incoming: [],
  outgoing: [],
  cheers: [],
  feed: [
    { kind: 'meal', ref: MEAL_REF, user_id: 'ben', display_name: 'Ben', avatar: '', day: today(), meal: 'lunch', items: [{ name: 'Toast', portion: '1 slice', source: 'builtin' }], show_kcal: false, cheered: false },
  ],
  my_meals: [{ ref: FISH_REF, day: today(), meal: 'lunch', items: [{ name: 'Rice', emoji: '', portion: '1 cup', source: 'builtin' }], show_kcal: false, shown_at: 'x', expires_at: 'y', viewers: [{ user_id: 'ben', display_name: 'Ben', avatar: '' }], cheers: 1 }],
  ...extra,
});

describe('meals shown to friends', () => {
  beforeEach(async () => {
    server.answers = { friends_overview: [mealsOverview()] };
    useStore.setState({ ownerId: 'user-a', foodEntries: {} });
    await refreshFriends();
    server.calls = [];
  });

  it('reads the meal parts of the overview', () => {
    const o = useFriends.getState().overview!;
    expect(o.me).toMatchObject({ mealsAllowed: true, audience: ['ben'], mealSettings: { auto: [], kcal: false, see: true } });
    expect(o.friends[0]).toMatchObject({ shareMeals: true, seeMeals: true });
    expect(o.feed).toHaveLength(1);
    expect(o.myMeals?.[0]).toMatchObject({ ref: FISH_REF, cheers: 1, viewers: [{ userId: 'ben', displayName: 'Ben', avatar: '' }] });
  });

  it('shows a meal with only what friends may see, then reloads', async () => {
    server.answers.meal_show = [{ status: 'ok', ref: MEAL_REF, expires_at: '2026-12-02T12:00:00Z' }];
    const res = await showMeal({ day: today(), meal: 'dinner', items: [{ name: 'Fish', portion: '1 fillet', source: 'builtin', kcal: 300, protein: 40 } as never], showKcal: false, viewers: ['ben', 'ben'] });
    expect(res).toEqual({ ok: true, value: { ref: MEAL_REF, expiresAt: '2026-12-02T12:00:00Z' } });
    const call = server.calls.find((c) => c.fn === 'meal_show')!;
    expect(call.args).toEqual({ p_day: today(), p_meal: 'dinner', p_items: [{ name: 'Fish', emoji: '', portion: '1 fillet', source: 'builtin' }], p_show_kcal: false, p_viewers: ['ben'] });
    expect(server.calls.map((c) => c.fn)).toEqual(['meal_show', 'friends_overview']);
  });

  it('says why a meal was not shown, with the server code', async () => {
    server.answers.meal_show = [{ status: 'under_18' }];
    const res = await showMeal({ day: today(), meal: 'dinner', items: [], showKcal: false, viewers: ['ben'] });
    expect(res).toMatchObject({ ok: false, code: 'under_18', message: 'Showing and seeing meals is for people 18 and over.' });
    server.answers.meal_show = [{ status: 'not_friends' }];
    server.calls = [];
    expect(await showMeal({ day: today(), meal: 'dinner', items: [], showKcal: false, viewers: ['ben'] })).toMatchObject({ ok: false, code: 'not_friends' });
    expect(server.calls.map((c) => c.fn)).toEqual(['meal_show', 'friends_overview']);
  });

  it('marks a meal cheer at once and takes it back when the server refuses', async () => {
    const whileSending: boolean[] = [];
    server.onCall = (fn) => {
      if (fn === 'send_cheer') whileSending.push(useFriends.getState().overview!.feed![0].cheered);
    };
    server.answers.send_cheer = ['invalid'];
    const res = await cheerMeal('ben', MEAL_REF);
    expect(whileSending).toEqual([true]);
    expect(res).toMatchObject({ ok: false, code: 'invalid' });
    expect(useFriends.getState().overview!.feed![0].cheered).toBe(false);
    server.answers.send_cheer = ['ok'];
    expect((await cheerMeal('ben', MEAL_REF)).ok).toBe(true);
    expect(server.calls.filter((c) => c.fn === 'send_cheer').pop()!.args).toEqual({ p_to: 'ben', p_ref: `meal:${MEAL_REF}` });
    expect(useFriends.getState().overview!.feed![0].cheered).toBe(true);
    expect(useFriends.getState().overview!.friends[0].cheered).toContain(`meal:${MEAL_REF}`);
    server.onCall = null;
  });

  it('stops a meal at once on the screen', async () => {
    const whileSending: number[] = [];
    server.onCall = (fn) => {
      if (fn === 'meal_stop') whileSending.push(useFriends.getState().overview!.myMeals!.length);
    };
    server.answers.meal_stop = ['stopped'];
    server.answers.friends_overview = [mealsOverview({ my_meals: [] })];
    expect((await stopMeal(FISH_REF)).ok).toBe(true);
    expect(whileSending).toEqual([0]);
    server.onCall = null;
  });

  it('sends only the switch that changed', async () => {
    server.answers.friend_prefs_set = ['ok'];
    await setFriendMealPrefs('ben', { seeMeals: false });
    expect(server.calls[0]).toEqual({ fn: 'friend_prefs_set', args: { p_friend: 'ben', p_share_meals: null, p_see_meals: false } });
  });

  it('sends an edited meal once, and stops one whose foods are gone', async () => {
    const rice = entry('rice', 'Rice', 'lunch');
    const beans = entry('beans', 'Beans', 'lunch');
    // The server holds the lunch as this phone built it when it was shown.
    const shown = cleanSharedMealItems(buildSharedMeal({ entries: [rice], day: today(), meal: 'lunch', showKcal: false }), false);
    server.answers.friends_overview = [mealsOverview({ my_meals: [{ ...mealsOverview().my_meals[0], items: shown }] })];
    await refreshFriends();
    server.calls = [];
    useStore.setState({ foodEntries: { [rice.id]: rice } });
    // Unchanged: nothing is sent.
    await publishMeals();
    expect(server.calls.filter((c) => c.fn === 'meal_update')).toHaveLength(0);
    // Beans added: the meal is sent again, once.
    useStore.setState({ foodEntries: { [rice.id]: rice, [beans.id]: beans } });
    server.answers.meal_update = ['ok'];
    await publishMeals();
    await publishMeals();
    const updates = server.calls.filter((c) => c.fn === 'meal_update');
    expect(updates).toHaveLength(1);
    expect(updates[0].args.p_ref).toBe(FISH_REF);
    expect((updates[0].args.p_items as { name: string }[]).map((i) => i.name)).toEqual(['Rice', 'Beans']);
    // Every food deleted: an empty list, which stops it.
    server.calls = [];
    server.answers.meal_update = ['stopped'];
    useStore.setState({ foodEntries: { [rice.id]: { ...rice, deleted: true }, [beans.id]: { ...beans, deleted: true } } });
    await publishMeals();
    expect(server.calls.find((c) => c.fn === 'meal_update')!.args.p_items).toEqual([]);
  });

  it('shows today\'s meal of an "always" type to the remembered audience, and never for someone under 18', async () => {
    server.answers.friends_overview = [mealsOverview({ me: { ...mealsOverview().me, meal_settings: { auto: ['dinner'], kcal: true, see: true } }, my_meals: [] })];
    await refreshFriends();
    const fish = entry('fish', 'Fish', 'dinner');
    const milk = entry('milk', 'Milk', 'dinner', { via: 'water' });
    useStore.setState({ foodEntries: { [fish.id]: fish, [milk.id]: milk } });
    server.calls = [];
    server.answers.meal_show_auto = [{ status: 'ok', ref: MEAL_REF }];
    await publishMeals();
    const auto = server.calls.find((c) => c.fn === 'meal_show_auto')!;
    expect(auto.args.p_day).toBe(today());
    expect(auto.args.p_meal).toBe('dinner');
    // Calories by the default, the drink from Water left out.
    expect(auto.args.p_items).toEqual([expect.objectContaining({ name: 'Fish', kcal: 200 })]);

    server.answers.friends_overview = [mealsOverview({ me: { ...mealsOverview().me, meals_allowed: false, meal_settings: { auto: ['dinner'], kcal: true, see: true } }, my_meals: [] })];
    await refreshFriends();
    server.calls = [];
    await publishMeals();
    expect(server.calls).toEqual([]);
  });
});
