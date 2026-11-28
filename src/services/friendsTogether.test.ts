/**
 * Circles, buddies, notes and saved meals shown (20261202000000_friends_together.sql) in the friends service,
 * against a scripted server: the overview's new parts read safely, calm on a server without them (no call made,
 * controls hidden, no error), figures sent only as asked, and the answers that show at once rolled back on a refusal.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { today } from '@/lib/dates';
import { useStore } from '@/store';
import type { FoodEntry } from '@/types';

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
      if (data && typeof data === 'object' && '__error' in data) return { data: null, error: (data as { __error: unknown }).__error };
      return { data: data ?? null, error: null };
    },
  },
}));

vi.mock('./sync', async () => {
  const { create } = await import('zustand');
  return { useSyncState: create(() => ({ status: 'idle', lastRunAt: null })) };
});

const api = await import('./friends');
const { useFriends, refreshFriends, TOGETHER_NOT_YET } = api;

const card = { code: 'ABCD2345', display_name: 'Alex', avatar: '', sharing: { workouts: true, streak: true, minutes: true }, share_key: 'k'.repeat(64) };
const person = (id: string, name: string) => ({ user_id: id, display_name: name, avatar: '' });
const friend = (id: string, name: string) => ({ ...person(id, name), since: null, summary: {}, summary_updated_at: null, cheered: [] });
const week = ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29'];
const PGRST202 = { __error: { code: 'PGRST202', message: 'Could not find the function public.together_start(p_invite, p_kind, p_target) in the schema cache' } };

/** The overview of a server with meals and, unless `together` is false, with circles. */
function overview(together = true) {
  const base = { me: card, friends: [friend('maya', 'Maya'), friend('jo', 'Jo')], incoming: [], outgoing: [], cheers: [], feed: [], my_meals: [], meal_cheers: [] };
  if (!together) return base;
  return {
    ...base,
    signals: { minutes: true, logged: false, today: '2026-11-28' },
    notes_on: true,
    together: [
      {
        id: 'c1',
        kind: 'minutes',
        week: '2026-11-23',
        target: 600,
        total: 412,
        last_week: null,
        members: [{ ...person('user-a', 'Alex'), me: true }, { ...person('maya', 'Maya'), me: false }, { ...person('sam', 'Sam'), me: false }],
        asked: ['jo'],
      },
      { id: 'bad', kind: 'steps', week: '2026-11-23', target: 1, total: 0 },
    ],
    together_invites: [{ id: 'c2', kind: 'days', target: 10, from: person('jo', 'Jo'), members: [person('jo', 'Jo')], created_at: '2026-11-27T10:00:00Z' }, { id: 'c3' }],
    buddies: [
      { ...person('jo', 'Jo'), status: 'together', since: '2026-11-20', week: week.map((day, i) => ({ day, count: i < 5 ? [2, 2, 1, 2, 2][i] : i === 5 ? 0 : null })), run: 8, kept: true },
      { ...person('maya', 'Maya'), status: 'asked' },
      { ...person('x', 'X'), status: 'together', since: '2026-11-20', week: [] },
    ],
    buddy_invites: [{ ...person('sam', 'Sam'), created_at: '2026-11-27T10:00:00Z' }],
    notes: [{ id: '7', from_user: 'maya', display_name: 'Maya', avatar: '', kind: 'walk_later', created_at: '2026-11-28T08:00:00Z' }, { id: '8', from_user: 'maya', kind: 'you failed' }],
    notes_sent: [],
    shared_saved_meals: [
      { kind: 'saved_meal', ref: 'a'.repeat(32), ...person('maya', 'Maya'), name: 'Overnight oats', items: [{ name: 'Oats', portion: '1 cup', source: 'builtin', kcal: 300 }], show_kcal: false, servings: 2, cheered: false },
      { kind: 'saved_meal', ref: 'b'.repeat(32), ...person('maya', 'Maya'), name: 'Empty', items: [], show_kcal: false },
    ],
    my_saved_meals: [],
  };
}

beforeEach(async () => {
  server.calls = [];
  server.answers = { friends_overview: [overview()] };
  useFriends.setState({ status: 'idle', overview: null, error: null });
  await refreshFriends();
  server.calls = [];
});

