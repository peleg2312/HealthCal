/**
 * The friends service against a scripted server: what the app says when a request
 * vanished while the screen showed it, and how a device holding an old share key
 * (friends turned off and on on another device) recovers before publishing.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { shareRef } from '@/features/friends/summary';
import { today } from '@/lib/dates';
import { useStore } from '@/store';
import type { ActivityEntry } from '@/types';

const server = vi.hoisted(() => ({
  calls: [] as { fn: string; args: Record<string, unknown> }[],
  answers: {} as Record<string, unknown[]>,
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

const { publishSummary, refreshFriends, respondToRequest, undoDecline, useFriends } = await import('./friends');

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
