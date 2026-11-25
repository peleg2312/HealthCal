/**
 * Friends: adding people by a code, seeing the part of their week they chose
 * to share, meals they chose to show, and cheering. Needs an account; all of it
 * goes through the database functions in supabase/migrations/20261115000000_friends.sql,
 * 20261116000000_friends_hardening.sql and 20261201000000_friends_meals.sql, which
 * check every call. Nothing here is stored with the synced records.
 */
import { create } from 'zustand';

import { buildSharedMeal } from '@/features/friends/meals';
import { buildFriendSummary, cleanFriendSummary, DEFAULT_SHARING, normalizeCode, summarySignature, type FriendSummary, type SocialSharing } from '@/features/friends/summary';
import { today } from '@/lib/dates';
import { useStore } from '@/store';
import { live } from '@/store/selectors';
import type { FeedItem, ISODate, MealSettings, MealType, MySharedMeal, SharedMealItem } from '@/types';

import { cleanMealSettings, cleanSharedMealItems, DEFAULT_MEAL_SETTINGS, mealCheerRef, mealItemsSignature, toFeed, toMyMeals, workoutFeedOf } from './friendsWire';
import { isBackendConfigured, supabase } from './supabase';
import { useSyncState } from './sync';

export type { FriendSummary, FriendWorkout, SocialSharing } from '@/features/friends/summary';
export type { FeedItem, FeedMeal, FeedWorkout, FriendPerson, MealSettings, MySharedMeal, SharedMeal, SharedMealItem } from '@/types';
export { cleanSharedMealItems, DEFAULT_MEAL_SETTINGS, mealItemsSignature } from './friendsWire';

export interface SocialMe {
  code: string;
  displayName: string;
  avatar: string;
  sharing: SocialSharing;
  /**
   * The secret behind the references friends see for this user's workouts
   * (see shareRef). Given by the server to its owner only; never sent anywhere.
   */
  shareKey: string;
  /**
   * Meals (20261201000000_friends_meals.sql). Always filled by `toOverview`; optional only so an
   * overview built by hand (tests, older screenshots) still type-checks.
   */
  mealSettings?: MealSettings;
  /** 18 or over, as the server reads the profile's birth date: false hides every meal control. */
  mealsAllowed?: boolean;
  /** "Who sees your meals": the friends picked last time, still friends. */
  audience?: string[];
}

export interface Friend {
  userId: string;
  displayName: string;
  avatar: string;
  /** When the two became friends. */
  since: string | null;
  /** Only what this friend chose to share; any part may be missing. */
  summary: FriendSummary;
  summaryUpdatedAt: string | null;
  /** References (opaque workout references, 'day:YYYY-MM-DD' or 'meal:<ref>') this user has already cheered. */
  cheered: string[];
  /** My switch "<name> sees meals I show" (on unless turned off). */
  shareMeals: boolean;
  /** My switch "<name>'s meals in my feed" (on unless turned off). Their switches about me are never told. */
  seeMeals: boolean;
}

export interface FriendRequest {
  userId: string;
  displayName: string;
  avatar: string;
  createdAt: string;
}

export interface CheerReceived {
  fromUserId: string;
  displayName: string;
  avatar: string;
  ref: string;
  createdAt: string;
}

export interface FriendsOverview {
  /** The user's own card, or null until they turn friends on. */
  me: SocialMe | null;
  friends: Friend[];
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
  /** Cheers received in the last two weeks, newest first ('meal:<ref>' for a meal). */
  cheers: CheerReceived[];
  /**
   * What friends chose to show me: their meals I may see now and their shared workouts of the last
   * 7 days, newest first (the server's order). Always filled by `toOverview`.
   */
  feed?: FeedItem[];
  /** My meals showing now, newest first. Always filled by `toOverview`. */
  myMeals?: MySharedMeal[];
  /**
   * False while the server has no meals (20261201000000_friends_meals.sql not applied yet: its overview sends no
   * `feed`): every meal control hides, Friends settings says meals are not here yet, the feed holds friends'
   * workouts made on the phone, and no meal call reaches the server. Absent (a hand-built overview) reads as true.
   */
  mealsAvailable?: boolean;
}

