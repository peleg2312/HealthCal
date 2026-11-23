#!/usr/bin/env node
/**
 * Checks a real HealthCal backend end to end with two throwaway accounts:
 * sign-in, upload and download of records, that one account cannot read or
 * change another's rows, newest-edit-wins, friends (request, accept, what a
 * friend can and cannot see, cheering), both edge functions, and account
 * deletion. Everything it creates is deleted again at the end.
 *
 *   node scripts/ops/verify-backend.mjs [--require-ai] [--chat] [--config path] [--via-management]
 *
 * --chat also asks the AI coach one real question (a paid call, about $0.0003); without it the
 * coach is only checked for its two free refusals.
 *
 * Reads EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY from the
 * environment, from the file given with --config, or from .env (written by
 * provision-supabase.mjs).
 * Projects that confirm email addresses on sign-up (the default) cannot sign a
 * test account in by themselves. Two ways round it:
 *   - SUPABASE_SERVICE_ROLE_KEY in the environment: the script creates confirmed
 *     test accounts with it. It is used for that and nothing else, and never printed.
 *   - --via-management with SUPABASE_ACCESS_TOKEN (the token provision-supabase.mjs
 *     uses): the script asks the management API for the project's secret key,
 *     keeps it in memory for this run only, and uses it the same way. Nothing
 *     about the project's settings is changed.
 */
import { createClient } from '@supabase/supabase-js';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const argAfter = (flag) => {
  const i = process.argv.indexOf(flag);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const configPath = argAfter('--config') ? resolve(argAfter('--config')) : join(ROOT, '.env');
const fromFile = Object.fromEntries(
  (existsSync(configPath) ? readFileSync(configPath, 'utf8') : '')
    .split('\n')
    .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);
const URL_ = process.env.EXPO_PUBLIC_SUPABASE_URL || fromFile.EXPO_PUBLIC_SUPABASE_URL;
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || fromFile.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const REQUIRE_AI = process.argv.includes('--require-ai');
const CHAT = process.argv.includes('--chat');
const VIA_MANAGEMENT = process.argv.includes('--via-management');
// In some managed environments a proxy adds the real token; any value then satisfies this header.
const MANAGEMENT_TOKEN = process.env.SUPABASE_ACCESS_TOKEN || `sbp_${'0'.repeat(40)}`;
if (!URL_ || !ANON) {
  console.error('Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY (or run provision-supabase.mjs, which writes .env).');
  process.exit(2);
}

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: ok === true, skipped: ok === 'skip' });
  console.log(`${ok === 'skip' ? 'SKIP' : ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const options = { auth: { persistSession: false, autoRefreshToken: false } };
let admin = SERVICE ? createClient(URL_, SERVICE, options) : null;
const stamp = Date.now().toString(36);
const password = `Hc-${randomUUID()}`;

/** One call to Supabase's management API for this project. */
async function management(method, path, json) {
  const ref = new URL(URL_).hostname.split('.')[0];
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}${path}`, {
    method,
    headers: { Authorization: `Bearer ${MANAGEMENT_TOKEN}`, ...(json ? { 'Content-Type': 'application/json' } : null) },
    body: json ? JSON.stringify(json) : undefined,
  });
  if (!res.ok) throw new Error(`management API ${method} ${path}: ${res.status}`);
  return res.json().catch(() => null);
}

/** With --via-management and no key given: fetch the project's secret key for this run. It is never printed or stored. */
async function adminFromManagement() {
  if (admin || !VIA_MANAGEMENT) return;
  const keys = await management('GET', '/api-keys?reveal=true');
  const secret = (keys || []).find((k) => k.type === 'secret' && k.api_key) || (keys || []).find((k) => k.name === 'service_role' && k.api_key);
  if (!secret) throw new Error('the management API returned no secret key for this project');
  admin = createClient(URL_, secret.api_key, options);
}

async function account(label) {
  const email = `healthcal-check-${label}-${stamp}@example.com`;
  const client = createClient(URL_, ANON, options);
  if (admin) {
    const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw new Error(`creating ${label}: ${error.message}`);
  } else {
    const { data, error } = await client.auth.signUp({ email, password });
    if (error) throw new Error(`sign-up ${label}: ${error.message}`);
    if (!data.session) throw new Error('This project confirms email addresses, so a test account cannot sign in by itself. Run again with SUPABASE_SERVICE_ROLE_KEY set, or with --via-management.');
  }
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`sign-in ${label}: ${error?.message ?? 'no session'}`);
  return { client, id: data.session.user.id, token: data.session.access_token, email };
}

