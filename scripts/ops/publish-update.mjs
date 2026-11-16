#!/usr/bin/env node
/**
 * Publishes an over-the-air update of the current commit to the installed Android and iPhone apps
 * (the production channel). Phones download it in the background and start it at their next cold
 * start, or when the app comes back to the front after five minutes away on a tab
 * (src/features/updates). The web app is published separately (deploy-web.mjs).
 *
 *   EXPO_TOKEN=... node scripts/ops/publish-update.mjs [--message "What changed"] [--dry-run]
 *
 * Refuses, with the reason, when:
 *   - the working tree has uncommitted changes (an update must be a commit someone can find again);
 *   - the runtime-version tripwire fails (src/features/updates/nativeSurface.test.ts): the native
 *     surface changed, so runtimeVersion must be raised and both apps rebuilt first;
 *   - EXPO_TOKEN is not set.
 * The EXPO_PUBLIC_* values come from eas.json's build.production.env, the ones the app builds use;
 * EXPO_PUBLIC_E2E (the test hooks) is always unset. --message defaults to the commit's subject line.
 * --dry-run makes the same checks, prints the command it would run, and exits without publishing.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const messageAt = args.findIndex((a) => a === '--message' || a.startsWith('--message='));
const messageArg = messageAt < 0 ? null : args[messageAt].includes('=') ? args[messageAt].slice('--message='.length) : args[messageAt + 1];

const blocked = [];
const fatal = (reason) => {
  console.error(`Not publishing: ${reason}`);
  process.exit(1);
};
/** A real run stops here; --dry-run notes it and goes on, so it shows everything at once. */
const refuse = (reason) => {
  if (!dryRun) fatal(reason);
  blocked.push(reason);
};
const git = (...a) => {
  const r = spawnSync('git', a, { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0) fatal(`git ${a.join(' ')} failed: ${(r.stderr || '').trim()}`);
  return r.stdout.replace(/\n+$/, '');
};

// 1. A clean working tree: the update is exactly the commit.
const dirty = git('status', '--porcelain');
if (dirty) refuse(`the working tree has uncommitted changes. Commit or stash them first:\n${dirty}`);
const commit = git('rev-parse', '--short', 'HEAD').trim();
const message = messageArg?.trim() || git('log', '-1', '--format=%s').trim();
if (!message) fatal('no --message and no commit subject');

// 2. The runtime-version tripwire.
const trip = spawnSync('npx', ['vitest', 'run', 'src/features/updates/nativeSurface.test.ts'], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, HEALTHCAL_RECORD_NATIVE: '' } });
if (trip.status !== 0) {
  const out = `${trip.stdout}\n${trip.stderr}`;
  const reason = out.match(/Error: ([\s\S]*?)\n\s*(?:❯|at |\n)/)?.[1]?.trim();
  refuse(`the runtime-version tripwire failed.\n${reason || out.slice(-2000)}`);
}

// 3. The token.
if (!process.env.EXPO_TOKEN) refuse('EXPO_TOKEN is not set (an Expo access token for the account that owns the project).');

// The app's public settings, from the one place the app builds take them.
const publicEnv = JSON.parse(readFileSync(join(ROOT, 'eas.json'), 'utf8')).build.production.env ?? {};
const env = { ...process.env, EXPO_NO_TELEMETRY: '1' };
for (const key of Object.keys(env)) if (key.startsWith('EXPO_PUBLIC_')) delete env[key];
for (const [key, value] of Object.entries(publicEnv)) if (key.startsWith('EXPO_PUBLIC_') && key !== 'EXPO_PUBLIC_E2E') env[key] = value;

const command = ['eas-cli@latest', 'update', '--channel', 'production', '--environment', 'production', '--platform', 'all', '--message', message, '--non-interactive'];
const runtimeVersion = JSON.parse(readFileSync(join(ROOT, 'app.json'), 'utf8')).expo.runtimeVersion;

console.log(`Commit ${commit}, runtime version ${runtimeVersion}, message "${message}"`);
console.log(`Public settings: ${Object.keys(env).filter((k) => k.startsWith('EXPO_PUBLIC_')).join(', ') || 'none'}`);
if (dryRun) {
  console.log(`Would run: npx ${command.map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(' ')}`);
  if (blocked.length) console.log(`\nA real run would refuse:\n${blocked.map((b) => `- ${b}`).join('\n')}`);
  else console.log('A real run would publish now.');
  process.exit(0);
}

const r = spawnSync('npx', command, { cwd: ROOT, env, encoding: 'utf8', stdio: ['inherit', 'pipe', 'pipe'] });
process.stdout.write(r.stdout ?? '');
process.stderr.write(r.stderr ?? '');
if (r.status !== 0) fatal(`eas update exited with ${r.status}.`);

// The ids it printed, gathered at the end so they are easy to find.
const out = `${r.stdout}\n${r.stderr}`;
const ids = ['Branch', 'Runtime version', 'Platform', 'Update group ID', 'Android update ID', 'iOS update ID', 'Message', 'EAS Dashboard']
  .map((label) => out.match(new RegExp(`^\\s*${label}\\s+(.+)$`, 'm')))
  .filter(Boolean)
  .map((m) => m[0].trim());
console.log(`\nPublished commit ${commit}.`);
for (const line of ids) console.log(`  ${line}`);