/**
 * unavailable: this build has no backend. signed-out: friends need an account.
 * Otherwise idle until first loaded, then ready (or error, keeping the last overview).
 */
export type FriendsStatus = 'unavailable' | 'signed-out' | 'idle' | 'loading' | 'ready' | 'error';

interface FriendsState {
  status: FriendsStatus;
  overview: FriendsOverview | null;
  error: string | null;
}

export const useFriends = create<FriendsState>(() => ({ status: isBackendConfigured ? 'idle' : 'unavailable', overview: null, error: null }));

// Browser tests and screenshots set this store directly to show the screens with data and no backend.
if (typeof __DEV__ !== 'undefined' && (__DEV__ || process.env.EXPO_PUBLIC_E2E === '1')) {
  (globalThis as { __healthcalFriends?: typeof useFriends }).__healthcalFriends = useFriends;
}

export type FriendsFailure = 'unavailable' | 'signed-out' | 'offline' | 'failed';
/** A failure's `code` is the server's answer when it refused (meals: see `MealShowStatus` and the others below). */
export type FriendsResult<T = void> = { ok: true; value: T } | { ok: false; reason: FriendsFailure; message: string; code?: string };

const OFFLINE = /network|fetch|timeout|offline/i;

function failure(message: string): { ok: false; reason: FriendsFailure; message: string } {
  return OFFLINE.test(message) ? { ok: false, reason: 'offline', message: 'No connection. Try again when you are online.' } : { ok: false, reason: 'failed', message };
}

async function signedInClient(): Promise<{ ok: true; client: NonNullable<typeof supabase>; userId: string } | { ok: false; reason: FriendsFailure; message: string }> {
  if (!supabase) return { ok: false, reason: 'unavailable', message: 'Accounts are not set up for this build yet.' };
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) return { ok: false, reason: 'signed-out', message: 'Friends need an account. Sign in first.' };
  return { ok: true, client: supabase, userId };
}

type Json = Record<string, unknown>;
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const list = (v: unknown): Json[] => (Array.isArray(v) ? (v.filter((x) => x && typeof x === 'object') as Json[]) : []);

function toSharing(v: unknown): SocialSharing {
  const o = (v && typeof v === 'object' ? v : {}) as Json;
  return { workouts: o.workouts !== false, streak: o.streak !== false, minutes: o.minutes !== false };
}

/** The database's answer in the app's own shape. Anything unexpected is dropped rather than trusted. */
export function toOverview(raw: unknown): FriendsOverview {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Json;
  const me = o.me && typeof o.me === 'object' ? (o.me as Json) : null;
  const person = (p: Json) => ({ userId: str(p.user_id), displayName: str(p.display_name), avatar: str(p.avatar) });
  // A server with meals always sends a feed (an empty list at least); one without them sends no such key.
  const mealsAvailable = Array.isArray(o.feed);
  const friends = list(o.friends).map((f) => ({
    ...person(f),
    since: typeof f.since === 'string' ? f.since : null,
    summary: cleanFriendSummary(f.summary),
    summaryUpdatedAt: typeof f.summary_updated_at === 'string' ? f.summary_updated_at : null,
    cheered: Array.isArray(f.cheered) ? f.cheered.filter((r): r is string => typeof r === 'string') : [],
    shareMeals: f.share_meals !== false,
    seeMeals: f.see_meals !== false,
  }));
  return {
    me: me
      ? {
          code: str(me.code),
          displayName: str(me.display_name),
          avatar: str(me.avatar),
          sharing: toSharing(me.sharing),
          shareKey: str(me.share_key),
          mealSettings: cleanMealSettings(me.meal_settings),
          mealsAllowed: mealsAvailable && me.meals_allowed === true,
          audience: Array.isArray(me.audience) ? me.audience.filter((id): id is string => typeof id === 'string') : [],
        }
      : null,
    friends,
    incoming: list(o.incoming).map((r) => ({ ...person(r), createdAt: str(r.created_at) })),
    outgoing: list(o.outgoing).map((r) => ({ ...person(r), createdAt: str(r.created_at) })),
    cheers: list(o.cheers).map((c) => ({ fromUserId: str(c.from_user), displayName: str(c.display_name), avatar: str(c.avatar), ref: str(c.ref), createdAt: str(c.created_at) })),
    feed: mealsAvailable ? toFeed(o.feed) : workoutFeedOf(friends),
    myMeals: mealsAvailable ? toMyMeals(o.my_meals) : [],
    mealsAvailable,
  };
}

