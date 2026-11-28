/**
 * The stand-in backend (scripts/dev/mock-backend.cjs) must follow the same rules for circles, buddies, notes and
 * saved meals shown as supabase/migrations/20261202000000_friends_together.sql, which
 * supabase/tests/friends_together.sql checks. This starts a private copy of the stand-in on a free port and walks
 * the same cases over HTTP, then the stand-in answering as the server before that migration.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { sharedSavedRef } from './friendsWire';

const root = join(__dirname, '..', '..');
let proc: ChildProcess;
let base = '';

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address() as { port: number };
      srv.close(() => resolve(port));
    });
  });
}

beforeAll(async () => {
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  proc = spawn(process.execPath, [join(root, 'scripts', 'dev', 'mock-backend.cjs'), `--port=${port}`], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('mock backend did not start')), 5000);
    proc.stdout!.on('data', (d) => {
      if (String(d).includes('mock backend on')) {
        clearTimeout(timer);
        resolve();
      }
    });
  });
});
afterAll(() => {
  proc?.kill();
});

interface Person {
  id: string;
  name: string;
  code: string;
  key: string;
  rpc: (fn: string, body?: Record<string, unknown>) => Promise<any>;
  raw: (fn: string, body?: Record<string, unknown>) => Promise<{ status: number; body: any }>;
}

const day = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
const minor = () => {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - 17);
  return d.toISOString().slice(0, 10);
};

let n = 0;
async function person(name: string, birthDate = '1990-04-02'): Promise<Person> {
  n += 1;
  const res = await fetch(`${base}/auth/v1/signup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `tog${n}-${Date.now()}@example.com`, password: 'secret123' }) });
  const session = (await res.json()) as { access_token: string; user: { id: string } };
  const raw = async (fn: string, body: Record<string, unknown> = {}) => {
    const r = await fetch(`${base}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(body) });
    const text = await r.text();
    return { status: r.status, body: text ? JSON.parse(text) : null };
  };
  const rpc = async (fn: string, body: Record<string, unknown> = {}) => (await raw(fn, body)).body;
  await rpc('push_profile', { p_profile: { name, birthDate }, p_profile_updated_at: new Date().toISOString(), p_settings: null, p_settings_updated_at: null });
  const card = await rpc('social_setup', { p_display_name: name, p_avatar: '', p_sharing: {} });
  return { id: session.user.id, name, code: card.code, key: card.share_key, rpc, raw };
}

async function befriend(a: Person, b: Person) {
  await a.rpc('friend_request', { p_code: b.code });
  expect(await b.rpc('friend_respond', { p_user: a.id, p_accept: true })).toBe('accepted');
}
const signals = (minutes: number, last: number, loggedAgo: number[]) => ({ p_signals: { today: day(0), minutes, last_minutes: last, logged: loggedAgo.map((k) => day(-k)) } });
const overview = (p: Person) => p.rpc('friends_overview');

describe('stand-in backend: together this week', () => {
  it('pours the members’ minutes into one cup, by name, never per person', async () => {
    const ann = await person('Ann');
    const bob = await person('Bob');
    const dot = await person('Dot', minor());
    const eve = await person('Eve');
    await befriend(bob, ann);
    await befriend(dot, ann);

    expect(await ann.rpc('social_signals_publish', signals(10, 0, [0]))).toBe('not_needed');
    expect((await ann.rpc('together_start', { p_kind: 'minutes', p_target: 10, p_invite: [] })).status).toBe('invalid');
    expect((await ann.rpc('together_start', { p_kind: 'minutes', p_target: 600, p_invite: [eve.id] })).status).toBe('not_friends');
    expect((await dot.rpc('together_start', { p_kind: 'days', p_target: 10, p_invite: [] })).status).toBe('under_18');
    const r = await ann.rpc('together_start', { p_kind: 'minutes', p_target: 600, p_invite: [bob.id, dot.id] });
    expect(r.status).toBe('ok');
    expect((await ann.rpc('together_start', { p_kind: 'days', p_target: 10, p_invite: [] })).status).toBe('in_circle');

    const inv = (await overview(bob)).together_invites;
    expect(inv).toHaveLength(1);
    expect(Object.keys(inv[0]).sort()).toEqual(['created_at', 'from', 'id', 'kind', 'members', 'target']);
    expect(await bob.rpc('together_respond', { p_goal: r.id, p_accept: true })).toBe('joined');
    expect(await dot.rpc('together_respond', { p_goal: r.id, p_accept: false })).toBe('declined');

    expect(await ann.rpc('social_signals_publish', signals(100, 40, [0, 1]))).toBe('ok');
    expect(await bob.rpc('social_signals_publish', signals(90, 10, [0]))).toBe('ok');
    const o = await overview(ann);
    expect(o.signals).toEqual({ minutes: true, logged: false, today: day(0) });
    const c = o.together[0];
    expect(Object.keys(c).sort()).toEqual(['asked', 'id', 'kind', 'last_week', 'members', 'target', 'total', 'week']);
    expect(c.total).toBe(190);
    expect(c.last_week).toBeNull();
    expect(c.members.map((m: any) => [m.display_name, m.me])).toEqual([
      ['Ann', true],
      ['Bob', false],
    ]);
    for (const m of c.members) expect(Object.keys(m).sort()).toEqual(['avatar', 'display_name', 'me', 'user_id']);
    // Dot declined: Ann still sees Dot as asked.
    expect(c.asked).toEqual([dot.id]);
    const state = await (await fetch(`${base}/__state`)).json();
    expect(state.signals[ann.id].logged).toBeNull();

    expect(await ann.rpc('together_set_target', { p_goal: r.id, p_target: 450 })).toBe('ok');
    expect((await overview(bob)).together[0].target).toBe(450);
    expect(await bob.rpc('together_leave', { p_goal: r.id })).toBe('left');
    expect(await ann.rpc('together_leave', { p_goal: r.id })).toBe('left');
    expect((await overview(ann)).together).toEqual([]);
    expect(await ann.rpc('social_signals_publish', signals(1, 1, [0]))).toBe('not_needed');
  });
});

describe('stand-in backend: buddies and notes', () => {
  it('counts both logged, keeps a decline silent, and limits notes', async () => {
    const ann = await person('Ann');
    const bob = await person('Bob');
    const cid = await person('Cid');
    const eve = await person('Eve');
    await befriend(bob, ann);
    await befriend(cid, ann);

    expect(await ann.rpc('buddy_invite', { p_user: eve.id })).toBe('not_friends');
    expect(await ann.rpc('buddy_invite', { p_user: bob.id })).toBe('sent');
    expect(await ann.rpc('buddy_invite', { p_user: bob.id })).toBe('already');
    expect(await ann.rpc('buddy_invite', { p_user: cid.id })).toBe('sent');
    expect(await cid.rpc('buddy_respond', { p_user: ann.id, p_accept: false })).toBe('declined');
    expect(await ann.rpc('buddy_invite', { p_user: cid.id })).toBe('sent');
    expect((await overview(cid)).buddy_invites).toEqual([]);
    expect(await bob.rpc('buddy_respond', { p_user: ann.id, p_accept: true })).toBe('together');
    expect(await ann.rpc('social_signals_publish', signals(0, 0, [0, 1]))).toBe('ok');
    expect(await bob.rpc('social_signals_publish', signals(0, 0, [0]))).toBe('ok');
    const b = (await overview(ann)).buddies.find((x: any) => x.user_id === bob.id);
    expect(Object.keys(b).sort()).toEqual(['avatar', 'display_name', 'kept', 'run', 'since', 'status', 'user_id', 'week']);
    expect(b.week.find((d: any) => d.day === day(0)).count).toBe(2);
    expect(b.run).toBe(1);
    expect((await overview(ann)).buddies.find((x: any) => x.user_id === cid.id).status).toBe('asked');
    expect(await bob.rpc('buddy_stop', { p_user: ann.id })).toBe('stopped');
    expect((await (await fetch(`${base}/__state`)).json()).signals[bob.id]).toBeUndefined();

    expect(await ann.rpc('send_note', { p_to: bob.id, p_kind: 'you failed' })).toBe('invalid');
    expect(await ann.rpc('send_note', { p_to: eve.id, p_kind: 'nice_week' })).toBe('not_friends');
    expect(await ann.rpc('send_note', { p_to: bob.id, p_kind: 'nice_week' })).toBe('ok');
    expect(await ann.rpc('send_note', { p_to: bob.id, p_kind: 'walk_later' })).toBe('already_today');
    expect((await overview(bob)).notes.map((x: any) => x.kind)).toEqual(['nice_week']);
    expect(await cid.rpc('friend_notes_set', { p_friend: ann.id, p_on: false })).toBe('ok');
    expect(await ann.rpc('send_note', { p_to: cid.id, p_kind: 'thinking_of_you' })).toBe('ok');
    expect((await overview(cid)).notes).toEqual([]);
    expect(await cid.rpc('friend_notes_set', { p_friend: ann.id, p_on: true })).toBe('ok');
    expect((await overview(cid)).notes).toEqual([]);
    expect((await overview(ann)).notes_sent).toHaveLength(2);
    expect(await bob.rpc('note_settings_set', { p_on: false })).toBe(false);
    expect((await overview(bob)).notes).toEqual([]);

    // Removing a friend takes the notes both ways.
    await ann.rpc('friend_remove', { p_user: bob.id });
    expect(await bob.rpc('note_settings_set', { p_on: true })).toBe(true);
    expect((await overview(bob)).notes).toEqual([]);
  });
});

describe('stand-in backend: saved meals shown', () => {
  it('shows a saved meal outside the feed, under its own key, with the same reference each time', async () => {
    const ann = await person('Ann');
    const bob = await person('Bob');
    await befriend(bob, ann);
    const items = [{ name: 'Oats', portion: '1 cup', source: 'builtin', kcal: 300, protein: 10 }];
    expect((await ann.rpc('meal_show_saved', { p_saved_id: 'bad id', p_name: 'Oats', p_items: items, p_servings: null, p_show_kcal: false, p_viewers: [bob.id] })).status).toBe('invalid');
    const r = await ann.rpc('meal_show_saved', { p_saved_id: 'meal-1', p_name: 'Overnight oats', p_items: items, p_servings: 2, p_show_kcal: false, p_viewers: [bob.id] });
    expect(r.status).toBe('ok');
    expect(r.ref).toBe(sharedSavedRef(ann.key, 'meal-1'));
    const o = await overview(bob);
    expect(o.feed.some((x: any) => x.ref === r.ref)).toBe(false);
    expect(Object.keys(o.shared_saved_meals[0]).sort()).toEqual(['avatar', 'cheered', 'display_name', 'items', 'kind', 'name', 'ref', 'servings', 'show_kcal', 'user_id']);
    expect(o.shared_saved_meals[0].items).toEqual([{ name: 'Oats', emoji: '', portion: '1 cup', source: 'builtin' }]);
    expect(await bob.rpc('send_cheer', { p_to: ann.id, p_ref: `meal:${r.ref}` })).toBe('ok');
    const mine = await overview(ann);
    expect(mine.my_meals).toEqual([]);
    expect(mine.my_saved_meals[0]).toMatchObject({ ref: r.ref, name: 'Overnight oats', servings: 2, cheers: 1 });
    expect(mine.meal_cheers.map((c: any) => c.ref)).toEqual([`meal:${r.ref}`]);
  });
});

describe('stand-in backend: a server without together (--no-together, POST /__together)', () => {
  it('answers 404 PGRST202 for every new function and leaves the new keys out of the overview', async () => {
    const ann = await person('Ann');
    await fetch(`${base}/__together`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ on: false }) });
    try {
      for (const fn of ['social_signals_publish', 'together_start', 'together_invite', 'together_respond', 'together_leave', 'together_set_target', 'buddy_invite', 'buddy_respond', 'buddy_stop', 'send_note', 'note_settings_set', 'friend_notes_set', 'meal_show_saved']) {
        const r = await ann.raw(fn, { p_x: 1 });
        expect(r.status).toBe(404);
        expect(r.body.code).toBe('PGRST202');
        expect(r.body.message).toBe(`Could not find the function public.${fn}(p_x) in the schema cache`);
      }
      const o = await overview(ann);
      for (const k of ['signals', 'notes_on', 'together', 'together_invites', 'buddies', 'buddy_invites', 'notes', 'notes_sent', 'shared_saved_meals', 'my_saved_meals']) expect(o).not.toHaveProperty(k);
      expect(o).toHaveProperty('feed');
    } finally {
      await fetch(`${base}/__together`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ on: true }) });
    }
  });
});
