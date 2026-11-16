#!/usr/bin/env node
/**
 * Publishes the web app to its public address on Expo's hosting (https://healthcal.expo.app),
 * built against the real backend named in eas.json. This is the app people add to an iPhone's
 * Home Screen from Safari, and a normal website on any other device.
 *
 *   EXPO_TOKEN=... node scripts/ops/deploy-web.mjs [--preview]
 *
 * Needs an Expo access token for the account that owns the project (app.json: owner, extra.eas.projectId).
 * --preview publishes to a one-off preview address instead of the production one.
 * The export goes to dist/ (ignored by git). Nothing is published if the export fails.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const env = JSON.parse(readFileSync(join(ROOT, 'eas.json'), 'utf8')).build.production.env;
const preview = process.argv.includes('--preview');

const run = (cmd, args, extra = {}) => {
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', env: { ...process.env, EXPO_NO_TELEMETRY: '1', ...extra } });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

rmSync(join(ROOT, 'dist'), { recursive: true, force: true });
// The public backend address and key only; test hooks stay off in a published build.
const build = { ...env };
delete process.env.EXPO_PUBLIC_E2E;
run('npx', ['expo', 'export', '--platform', 'web'], build);
run('npx', ['--yes', 'eas-cli@latest', 'deploy', '--non-interactive', ...(preview ? [] : ['--prod'])]);
