/**
 * The native surface of the app: what an installed build was made with that a new over-the-air
 * update cannot change. Read by the runtime-version tripwire (nativeSurface.test.ts) and, through
 * that test, by scripts/ops/publish-update.mjs. Node only (it reads files): never imported by the app.
 *
 * It is the version of every package that has native code (an android/, ios/, apple/ or cpp/
 * folder, a podspec, expo-module.config.json, react-native.config.js or a codegenConfig), whether
 * package.json names it (dependencies or devDependencies: autolinking follows both at the root) or
 * another package brings it in (its dependencies, optionalDependencies and required
 * peerDependencies), because autolinking builds those into the app too; plus every key of app.json
 * that goes into the native build (all but APP_KEYS_UPDATES_CARRY), runtimeVersion included, and
 * the source of local config plugins ("./plugins/...") and of the custom EAS build configs
 * (.eas/build/*.yml). Pure JavaScript packages (date-fns,
 * zustand, fflate, ...) are left out: an update carries them. Image files named in app.json (icon,
 * splash) are hashed by path only: a new picture needs a new build to show, but cannot crash an
 * older one.
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
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

/** app.json keys an over-the-air update carries or that never reach the native build. */
export const APP_KEYS_UPDATES_CARRY = ['web', 'extra', 'owner', 'slug', 'version', 'experiments'] as const;

/** Folders and files that mean a package has native code. */
const NATIVE_MARKS = ['android', 'ios', 'apple', 'cpp', 'expo-module.config.json', 'react-native.config.js'];

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
export function isNative(dir: string, meta?: { codegenConfig?: unknown }): boolean {
  if (NATIVE_MARKS.some((m) => existsSync(join(dir, m)))) return true;
  if (meta?.codegenConfig) return true;
  try {
    return readdirSync(dir).some((f) => f.endsWith('.podspec'));
  } catch {
    return false;
  }
}

/** The packages a package brings in: dependencies, optional ones, and peers it does not mark optional. */
function brings(meta: { dependencies?: object; optionalDependencies?: object; peerDependencies?: object; peerDependenciesMeta?: Record<string, { optional?: boolean }> }): string[] {
  const peers = Object.keys(meta.peerDependencies ?? {}).filter((n) => !meta.peerDependenciesMeta?.[n]?.optional);
  return [...Object.keys(meta.dependencies ?? {}), ...Object.keys(meta.optionalDependencies ?? {}), ...peers];
}

/** The source of every local config plugin ("./plugins/x" or ["./plugins/x", options]), by path. */
function localPlugins(root: string, plugins: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  for (const entry of Array.isArray(plugins) ? plugins : []) {
    const ref = Array.isArray(entry) ? entry[0] : entry;
    if (typeof ref !== 'string' || !ref.startsWith('.')) continue;
    const file = [ref, `${ref}.js`, `${ref}.ts`, join(ref, 'index.js')].map((r) => join(root, r)).find((f) => existsSync(f) && !statSync(f).isDirectory());
    out[ref] = file ? createHash('sha256').update(readFileSync(file)).digest('hex') : 'missing';
  }
  return out;
}

/**
 * The custom EAS build configs (.eas/build/*.yml) by content: they decide how an installed app was
 * built and signed (the sideload .ipa's HealthKit entitlement, for one), which an update cannot change.
 */
function buildConfigs(root: string): Record<string, string> {
  const dir = join(root, '.eas', 'build');
  if (!existsSync(dir)) return {};
  const out: Record<string, string> = {};
  for (const f of readdirSync(dir).sort()) {
    if (/\.ya?ml$/.test(f)) out[f] = createHash('sha256').update(readFileSync(join(dir, f))).digest('hex');
  }
  return out;
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
  // Autolinking follows the root's devDependencies too (expo-modules-autolinking, dependencies/resolution.js).
  const queue: [string, string][] = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {}), ...Object.keys(pkg.optionalDependencies ?? {})].map((n) => [n, root]);
  while (queue.length) {
    const [name, from] = queue.shift()!;
    const dir = resolvePackage(name, from);
    if (!dir || seen.has(dir)) continue;
    seen.add(dir);
    const meta = readJson(join(dir, 'package.json'));
    if (isNative(dir, meta)) {
      // By name, not by folder, so how npm laid out node_modules does not matter; two copies list both versions.
      const versions = new Set((packages[name] ?? '').split(' ').filter(Boolean)).add(meta.version);
      packages[name] = [...versions].sort().join(' ');
    }
    for (const dep of brings(meta)) queue.push([dep, dir]);
  }
  const runtimeVersion = String(expo.runtimeVersion ?? '');
  const app = Object.fromEntries(Object.entries(expo).filter(([k]) => !(APP_KEYS_UPDATES_CARRY as readonly string[]).includes(k)));
  const surface = { runtimeVersion, packages, app, localPlugins: localPlugins(root, expo.plugins), buildConfigs: buildConfigs(root) };
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
      `The app's native surface changed (a package with native code, a native setting in app.json, a local config plugin or an .eas/build config) but runtimeVersion is still "${now.runtimeVersion}".`,
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

/** The variable that records a new pair, and the second one needed to record a new hash under the same runtimeVersion. */
export const RECORD_VAR = 'HEALTHCAL_RECORD_NATIVE';
export const SAME_RUNTIME_VAR = 'HEALTHCAL_RECORD_SAME_RUNTIME';

/**
 * Why recording the current pair is refused, or null when it may be recorded. Recording a new hash
 * under the runtimeVersion already recorded is exactly the dangerous case the tripwire is for (a
 * native change without a new runtime version), so it needs SAME_RUNTIME_VAR=1 as well: only for a
 * change that is known not to touch the installed apps (a change to how the hash is made).
 */
export function recordRefusal(now: NativeSurface, recorded: Recorded | null, sameRuntimeOverride: boolean): string | null {
  if (!recorded || recorded.runtimeVersion !== now.runtimeVersion || recorded.hash === now.hash || sameRuntimeOverride) return null;
  return [
    `Not recording: the native surface changed but runtimeVersion is still "${now.runtimeVersion}" (recorded hash ${recorded.hash}, now ${now.hash}).`,
    `Raise expo.runtimeVersion in app.json (for example to "${bump(now.runtimeVersion)}") and rebuild both apps, then record again.`,
    `Only if the installed apps are known to match this surface already (the hash formula changed, nothing native did), record with ${SAME_RUNTIME_VAR}=1 as well.`,
  ].join('\n');
}

function bump(v: string): string {
  return /^\d+$/.test(v) ? String(Number(v) + 1) : `${v}-2`;
}
