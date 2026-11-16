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
 *   - EXPO_TOKEN is not set;
 *   - the exported bundles hold the test hooks (EXPO_PUBLIC_E2E) or lack a public setting.
 *
 * The bundles are made here, not by eas-cli: `expo export` runs with exactly eas.json's
 * build.production.env (the settings the app builds use), EXPO_PUBLIC_E2E set to "0", every other
 * EXPO_PUBLIC_* from the shell removed and no .env file read (EXPO_NO_DOTENV). Then the bundles are
 * checked and uploaded as they are with `eas update --skip-bundler`. So neither a value stored on
 * the EAS dashboard's "production" environment (eas-cli merges those over the shell when it bundles
 * itself) nor a .env or .env.local file can reach the phones. eas-cli is pinned (EAS_CLI below).
 * --message defaults to the commit's subject line. --dry-run makes the same checks, the export
 * included, prints the command it would run, and exits without publishing.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The eas-cli this script was checked against (its update command, --skip-bundler and --input-dir). */
export const EAS_CLI = 'eas-cli@27.10.0';

/**
 * Names that only a bundle built with EXPO_PUBLIC_E2E=1 holds: the test handles set in
 * src/services/friends.ts, src/features/health-sync/sync.ts and src/features/updates/updates.ts.
 * Not "__healthcal" alone: a release bundle reads window.__healthcalMotion (src/theme/motion.ts),
 * and Hermes may store a short string inside a longer one.
 */
export const TEST_HOOK_MARKS = ['__healthcalFriends', '__healthcalHealthSync', '__healthcalUpdates'];

/** The environment `expo export` runs with: the shell's, minus its public settings, plus eas.json's. */
export function exportEnv(shellEnv, publicEnv) {
  const env = { ...shellEnv, EXPO_NO_TELEMETRY: '1', EXPO_NO_DOTENV: '1', NODE_ENV: 'production' };
  for (const key of Object.keys(env)) if (key.startsWith('EXPO_PUBLIC_')) delete env[key];
  for (const [key, value] of Object.entries(publicEnv)) if (key.startsWith('EXPO_PUBLIC_')) env[key] = String(value);
  env.EXPO_PUBLIC_E2E = '0';
  return env;
}

/** The JavaScript or Hermes bundles of an export, per platform (`_expo/static/js/<platform>/`). */
function bundles(dir) {
  const base = join(dir, '_expo', 'static', 'js');
  const out = {};
  for (const platform of readdirSync(base)) {
    const pdir = join(base, platform);
    if (!statSync(pdir).isDirectory()) continue;
    out[platform] = readdirSync(pdir).filter((f) => /\.(hbc|js)$/.test(f)).map((f) => join(pdir, f));
  }
  return out;
}

/**
 * What is wrong with an export in `dir` (an empty list when nothing is): a platform missing, a test
 * hook present, or a public setting absent (so the bundle was not made with eas.json's values).
 */
export function scanExport(dir, { platforms = ['android', 'ios'], publicEnv = {} } = {}) {
  const problems = [];
  let found;
  try {
    found = bundles(dir);
  } catch (e) {
    return [`no bundles in ${dir} (${e.message})`];
  }
  for (const platform of platforms) {
    const files = found[platform] ?? [];
    if (!files.length) {
      problems.push(`no ${platform} bundle in the export`);
      continue;
    }
    const text = files.map((f) => readFileSync(f).toString('latin1')).join('\n');
    for (const mark of TEST_HOOK_MARKS) if (text.includes(mark)) problems.push(`the ${platform} bundle holds the test hooks (${mark}): it was built with EXPO_PUBLIC_E2E=1`);
    for (const [key, value] of Object.entries(publicEnv)) {
      if (key.startsWith('EXPO_PUBLIC_') && key !== 'EXPO_PUBLIC_E2E' && value && !text.includes(String(value))) problems.push(`the ${platform} bundle lacks ${key} from eas.json`);
    }
  }
  return problems;
}

function main() {
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
  const trip = spawnSync('npx', ['vitest', 'run', 'src/features/updates/nativeSurface.test.ts'], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, HEALTHCAL_RECORD_NATIVE: '', HEALTHCAL_RECORD_SAME_RUNTIME: '' },
  });
  if (trip.status !== 0) {
    const out = `${trip.stdout}\n${trip.stderr}`;
    const reason = out.match(/Error: ([\s\S]*?)\n\s*(?:❯|at |\n)/)?.[1]?.trim();
    refuse(`the runtime-version tripwire failed.\n${reason || out.slice(-2000)}`);
  }

  // 3. The token.
  if (!process.env.EXPO_TOKEN) refuse('EXPO_TOKEN is not set (an Expo access token for the account that owns the project).');

  // 4. The bundles, made here with the app's public settings only, then checked.
  const publicEnv = JSON.parse(readFileSync(join(ROOT, 'eas.json'), 'utf8')).build.production.env ?? {};
  const env = exportEnv(process.env, publicEnv);
  const runtimeVersion = JSON.parse(readFileSync(join(ROOT, 'app.json'), 'utf8')).expo.runtimeVersion;
  console.log(`Commit ${commit}, runtime version ${runtimeVersion}, message "${message}"`);
  console.log(`Public settings: ${Object.keys(env).filter((k) => k.startsWith('EXPO_PUBLIC_')).map((k) => `${k}${k === 'EXPO_PUBLIC_E2E' ? '=0' : ''}`).join(', ')}`);

  // Outside the repository, so eas-cli's clean-tree check and git never see it.
  const outDir = mkdtempSync(join(tmpdir(), 'healthcal-update-'));
  // fatal() exits without running finally blocks.
  process.on('exit', () => rmSync(outDir, { recursive: true, force: true }));
  try {
    console.log(`Exporting the Android and iPhone bundles to ${outDir} ...`);
    const exp = spawnSync('npx', ['expo', 'export', '--output-dir', outDir, '--platform', 'android', '--platform', 'ios', '--dump-assetmap', '--source-maps', '--clear'], {
      cwd: ROOT,
      env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (exp.status !== 0) fatal(`expo export exited with ${exp.status}.\n${`${exp.stdout}\n${exp.stderr}`.slice(-3000)}`);
    const problems = scanExport(outDir, { publicEnv });
    if (problems.length) fatal(`the exported bundles are not fit to ship:\n${problems.map((p) => `- ${p}`).join('\n')}`);
    console.log('Bundles checked: no test hooks, the public settings from eas.json are in both.');

    // --environment is still required for SDK 55+ in non-interactive mode; with --skip-bundler the
    // server's variables it fetches are not used to build anything.
    const command = [EAS_CLI, 'update', '--skip-bundler', '--input-dir', outDir, '--channel', 'production', '--environment', 'production', '--platform', 'all', '--message', message, '--non-interactive'];
    if (dryRun) {
      console.log(`Would run: npx ${command.map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(' ')}`);
      if (blocked.length) console.log(`\nA real run would refuse:\n${blocked.map((b) => `- ${b}`).join('\n')}`);
      else console.log('A real run would publish now.');
      return;
    }

    const r = spawnSync('npx', ['--yes', ...command], { cwd: ROOT, env, encoding: 'utf8', stdio: ['inherit', 'pipe', 'pipe'] });
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
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