describe('reading the overview', () => {
  it('reads circles, invitations, buddies, notes and saved meals, dropping what is malformed', () => {
    const o = useFriends.getState().overview!;
    expect(o.togetherAvailable).toBe(true);
    expect(o.signals).toEqual({ minutes: true, logged: false, today: '2026-11-28' });
    expect(o.together).toHaveLength(1);
    expect(o.together![0]).toMatchObject({ id: 'c1', kind: 'minutes', total: 412, target: 600, lastWeek: null, asked: ['jo'] });
    expect(o.together![0].members.map((m) => [m.displayName, m.me])).toEqual([['Alex', true], ['Maya', false], ['Sam', false]]);
    expect(o.togetherInvites!.map((i) => i.id)).toEqual(['c2']);
    expect(o.buddies!.map((b) => [b.displayName, b.status])).toEqual([['Jo', 'together'], ['Maya', 'asked']]);
    const jo = o.buddies![0];
    expect(jo.status === 'together' && jo.week.map((d) => d.count)).toEqual([2, 2, 1, 2, 2, 0, null]);
    expect(o.buddyInvites!.map((b) => b.displayName)).toEqual(['Sam']);
    expect(o.notes!.map((n) => [n.id, n.kind])).toEqual([['7', 'walk_later']]);
    expect(o.sharedSavedMeals!.map((m) => m.name)).toEqual(['Overnight oats']);
    // Calories are dropped unless the meal shows them.
    expect(o.sharedSavedMeals![0].items[0]).not.toHaveProperty('kcal');
    expect(o.friends.every((f) => f.notesOn)).toBe(true);
  });
});

describe('a server without circles (the app update arrives before the migration)', () => {
  beforeEach(async () => {
    server.answers = { friends_overview: [overview(false)] };
    await refreshFriends();
    server.calls = [];
  });

  it('hides everything and asks the server nothing', async () => {
    const o = useFriends.getState().overview!;
    expect(o.togetherAvailable).toBe(false);
    expect([o.together, o.togetherInvites, o.buddies, o.buddyInvites, o.notes, o.notesSent, o.sharedSavedMeals, o.mySavedMeals]).toEqual([[], [], [], [], [], [], [], []]);
    expect(o.notesOn).toBe(true);
    expect(o.mealsAvailable).toBe(true);
    for (const r of [
      await api.startTogether({ kind: 'minutes', target: 300, invite: ['maya'] }),
      await api.inviteBuddy('maya'),
      await api.sendNote('maya', 'nice_week'),
      await api.setNotesOn(false),
      await api.showSavedMeal({ savedMealId: 's1', name: 'Oats', items: [{ name: 'Oats', portion: '1 cup', source: 'builtin' }], servings: null, showKcal: false, viewers: ['maya'] }),
    ]) {
      expect(r).toEqual({ ok: false, reason: 'failed', code: 'not_yet', message: TOGETHER_NOT_YET });
    }
    await api.publishSignals({ force: true });
    expect(server.calls).toEqual([]);
  });
});

describe('a together function that is missing although the overview has circles (a schema cache still reloading)', () => {
  it('says not yet, hides the controls and sends nothing more until the next reload', async () => {
    server.answers.together_start = [PGRST202];
    const r = await api.startTogether({ kind: 'minutes', target: 300, invite: ['maya'] });
    expect(r).toMatchObject({ ok: false, code: 'not_yet' });
    const o = useFriends.getState().overview!;
    expect(o.togetherAvailable).toBe(false);
    expect(o.together).toEqual([]);
    expect(o.feed).toEqual([]);
    server.calls = [];
    await api.inviteBuddy('jo');
    await api.publishSignals({ force: true });
    expect(server.calls).toEqual([]);
    // The meals and the week are untouched.
    expect(o.mealsAvailable).toBe(true);
  });

  it('publishSignals meets it quietly', async () => {
    server.answers.social_signals_publish = [{ __error: { code: 'PGRST202', message: 'Could not find the function public.social_signals_publish(p_signals) in the schema cache' } }];
    useStore.setState({ ownerId: 'user-a' });
    await api.publishSignals({ force: true });
    expect(server.calls.map((c) => c.fn)).toEqual(['social_signals_publish']);
    expect(useFriends.getState().overview!.togetherAvailable).toBe(false);
  });
});

describe('sending figures', () => {
  it('sends only what the server wants, and nothing again while unchanged', async () => {
    useStore.setState({ ownerId: 'user-a' });
    server.answers.social_signals_publish = ['ok'];
    await api.publishSignals({ force: true });
    await api.publishSignals();
    expect(server.calls.map((c) => c.fn)).toEqual(['social_signals_publish']);
    const sent = server.calls[0].args.p_signals as Record<string, unknown>;
    expect(Object.keys(sent).sort()).toEqual(['last_minutes', 'minutes', 'today']);
    expect(sent.today).toBe(today());
  });

  it('sends nothing for someone in no circle and with no buddy', async () => {
    useStore.setState({ ownerId: 'user-a' });
    useFriends.setState((s) => ({ overview: { ...s.overview!, signals: { minutes: false, logged: false, today: null } } }));
    await api.publishSignals({ force: true });
    expect(server.calls).toEqual([]);
  });

  it('sends the days logged for a buddy, never the food', async () => {
    const day = today();
    useStore.setState({
      ownerId: 'user-a',
      foodEntries: { f1: { id: 'f1', updatedAt: `${day}T12:00:00Z`, date: day, meal: 'lunch', name: 'Secret cake', source: 'builtin', verified: true, servingLabel: '1 slice', quantity: 1, grams: 80, nutrients: { kcal: 320, protein: 4, carbs: 40, fat: 15 }, loggedAt: `${day}T12:00:00Z` } as FoodEntry },
    });
    useFriends.setState((s) => ({ overview: { ...s.overview!, signals: { minutes: false, logged: true, today: day } } }));
    server.answers.social_signals_publish = ['ok'];
    await api.publishSignals({ force: true });
    const sent = server.calls[0].args.p_signals as Record<string, unknown>;
    expect(sent).toEqual({ today: day, logged: [day] });
    expect(JSON.stringify(sent)).not.toMatch(/cake|320|lunch/i);
    useStore.setState({ foodEntries: {} });
  });
});

