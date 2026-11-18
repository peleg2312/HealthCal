#!/usr/bin/env node
/**
 * Sets up, checks and removes the TEMPORARY measuring route analyze-food-lab (see README.md here).
 *
 *   NODE_USE_ENV_PROXY=1 node scripts/ops/food-ai-lab/lab.mjs account --account=<file>   create the one test account
 *   NODE_USE_ENV_PROXY=1 node scripts/ops/food-ai-lab/lab.mjs deploy  --account=<file> [--hours=6]
 *   NODE_USE_ENV_PROXY=1 node scripts/ops/food-ai-lab/lab.mjs status  --account=<file>
 *   NODE_USE_ENV_PROXY=1 node scripts/ops/food-ai-lab/lab.mjs remove  --account=<file>     function, its two secrets, the account
 *     (remove refuses to run without --account, so the account is never left behind by mistake; --keep-account
 *     removes only the function and its secrets)
 *   NODE_USE_ENV_PROXY=1 node scripts/ops/food-ai-lab/lab.mjs probe   --account=<file>     the free refusal checks
 *
 * Like scripts/ops/provision-supabase.mjs it talks to Supabase's management API with
 * SUPABASE_ACCESS_TOKEN, or, where a proxy adds the real token, with a placeholder. The project is
 * the one the production build points at (eas.json), or --ref=<project ref>.
 *
 * What it may touch, and nothing else: the ONE function analyze-food-lab, its own secrets
 * LAB_USER_ID and LAB_UNTIL, and ONE throwaway test account whose email and password live only in
 * the --account file (mode 600, outside the repository; the password is never printed). The
 * production functions, their secrets and limits are never written. `status` and `remove` list the
 * project's secrets to see whether the two lab ones are there: the management API returns every
 * secret's name, a digest of its value and when it changed; only the two lab names are looked at,
 * and nothing from that list is printed or kept beyond the call.
 *
 * Six hours per round, not per deploy: the first deploy writes its closing time into the account
 * file and every later deploy (a fix to the function) keeps that time. `remove` replaces the
 * account file with a receipt (user id and time, no password), so `status --account` can still
 * prove the account is gone and a second round needs a new account file.
 */
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const require = createRequire(path.join(ROOT, 'package.json'));
const { createClient } = require('@supabase/supabase-js');

const SLUG = 'analyze-food-lab';
const SECRETS = ['LAB_USER_ID', 'LAB_UNTIL'];
const FUNCTION_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'function');
const API = 'https://api.supabase.com';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN || `sbp_${'0'.repeat(40)}`;

const [command] = process.argv.slice(2);
const flag = (name, fallback = '') => (process.argv.find((a) => a.startsWith(`--${name}=`)) ?? `--${name}=${fallback}`).slice(name.length + 3);
const accountFile = flag('account');

/** The production build's public project settings (URL and publishable key; both ship in the app). */
function projectSettings() {
  const env = JSON.parse(fs.readFileSync(path.join(ROOT, 'eas.json'), 'utf8')).build.production.env;
  const url = env.EXPO_PUBLIC_SUPABASE_URL;
  const ref = flag('ref') || new URL(url).hostname.split('.')[0];
  return { url: flag('ref') ? `https://${ref}.supabase.co` : url, ref, anon: env.EXPO_PUBLIC_SUPABASE_ANON_KEY };
}

async function call(method, p, { json, form } = {}) {
  const res = await fetch(API + p, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, ...(json ? { 'Content-Type': 'application/json' } : null) },
    body: json ? JSON.stringify(json) : form,
  });
  const text = await res.text();
  if (!res.ok) throw Object.assign(new Error(`${method} ${p.replace(/\?.*/, '')} failed (${res.status}): ${text.slice(0, 300)}`), { status: res.status });
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return text;
  }
}

