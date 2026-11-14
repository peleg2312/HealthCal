/**
 * Friends: adding people by a code, seeing the part of their week they chose
 * to share, and cheering a workout. Needs an account; all of it goes through
 * the database functions in supabase/migrations/20261115000000_friends.sql,
 * which check every call. Nothing here is stored with the synced records.
 */
import { create } from 'zustand';

import { buildFriendSummary, cleanFriendSummary, DEFAULT_SHARING, normalizeCode, summarySignature, type FriendSummary, type SocialSharing } from '@/features/friends/summary';
import { today } from '@/lib/dates';
import { useStore } from '@/store';
import { live } from '@/store/selectors';

import { isBackendConfigured, supabase } from './supabase';
import { useSyncState } from './sync';

export type { FriendSummary, FriendWorkout, SocialSharing } from '@/features/friends/summary';

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
  /** References (opaque workout references or 'day:YYYY-MM-DD') this user has already cheered. */
  cheered: string[];
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
  /** Cheers received in the last two weeks, newest first. */
  cheers: CheerReceived[];
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
export type FriendsResult<T = void> = { ok: true; value: T } | { ok: false; reason: FriendsFailure; message: string };

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
  return {
    me: me ? { code: str(me.code), displayName: str(me.display_name), avatar: str(me.avatar), sharing: toSharing(me.sharing), shareKey: str(me.share_key) } : null,
    friends: list(o.friends).map((f) => ({
      ...person(f),
      since: typeof f.since === 'string' ? f.since : null,
      summary: cleanFriendSummary(f.summary),
      summaryUpdatedAt: typeof f.summary_updated_at === 'string' ? f.summary_updated_at : null,
      cheered: Array.isArray(f.cheered) ? f.cheered.filter((r): r is string => typeof r === 'string') : [],
    })),
    incoming: list(o.incoming).map((r) => ({ ...person(r), createdAt: str(r.created_at) })),
    outgoing: list(o.outgoing).map((r) => ({ ...person(r), createdAt: str(r.created_at) })),
    cheers: list(o.cheers).map((c) => ({ fromUserId: str(c.from_user), displayName: str(c.display_name), avatar: str(c.avatar), ref: str(c.ref), createdAt: str(c.created_at) })),
  };
}

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
  useFriends.setState((s) => ({ status: 'ready', overview: { ...(s.overview ?? { friends: [], incoming: [], outgoing: [], cheers: [] }), me } }));
  // What friends see changes with the switches, so send the week again.
  await publishSummary({ force: true });
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

/** Cheer a friend's workout (the reference they published) or day (`dayRef(date)`). Shows at once; rolled back if it fails. */
export async function cheerFriend(userId: string, ref: string): Promise<FriendsResult> {
  const session = await signedInClient();
  if (!session.ok) return session;
  const mark = (on: boolean) =>
    useFriends.setState((s) =>
      s.overview
        ? { overview: { ...s.overview, friends: s.overview.friends.map((f) => (f.userId === userId ? { ...f, cheered: on ? [...new Set([...f.cheered, ref])] : f.cheered.filter((r) => r !== ref) } : f)) } }
        : s,
    );
  mark(true);
  const { data, error } = await session.client.rpc('send_cheer', { p_to: userId, p_ref: ref });
  if (error || data !== 'ok') {
    mark(false);
    return failure(
      error?.message ??
        (data === 'limit' ? 'That is a lot of cheering for one day. Try again tomorrow.' : data === 'invalid' ? 'That cheer could not be sent. Refresh and try again.' : 'You can only cheer your friends.'),
    );
  }
  return { ok: true, value: undefined };
}

/** Turn friends off: the card, every friendship and every cheer are removed on the server. */
export async function leaveSocial(): Promise<FriendsResult> {
  const session = await signedInClient();
  if (!session.ok) return session;
  const { error } = await session.client.rpc('social_leave');
  if (error) return failure(error.message);
  lastPublished = null;
  useFriends.setState({ status: 'ready', overview: { me: null, friends: [], incoming: [], outgoing: [], cheers: [] }, error: null });
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
    })();
  });
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') {
      lastPublished = null;
      useFriends.setState({ status: 'signed-out', overview: null, error: null });
    }
  });
}