const EMPTY_OVERVIEW: FriendsOverview = { me: null, friends: [], incoming: [], outgoing: [], cheers: [], feed: [], myMeals: [] };

/** Load (or reload) everything the Friends screen shows. Never throws. */
export async function refreshFriends(): Promise<void> {
  const session = await signedInClient();
  if (!session.ok) {
    useFriends.setState({ status: session.reason === 'unavailable' ? 'unavailable' : 'signed-out', overview: null, error: null });
    return;
  }
  if (useFriends.getState().status !== 'ready') useFriends.setState({ status: 'loading', error: null });
  const { data, error } = await session.client.rpc('friends_overview');
  if (error) {
    useFriends.setState({ status: 'error', error: failure(error.message).message });
    return;
  }
  useFriends.setState({ status: 'ready', overview: toOverview(data), error: null });
}

/** Turn friends on, or change the name, avatar and what is shared. */
export async function setupSocial(input: { displayName: string; avatar: string; sharing: SocialSharing }): Promise<FriendsResult<SocialMe>> {
  const session = await signedInClient();
  if (!session.ok) return session;
  const { data, error } = await session.client.rpc('social_setup', { p_display_name: input.displayName.trim(), p_avatar: input.avatar.trim(), p_sharing: input.sharing });
  if (error) return failure(error.message);
  const me = toOverview({ me: data }).me;
  if (!me) return failure('The server did not return your card.');
  const before = useFriends.getState().overview?.me;
  // The card's answer does not carry the meal settings: keep the ones held until the next reload.
  const merged: SocialMe = before ? { ...me, mealSettings: before.mealSettings, mealsAllowed: before.mealsAllowed, audience: before.audience } : me;
  useFriends.setState((s) => ({ status: 'ready', overview: { ...(s.overview ?? EMPTY_OVERVIEW), me: merged } }));
  // What friends see changes with the switches, so send the week again.
  await publishSummary({ force: true });
  // A new card: load what comes with it (whether meals are allowed, the default meal settings).
  if (!before) await refreshFriends();
  return { ok: true, value: me };
}

export type RequestOutcome = 'sent' | 'accepted' | 'already_friends' | 'not_found' | 'self' | 'too_many' | 'limit' | 'setup_needed';

/** Ask the owner of a code to be friends. The outcome says what happened in the user's terms. */
export async function requestFriend(code: string): Promise<FriendsResult<{ outcome: RequestOutcome; displayName?: string }>> {
  const session = await signedInClient();
  if (!session.ok) return session;
  const { data, error } = await session.client.rpc('friend_request', { p_code: normalizeCode(code) });
  if (error) return failure(error.message);
  const o = (data && typeof data === 'object' ? data : {}) as Json;
  const outcome = str(o.status) as RequestOutcome;
  const friend = o.friend && typeof o.friend === 'object' ? (o.friend as Json) : null;
  if (outcome === 'sent' || outcome === 'accepted') await refreshFriends();
  return { ok: true, value: { outcome, displayName: friend ? str(friend.display_name) : undefined } };
}

/** Accept or decline a request someone sent. */
export async function respondToRequest(userId: string, accept: boolean): Promise<FriendsResult> {
  const session = await signedInClient();
  if (!session.ok) return session;
  const { data, error } = await session.client.rpc('friend_respond', { p_user: userId, p_accept: accept });
  if (error) return failure(error.message);
  await refreshFriends();
  // The other person may have taken the request back in the meantime: say so instead of claiming it worked.
  if (data === 'not_found') return { ok: false, reason: 'failed', message: 'That request is no longer there.' };
  return { ok: true, value: undefined };
}

/**
 * Undo a decline made a moment ago (the toast's Undo): the request shows again.
 * The server allows it for 15 minutes; after that, entering their code is the way back.
 */