/** A service client, only for creating and deleting the one test account. The key stays in memory. */
async function adminClient(ref, url) {
  const keys = await call('GET', `/v1/projects/${ref}/api-keys?reveal=true`);
  const secret = keys.find((k) => k.type === 'secret' && k.api_key) || keys.find((k) => k.name === 'service_role' && k.api_key);
  if (!secret) throw new Error('No service key returned.');
  return createClient(url, secret.api_key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const readAccount = () => (accountFile && fs.existsSync(accountFile) ? JSON.parse(fs.readFileSync(accountFile, 'utf8')) : null);
const writeAccount = (data) => fs.writeFileSync(accountFile, JSON.stringify(data), { mode: 0o600 });

/**
 * The route's closing time for this round: the one the first deploy chose, kept in the account file, so
 * a redeploy never moves it. Pure, so the rule is tested (lab-round.test.mjs).
 */
export function roundUntil(acct, labUntilSet, now, hours) {
  if (!acct || acct.removedAt) return { error: 'This account file belongs to a round that was removed; create a new account first.' };
  if (acct.until) {
    if (Date.parse(acct.until) <= now) return { error: `This round closed at ${acct.until}; it is not reopened. Remove it, then start a new round with a new account.` };
    return { until: acct.until, first: false };
  }
  if (labUntilSet) return { error: 'LAB_UNTIL is already set but this account file has no closing time: remove the route before deploying again.' };
  if (!(hours > 0 && hours <= 6)) return { error: '--hours must be more than 0 and at most 6.' };
  return { until: new Date(now + hours * 3600_000).toISOString(), first: true };
}

async function account() {
  if (!accountFile) throw new Error('Give --account=<file outside the repository>.');
  if (path.resolve(accountFile).startsWith(ROOT + path.sep)) throw new Error('The account file must live outside the repository.');
  const existing = readAccount();
  if (existing) {
    console.log(existing.removedAt ? `That file is the receipt of a removed round (user ${existing.userId}); use a new file.` : `An account already exists in that file (user ${existing.userId}); remove it first.`);
    return;
  }
  const { ref, url } = projectSettings();
  const admin = await adminClient(ref, url);
  const email = `healthcal-food-lab-${Date.now().toString(36)}@example.com`;
  const password = `Lab-${randomUUID()}${randomUUID().slice(0, 12)}`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw new Error(created.error.message);
  fs.mkdirSync(path.dirname(path.resolve(accountFile)), { recursive: true });
  writeAccount({ email, password, userId: created.data.user.id, createdAt: new Date().toISOString() });
  console.log(`Created the test account ${email} (user ${created.data.user.id}); its password is only in ${accountFile}.`);
}

async function deploy() {
  const acct = readAccount();
  if (!acct) throw new Error('Create the account first (lab.mjs account --account=<file>).');
  const { ref } = projectSettings();
  const labUntilSet = (await call('GET', `/v1/projects/${ref}/secrets`)).some((s) => s.name === 'LAB_UNTIL');
  const round = roundUntil(acct, labUntilSet, Date.now(), Number(flag('hours', '6')));
  if (round.error) throw new Error(round.error);
  const { until } = round;
  if (round.first) writeAccount({ ...acct, until });
  // Secrets first, so the function never runs one moment without its closing time.
  await call('POST', `/v1/projects/${ref}/secrets`, { json: [{ name: 'LAB_USER_ID', value: acct.userId }, { name: 'LAB_UNTIL', value: until }] });
  const files = ['index.ts', 'lab.ts', 'deno.json'];
  const form = new FormData();
  form.append('metadata', JSON.stringify({ entrypoint_path: 'index.ts', import_map_path: 'deno.json', name: SLUG, verify_jwt: true }));
  for (const f of files) form.append('file', new Blob([fs.readFileSync(path.join(FUNCTION_DIR, f))], { type: 'application/typescript' }), f);
  const out = await call('POST', `/v1/projects/${ref}/functions/deploy?slug=${SLUG}`, { form });
  console.log(`Deployed ${SLUG} (version ${out?.version ?? '?'}, verify_jwt on), open for user ${acct.userId} until ${until}${round.first ? '' : ' (this round\'s time, unchanged)'}.`);
}

async function status() {
  const { ref, url } = projectSettings();
  const fns = await call('GET', `/v1/projects/${ref}/functions`);
  const lab = fns.find((f) => f.slug === SLUG);
  console.log(`functions: ${fns.map((f) => `${f.slug} v${f.version}`).join(', ')}`);
  console.log(lab ? `${SLUG}: present (v${lab.version}, verify_jwt ${lab.verify_jwt}, ${lab.status})` : `${SLUG}: absent`);
  const names = (await call('GET', `/v1/projects/${ref}/secrets`)).map((s) => s.name);
  console.log(`lab secrets present: ${SECRETS.filter((s) => names.includes(s)).join(', ') || 'none'}`);
  const acct = readAccount();
  if (!acct) console.log('test account: not checked (give --account=<file>)');
  else {
    const admin = await adminClient(ref, url);
    const got = await admin.auth.admin.getUserById(acct.userId);
    console.log(`test account ${acct.userId}: ${got.data?.user ? 'exists' : 'absent'}`);
  }
}

async function remove() {
  const keepAccount = process.argv.includes('--keep-account');
  const acct = readAccount();
  if (!keepAccount && !acct) throw new Error('Give --account=<file> so the test account is removed too (or --keep-account to leave it on purpose).');
  const { ref, url } = projectSettings();
  const fns = await call('GET', `/v1/projects/${ref}/functions`);
  if (fns.some((f) => f.slug === SLUG)) {
    await call('DELETE', `/v1/projects/${ref}/functions/${SLUG}`);
    console.log(`${SLUG}: deleted`);
  } else console.log(`${SLUG}: was not there`);
  const names = (await call('GET', `/v1/projects/${ref}/secrets`)).map((s) => s.name);
  const ours = SECRETS.filter((s) => names.includes(s));
  if (ours.length) {
    await call('DELETE', `/v1/projects/${ref}/secrets`, { json: ours });
    console.log(`secrets deleted: ${ours.join(', ')}`);
  }
  if (keepAccount) {
    console.log('test account: left in place (--keep-account); remove it with remove --account=<file>');
    return;
  }
  if (acct.removedAt) {
    console.log(`test account ${acct.userId}: already removed at ${acct.removedAt}`);
    return;
  }
  const admin = await adminClient(ref, url);
  const gone = await admin.auth.admin.deleteUser(acct.userId);
  if (gone.error && !/not found/i.test(gone.error.message)) throw new Error(`could not delete the test account: ${gone.error.message}`);
  // A receipt instead of the file: no email or password left, but status --account can still check the id.
  writeAccount({ userId: acct.userId, removedAt: new Date().toISOString() });
  console.log(`test account ${acct.userId}: deleted; its file now holds only the user id and the time (no password)`);
}

/** Requests that reach no model: each must be refused before the model is called. */
async function probe() {
  const acct = readAccount();
  if (!acct) throw new Error('Give --account=<file>.');
  const { url, anon } = projectSettings();
  const endpoint = `${url}/functions/v1/${SLUG}`;
  const client = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const signed = await client.auth.signInWithPassword({ email: acct.email, password: acct.password });
  if (signed.error) throw new Error(signed.error.message);
  const token = signed.data.session.access_token;
  // A second, separate signed-in account is not created on purpose; the anon key stands in for "anyone else".
  const ok = { model: 'claude-haiku-5-5', max_tokens: 10, messages: [{ role: 'user', content: 'x' }] };
  const cases = [
    ['no sign-in', {}, ok],
    ['the public key alone (another caller)', { Authorization: `Bearer ${anon}` }, ok],
    ['a made-up token', { Authorization: 'Bearer abc.def.ghi' }, ok],
    ['lab account, model outside the list', { Authorization: `Bearer ${token}` }, { ...ok, model: 'claude-fable-5-2' }],
    ['lab account, max_tokens over the cap', { Authorization: `Bearer ${token}` }, { ...ok, max_tokens: 3001 }],
    ['lab account, not a Messages request', { Authorization: `Bearer ${token}` }, { hello: 'world' }],
    ['lab account, a tool', { Authorization: `Bearer ${token}` }, { ...ok, tools: [{ name: 't', input_schema: { type: 'object' } }] }],
    ['lab account, text over the cap', { Authorization: `Bearer ${token}` }, { ...ok, system: 'x'.repeat(60_001) }],
    ['lab account, GET', { Authorization: `Bearer ${token}` }, null],
  ];
  let allRefused = true;
  for (const [name, headers, body] of cases) {
    const res = await fetch(endpoint, {
      method: body ? 'POST' : 'GET',
      headers: { apikey: anon, ...(body ? { 'Content-Type': 'application/json' } : null), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = (await res.text()).slice(0, 160).replace(/\s+/g, ' ');
    const refused = res.status >= 400 && !res.headers.get('x-lab-upstream-ms');
    allRefused &&= refused;
    console.log(`${refused ? 'refused' : 'NOT REFUSED'}  ${res.status}  ${name}: ${text}`);
  }
  console.log(allRefused ? 'Every probe was refused before reaching the model.' : 'A probe got through: remove the route now.');
  if (!allRefused) process.exitCode = 1;
}

const commands = { account, deploy, status, remove, probe };
if (process.argv[1] !== fileURLToPath(import.meta.url)) {
  // Imported (by the test): only the pure rule above.
} else if (!commands[command]) {
  console.error(`Usage: lab.mjs ${Object.keys(commands).join('|')} [--account=<file>] [--hours=6] [--ref=<project ref>]`);
  process.exit(2);
} else {
  try {
    await commands[command]();
  } catch (e) {
    console.error(`Stopped: ${e.message}`);
    process.exit(1);
  }
}
