/**
 * The stand-in backend (scripts/dev/mock-backend.cjs) must follow the same rules for meals
 * shown to friends as supabase/migrations/20261201000000_friends_meals.sql, which
 * supabase/tests/friends_meals.sql checks. This starts a private copy of the stand-in on a
 * free port (never the shared one) and walks the same cases over HTTP.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { sharedMealRef } from './friendsWire';

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
}

const day = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
const yearsAgo = (years: number, plusDays = 0) => {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - years);
  d.setUTCDate(d.getUTCDate() + plusDays);
  return d.toISOString().slice(0, 10);
};

let n = 0;
async function person(name: string, birthDate: string | null = '1990-04-02'): Promise<Person> {
  n += 1;
  const res = await fetch(`${base}/auth/v1/signup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `meal${n}-${Date.now()}@example.com`, password: 'secret123' }) });
  const session = (await res.json()) as { access_token: string; user: { id: string } };
  const rpc = async (fn: string, body: Record<string, unknown> = {}) => {
    const r = await fetch(`${base}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(body) });
    const text = await r.text();
    return text ? JSON.parse(text) : null;
  };
  await rpc('push_profile', { p_profile: birthDate ? { name, birthDate } : { name }, p_profile_updated_at: new Date().toISOString(), p_settings: null, p_settings_updated_at: null });
  const card = await rpc('social_setup', { p_display_name: name, p_avatar: '', p_sharing: {} });
  return { id: session.user.id, name, code: card.code, key: card.share_key, rpc };
}

async function befriend(a: Person, b: Person) {
  await a.rpc('friend_request', { p_code: b.code });
  expect(await b.rpc('friend_respond', { p_user: a.id, p_accept: true })).toBe('accepted');
}

const RICE = [{ name: 'Rice', portion: '1 cup', source: 'builtin' }];
const show = (p: Person, viewers: Person[], extra: Record<string, unknown> = {}) =>
  p.rpc('meal_show', { p_day: day(0), p_meal: 'lunch', p_items: RICE, p_show_kcal: false, p_viewers: viewers.map((v) => v.id), ...extra });
const feedMeals = async (p: Person) => ((await p.rpc('friends_overview')).feed as { kind: string }[]).filter((x) => x.kind === 'meal') as any[];
const clock = (body: Record<string, unknown>) => fetch(`${base}/__clock`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());

describe('stand-in backend: meals shown to friends', () => {
  it('shows a meal to the friends picked only, with only what they may see', async () => {
    const ana = await person('Ana');
    const ben = await person('Ben', yearsAgo(18));
    const cal = await person('Cal');
    const dee = await person('Dee');
    await befriend(ben, ana);
    await befriend(cal, ana);

    expect((await show(ana, [dee])).status).toBe('not_friends');
    expect((await show(ana, [])).status).toBe('no_viewers');
    expect((await show(ana, [ben], { p_day: day(-8) })).status).toBe('invalid');
    expect((await show(ana, [ben], { p_meal: "lunch'; --" })).status).toBe('invalid');
    expect((await show(ana, [ben], { p_items: [{ name: '', source: 'builtin' }, { name: 'X', source: 'secret' }] })).status).toBe('empty');

    const r = await show(ana, [ben, ben], {
      p_meal: ' Lunch ',
      p_items: [{ name: 'Chicken,\nroasted', portion: '1 breast · 172 g', source: 'builtin', foodId: 'b_chicken_breast', grams: 172.04, kcal: 284, protein: 53, notes: 'x', id: '8b552e86-b4b0-5c91-a9b5-0267052a9b4f', budget: 2100 }],
    });
    expect(r.status).toBe('ok');
    expect(r.ref).toBe(sharedMealRef(ana.key, day(0), 'lunch'));
    expect(Date.parse(r.expires_at) - Date.now()).toBeGreaterThan(7 * 86400000 - 60000);

    const seen = await feedMeals(ben);
    expect(seen).toHaveLength(1);
    expect(Object.keys(seen[0]).sort()).toEqual(['avatar', 'cheered', 'day', 'display_name', 'items', 'kind', 'meal', 'ref', 'show_kcal', 'user_id']);
    expect(seen[0].items).toEqual([{ name: 'Chicken, roasted', emoji: '', portion: '1 breast · 172 g', source: 'builtin', foodId: 'b_chicken_breast', grams: 172 }]);
    expect(await feedMeals(cal)).toEqual([]);
    expect(await feedMeals(dee)).toEqual([]);

    const mine = (await ana.rpc('friends_overview')).my_meals;
    expect(mine).toHaveLength(1);
    expect(mine[0].viewers.map((v: { display_name: string }) => v.display_name)).toEqual(['Ben']);
    expect((await ana.rpc('friends_overview')).me).toMatchObject({ meals_allowed: true, audience: [ben.id], meal_settings: { auto: [], kcal: false, see: true } });
  });

  it('keeps meals from anyone under 18, without telling the person who showed it', async () => {
    const ana = await person('Ana');
    const eli = await person('Eli', yearsAgo(18, 1));
    const fay = await person('Fay', null);
    await befriend(eli, ana);
    await befriend(fay, ana);
    expect((await show(eli, [ana])).status).toBe('under_18');
    expect((await show(fay, [ana])).status).toBe('under_18');
    expect((await show(ana, [eli])).status).toBe('ok');
    expect(await feedMeals(eli)).toEqual([]);
    expect((await eli.rpc('friends_overview')).me.meals_allowed).toBe(false);
  });

  it('cheers only a meal the friend may see now; stopping takes the meal and its cheers away', async () => {
    const ana = await person('Ana');
    const ben = await person('Ben');
    const cal = await person('Cal');
    await befriend(ben, ana);
    await befriend(cal, ana);
    const { ref } = await show(ana, [ben]);
    expect(await cal.rpc('send_cheer', { p_to: ana.id, p_ref: `meal:${ref}` })).toBe('invalid');
    expect(await ben.rpc('send_cheer', { p_to: ana.id, p_ref: `meal:${'b'.repeat(32)}` })).toBe('invalid');
    expect(await ben.rpc('send_cheer', { p_to: ana.id, p_ref: `meal:${ref}` })).toBe('ok');
    expect((await feedMeals(ben))[0].cheered).toBe(true);
    expect(await ben.rpc('send_cheer', { p_to: ana.id, p_ref: `day:${day(0)}` })).toBe('ok');
    const o = await ana.rpc('friends_overview');
    expect(o.my_meals[0].cheers).toBe(1);
    // A meal's cheer under meal_cheers, in the same shape; cheers keeps the workouts and days an older app can name.
    const refs = (l: { ref: string }[]) => l.map((c) => c.ref);
    expect(refs(o.meal_cheers)).toEqual([`meal:${ref}`]);
    expect(refs(o.cheers)).toEqual([`day:${day(0)}`]);
    expect(Object.keys(o.meal_cheers[0]).sort()).toEqual(Object.keys(o.cheers[0]).sort());

    expect(await ana.rpc('meal_stop', { p_ref: ref })).toBe('stopped');
    expect(await ana.rpc('meal_stop', { p_ref: ref })).toBe('not_found');
    expect(await feedMeals(ben)).toEqual([]);
    const after = await ana.rpc('friends_overview');
    expect(after.meal_cheers).toEqual([]);
    expect(refs(after.cheers)).toEqual([`day:${day(0)}`]);
    expect(await ben.rpc('send_cheer', { p_to: ana.id, p_ref: `meal:${ref}` })).toBe('invalid');
  });

  it('edits change the foods only; an emptied meal stops; an edit never brings one back', async () => {
    const ana = await person('Ana');
    const ben = await person('Ben');
    await befriend(ben, ana);
    const { ref, expires_at } = await show(ana, [ben]);
    expect(await ana.rpc('meal_update', { p_ref: ref, p_items: [...RICE, { name: 'Beans', portion: '1/2 cup', source: 'builtin', kcal: 120 }] })).toBe('ok');
    const seen = (await feedMeals(ben))[0];
    expect(seen.items.map((i: { name: string }) => i.name)).toEqual(['Rice', 'Beans']);
    expect(seen.items[1]).not.toHaveProperty('kcal');
    expect((await ana.rpc('friends_overview')).my_meals[0].expires_at).toBe(expires_at);
    expect(await ana.rpc('meal_update', { p_ref: ref, p_items: [] })).toBe('stopped');
    expect(await ana.rpc('meal_update', { p_ref: ref, p_items: RICE })).toBe('gone');
    expect(await feedMeals(ben)).toEqual([]);
  });

  it('a meal leaves after 7 days (the stand-in clock moved forward)', async () => {
    const ana = await person('Ana');
    const ben = await person('Ben');
    await befriend(ben, ana);
    const { ref } = await show(ana, [ben]);
    await clock({ advanceMs: 6 * 86400000 });
    expect(await feedMeals(ben)).toHaveLength(1);
    await clock({ advanceMs: 86400000 + 60000 });
    try {
      expect(await ben.rpc('send_cheer', { p_to: ana.id, p_ref: `meal:${ref}` })).toBe('invalid');
      expect(await feedMeals(ben)).toEqual([]);
      expect((await ana.rpc('friends_overview')).my_meals).toEqual([]);
      const state = await (await fetch(`${base}/__state`)).json();
      expect(state.sharedMeals.some((m: { ref: string }) => m.ref === ref)).toBe(false);
      expect(await ana.rpc('meal_update', { p_ref: ref, p_items: RICE })).toBe('gone');
    } finally {
      await clock({ reset: true });
    }
  });

  it('the switches: see off, a friend left out (at once, and not back), and never told', async () => {
    const ana = await person('Ana');
    const ben = await person('Ben');
    await befriend(ben, ana);
    await show(ana, [ben]);
    expect(await ben.rpc('meal_settings_set', { p_settings: { see: false, auto: ['dinner', 'brunch'] } })).toEqual({ auto: ['dinner'], kcal: false, see: false });
    expect(await feedMeals(ben)).toEqual([]);
    await ben.rpc('meal_settings_set', { p_settings: { see: true } });
    expect(await ben.rpc('friend_prefs_set', { p_friend: ana.id, p_share_meals: null, p_see_meals: false })).toBe('ok');
    expect(await feedMeals(ben)).toEqual([]);
    await ben.rpc('friend_prefs_set', { p_friend: ana.id, p_share_meals: null, p_see_meals: true });
    expect(await feedMeals(ben)).toHaveLength(1);

    expect(await ana.rpc('friend_prefs_set', { p_friend: ben.id, p_share_meals: false, p_see_meals: null })).toBe('ok');
    expect(await feedMeals(ben)).toEqual([]);
    // The meal had only Ben: it stopped.
    expect((await ana.rpc('friends_overview')).my_meals).toEqual([]);
    expect((await show(ana, [ben])).status).toBe('not_friends');
    const benSees = (await ben.rpc('friends_overview')).friends[0];
    expect([benSees.share_meals, benSees.see_meals]).toEqual([true, true]);
    await ana.rpc('friend_prefs_set', { p_friend: ben.id, p_share_meals: true, p_see_meals: null });
    expect(await feedMeals(ben)).toEqual([]);
  });

  it('"always show" a meal type: today only, to the remembered audience, never one the person stopped', async () => {
    const ana = await person('Ana');
    const ben = await person('Ben');
    await befriend(ben, ana);
    await ana.rpc('meal_settings_set', { p_settings: { auto: ['dinner'], kcal: true } });
    const food = [{ name: 'Soup', portion: '1 bowl', source: 'builtin', kcal: 180 }];
    expect((await ana.rpc('meal_show_auto', { p_day: day(0), p_meal: 'dinner', p_items: food })).status).toBe('no_viewers');
    await ana.rpc('meal_audience_set', { p_viewers: [ben.id] });
    expect((await ana.rpc('meal_show_auto', { p_day: day(0), p_meal: 'lunch', p_items: food })).status).toBe('not_auto');
    expect((await ana.rpc('meal_show_auto', { p_day: day(-3), p_meal: 'dinner', p_items: food })).status).toBe('invalid');
    const r = await ana.rpc('meal_show_auto', { p_day: day(0), p_meal: 'dinner', p_items: food });
    expect(r.status).toBe('ok');
    expect((await feedMeals(ben))[0].items[0].kcal).toBe(180);
    expect((await ana.rpc('meal_show_auto', { p_day: day(0), p_meal: 'dinner', p_items: food })).status).toBe('exists');
    await ana.rpc('meal_stop', { p_ref: r.ref });
    expect((await ana.rpc('meal_show_auto', { p_day: day(0), p_meal: 'dinner', p_items: food })).status).toBe('stopped');
    expect((await show(ana, [ben], { p_meal: 'dinner' })).status).toBe('ok');
  });

  it('unfriending and turning friends off stop everything at once', async () => {
    const ana = await person('Ana');
    const ben = await person('Ben');
    const cal = await person('Cal');
    await befriend(ben, ana);
    await befriend(cal, ana);
    await show(ana, [ben]);
    await show(ana, [ben, cal], { p_meal: 'dinner' });
    await show(ben, [ana]);
    await ben.rpc('friend_remove', { p_user: ana.id });
    expect(await feedMeals(ben)).toEqual([]);
    expect((await ben.rpc('friends_overview')).my_meals).toEqual([]);
    const mine = (await ana.rpc('friends_overview')).my_meals;
    expect(mine.map((m: { meal: string }) => m.meal)).toEqual(['dinner']);
    expect(mine[0].viewers.map((v: { display_name: string }) => v.display_name)).toEqual(['Cal']);

    await show(cal, [ana]);
    await ana.rpc('meal_settings_set', { p_settings: { auto: ['lunch'] } });
    await ana.rpc('social_leave');
    const state = await (await fetch(`${base}/__state`)).json();
    expect(state.sharedMeals.filter((m: { owner: string }) => m.owner === ana.id || m.owner === cal.id)).toEqual([]);
    await ana.rpc('social_setup', { p_display_name: 'Ana', p_avatar: '', p_sharing: {} });
    expect((await ana.rpc('friends_overview')).me.meal_settings).toEqual({ auto: [], kcal: false, see: true });
  });

  it('limits: 20 new showings a day, kept when friends are turned off and on', async () => {
    const gus = await person('Gus');
    const ben = await person('Ben');
    await befriend(ben, gus);
    let shown = 0;
    for (let d = -7; d <= 2 && shown < 20; d++) {
      for (const meal of ['breakfast', 'lunch', 'dinner', 'snack']) {
        if (shown === 20) break;
        expect((await show(gus, [ben], { p_day: day(d), p_meal: meal })).status).toBe('ok');
        shown += 1;
      }
    }
    expect((await show(gus, [ben], { p_day: day(2), p_meal: 'snack' })).status).toBe('limit');
    expect((await show(gus, [ben], { p_day: day(-7), p_meal: 'breakfast', p_items: [{ name: 'Eggs', portion: '2', source: 'builtin' }] })).status).toBe('ok');
    await gus.rpc('meal_stop_all');
    await gus.rpc('social_leave');
    const card = await gus.rpc('social_setup', { p_display_name: 'Gus', p_avatar: '', p_sharing: {} });
    gus.code = card.code;
    await befriend(ben, gus);
    expect((await show(gus, [ben])).status).toBe('limit');
  });
});

describe('stand-in backend: the server before meals (--no-meals, POST /__meals)', () => {
  const meals = (on: boolean) => fetch(`${base}/__meals`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ on }) }).then((r) => r.json());

  it('answers as 20261116000000_friends_hardening.sql does: no meal function, no meal field, no meal cheer', async () => {
    const ana = await person('Ana');
    const ben = await person('Ben');
    await befriend(ben, ana);
    await ben.rpc('social_publish', { p_summary: { workouts: [{ id: 'ab'.repeat(16), name: 'Running', emoji: '', minutes: 30, date: day(0) }] }, p_share_key: ben.key });
    expect(await meals(false)).toEqual({ on: false });
    try {
      const o = await ana.rpc('friends_overview');
      expect(Object.keys(o).sort()).toEqual(['cheers', 'friends', 'incoming', 'me', 'outgoing']);
      expect(Object.keys(o.me).sort()).toEqual(['avatar', 'code', 'display_name', 'share_key', 'sharing']);
      expect(Object.keys(o.friends[0]).sort()).toEqual(['avatar', 'cheered', 'display_name', 'since', 'summary', 'summary_updated_at', 'user_id']);
      expect(o.friends[0].summary.workouts).toHaveLength(1);

      // PostgREST's own answer to a function it does not hold: PGRST202, in its words (with status 404, below).
      for (const [fn, body] of [
        ['meal_show', { p_day: day(0), p_meal: 'lunch', p_items: RICE, p_show_kcal: false, p_viewers: [ben.id] }],
        ['meal_show_auto', { p_day: day(0), p_meal: 'lunch', p_items: RICE }],
        ['meal_update', { p_ref: 'ab'.repeat(16), p_items: RICE }],
        ['meal_stop', { p_ref: 'ab'.repeat(16) }],
        ['meal_stop_all', {}],
        ['meal_settings_set', { p_settings: { kcal: true } }],
        ['meal_audience_set', { p_viewers: [ben.id] }],
        ['friend_prefs_set', { p_friend: ben.id, p_share_meals: null, p_see_meals: false }],
      ] as const) {
        const answer = await ana.rpc(fn, body);
        expect(answer.code).toBe('PGRST202');
        expect(answer.hint).toBeNull();
        const args = Object.keys(body).sort().join(', ');
        expect(answer.message).toBe(args ? `Could not find the function public.${fn}(${args}) in the schema cache` : `Could not find the function public.${fn} without parameters in the schema cache`);
      }
      const signup = await fetch(`${base}/auth/v1/signup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `probe-${Date.now()}@example.com`, password: 'secret123' }) }).then((r) => r.json());
      const probe = await fetch(`${base}/rest/v1/rpc/meal_stop_all`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${signup.access_token}` }, body: '{}' });
      expect(probe.status).toBe(404);
      expect((await probe.json()).code).toBe('PGRST202');
      expect(await ana.rpc('send_cheer', { p_to: ben.id, p_ref: `meal:${'cd'.repeat(16)}` })).toBe('invalid');
      expect(await ana.rpc('send_cheer', { p_to: ben.id, p_ref: 'ab'.repeat(16) })).toBe('ok');
      expect(await ana.rpc('send_cheer', { p_to: ben.id, p_ref: `day:${day(0)}` })).toBe('ok');
      expect((await ben.rpc('friends_overview')).cheers).toHaveLength(2);
      expect(await ana.rpc('friend_remove', { p_user: ben.id })).toBeNull();
      expect(await ana.rpc('social_leave')).toBeNull();
      expect((await ana.rpc('friends_overview')).me).toBeNull();
    } finally {
      expect(await meals(true)).toEqual({ on: true });
    }
    expect(Object.keys(await ben.rpc('friends_overview'))).toContain('feed');
  });
});