describe('what shows at once', () => {
  it('marks a note as sent at once, and takes it back when refused', async () => {
    server.answers.send_note = ['limit'];
    const pending = api.sendNote('jo', 'nice_week');
    expect(useFriends.getState().overview!.notesSent!.map((n) => n.toUserId)).toEqual(['jo']);
    const r = await pending;
    expect(r).toMatchObject({ ok: false, code: 'limit' });
    expect(useFriends.getState().overview!.notesSent).toEqual([]);
  });

  it('keeps a note shown as sent when another phone sent one today', async () => {
    server.answers.send_note = ['already_today'];
    const r = await api.sendNote('jo', 'walk_later');
    expect(r).toMatchObject({ ok: false, code: 'already_today' });
    expect(useFriends.getState().overview!.notesSent!.map((n) => n.toUserId)).toEqual(['jo']);
  });

  it('takes a buddy off at once, and puts them back when the call fails', async () => {
    server.answers.buddy_stop = [{ __error: { message: 'Failed to fetch' } }];
    const r = await api.stopBuddy('jo');
    expect(r).toMatchObject({ ok: false, reason: 'offline' });
    expect(useFriends.getState().overview!.buddies!.map((b) => b.userId)).toEqual(['jo', 'maya']);
  });

  it('turns notes from one friend off at once', async () => {
    server.answers.friend_notes_set = ['ok'];
    const pending = api.setFriendNotes('maya', false);
    expect(useFriends.getState().overview!.friends.find((f) => f.userId === 'maya')!.notesOn).toBe(false);
    expect(await pending).toEqual({ ok: true, value: undefined });
  });
});

describe('calls', () => {
  it('starts a circle with the friends picked, once each', async () => {
    server.answers.together_start = [{ status: 'ok', id: 'c9' }];
    const r = await api.startTogether({ kind: 'minutes', target: 412.4, invite: ['maya', 'maya', 'jo'] });
    expect(r).toEqual({ ok: true, value: { id: 'c9' } });
    expect(server.calls[0]).toEqual({ fn: 'together_start', args: { p_kind: 'minutes', p_target: 412, p_invite: ['maya', 'jo'] } });
  });

  it('says a refusal in plain words', async () => {
    server.answers.together_start = [{ status: 'in_circle' }];
    const r = await api.startTogether({ kind: 'days', target: 10, invite: [] });
    expect(r).toMatchObject({ ok: false, code: 'in_circle' });
    expect(r.ok || r.message).toMatch(/Leave it first/);
  });

  it('cheers every member who is a friend, never the caller or someone who is not a friend', async () => {
    server.answers.send_cheer = ['ok'];
    const circle = useFriends.getState().overview!.together![0];
    const r = await api.cheerTogether(circle, '2026-11-28');
    expect(r).toEqual({ ok: true, value: { sent: 1 } });
    expect(server.calls.map((c) => [c.fn, c.args.p_to, c.args.p_ref])).toEqual([['send_cheer', 'maya', 'day:2026-11-28']]);
  });

  it('shows a saved meal with its foods cleaned as friends receive them', async () => {
    server.answers.meal_show_saved = [{ status: 'ok', ref: 'c'.repeat(32), expires_at: '2026-12-05T10:00:00Z' }];
    const r = await api.showSavedMeal({ savedMealId: 's1', name: 'Oats', items: [{ name: 'Oats', portion: '1 cup', source: 'builtin', kcal: 300 }], servings: 2, showKcal: false, viewers: ['maya', 'maya'] });
    expect(r).toEqual({ ok: true, value: { ref: 'c'.repeat(32), expiresAt: '2026-12-05T10:00:00Z' } });
    expect(server.calls[0].args).toEqual({ p_saved_id: 's1', p_name: 'Oats', p_items: [{ name: 'Oats', emoji: '', portion: '1 cup', source: 'builtin' }], p_servings: 2, p_show_kcal: false, p_viewers: ['maya'] });
  });

  it('treats leaving a circle that is already gone as done', async () => {
    server.answers.together_leave = ['not_found'];
    expect(await api.leaveTogether('c1')).toEqual({ ok: true, value: undefined });
  });
});