export async function undoDecline(userId: string): Promise<FriendsResult> {
  const session = await signedInClient();
  if (!session.ok) return session;
  const { data, error } = await session.client.rpc('friend_undecline', { p_user: userId });
  if (error) return failure(error.message);
  await refreshFriends();
  if (data !== 'restored') return { ok: false, reason: 'failed', message: 'That request is no longer there.' };
  return { ok: true, value: undefined };
}

/** Stop being friends, or take back a request. */
export async function removeFriend(userId: string): Promise<FriendsResult> {
  const session = await signedInClient();
  if (!session.ok) return session;
  const { error } = await session.client.rpc('friend_remove', { p_user: userId });
  if (error) return failure(error.message);
  await refreshFriends();
  return { ok: true, value: undefined };
}

/**
 * Cheer a friend's workout (the reference they published), day (`dayRef(date)`) or shown meal
 * (`mealCheerRef(ref)`, or use `cheerMeal`). Shows at once, in `friends[i].cheered` and on the matching
 * feed item; rolled back if it fails.
 */
export async function cheerFriend(userId: string, ref: string): Promise<FriendsResult> {
  const session = await signedInClient();
  if (!session.ok) return session;
  const mark = (on: boolean) =>
    useFriends.setState((s) =>
      s.overview
        ? {
            overview: {
              ...s.overview,
              friends: s.overview.friends.map((f) => (f.userId === userId ? { ...f, cheered: on ? [...new Set([...f.cheered, ref])] : f.cheered.filter((r) => r !== ref) } : f)),
              feed: (s.overview.feed ?? []).map((item) =>
                item.userId === userId && (item.kind === 'meal' ? mealCheerRef(item.ref) : item.ref) === ref ? { ...item, cheered: on } : item,
              ),
            },
          }
        : s,
    );
  mark(true);
  const { data, error } = await session.client.rpc('send_cheer', { p_to: userId, p_ref: ref });
  if (error || data !== 'ok') {
    mark(false);
    if (error) return failure(error.message);
    return {
      ok: false,
      reason: 'failed',
      code: typeof data === 'string' ? data : undefined,
      message:
        data === 'limit'
          ? 'That is a lot of cheering for one day. Try again tomorrow.'
          : data === 'invalid'
            ? 'That cheer could not be sent. Refresh and try again.'
            : 'You can only cheer your friends.',
    };
  }
  return { ok: true, value: undefined };
}

/** Cheer a meal a friend shows you (its `ref` from the feed). Shows at once on the feed item; rolled back if it fails. */
export function cheerMeal(ownerId: string, ref: string): Promise<FriendsResult> {
  return cheerFriend(ownerId, mealCheerRef(ref));
}

// ------------------------------------------------------------------ meals

/** What `meal_show` answers when it refuses (it stores nothing then). */
export type MealShowStatus = 'no_card' | 'under_18' | 'invalid' | 'empty' | 'no_viewers' | 'not_friends' | 'limit';

const MEAL_MESSAGES: Record<string, string> = {
  no_card: 'Friends are off. Turn them on to show a meal.',
  under_18: 'Showing and seeing meals is for people 18 and over.',
  invalid: 'That meal could not be shown. Refresh and try again.',
  empty: 'There is nothing in this meal to show.',
  no_viewers: 'Pick at least one friend to show it to.',
  not_friends: 'One of the people picked is no longer a friend who can see your meals. Refresh and pick again.',
  limit: 'That is a lot of meals shown for one day. Try again tomorrow.',
  gone: 'That meal is not showing any more.',
  not_found: 'That meal is not showing any more.',
};

function refused(code: string): { ok: false; reason: FriendsFailure; message: string; code: string } {
  return { ok: false, reason: 'failed', code, message: MEAL_MESSAGES[code] ?? 'That did not work. Refresh and try again.' };
}

/** Change the overview in place at once (it is reloaded after the call either way). */
function patchOverview(change: (o: FriendsOverview) => FriendsOverview): void {
  useFriends.setState((s) => (s.overview ? { overview: change(s.overview) } : s));
}

