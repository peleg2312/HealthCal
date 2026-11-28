/**
 * Friends: adding people by a code, seeing the part of their week they chose
 * to share, meals they chose to show, and cheering. Needs an account; all of it
 * goes through the database functions in supabase/migrations/20261115000000_friends.sql,
 * 20261116000000_friends_hardening.sql, 20261201000000_friends_meals.sql and
 * 20261202000000_friends_together.sql (circles, buddies, notes, saved meals shown), which
 * check every call. Nothing here is stored with the synced records.
 */
import { create } from 'zustand';

import { buildSharedMeal } from '@/features/friends/meals';
import { buildSharedSavedMeal } from '@/features/friends/savedShare';
import { friendMealToSaved } from '@/features/friends/saveFriendMeal';
import { buildFriendSignals, signalsSignature } from '@/features/friends/signals';
import { MEALS_NOT_YET } from '@/features/friends/words';
import { buildFriendSummary, cleanFriendSummary, DEFAULT_SHARING, normalizeCode, summarySignature, type FriendSummary, type SocialSharing } from '@/features/friends/summary';
import { dayRef } from '@/features/friends/summary';
import { today } from '@/lib/dates';
import { useStore } from '@/store';
import { live } from '@/store/selectors';
import type {
  Buddy,
  BuddyInvite,
  FeedItem,
  FeedSavedMeal,
  ISODate,
  MealSettings,
  MealType,
  MySharedMeal,
  MySharedSavedMeal,
  NoteKind,
  NoteReceived,
  NoteSent,
  SharedMealItem,
  SignalsWanted,
  TogetherCircle,
  TogetherInvite,
  TogetherKind,
} from '@/types';

import {
  cleanMealSettings,
  cleanSharedMealItems,
  DEFAULT_MEAL_SETTINGS,
  mealCheerRef,
  mealItemsSignature,
  mergeCheers,
  NO_SIGNALS,
  toBuddies,
  toBuddyInvites,
  toFeed,
  toMyMeals,
  toMySavedMeals,
  toNotes,
  toNotesSent,
  toSharedSavedMeals,
  toSignalsWanted,
  toTogether,
  toTogetherInvites,
  workoutFeedOf,
} from './friendsWire';
import { isBackendConfigured, supabase } from './supabase';
import { useSyncState } from './sync';

export type { FriendSummary, FriendWorkout, SocialSharing } from '@/features/friends/summary';
export type {
  Buddy,
  BuddyDay,
  BuddyInvite,
  FeedItem,
  FeedMeal,
  FeedSavedMeal,
  FeedWorkout,
  FriendPerson,
  MealSettings,
  MySharedMeal,
  MySharedSavedMeal,
  NoteKind,
  NoteReceived,
  NoteSent,
  SharedMeal,
  SharedMealItem,
  SharedSavedMeal,
  SignalsWanted,
  TogetherCircle,
  TogetherInvite,
  TogetherKind,
  TogetherMember,
  TogetherWeek,
} from '@/types';
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
  /** My switch "Notes from <name>" (on unless turned off; 20261202000000_friends_together.sql). Never told to them. */
  notesOn?: boolean;
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
  /** Cheers received in the last two weeks, newest first ('meal:<ref>' for a meal: the server sends those under meal_cheers). */
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
  /**
   * False while the server has no circles, buddies, notes or saved meals shown (20261202000000_friends_together.sql
   * not applied yet: its overview sends no `together`), or after one of their functions was missing: every control of
   * them hides, the lists below are empty and no call of them reaches the server. Absent (a hand-built overview)
   * reads as true. Always filled by `toOverview`, as are the fields below.
   */
  togetherAvailable?: boolean;
  /** What this phone should send for circles and buddies (`publishSignals`), and the day the figures are for. */
  signals?: SignalsWanted;
  /** "Notes from friends", for everyone (on unless turned off). */
  notesOn?: boolean;
  /** "Together this week": the circle I am in (one at most). Only the circle's total, never one person's. */
  together?: TogetherCircle[];
  /** Invitations to a circle, newest first. */
  togetherInvites?: TogetherInvite[];
  /** My logging buddies: together, or asked by me (a decline looks the same), by name. */
  buddies?: Buddy[];
  /** Friends asking me to log together, newest first. */
  buddyInvites?: BuddyInvite[];
  /** Kind notes received in the last 14 days, newest first. */
  notes?: NoteReceived[];
  /** The notes I sent today (one a day to each friend). */
  notesSent?: NoteSent[];
  /** Saved meals and recipes friends show me, newest first. Never part of `feed`. */
  sharedSavedMeals?: FeedSavedMeal[];
  /** My saved meals showing now, newest first. */
  mySavedMeals?: MySharedSavedMeal[];
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

