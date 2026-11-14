#!/usr/bin/env node
/**
 * Sets up a Supabase project for HealthCal through Supabase's management API
 * (https://api.supabase.com/api/v1): creates the project if there is none,
 * applies the database migrations, deploys both edge functions, allows the
 * app's links for password reset, and writes .env with the project's public
 * URL and key. Safe to run again: every step first checks what is there.
 *
 *   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/ops/provision-supabase.mjs \
 *     [--name healthcal] [--org <organization slug>] [--region emea|americas|apac|<region code>] \
 *     [--site-url https://your.site] [--dry-run]
 *
 * The token comes from supabase.com > Account > Access tokens. Nothing secret
 * is printed or written: the database password is generated and discarded
 * (reset it in the dashboard if you ever need a direct connection), and the
 * only key written to .env is the public one that ships in the app anyway.
 *
 * One thing it cannot do: store your Anthropic API key for meal analysis.
 * Add it yourself in the dashboard; the script prints the exact page.
 */
import { randomBytes } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const API = 'https://api.supabase.com';
const args = Object.fromEntries(
  process.argv.slice(2).flatMap((a, i, all) => (a.startsWith('--') ? [[a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : [])),
);
const NAME = args.name || 'healthcal';
const DRY = args['dry-run'] === 'true';
const SMART_GROUPS = ['emea', 'americas', 'apac'];
// In some managed environments a proxy adds the real token; any value then satisfies this header.
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN || `sbp_${'0'.repeat(40)}`;

const step = (text) => console.log(`\n== ${text}`);
const note = (text) => console.log(`   ${text}`);

async function call(method, path, { json, form, query } = {}) {
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(query || {})) url.searchParams.set(k, v);
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, ...(json ? { 'Content-Type': 'application/json' } : null) },
    body: json ? JSON.stringify(json) : form,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const message = typeof data === 'object' && data ? data.message || JSON.stringify(data) : String(data);
    const error = new Error(`${method} ${path} failed (${res.status}): ${String(message).slice(0, 400)}`);
    error.status = res.status;
    throw error;
  }
  return data;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function findOrCreateProject() {
  step('Project');
  const projects = await call('GET', '/v1/projects');
  const wantedOrg = args.org;
  const existing = projects.find((p) => p.name === NAME && (!wantedOrg || p.organization_slug === wantedOrg) && p.status !== 'REMOVED');
  if (existing) {
    note(`Using the existing project "${existing.name}" (${existing.ref}, ${existing.region}, ${existing.status}).`);
    return existing;
  }
  const orgs = await call('GET', '/v1/organizations');
  const org = wantedOrg ? orgs.find((o) => o.slug === wantedOrg) : orgs.length === 1 ? orgs[0] : null;
  if (!org) {
    const listed = orgs.map((o) => `${o.name} (--org ${o.slug})`).join(', ') || 'none';
    throw new Error(wantedOrg ? `No organization with slug ${wantedOrg}. Yours: ${listed}` : `Choose an organization with --org. Yours: ${listed}`);
  }
  const region = args.region || 'emea';
  const body = {
    name: NAME,
    organization_slug: org.slug,
    db_pass: randomBytes(24).toString('base64url'),
    region_selection: SMART_GROUPS.includes(region) ? { type: 'smartGroup', code: region } : { type: 'specific', code: region },
  };
  if (DRY) {
    note(`Would create "${NAME}" in organization ${org.name}, region ${region}.`);
    return null;
  }
  const created = await call('POST', '/v1/projects', { json: body });
  note(`Created "${created.name}" (${created.ref}) in ${org.name}, region ${created.region}.`);
  return created;
}

async function waitUntilReady(ref) {
  step('Waiting for the project to come up (new projects take a few minutes)');
  for (let i = 0; i < 90; i += 1) {
    try {
      const health = await call('GET', `/v1/projects/${ref}/health`, { query: { services: 'auth,db,rest' } });
      const pending = health.filter((s) => s.status !== 'ACTIVE_HEALTHY').map((s) => `${s.name}: ${s.status}`);
      if (pending.length === 0) {
        note('Database, sign-in and API are healthy.');
        return;
      }
      if (i % 6 === 0) note(pending.join(', '));
    } catch (e) {
      if (i % 6 === 0) note(String(e.message).slice(0, 120));
    }
    await sleep(5000);
  }
  throw new Error('The project did not become healthy in time. Run the script again in a few minutes.');
}

async function applyMigrations(ref) {
  step('Database');
  const dir = join(ROOT, 'supabase', 'migrations');
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const applied = new Set((await call('GET', `/v1/projects/${ref}/database/migrations`)).map((m) => m.version));
  for (const file of files) {
    const [, version, name] = file.match(/^(\d+)_(.*)\.sql$/) || [];
    if (!version) throw new Error(`Migration file name not understood: ${file}`);
    if (applied.has(version)) {
      note(`${file}: already applied.`);
      continue;
    }
    if (DRY) {
      note(`${file}: would apply.`);
      continue;
    }
    // The migrations use "if not exists" and "create or replace" throughout, so a retry after a partial failure is harmless.
    await call('POST', `/v1/projects/${ref}/database/migrations`, { json: { query: readFileSync(join(dir, file), 'utf8'), name } });
    note(`${file}: applied.`);
  }
}