/**
 * Show one meal to the friends picked (the "Show to friends" button). `items` come from
 * `buildSharedMeal`; the server keeps only what friends may see, makes the reference, and
 * remembers `viewers` as the audience offered next time. Showing the same day and meal again
 * changes its foods, calories switch and viewers, and keeps when it leaves (7 days after first shown).
 */
export async function showMeal(input: { day: ISODate; meal: MealType; items: SharedMealItem[]; showKcal: boolean; viewers: string[] }): Promise<FriendsResult<{ ref: string; expiresAt: string }>> {
  const session = await signedInClient();
  if (!session.ok) return session;
  const { data, error } = await session.client.rpc('meal_show', {
    p_day: input.day,
    p_meal: input.meal,
    p_items: cleanSharedMealItems(input.items, input.showKcal),
    p_show_kcal: input.showKcal,
    p_viewers: [...new Set(input.viewers)],
  });
  if (error) return failure(error.message);
  const o = (data && typeof data === 'object' ? data : {}) as Json;
  if (o.status !== 'ok' || typeof o.ref !== 'string') {
    if (o.status === 'not_friends' || o.status === 'no_card') await refreshFriends();
    return refused(str(o.status));
  }
  lastSentMeal.set(o.ref, mealItemsSignature(cleanSharedMealItems(input.items, input.showKcal)));
  await refreshFriends();
  return { ok: true, value: { ref: o.ref, expiresAt: str(o.expires_at) } };
}

/**
 * Send the foods of a meal showing now again after an edit in the diary (friends see the edit).
 * Never changes who sees it and never brings back a stopped or expired meal. 'stopped' when no
 * food is left: the meal stopped showing.
 */
export async function updateMeal(ref: string, items: SharedMealItem[]): Promise<FriendsResult<'ok' | 'stopped'>> {
  const session = await signedInClient();
  if (!session.ok) return session;
  const { data, error } = await session.client.rpc('meal_update', { p_ref: ref, p_items: items });
  if (error) return failure(error.message);
  if (data === 'ok' || data === 'stopped') return { ok: true, value: data };
  return refused(str(data));
}

/** Stop showing one meal, at once for everyone. */
export async function stopMeal(ref: string): Promise<FriendsResult> {
  const session = await signedInClient();
  if (!session.ok) return session;
  const removed = useFriends.getState().overview?.myMeals?.find((m) => m.ref === ref);
  patchOverview((o) => ({ ...o, myMeals: (o.myMeals ?? []).filter((m) => m.ref !== ref) }));
  const { data, error } = await session.client.rpc('meal_stop', { p_ref: ref });
  if (error) {
    if (removed) patchOverview((o) => ({ ...o, myMeals: [removed, ...(o.myMeals ?? []).filter((m) => m.ref !== ref)] }));
    return failure(error.message);
  }
  lastSentMeal.delete(ref);
  await refreshFriends();
  // Already gone (stopped on another phone, or it left by itself): what the person wanted.
  return data === 'stopped' || data === 'not_found' ? { ok: true, value: undefined } : refused(str(data));
}

/** "Stop showing all meals". The value is how many were showing. */
export async function stopAllMeals(): Promise<FriendsResult<number>> {
  const session = await signedInClient();
  if (!session.ok) return session;
  const { data, error } = await session.client.rpc('meal_stop_all');
  if (error) return failure(error.message);
  lastSentMeal.clear();
  await refreshFriends();
  return { ok: true, value: typeof data === 'number' ? data : 0 };
}

/** Change the meal settings (keys left out stay as they are). Shows at once, then reloads. */
export async function setMealSettings(patch: Partial<MealSettings>): Promise<FriendsResult<MealSettings>> {
  const session = await signedInClient();
  if (!session.ok) return session;
  const before = useFriends.getState().overview?.me?.mealSettings;
  patchOverview((o) => (o.me ? { ...o, me: { ...o.me, mealSettings: { ...DEFAULT_MEAL_SETTINGS, ...o.me.mealSettings, ...patch } } } : o));
  const { data, error } = await session.client.rpc('meal_settings_set', { p_settings: patch });
  if (error || !data) {
    patchOverview((o) => (o.me ? { ...o, me: { ...o.me, mealSettings: before ?? DEFAULT_MEAL_SETTINGS } } : o));
    if (error) return failure(error.message);
    await refreshFriends();
    return refused('no_card');
  }
  await refreshFriends();
  return { ok: true, value: cleanMealSettings(data) };
}

