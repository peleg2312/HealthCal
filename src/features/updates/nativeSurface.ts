/**
 * The native surface of the app: what an installed build was made with that a new over-the-air
 * update cannot change. Read by the runtime-version tripwire (nativeSurface.test.ts) and, through
 * that test, by scripts/ops/publish-update.mjs. Node only (it reads files): never imported by the app.
 *
 * It is the version of every package that has native code (an android/ or ios/ folder, a podspec
 * or expo-module.config.json in its folder), whether package.json names it or another package
 * brings it in, because autolinking builds those into the app too; plus the native parts of
 * app.json (plugins, ios, android) and runtimeVersion itself. Pure JavaScript packages
 * (date-fns, zustand, fflate, ...) are left out: an update carries them.
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const ROOT = join(__dirname, '..', '..', '..');
export const RECORD_FILE = join(__dirname, 'nativeSurface.json');

export interface NativeSurface {
  runtimeVersion: string;
  /** Native package name -> installed version. */
  packages: Record<string, string>;
  hash: string;
}

export interface Recorded {
  runtimeVersion: string;
  hash: string;
}

const readJson = (file: string) => JSON.parse(readFileSync(file, 'utf8'));

/** JSON with sorted keys, so the same content always gives the same text. */
export function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o)
      .sort()
      .filter((k) => o[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${stable(o[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Whether a package folder carries native code. */
export function isNative(dir: string): boolean {
  if (existsSync(join(dir, 'android')) || existsSync(join(dir, 'ios')) || existsSync(join(dir, 'expo-module.config.json'))) return true;
  try {
    return readdirSync(dir).some((f) => f.endsWith('.podspec'));
  } catch {
    return false;
  }
}

/** Where Node would find `name` from a package in `from` (nested node_modules first). */
function resolvePackage(name: string, from: string): string | null {
  let dir = from;
  for (;;) {
    const candidate = join(dir, 'node_modules', name);
    if (existsSync(join(candidate, 'package.json'))) return candidate;
    const up = dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

export function nativeSurface(root: string = ROOT): NativeSurface {
  const pkg = readJson(join(root, 'package.json'));
  const expo = readJson(join(root, 'app.json')).expo;
  const packages: Record<string, string> = {};
  const seen = new Set<string>();
  const queue: [string, string][] = Object.keys(pkg.dependencies ?? {}).map((n) => [n, root]);
  while (queue.length) {
    const [name, from] = queue.shift()!;
    const dir = resolvePackage(name, from);
    if (!dir || seen.has(dir)) continue;
    seen.add(dir);
    const meta = readJson(join(dir, 'package.json'));
    if (isNative(dir)) {
      // By name, not by folder, so how npm laid out node_modules does not matter; two copies list both versions.
      const versions = new Set((packages[name] ?? '').split(' ').filter(Boolean)).add(meta.version);
      packages[name] = [...versions].sort().join(' ');
    }
    for (const dep of Object.keys(meta.dependencies ?? {})) queue.push([dep, dir]);
  }
  const runtimeVersion = String(expo.runtimeVersion ?? '');
  const surface = { runtimeVersion, packages, app: { plugins: expo.plugins ?? null, ios: expo.ios ?? null, android: expo.android ?? null } };
  return { runtimeVersion, packages, hash: createHash('sha256').update(stable(surface)).digest('hex').slice(0, 16) };
}

export function readRecorded(): Recorded | null {
  return existsSync(RECORD_FILE) ? (readJson(RECORD_FILE) as Recorded) : null;
}

/** null when the recorded pair matches; otherwise what the maintainer must do. */
export function tripwire(now: NativeSurface, recorded: Recorded | null): string | null {
  if (recorded && recorded.hash === now.hash && recorded.runtimeVersion === now.runtimeVersion) return null;
  const record = `HEALTHCAL_RECORD_NATIVE=1 npx vitest run src/features/updates/nativeSurface.test.ts`;
  const pair = JSON.stringify({ runtimeVersion: now.runtimeVersion, hash: now.hash });
  if (recorded && recorded.runtimeVersion === now.runtimeVersion) {
    return [
      `The app's native surface changed (a package with native code, or app.json's plugins, ios or android) but runtimeVersion is still "${now.runtimeVersion}".`,
      `An over-the-air update built now would reach phones whose installed app lacks that native code and could crash them.`,
      `1. Raise expo.runtimeVersion in app.json (for example to "${bump(now.runtimeVersion)}").`,
      `2. Rebuild and reinstall both apps (Android and iPhone) with the new runtime version.`,
      `3. Record the new pair: ${record}`,
      `Only then publish an update (node scripts/ops/publish-update.mjs).`,
    ].join('\n');
  }
  return [
    `runtimeVersion is "${now.runtimeVersion}" but the recorded pair is ${recorded ? JSON.stringify(recorded) : 'missing'}.`,
    `If both apps were rebuilt with runtimeVersion "${now.runtimeVersion}", record the new pair: ${record}`,
    `(it writes ${pair} to src/features/updates/nativeSurface.json).`,
  ].join('\n');
}

function bump(v: string): string {
  return /^\d+$/.test(v) ? String(Number(v) + 1) : `${v}-2`;
}