const toCheer = (c: Json): CheerReceived => ({ fromUserId: str(c.from_user), displayName: str(c.display_name), avatar: str(c.avatar), ref: str(c.ref), createdAt: str(c.created_at) });

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
    notesOn: f.notes !== false,
  }));
  // A server with circles always sends `together` (an empty list at least); one without them sends no such key.
  const togetherAvailable = Array.isArray(o.together);
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
    // Workout and day cheers under `cheers` (all an older app reads), a shown meal's under `meal_cheers`: one list here.
    cheers: mergeCheers(list(o.cheers).map(toCheer), list(o.meal_cheers).map(toCheer)),
    feed: mealsAvailable ? toFeed(o.feed) : workoutFeedOf(friends),
    myMeals: mealsAvailable ? toMyMeals(o.my_meals) : [],
    mealsAvailable,
    togetherAvailable,
    signals: togetherAvailable ? toSignalsWanted(o.signals) : NO_SIGNALS,
    notesOn: !togetherAvailable || o.notes_on !== false,
    together: togetherAvailable ? toTogether(o.together) : [],
    togetherInvites: togetherAvailable ? toTogetherInvites(o.together_invites) : [],
    buddies: togetherAvailable ? toBuddies(o.buddies) : [],
    buddyInvites: togetherAvailable ? toBuddyInvites(o.buddy_invites) : [],
    notes: togetherAvailable ? toNotes(o.notes) : [],
    notesSent: togetherAvailable ? toNotesSent(o.notes_sent) : [],
    sharedSavedMeals: togetherAvailable ? toSharedSavedMeals(o.shared_saved_meals) : [],
    mySavedMeals: togetherAvailable ? toMySavedMeals(o.my_saved_meals) : [],
  };
}

const EMPTY_OVERVIEW: FriendsOverview = {
  me: null,
  friends: [],
  incoming: [],
  outgoing: [],
  cheers: [],
  feed: [],
  myMeals: [],
  together: [],
  togetherInvites: [],
  buddies: [],
  buddyInvites: [],
  notes: [],
  notesSent: [],
  sharedSavedMeals: [],
  mySavedMeals: [],
};

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
  const forMeal = ref.startsWith('meal:');
  if (forMeal && mealsMissing()) return refused('not_yet');
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
    // A server without meals keeps the cheers' older check (23514, check_violation) if a meal cheer ever reaches it.
    if (error && forMeal && (isMissingFunction(error) || error.code === '23514')) return mealsNotYet();
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
  not_yet: MEALS_NOT_YET,
};

function refused(code: string): { ok: false; reason: FriendsFailure; message: string; code: string } {
  return { ok: false, reason: 'failed', code, message: MEAL_MESSAGES[code] ?? 'That did not work. Refresh and try again.' };
}

/** Change the overview in place at once (it is reloaded after the call either way). */
function patchOverview(change: (o: FriendsOverview) => FriendsOverview): void {
  useFriends.setState((s) => (s.overview ? { overview: change(s.overview) } : s));
}

/**
 * A function the server does not have. Before 20261201000000_friends_meals.sql is applied every meal function is
 * missing, and PostgREST answers 404 with PGRST202 ("Could not find the function public.meal_show(...) in the
 * schema cache"); for a moment after it is applied, while PostgREST reloads its schema cache, it can answer the
 * same. 42883 (undefined_function) is PostgreSQL's own answer when the cache still lists one that is gone.
 */
export function isMissingFunction(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return error.code === 'PGRST202' || error.code === '42883' || /could not find the function/i.test(error.message ?? '');
}