/** Set "Who sees your meals" (friends only are kept). The value is the ids kept. */
export async function setMealAudience(userIds: string[]): Promise<FriendsResult<string[]>> {
  const session = await signedInClient();
  if (!session.ok) return session;
  const { data, error } = await session.client.rpc('meal_audience_set', { p_viewers: [...new Set(userIds)] });
  if (error) return failure(error.message);
  await refreshFriends();
  if (!Array.isArray(data)) return refused('no_card');
  return { ok: true, value: data.filter((id): id is string => typeof id === 'string') };
}

/**
 * My two switches for one friend: `shareMeals` ("<name> sees meals I show": off takes them out of
 * every meal showing now, at once) and `seeMeals` ("<name>'s meals in my feed"). Left out = unchanged.
 * Shows at once, then reloads.
 */
export async function setFriendMealPrefs(userId: string, prefs: { shareMeals?: boolean; seeMeals?: boolean }): Promise<FriendsResult> {
  const session = await signedInClient();
  if (!session.ok) return session;
  const apply = (o: FriendsOverview, p: { shareMeals?: boolean; seeMeals?: boolean }) => ({
    ...o,
    friends: o.friends.map((f) => (f.userId === userId ? { ...f, ...(p.shareMeals === undefined ? null : { shareMeals: p.shareMeals }), ...(p.seeMeals === undefined ? null : { seeMeals: p.seeMeals }) } : f)),
  });
  const friend = useFriends.getState().overview?.friends.find((f) => f.userId === userId);
  patchOverview((o) => apply(o, prefs));
  const { data, error } = await session.client.rpc('friend_prefs_set', { p_friend: userId, p_share_meals: prefs.shareMeals ?? null, p_see_meals: prefs.seeMeals ?? null });
  if (error || data !== 'ok') {
    if (friend) patchOverview((o) => apply(o, { shareMeals: friend.shareMeals, seeMeals: friend.seeMeals }));
    if (error) return failure(error.message);
    await refreshFriends();
    return refused(str(data));
  }
  await refreshFriends();
  return { ok: true, value: undefined };
}

/** What each meal showing now last sent, by ref, so an unchanged meal is not sent again after every sync. */
const lastSentMeal = new Map<string, string>();

/**
 * Keep the meals showing now in step with the diary, after each sync: an edited meal is sent again
 * (friends see the edit), one whose foods are all gone stops, and today's meals of a type in
 * "Always show these meals" are shown to the remembered audience. Never shows a meal the person
 * stopped, never a past day by itself, never changes who sees a meal. Does nothing for someone
 * under 18 or without friends on.
 */
export async function publishMeals(): Promise<void> {
  const session = await signedInClient();
  if (!session.ok) return;
  const overview = useFriends.getState().overview;
  const me = overview?.me;
  if (!me || !me.mealsAllowed) return;
  const s = useStore.getState();
  if (s.ownerId !== session.userId) return;
  const entries = live(s.foodEntries);
  let changed = false;
  for (const shown of overview.myMeals ?? []) {
    const items = cleanSharedMealItems(buildSharedMeal({ entries, day: shown.day, meal: shown.meal, showKcal: shown.showKcal }), shown.showKcal);
    const signature = mealItemsSignature(items);
    if (signature === mealItemsSignature(shown.items) || signature === lastSentMeal.get(shown.ref)) continue;
    const { data, error } = await session.client.rpc('meal_update', { p_ref: shown.ref, p_items: items });
    if (error) return;
    if (data === 'ok') lastSentMeal.set(shown.ref, signature);
    changed = true;
  }
  const settings = me.mealSettings ?? DEFAULT_MEAL_SETTINGS;
  if (settings.auto.length && (me.audience ?? []).length) {
    const day = today();
    for (const meal of settings.auto) {
      if ((overview.myMeals ?? []).some((m) => m.day === day && m.meal === meal)) continue;
      const items = cleanSharedMealItems(buildSharedMeal({ entries, day, meal, showKcal: settings.kcal }), settings.kcal);
      if (!items.length) continue;
      const signature = `auto:${day}:${meal}:${mealItemsSignature(items)}`;
      if (lastSentMeal.get(`auto:${day}:${meal}`) === signature) continue;
      const { data, error } = await session.client.rpc('meal_show_auto', { p_day: day, p_meal: meal, p_items: items });
      if (error) return;
      lastSentMeal.set(`auto:${day}:${meal}`, signature);
      if (data && typeof data === 'object' && (data as Json).status === 'ok') changed = true;
    }
  }
  if (changed) await refreshFriends();
}