/** verify_jwt per function, read from supabase/config.toml so the two stay in step. */
function functionSettings() {
  const toml = readFileSync(join(ROOT, 'supabase', 'config.toml'), 'utf8');
  const out = {};
  let current = null;
  for (const line of toml.split('\n')) {
    const section = line.match(/^\[functions\.([\w-]+)\]/);
    if (section) current = section[1];
    const verify = line.match(/^verify_jwt\s*=\s*(true|false)/);
    if (current && verify) out[current] = verify[1] === 'true';
  }
  return out;
}

async function deployFunctions(ref) {
  step('Functions');
  const settings = functionSettings();
  const base = join(ROOT, 'supabase', 'functions');
  for (const slug of readdirSync(base, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)) {
    const dir = join(base, slug);
    const files = readdirSync(dir).filter((f) => /\.(ts|json)$/.test(f) && !f.endsWith('.test.ts'));
    const metadata = { entrypoint_path: 'index.ts', name: slug, verify_jwt: settings[slug] ?? true, ...(files.includes('deno.json') ? { import_map_path: 'deno.json' } : null) };
    if (DRY) {
      note(`${slug}: would deploy ${files.join(', ')} (verify_jwt ${metadata.verify_jwt}).`);
      continue;
    }
    const form = new FormData();
    form.append('metadata', JSON.stringify(metadata));
    for (const f of files) form.append('file', new Blob([readFileSync(join(dir, f))], { type: 'application/typescript' }), f);
    await call('POST', `/v1/projects/${ref}/functions/deploy`, { form, query: { slug } });
    note(`${slug}: deployed (verify_jwt ${metadata.verify_jwt}).`);
  }
}

async function configureAuth(ref) {
  step('Sign-in links');
  const current = await call('GET', `/v1/projects/${ref}/config/auth`);
  const wanted = ['healthcal://**', 'http://localhost:8081/**', ...(args['site-url'] ? [`${args['site-url'].replace(/\/$/, '')}/**`] : [])];
  const have = String(current.uri_allow_list || '').split(',').map((s) => s.trim()).filter(Boolean);
  const merged = [...new Set([...have, ...wanted])];
  const patch = {};
  if (merged.length !== have.length) patch.uri_allow_list = merged.join(',');
  if (args['site-url'] && current.site_url !== args['site-url']) patch.site_url = args['site-url'];
  if (Object.keys(patch).length === 0) {
    note('Already allow the app and the local web build.');
    return;
  }
  if (DRY) {
    note(`Would set ${JSON.stringify(patch)}.`);
    return;
  }
  await call('PATCH', `/v1/projects/${ref}/config/auth`, { json: patch });
  note(`Password-reset links may now return to: ${merged.join(', ')}.`);
  note(`Email confirmation on sign-up is ${current.mailer_autoconfirm ? 'OFF (anyone can sign up with any address)' : 'on'}; change it in the dashboard under Authentication if you want.`);
}

async function writeEnv(ref) {
  step('App configuration');
  const keys = await call('GET', `/v1/projects/${ref}/api-keys`, { query: { reveal: 'true' } });
  // Only the public key: a publishable key where the project has one, else the legacy anon key.
  const publicKey = keys.find((k) => k.type === 'publishable' && k.api_key) || keys.find((k) => k.name === 'anon' && k.api_key);
  if (!publicKey) throw new Error('The project returned no public key.');
  const url = `https://${ref}.supabase.co`;
  const envPath = join(ROOT, '.env');
  const lines = existsSync(envPath) ? readFileSync(envPath, 'utf8').split('\n').filter((l) => !/^EXPO_PUBLIC_SUPABASE_(URL|ANON_KEY)=/.test(l)) : [];
  const next = [...lines.filter((l, i, all) => l !== '' || i < all.length - 1), `EXPO_PUBLIC_SUPABASE_URL=${url}`, `EXPO_PUBLIC_SUPABASE_ANON_KEY=${publicKey.api_key}`, ''];
  if (DRY) {
    note(`Would write ${url} and the public key to .env.`);
    return url;
  }
  writeFileSync(envPath, next.join('\n'));
  note(`.env now points the app at ${url} (public URL and public key only).`);
  return url;
}

async function reportSecrets(ref) {
  step('Meal analysis');
  const secrets = await call('GET', `/v1/projects/${ref}/secrets`);
  if (secrets.some((s) => s.name === 'ANTHROPIC_API_KEY')) {
    note('ANTHROPIC_API_KEY is set: photo and text analysis will run.');
    return true;
  }
  note('ANTHROPIC_API_KEY is not set yet, so the AI screen will answer "not set up".');
  note(`Add it here (name ANTHROPIC_API_KEY): https://supabase.com/dashboard/project/${ref}/functions/secrets`);
  return false;
}

try {
  const project = await findOrCreateProject();
  if (project) {
    const ref = project.ref;
    await waitUntilReady(ref);
    await applyMigrations(ref);
    await deployFunctions(ref);
    await configureAuth(ref);
    const url = await writeEnv(ref);
    const ai = await reportSecrets(ref);
    console.log(`\nDone. Project ${ref} at ${url}. Dashboard: https://supabase.com/dashboard/project/${ref}`);
    console.log(`Next: ${ai ? '' : 'add the Anthropic key (above), then '}check it end to end with: node scripts/ops/verify-backend.mjs`);
  }
} catch (e) {
  console.error(`\nStopped: ${e.message}`);
  if (e.status === 401) console.error('The access token was not accepted. Create one at https://supabase.com/dashboard/account/tokens and pass it as SUPABASE_ACCESS_TOKEN.');
  process.exit(1);
}