/** The overview held says this server has no meals yet: a meal call is not sent at all. */
function mealsMissing(): boolean {
  return useFriends.getState().overview?.mealsAvailable === false;
}

/**
 * A meal function was missing: every meal control hides until the next reload of the overview says otherwise, and
 * the call says so in plain words (code 'not_yet'). Workouts and cheers on them are untouched.
 */
function mealsNotYet(): { ok: false; reason: FriendsFailure; message: string; code: string } {
  patchOverview((o) => ({ ...o, mealsAvailable: false, me: o.me ? { ...o.me, mealsAllowed: false } : o.me, feed: (o.feed ?? []).filter((i) => i.kind !== 'meal'), myMeals: [] }));
  return refused('not_yet');
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
  if (mealsMissing()) return refused('not_yet');
  const { data, error } = await session.client.rpc('meal_show', {
    p_day: input.day,
    p_meal: input.meal,
    p_items: cleanSharedMealItems(input.items, input.showKcal),
    p_show_kcal: input.showKcal,
    p_viewers: [...new Set(input.viewers)],
  });
  if (error) return isMissingFunction(error) ? mealsNotYet() : failure(error.message);
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
  if (mealsMissing()) return refused('not_yet');
  const { data, error } = await session.client.rpc('meal_update', { p_ref: ref, p_items: items });
  if (error) return isMissingFunction(error) ? mealsNotYet() : failure(error.message);
  if (data === 'ok' || data === 'stopped') return { ok: true, value: data };
  return refused(str(data));
}