const row = (collection, data, updatedAt, extra = {}) => ({ collection, id: randomUUID(), date: data.date ?? null, data, deleted: false, updated_at: updatedAt, ...extra });
const fn = (name, init = {}) => fetch(`${URL_.replace(/\/$/, '')}/functions/v1/${name}`, init);

let a = null;
let b = null;
try {
  await adminFromManagement();
  a = await account('a');
  b = await account('b');
  check('two accounts can sign in', true);

  // ------------------------------------------------------------- records
  const COLLECTIONS = ['foodEntries', 'customFoods', 'savedMeals', 'activities', 'water', 'weights', 'sleep', 'fasting', 'favorites', 'days', 'routines'];
  const rows = COLLECTIONS.map((c) => row(c, { date: '2026-01-05', probe: c }, '2026-01-05T08:00:00.000Z'));
  const pushed = await a.client.rpc('push_records', { p_records: rows });
  check('every kind of record the app syncs is accepted', !pushed.error && pushed.data === rows.length, pushed.error?.message ?? `${pushed.data} of ${rows.length} stored`);

  const mine = await a.client.from('records').select('collection,id,data,deleted,updated_at,server_updated_at').eq('user_id', a.id);
  check('the owner reads back what was uploaded', !mine.error && mine.data.length === rows.length, mine.error?.message ?? `${mine.data?.length} rows`);
  const stampText = mine.data?.[0]?.updated_at ?? '';
  check('times come back as the instants that were sent', Date.parse(stampText) === Date.parse('2026-01-05T08:00:00.000Z'), stampText);

  const theirs = await b.client.from('records').select('id').eq('user_id', a.id);
  const all = await b.client.from('records').select('id');
  check("another account cannot read someone's records", !theirs.error && theirs.data.length === 0 && all.data.length === 0, `${theirs.data?.length ?? '?'} visible`);
  const tamper = await b.client.from('records').update({ data: { hacked: true } }).eq('id', rows[0].id).select('id');
  const forge = await b.client.from('records').insert({ user_id: a.id, collection: 'water', id: randomUUID(), data: {}, updated_at: new Date().toISOString() });
  check('another account cannot change or forge them', (tamper.data ?? []).length === 0 && !!forge.error, forge.error ? 'insert refused' : 'insert was accepted');

  const older = await a.client.rpc('push_records', { p_records: [{ ...rows[4], data: { ml: 1 }, updated_at: '2026-01-04T08:00:00.000Z' }] });
  const newer = await a.client.rpc('push_records', { p_records: [{ ...rows[4], data: { ml: 500 }, updated_at: '2026-01-06T08:00:00.000Z' }] });
  const after = await a.client.from('records').select('data').eq('id', rows[4].id).single();
  check('the newest edit wins and an older one is ignored', older.data === 0 && newer.data === 1 && after.data?.data?.ml === 500, `older stored ${older.data}, newer stored ${newer.data}`);

  const bad = await a.client.rpc('push_records', { p_records: [row('secrets', {}, '2026-01-05T08:00:00.000Z')] });
  check('an unknown kind of record is refused as a data error', !!bad.error && /^23/.test(bad.error.code ?? ''), bad.error ? `code ${bad.error.code}` : 'accepted');

  const profile = await a.client.rpc('push_profile', { p_profile: { name: 'Check A', updatedAt: '2026-01-05T08:00:00.000Z' }, p_profile_updated_at: '2026-01-05T08:00:00.000Z', p_settings: null, p_settings_updated_at: null });
  const readProfile = await a.client.from('profiles').select('data').eq('user_id', a.id).maybeSingle();
  check('the profile is stored and read back', !profile.error && readProfile.data?.data?.name === 'Check A', profile.error?.message ?? '');

  // ------------------------------------------------------------- friends
  const cardA = await a.client.rpc('social_setup', { p_display_name: 'Check A', p_avatar: 'A', p_sharing: { workouts: true, streak: true, minutes: true } });
  const cardB = await b.client.rpc('social_setup', { p_display_name: 'Check B', p_avatar: 'B', p_sharing: {} });
  check('friends can be turned on and give a code', !cardA.error && /^[A-HJKMNP-Z2-9]{8}$/.test(cardA.data?.code ?? ''), cardA.error?.message ?? '');
  const direct = await b.client.from('social_profiles').select('code');
  check('friend codes cannot be listed', (direct.data ?? []).length === 0, `${direct.data?.length ?? 0} visible`);
  // Friends never see a workout's record id: the app publishes sha256(share key + ':' + id), cut to 32 hex characters.
  const recordId = randomUUID();
  const workoutRef = createHash('sha256').update(`${cardA.data?.share_key ?? ''}:${recordId}`).digest('hex').slice(0, 32);
  const summary = (id) => ({ week: '2026-01-05', minutes: 120, sessions: 3, streak: 9, kcal: 2100, weightKg: 80, workouts: [{ id, name: 'Running', emoji: '🏃', minutes: 30, date: '2026-01-05', kcalNet: 300 }] });
  const rawId = await a.client.rpc('social_publish', { p_summary: summary(recordId) });
  check('a summary carrying a real record id is refused', !!rawId.error, rawId.error ? `code ${rawId.error.code}` : 'it was stored');
  const published = await a.client.rpc('social_publish', { p_summary: summary(workoutRef) });
  check('the week can be published with opaque workout references', !published.error && /^[0-9a-f]{64}$/.test(cardA.data?.share_key ?? ''), published.error?.message ?? '');
  const before = await b.client.rpc('friends_overview');
  check('a stranger sees nothing of the other account', (before.data?.friends ?? []).length === 0);
  const request = await b.client.rpc('friend_request', { p_code: cardA.data?.code ?? '' });
  const accept = await a.client.rpc('friend_respond', { p_user: b.id, p_accept: true });
  const overview = await b.client.rpc('friends_overview');
  const friend = overview.data?.friends?.[0];
  check('a request by code can be accepted', request.data?.status === 'sent' && accept.data === 'accepted' && !!friend, `${request.data?.status}, ${accept.data}`);
  const summaryText = JSON.stringify(friend?.summary ?? {});
  check('a friend sees minutes, sessions, streak and workouts', friend?.summary?.minutes === 120 && friend?.summary?.streak === 9 && friend?.summary?.workouts?.length === 1, summaryText.slice(0, 120));
  check('a friend never sees calories or weight', !/kcal|weight/i.test(summaryText));
  const friendText = JSON.stringify(overview.data ?? {});
  check('a friend never sees the record id or the share key', !friendText.includes(recordId) && !friendText.includes(cardA.data?.share_key ?? 'no key') && friend?.summary?.workouts?.[0]?.id === workoutRef);
  const loose = await b.client.rpc('send_cheer', { p_to: a.id, p_ref: 'hello there' });
  check('a cheer cannot carry free text', loose.data !== 'ok', String(loose.data ?? loose.error?.message));
  const cheer = await b.client.rpc('send_cheer', { p_to: a.id, p_ref: workoutRef });
  const cheers = await a.client.rpc('friends_overview');
  check('a cheer reaches the friend', cheer.data === 'ok' && cheers.data?.cheers?.[0]?.ref === workoutRef, String(cheer.data));
  if (cardB.error) check('second card', false, cardB.error.message);

  // ------------------------------------------------------ edge functions
  const anonCall = await fn('analyze-food', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${ANON}` }, body: JSON.stringify({ text: 'two eggs' }) });
  check('meal analysis refuses a caller who is not signed in', anonCall.status === 401, `status ${anonCall.status}`);
  const ai = await fn('analyze-food', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${a.token}` }, body: JSON.stringify({ text: 'two scrambled eggs on a slice of toast' }) });
  const aiBody = await ai.json().catch(() => ({}));
  if (ai.status === 200) {
    const items = Array.isArray(aiBody.items) ? aiBody.items : [];
    const sane = items.length > 0 && items.every((i) => i.kcal >= 0 && i.grams > 0);
    const total = Math.round(items.reduce((s, i) => s + (i.kcal || 0), 0));
    check('meal analysis returns a usable estimate', sane && total > 100 && total < 800, `${items.map((i) => i.name).join(', ')}: ${total} kcal, model ${aiBody.model}, tokens in/out ${aiBody.usage?.inputTokens}/${aiBody.usage?.outputTokens}`);
  } else {
    const why = `status ${ai.status}: ${String(aiBody.message ?? aiBody.error ?? '').slice(0, 140)}`;
    check('meal analysis returns a usable estimate', REQUIRE_AI ? false : 'skip', `${why}. Add ANTHROPIC_API_KEY to the function's secrets, then run with --require-ai`);
  }
  const search = await fn('food-search?q=oat%20milk&limit=5', { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } });
  const searchBody = await search.json().catch(() => ({}));
  check('product search answers', search.status === 200 && Array.isArray(searchBody.hits), search.status === 200 ? `${searchBody.hits.length} products` : `status ${search.status} (the product database may be busy)`);

  // The AI coach. Both refusals are free: they come before a unit is taken and before the model.
  const coach = (token, body) => fn('coach-chat', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  const coachAnon = await coach(ANON, { message: 'How many rest days a week?', consentVersion: 1 });
  check('the coach refuses a caller who is not signed in', coachAnon.status === 401, `status ${coachAnon.status}`);
  // Account A's profile has no date of birth, which the coach counts as under 18.
  const coachYoung = await coach(a.token, { message: 'How many rest days a week?', consentVersion: 1 });
  const youngBody = await coachYoung.json().catch(() => ({}));
  if (coachYoung.status === 500 && youngBody.error === 'not_configured') check('the coach refuses a profile without a valid date of birth', 'skip', 'the coach is not set up: deploy coach-chat and set ANTHROPIC_API_KEY');
  else check('the coach refuses a profile without a valid date of birth', coachYoung.status === 403 && youngBody.error === 'under_18', `status ${coachYoung.status} ${youngBody.error ?? ''}`);
  if (CHAT) {
    // A real question (a paid call, about $0.0003). Account B has no profile row, which is allowed.
    const started = Date.now();
    const asked = await coach(b.token, { message: 'How many rest days a week suit someone who started running last month?', consentVersion: 1 });
    const askedBody = await asked.json().catch(() => ({}));
    const fine = asked.status === 200 && typeof askedBody.text === 'string' && askedBody.text.length > 20 && typeof askedBody.remaining === 'number';
    check('the coach answers a question', fine, fine ? `${askedBody.text.split(/\s+/).length} words in ${((Date.now() - started) / 1000).toFixed(1)} s, ${askedBody.remaining} left today${askedBody.truncated ? ', cut short' : ''}` : `status ${asked.status}: ${String(askedBody.message ?? askedBody.error ?? '').slice(0, 140)}`);
  } else {
    check('the coach answers a question', 'skip', 'run with --chat to ask one real question (a paid call, about $0.0003)');
  }
} catch (e) {
  check('the run completed', false, e.message);
} finally {
  // ---------------------------------------------------------- clean up
  for (const user of [a, b]) {
    if (!user) continue;
    const gone = await user.client.rpc('delete_my_account');
    if (gone.error && admin) await admin.auth.admin.deleteUser(user.id);
  }
  if (a && b) {
    const again = await createClient(URL_, ANON, options).auth.signInWithPassword({ email: a.email, password });
    check('deleting the account removes it', !!again.error, again.error ? 'sign-in refused afterwards' : 'the account still signs in');
    if (admin) {
      const left = await admin.from('records').select('id', { count: 'exact', head: true }).in('user_id', [a.id, b.id]);
      const cards = await admin.from('social_profiles').select('user_id', { count: 'exact', head: true }).in('user_id', [a.id, b.id]);
      check('and every row it owned', (left.count ?? 0) === 0 && (cards.count ?? 0) === 0, `${left.count ?? '?'} records, ${cards.count ?? '?'} friend cards left`);
    }
  }
}

const failed = results.filter((r) => !r.ok && !r.skipped).length;
const skipped = results.filter((r) => r.skipped).length;
console.log(`\n${results.length - failed - skipped} passed, ${failed} failed, ${skipped} skipped`);
process.exit(failed ? 1 : 0);
