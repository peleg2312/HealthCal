/**
 * The local stand-in backend (scripts/dev/mock-backend.cjs) must follow the same
 * friends rules as supabase/migrations/20261115000000_friends.sql, which
 * supabase/tests/friends.sql checks. This starts a private copy of the stand-in on
 * a free port (never the shared one on 54321) and walks the same cases over HTTP.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { shareRef } from './summary';

const root = join(__dirname, '..', '..', '..');
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
  token: string;
  rpc: (fn: string, body?: Record<string, unknown>) => Promise<{ status: number; body: any }>;
}

let n = 0;
async function person(): Promise<Person> {
  n += 1;
  const res = await fetch(`${base}/auth/v1/signup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `p${n}-${Date.now()}@example.com`, password: 'secret123' }) });
  const session = (await res.json()) as { access_token: string; user: { id: string } };
  const rpc = async (fn: string, body: Record<string, unknown> = {}) => {
    const r = await fetch(`${base}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(body) });
    const text = await r.text();
    return { status: r.status, body: text ? JSON.parse(text) : null };
  };
  return { id: session.user.id, token: session.access_token, rpc };
}

async function setup(p: Person, name: string) {
  const r = await p.rpc('social_setup', { p_display_name: name, p_avatar: '', p_sharing: {} });
  return r.body as { code: string; share_key: string };
}
const overview = async (p: Person) => (await p.rpc('friends_overview')).body;
const names = (list: { display_name: string }[]) => list.map((x) => x.display_name);

describe('stand-in backend: declines (F1, F2)', () => {
  it('keeps a decline silent, lets the sender take any request back, and survives leaving and rejoining', async () => {
    const asker = await person();
    const decliner = await person();
    await setup(asker, 'Asker');
    const d = await setup(decliner, 'Decliner');

    await asker.rpc('friend_request', { p_code: d.code });
    expect((await decliner.rpc('friend_respond', { p_user: asker.id, p_accept: false })).body).toBe('declined');
    expect((await overview(decliner)).incoming).toEqual([]);

    expect((await asker.rpc('friend_request', { p_code: d.code })).body.status).toBe('sent');
    expect(names((await overview(asker)).outgoing)).toEqual(['Decliner']);
    await asker.rpc('friend_remove', { p_user: decliner.id });
    expect((await overview(asker)).outgoing).toEqual([]);
    expect((await asker.rpc('friend_request', { p_code: d.code })).body.status).toBe('sent');
    expect(names((await overview(asker)).outgoing)).toEqual(['Decliner']);
    expect((await overview(decliner)).incoming).toEqual([]);

    await asker.rpc('social_leave');
    const a2 = await setup(asker, 'Asker');
    expect((await asker.rpc('friend_request', { p_code: d.code })).body.status).toBe('sent');
    expect((await overview(decliner)).incoming).toEqual([]);
    expect((await decliner.rpc('friend_respond', { p_user: asker.id, p_accept: true })).body).toBe('not_found');
    await decliner.rpc('friend_remove', { p_user: asker.id });
    expect(names((await overview(asker)).outgoing)).toEqual(['Decliner']);

    // Only the decliner lifts it, by entering the code.
    expect((await decliner.rpc('friend_request', { p_code: a2.code })).body.status).toBe('accepted');
    expect(names((await overview(asker)).friends)).toEqual(['Decliner']);
  });
});

describe('stand-in backend: limits (F3)', () => {
  it('keeps the wrong-code count across leaving and caps turning friends on', async () => {
    const g = await person();
    await setup(g, 'Guesser');
    for (let i = 0; i < 20; i++) expect((await g.rpc('friend_request', { p_code: `QQQQ${2222 + i}` })).body.status).toBe('not_found');
    expect((await g.rpc('friend_request', { p_code: 'QQQQ3333' })).body.status).toBe('too_many');
    await g.rpc('social_leave');
    await setup(g, 'Guesser');
    expect((await g.rpc('friend_request', { p_code: 'QQQQ3333' })).body.status).toBe('too_many');
    for (let i = 3; i <= 5; i++) {
      await g.rpc('social_leave');
      await setup(g, 'Guesser');
    }
    await setup(g, 'Guesser 2'); // a change, not a new card
    await g.rpc('social_leave');
    const refused = await g.rpc('social_setup', { p_display_name: 'Guesser', p_avatar: '', p_sharing: {} });
    expect(refused.status).toBeGreaterThanOrEqual(400);
    expect(refused.body.code).toBe('54000');
    // A rolling 24 hours from the first of the five: it says when, not "tomorrow".
    expect(refused.body.message).toMatch(/again in about (an hour|2[34] hours)\.$/);
    expect((await overview(g)).me).toBeNull();
  });
});

describe('stand-in backend: one friendship per pair (F4)', () => {
  it('turns a request into an accept when the other person had asked', async () => {
    const a = await person();
    const b = await person();
    const ca = await setup(a, 'A');
    const cb = await setup(b, 'B');
    const [ra, rb] = await Promise.all([a.rpc('friend_request', { p_code: cb.code }), b.rpc('friend_request', { p_code: ca.code })]);
    expect([ra.body.status, rb.body.status].sort()).toEqual(['accepted', 'sent']);
    expect(names((await overview(a)).friends)).toEqual(['B']);
    expect((await overview(a)).outgoing).toEqual([]);
    expect((await overview(b)).incoming).toEqual([]);
  });
});

describe('stand-in backend: opaque workout references (G1)', () => {
  it('gives the share key to its owner only, refuses real ids and accepts references and day cheers', async () => {
    const a = await person();
    const b = await person();
    const ca = await setup(a, 'A');
    const cb = await setup(b, 'B');
    expect(ca.share_key).toMatch(/^[0-9a-f]{64}$/);
    expect((await overview(a)).me.share_key).toBe(ca.share_key);
    await a.rpc('friend_request', { p_code: cb.code });
    await b.rpc('friend_respond', { p_user: a.id, p_accept: true });

    const realId = await a.rpc('social_publish', { p_summary: { workouts: [{ id: '8b552e86-b4b0-5c91-a9b5-0267052a9b4f', name: 'Running', minutes: 48, date: '2026-11-14' }] } });
    expect(realId.status).toBe(400);
    expect(realId.body.code).toBe('22023');
    const ref = shareRef(ca.share_key, '8b552e86-b4b0-5c91-a9b5-0267052a9b4f');
    expect((await a.rpc('social_publish', { p_summary: { week: '2026-11-09', workouts: [{ id: ref, name: 'Running', minutes: 48, date: '2026-11-14' }] } })).body).toBe(true);

    const seen = await overview(b);
    expect(seen.friends[0].summary.workouts[0].id).toBe(ref);
    expect(JSON.stringify(seen)).not.toContain(ca.share_key);
    expect((await b.rpc('send_cheer', { p_to: a.id, p_ref: ref })).body).toBe('ok');
    expect((await b.rpc('send_cheer', { p_to: a.id, p_ref: `day:${utcDay(0)}` })).body).toBe('ok');
    expect((await b.rpc('send_cheer', { p_to: a.id, p_ref: 'see you at the park at 7' })).body).toBe('invalid');
    expect((await overview(a)).cheers.map((c: { ref: string }) => c.ref).sort()).toEqual([ref, `day:${utcDay(0)}`].sort());
  });
});

const utcDay = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

async function friends(): Promise<[Person, Person, { code: string; share_key: string }, { code: string; share_key: string }]> {
  const a = await person();
  const b = await person();
  const ca = await setup(a, 'A');
  const cb = await setup(b, 'B');
  await a.rpc('friend_request', { p_code: cb.code });
  await b.rpc('friend_respond', { p_user: a.id, p_accept: true });
  return [a, b, ca, cb];
}

describe('stand-in backend: cheers are for something the friend can see', () => {
  it('refuses impossible, future, old and unpublished references', async () => {
    const [a, b, ca] = await friends();
    const ref = shareRef(ca.share_key, 'rec-1');
    expect((await a.rpc('social_publish', { p_summary: { workouts: [{ id: ref, name: 'Running', minutes: 30, date: utcDay(0) }] }, p_share_key: ca.share_key })).body).toBe('ok');
    for (const bad of ['day:9999-99-99', 'day:2031-02-30', `day:${utcDay(5)}`, `day:${utcDay(-40)}`, 'abababababababababababababababab']) {
      expect((await b.rpc('send_cheer', { p_to: a.id, p_ref: bad })).body, bad).toBe('invalid');
    }
    expect((await b.rpc('send_cheer', { p_to: a.id, p_ref: `day:${utcDay(-6)}` })).body).toBe('ok');
    expect((await b.rpc('send_cheer', { p_to: a.id, p_ref: ref })).body).toBe('ok');
    await a.rpc('social_setup', { p_display_name: 'A', p_avatar: '', p_sharing: { workouts: false } });
    await b.rpc('send_cheer', { p_to: a.id, p_ref: ref }); // already stored: harmless
    const hidden = shareRef(ca.share_key, 'rec-2');
    expect((await b.rpc('send_cheer', { p_to: a.id, p_ref: hidden })).body).toBe('invalid');
    expect((await overview(a)).cheers).toHaveLength(2);
  });
});

describe('stand-in backend: publishing with the share key', () => {
  it('says when the key is stale or there is no card, and completes nameless workouts', async () => {
    const [a, b, ca] = await friends();
    const nameless = { id: shareRef(ca.share_key, 'x'), minutes: 30, date: utcDay(0) };
    expect((await a.rpc('social_publish', { p_summary: { workouts: [nameless] }, p_share_key: 'an old key' })).body).toBe('stale_key');
    expect((await overview(b)).friends[0].summary.workouts).toBeUndefined();
    const workouts = [nameless, { id: shareRef(ca.share_key, 'y'), name: 'Running', date: utcDay(0) }, { id: shareRef(ca.share_key, 'z'), name: 'Running', minutes: 20, date: '2026-02-30' }];
    expect((await a.rpc('social_publish', { p_summary: { workouts }, p_share_key: ca.share_key })).body).toBe('ok');
    expect((await overview(b)).friends[0].summary.workouts).toEqual([{ id: nameless.id, name: 'Workout', emoji: '', minutes: 30, date: utcDay(0) }]);
    const c = await person();
    expect((await c.rpc('social_publish', { p_summary: {}, p_share_key: 'x' })).body).toBe('no_card');
  });
});

describe('stand-in backend: answering a request that is no longer there', () => {
  it('says not_found and records nothing; a fresh decline can be undone by the decliner only', async () => {
    const asker = await person();
    const me = await person();
    await setup(asker, 'Tess');
    const cm = await setup(me, 'Me');
    await asker.rpc('friend_request', { p_code: cm.code });
    await asker.rpc('friend_remove', { p_user: me.id });
    expect((await me.rpc('friend_respond', { p_user: asker.id, p_accept: true })).body).toBe('not_found');
    expect((await me.rpc('friend_respond', { p_user: asker.id, p_accept: false })).body).toBe('not_found');
    await asker.rpc('friend_request', { p_code: cm.code });
    expect(names((await overview(me)).incoming)).toEqual(['Tess']);

    expect((await me.rpc('friend_respond', { p_user: asker.id, p_accept: false })).body).toBe('declined');
    expect((await asker.rpc('friend_undecline', { p_user: me.id })).body).toBe('not_found');
    expect((await me.rpc('friend_undecline', { p_user: asker.id })).body).toBe('restored');
    expect(names((await overview(me)).incoming)).toEqual(['Tess']);
    expect(names((await overview(asker)).outgoing)).toEqual(['Me']);
    expect((await me.rpc('friend_undecline', { p_user: asker.id })).body).toBe('not_found');
  });
});
