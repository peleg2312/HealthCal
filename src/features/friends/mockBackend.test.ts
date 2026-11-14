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
    expect((await b.rpc('send_cheer', { p_to: a.id, p_ref: 'day:2026-11-14' })).body).toBe('ok');
    expect((await b.rpc('send_cheer', { p_to: a.id, p_ref: 'see you at the park at 7' })).body).toBe('invalid');
    expect((await overview(a)).cheers.map((c: { ref: string }) => c.ref).sort()).toEqual([ref, 'day:2026-11-14'].sort());
  });
});