/** Stop showing one meal, at once for everyone. */
export async function stopMeal(ref: string): Promise<FriendsResult> {
  const session = await signedInClient();
  if (!session.ok) return session;
  if (mealsMissing()) return refused('not_yet');
  const removed = useFriends.getState().overview?.myMeals?.find((m) => m.ref === ref);
  patchOverview((o) => ({ ...o, myMeals: (o.myMeals ?? []).filter((m) => m.ref !== ref) }));
  const { data, error } = await session.client.rpc('meal_stop', { p_ref: ref });
  if (error) {
    if (removed) patchOverview((o) => ({ ...o, myMeals: [removed, ...(o.myMeals ?? []).filter((m) => m.ref !== ref)] }));
    return isMissingFunction(error) ? mealsNotYet() : failure(error.message);
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
  if (mealsMissing()) return refused('not_yet');
  const { data, error } = await session.client.rpc('meal_stop_all');
  if (error) return isMissingFunction(error) ? mealsNotYet() : failure(error.message);
  lastSentMeal.clear();
  await refreshFriends();
  return { ok: true, value: typeof data === 'number' ? data : 0 };
}

/** Change the meal settings (keys left out stay as they are). Shows at once, then reloads. */
export async function setMealSettings(patch: Partial<MealSettings>): Promise<FriendsResult<MealSettings>> {
  const session = await signedInClient();
  if (!session.ok) return session;
  if (mealsMissing()) return refused('not_yet');
  const before = useFriends.getState().overview?.me?.mealSettings;
  patchOverview((o) => (o.me ? { ...o, me: { ...o.me, mealSettings: { ...DEFAULT_MEAL_SETTINGS, ...o.me.mealSettings, ...patch } } } : o));
  const { data, error } = await session.client.rpc('meal_settings_set', { p_settings: patch });
  if (error || !data) {
    patchOverview((o) => (o.me ? { ...o, me: { ...o.me, mealSettings: before ?? DEFAULT_MEAL_SETTINGS } } : o));
    if (error) return isMissingFunction(error) ? mealsNotYet() : failure(error.message);
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
  if (mealsMissing()) return refused('not_yet');
  const { data, error } = await session.client.rpc('meal_audience_set', { p_viewers: [...new Set(userIds)] });
  if (error) return isMissingFunction(error) ? mealsNotYet() : failure(error.message);
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
  if (mealsMissing()) return refused('not_yet');
  const apply = (o: FriendsOverview, p: { shareMeals?: boolean; seeMeals?: boolean }) => ({
    ...o,
    friends: o.friends.map((f) => (f.userId === userId ? { ...f, ...(p.shareMeals === undefined ? null : { shareMeals: p.shareMeals }), ...(p.seeMeals === undefined ? null : { seeMeals: p.seeMeals }) } : f)),
  });
  const friend = useFriends.getState().overview?.friends.find((f) => f.userId === userId);
  patchOverview((o) => apply(o, prefs));
  const { data, error } = await session.client.rpc('friend_prefs_set', { p_friend: userId, p_share_meals: prefs.shareMeals ?? null, p_see_meals: prefs.seeMeals ?? null });
  if (error || data !== 'ok') {
    if (friend) patchOverview((o) => apply(o, { shareMeals: friend.shareMeals, seeMeals: friend.seeMeals }));
    if (error) return isMissingFunction(error) ? mealsNotYet() : failure(error.message);
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
 * under 18 or without friends on, nor against a server without meals; never raises an error.
 */
export async function publishMeals(): Promise<void> {
  const session = await signedInClient();
  if (!session.ok) return;
  const overview = useFriends.getState().overview;
  const me = overview?.me;
  // A server without meals (mealsAllowed is then false too) is asked nothing.
  if (!me || !me.mealsAllowed || overview.mealsAvailable === false) return;
  const s = useStore.getState();
  if (s.ownerId !== session.userId) return;
  const entries = live(s.foodEntries);
  let changed = false;
  for (const shown of overview.myMeals ?? []) {
    const items = cleanSharedMealItems(buildSharedMeal({ entries, day: shown.day, meal: shown.meal, showKcal: shown.showKcal }), shown.showKcal);
    const signature = mealItemsSignature(items);
    if (signature === mealItemsSignature(shown.items) || signature === lastSentMeal.get(shown.ref)) continue;
    const { data, error } = await session.client.rpc('meal_update', { p_ref: shown.ref, p_items: items });
    if (error) {
      // Quietly: a sync never raises a meal error. A missing function hides the meal controls instead.
      if (isMissingFunction(error)) mealsNotYet();
      return;
    }
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
      if (error) {
        if (isMissingFunction(error)) mealsNotYet();
        return;
      }
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
  lastSignals = null;
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

// ------------------------------------------------------------------ together (20261202000000_friends_together.sql)

/** Said where a control of circles, buddies or notes was still on screen when the server turned out not to have them. */
export const TOGETHER_NOT_YET = 'Doing things together with friends is not available yet. Friends work as before.';

/** The words for each answer the together functions refuse with. */
export const TOGETHER_MESSAGES: Record<string, string> = {
  no_card: 'Friends are off. Turn them on first.',
  invalid: 'That could not be saved. Refresh and try again.',
  under_18: 'Days logged together is for people 18 and over. Active minutes work for everyone.',
  in_circle: 'You are in a circle already. Leave it first to join another.',
  not_friends: 'Someone picked is no longer a friend. Refresh and pick again.',
  too_many: 'That is more people than this allows.',
  not_member: 'You are no longer in this circle.',
  not_found: 'That is no longer there.',
  already_today: 'One note a day to each friend. You can send another tomorrow.',
  limit: 'That is a lot for one day. Try again tomorrow.',
  not_yet: TOGETHER_NOT_YET,
};

function togetherRefused(code: string): { ok: false; reason: FriendsFailure; message: string; code: string } {
  return { ok: false, reason: 'failed', code, message: TOGETHER_MESSAGES[code] ?? 'That did not work. Refresh and try again.' };
}

/** The overview held says this server has no circles yet: a together call is not sent at all. */
function togetherMissing(): boolean {
  return useFriends.getState().overview?.togetherAvailable === false;
}

/**
 * A together function was missing (PGRST202 before the migration, or for a moment after it while PostgREST reloads):
 * every control of circles, buddies, notes and saved meals shown hides until the next reload says otherwise.
 */
function togetherNotYet(): { ok: false; reason: FriendsFailure; message: string; code: string } {
  patchOverview((o) => ({
    ...o,
    togetherAvailable: false,
    signals: NO_SIGNALS,
    notesOn: true,
    together: [],
    togetherInvites: [],
    buddies: [],
    buddyInvites: [],
    notes: [],
    notesSent: [],
    sharedSavedMeals: [],
    mySavedMeals: [],
  }));
  return togetherRefused('not_yet');
}

/** One together call: the client, the not-yet rule, a missing function and the server's word in one place. */
async function togetherCall(fn: string, args: Record<string, unknown>): Promise<{ ok: true; data: unknown } | { ok: false; reason: FriendsFailure; message: string; code?: string }> {
  const session = await signedInClient();
  if (!session.ok) return session;
  if (togetherMissing()) return togetherRefused('not_yet');
  const { data, error } = await session.client.rpc(fn, args);
  if (error) return isMissingFunction(error) ? togetherNotYet() : failure(error.message);
  return { ok: true, data };
}

const statusOf = (data: unknown): string => (data && typeof data === 'object' ? str((data as Json).status) : str(data));

/**
 * Start "Together this week" with the friends picked (at most 5; they each accept). `kind` 'minutes' (active
 * minutes, target 30 to 6000) or 'days' (days with food logged, target 2 to 42, 18 and over only).
 */
export async function startTogether(input: { kind: TogetherKind; target: number; invite: string[] }): Promise<FriendsResult<{ id: string }>> {
  const r = await togetherCall('together_start', { p_kind: input.kind, p_target: Math.round(input.target), p_invite: [...new Set(input.invite)] });
  if (!r.ok) return r;
  const o = (r.data && typeof r.data === 'object' ? r.data : {}) as Json;
  if (o.status !== 'ok' || typeof o.id !== 'string') return togetherRefused(statusOf(r.data));
  await refreshFriends();
  await publishSignals({ force: true });
  return { ok: true, value: { id: o.id } };
}

/** Invite more friends to my circle. Someone already invited, in it, or who declined is passed over silently. */
export async function inviteToTogether(circleId: string, userIds: string[]): Promise<FriendsResult> {
  const r = await togetherCall('together_invite', { p_goal: circleId, p_users: [...new Set(userIds)] });
  if (!r.ok) return r;
  if (r.data !== 'ok') return togetherRefused(statusOf(r.data));
  await refreshFriends();
  return { ok: true, value: undefined };
}

/** Join a circle, or decline (silently; that circle cannot ask again). */
export async function respondToTogether(circleId: string, accept: boolean): Promise<FriendsResult<'joined' | 'declined'>> {
  const r = await togetherCall('together_respond', { p_goal: circleId, p_accept: accept });
  if (!r.ok) return r;
  await refreshFriends();
  if (r.data === 'joined' || r.data === 'declined') {
    // Joining asks this phone for new figures: send them now rather than after the next sync.
    if (r.data === 'joined') await publishSignals({ force: true });
    return { ok: true, value: r.data };
  }
  return togetherRefused(statusOf(r.data));
}

/** Leave my circle, silently. Gone from the screen at once. */
export async function leaveTogether(circleId: string): Promise<FriendsResult> {
  const before = useFriends.getState().overview?.together;
  patchOverview((o) => ({ ...o, together: (o.together ?? []).filter((c) => c.id !== circleId) }));
  const r = await togetherCall('together_leave', { p_goal: circleId });
  if (!r.ok) {
    if (before && r.code !== 'not_yet') patchOverview((o) => ({ ...o, together: before }));
    return r;
  }
  await refreshFriends();
  // Already gone: what the person wanted.
  return r.data === 'left' || r.data === 'not_found' ? { ok: true, value: undefined } : togetherRefused(statusOf(r.data));
}

/** "Change the goal": the circle's target from this week on. */
export async function setTogetherTarget(circleId: string, target: number): Promise<FriendsResult> {
  const r = await togetherCall('together_set_target', { p_goal: circleId, p_target: Math.round(target) });
  if (!r.ok) return r;
  if (r.data !== 'ok') return togetherRefused(statusOf(r.data));
  await refreshFriends();
  return { ok: true, value: undefined };
}

/**
 * "Cheer everyone": a cheer for today (`day:<today>`) to each member of the circle who is my friend (members who are
 * not are skipped: a cheer is between friends). `today` is the caller's `useToday()`. The value is how many were sent.
 */
export async function cheerTogether(circle: Pick<TogetherCircle, 'members'>, day: ISODate): Promise<FriendsResult<{ sent: number }>> {
  const friends = new Set((useFriends.getState().overview?.friends ?? []).map((f) => f.userId));
  const to = circle.members.filter((m) => !m.me && friends.has(m.userId));
  let sent = 0;
  let last: FriendsResult | null = null;
  for (const m of to) {
    last = await cheerFriend(m.userId, dayRef(day));
    if (last.ok) sent += 1;
  }
  if (!sent && last && !last.ok) return last;
  return { ok: true, value: { sent } };
}

/** Ask a friend to log together. 'accepted' when they had asked me first. */
export async function inviteBuddy(userId: string): Promise<FriendsResult<'sent' | 'accepted' | 'already'>> {
  const r = await togetherCall('buddy_invite', { p_user: userId });
  if (!r.ok) return r;
  await refreshFriends();
  if (r.data === 'sent' || r.data === 'accepted' || r.data === 'already') {
    if (r.data === 'accepted') await publishSignals({ force: true });
    return { ok: true, value: r.data };
  }
  return togetherRefused(statusOf(r.data));
}

/** Answer a friend's ask to log together. Declining is silent. */
export async function respondToBuddy(userId: string, accept: boolean): Promise<FriendsResult<'together' | 'declined'>> {
  const r = await togetherCall('buddy_respond', { p_user: userId, p_accept: accept });
  if (!r.ok) return r;
  await refreshFriends();
  if (r.data === 'together' || r.data === 'declined') {
    if (r.data === 'together') await publishSignals({ force: true });
    return { ok: true, value: r.data };
  }
  return togetherRefused(statusOf(r.data));
}

/** Stop logging together, or take back my ask. Silent for the other; gone from the screen at once. */
export async function stopBuddy(userId: string): Promise<FriendsResult> {
  const before = useFriends.getState().overview?.buddies;
  patchOverview((o) => ({ ...o, buddies: (o.buddies ?? []).filter((b) => b.userId !== userId) }));
  const r = await togetherCall('buddy_stop', { p_user: userId });
  if (!r.ok) {
    if (before && r.code !== 'not_yet') patchOverview((o) => ({ ...o, buddies: before }));
    return r;
  }
  await refreshFriends();
  return r.data === 'stopped' || r.data === 'not_found' ? { ok: true, value: undefined } : togetherRefused(statusOf(r.data));
}

/** Send a friend a kind note. Shows as sent at once; rolled back if refused. */
export async function sendNote(userId: string, kind: NoteKind): Promise<FriendsResult> {
  const mark: NoteSent = { toUserId: userId, kind, createdAt: new Date().toISOString() };
  patchOverview((o) => ({ ...o, notesSent: [mark, ...(o.notesSent ?? [])] }));
  const r = await togetherCall('send_note', { p_to: userId, p_kind: kind });
  const undo = () => patchOverview((o) => ({ ...o, notesSent: (o.notesSent ?? []).filter((n) => n !== mark) }));
  if (!r.ok) {
    undo();
    return r;
  }
  if (r.data !== 'ok') {
    // Sent from another phone already today: keep it shown as sent.
    if (r.data !== 'already_today') undo();
    return togetherRefused(statusOf(r.data));
  }
  await refreshFriends();
  return { ok: true, value: undefined };
}

/** "Notes from friends" on or off for everyone. Shows at once. */
export async function setNotesOn(on: boolean): Promise<FriendsResult<boolean>> {
  const before = useFriends.getState().overview?.notesOn;
  patchOverview((o) => ({ ...o, notesOn: on }));
  const r = await togetherCall('note_settings_set', { p_on: on });
  if (!r.ok || typeof r.data !== 'boolean') {
    patchOverview((o) => ({ ...o, notesOn: before ?? true }));
    return r.ok ? togetherRefused('no_card') : r;
  }
  await refreshFriends();
  return { ok: true, value: r.data };
}

/** Notes from one friend on or off; they are never told. Shows at once. */
export async function setFriendNotes(userId: string, on: boolean): Promise<FriendsResult> {
  const apply = (value: boolean) => patchOverview((o) => ({ ...o, friends: o.friends.map((f) => (f.userId === userId ? { ...f, notesOn: value } : f)) }));
  const before = useFriends.getState().overview?.friends.find((f) => f.userId === userId)?.notesOn ?? true;
  apply(on);
  const r = await togetherCall('friend_notes_set', { p_friend: userId, p_on: on });
  if (!r.ok || r.data !== 'ok') {
    apply(before);
    return r.ok ? togetherRefused(statusOf(r.data)) : r;
  }
  await refreshFriends();
  return { ok: true, value: undefined };
}

/**
 * Show a saved meal or recipe to the friends picked, for 7 days (as a day's meal). `name`, `items` and `servings`
 * come from `buildSharedSavedMeal`; `savedMealId` is the saved meal's id, which the server turns into an opaque
 * reference with the share key and never keeps. Showing it again changes it and keeps when it leaves.
 */
export async function showSavedMeal(input: { savedMealId: string; name: string; items: SharedMealItem[]; servings: number | null; showKcal: boolean; viewers: string[] }): Promise<FriendsResult<{ ref: string; expiresAt: string }>> {
  if (mealsMissing()) return refused('not_yet');
  const r = await togetherCall('meal_show_saved', {
    p_saved_id: input.savedMealId,
    p_name: input.name,
    p_items: cleanSharedMealItems(input.items, input.showKcal),
    p_servings: input.servings,
    p_show_kcal: input.showKcal,
    p_viewers: [...new Set(input.viewers)],
  });
  if (!r.ok) return r;
  const o = (r.data && typeof r.data === 'object' ? r.data : {}) as Json;
  if (o.status !== 'ok' || typeof o.ref !== 'string') {
    if (o.status === 'not_friends' || o.status === 'no_card') await refreshFriends();
    return refused(str(o.status));
  }
  await refreshFriends();
  return { ok: true, value: { ref: o.ref, expiresAt: str(o.expires_at) } };
}

/** What was last sent for circles and buddies, by user, so unchanged figures are not sent again after every sync. */
let lastSignals: { userId: string; signature: string } | null = null;

/**
 * Send this phone's figures for circles and buddies (`buildFriendSignals`): only what the overview says the server
 * wants, nothing at all for someone in no circle and with no buddy, and nothing when unchanged. Run after each sync;
 * never raises an error, and against a server without circles it asks nothing.
 */
export async function publishSignals(options: { force?: boolean } = {}): Promise<void> {
  const session = await signedInClient();
  if (!session.ok) return;
  const overview = useFriends.getState().overview;
  const want = overview?.signals;
  if (!overview?.me || overview.togetherAvailable === false || !want || (!want.minutes && !want.logged)) return;
  const s = useStore.getState();
  if (s.ownerId !== session.userId) return;
  const signals = buildFriendSignals({ activities: live(s.activities), foodEntries: live(s.foodEntries), today: today(), want });
  const signature = signalsSignature(signals);
  if (!options.force && lastSignals?.userId === session.userId && lastSignals.signature === signature) return;
  const { data, error } = await session.client.rpc('social_signals_publish', { p_signals: signals });
  if (error) {
    if (isMissingFunction(error)) togetherNotYet();
    return;
  }
  if (data === 'ok') lastSignals = { userId: session.userId, signature };
  // not_needed or no_card: the overview is out of date; the next reload says what is wanted.
  else lastSignals = null;
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
      await publishSignals();
    })();
  });
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') {
      lastPublished = null;
      lastSignals = null;
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
    buildSharedSavedMeal,
    cheerMeal,
    cheerTogether,
    friendMealToSaved,
    inviteBuddy,
    inviteToTogether,
    leaveSocial,
    leaveTogether,
    publishMeals,
    publishSignals,
    publishSummary,
    refreshFriends,
    removeFriend,
    requestFriend,
    respondToBuddy,
    respondToRequest,
    respondToTogether,
    sendNote,
    setFriendMealPrefs,
    setFriendNotes,
    setNotesOn,
    setTogetherTarget,
    showSavedMeal,
    startTogether,
    stopBuddy,
    setMealAudience,
    setMealSettings,
    setupSocial,
    showMeal,
    stopAllMeals,
    stopMeal,
  };
}