/** Turn friends off: the card, every friendship and every cheer are removed on the server. */
export async function leaveSocial(): Promise<FriendsResult> {
  const session = await signedInClient();
  if (!session.ok) return session;
  const { error } = await session.client.rpc('social_leave');
  if (error) return failure(error.message);
  lastPublished = null;
  lastSentMeal.clear();
  useFriends.setState({ status: 'ready', overview: EMPTY_OVERVIEW, error: null });
  return { ok: true, value: undefined };
}

/** The summary last sent, by user, so an unchanged week is not sent again after every sync. */
let lastPublished: { userId: string; signature: string } | null = null;

/**
 * Send this device's week to the server for friends to see. Does nothing for
 * someone who has not turned friends on, and nothing when the week has not changed.
 */
export async function publishSummary(options: { force?: boolean } = {}): Promise<void> {
  const session = await signedInClient();
  if (!session.ok) return;
  // Twice at most: once with the card this device holds, and once more after reloading
  // it when the server says the key is old (friends were turned off and on on another
  // device). Workout references made with an old key would match nothing anywhere.
  for (let attempt = 0; attempt < 2; attempt++) {
    const me = useFriends.getState().overview?.me;
    if (!me) return;
    const s = useStore.getState();
    if (s.ownerId !== session.userId) return;
    const summary = buildFriendSummary({ activities: live(s.activities), foodEntries: live(s.foodEntries), today: today(), sharing: me.sharing ?? DEFAULT_SHARING, shareKey: me.shareKey });
    const signature = summarySignature(summary);
    if (!options.force && lastPublished?.userId === session.userId && lastPublished.signature === signature) return;
    const { data, error } = await session.client.rpc('social_publish', { p_summary: summary, p_share_key: me.shareKey });
    if (error) return;
    if (data === 'ok') {
      lastPublished = { userId: session.userId, signature };
      return;
    }
    // stale_key or no_card: this device's card is out of date. Reload it, then try again.
    lastPublished = null;
    await refreshFriends();
    if (data !== 'stale_key') return;
  }
}

let started = false;

/**
 * Keep friends in step with the account: load the overview once the first sync
 * of a session has finished, and send the week after every later sync. Call once at startup.
 */
export function startFriends(): void {
  if (started || !supabase) return;
  started = true;
  let lastRun: string | null = null;
  useSyncState.subscribe((sync) => {
    if (sync.status !== 'idle' || !sync.lastRunAt || sync.lastRunAt === lastRun) return;
    lastRun = sync.lastRunAt;
    void (async () => {
      if (useFriends.getState().status !== 'ready') await refreshFriends();
      await publishSummary();
      await publishMeals();
    })();
  });
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') {
      lastPublished = null;
      lastSentMeal.clear();
      useFriends.setState({ status: 'signed-out', overview: null, error: null });
    }
  });
}

// scripts/dev/e2e-backend.cjs drives the friends calls on two devices against the stand-in backend
// with these, so its checks do not depend on how the screens are laid out. Test builds only.
if (typeof __DEV__ !== 'undefined' && (__DEV__ || process.env.EXPO_PUBLIC_E2E === '1')) {
  (globalThis as { __healthcalFriendsApi?: unknown }).__healthcalFriendsApi = {
    buildSharedMeal,
    cheerMeal,
    leaveSocial,
    publishMeals,
    refreshFriends,
    removeFriend,
    requestFriend,
    respondToRequest,
    setFriendMealPrefs,
    setMealSettings,
    setupSocial,
    showMeal,
    stopAllMeals,
    stopMeal,
  };
}
