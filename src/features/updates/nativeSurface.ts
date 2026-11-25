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
 *
 * Per platform: an installed Android app and an installed iPhone app are matched to updates by their
 * own runtimeVersion (`expo.android.runtimeVersion` or `expo.ios.runtimeVersion` wins over
 * `expo.runtimeVersion`), so each has its own surface and its own recorded pair. A package whose
 * native code is for one platform only (an android/ folder and no ios/, apple/, cpp/ or podspec, or
 * the reverse), its config plugin's entry in app.json and the other platform's app.json key count
 * toward that platform alone: adding an Android-only package (the home-screen widget) changes the
 * Android surface and leaves the iPhone's as it was.
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const ROOT = join(__dirname, '..', '..', '..');
export const RECORD_FILE = join(__dirname, 'nativeSurface.json');

/** The two apps an over-the-air update can reach, each with its own runtimeVersion. */
export type NativePlatform = 'android' | 'ios';
export const NATIVE_PLATFORMS: readonly NativePlatform[] = ['android', 'ios'];

export interface NativeSurface {
  platform: NativePlatform;
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

function hasPodspec(dir: string): boolean {
  try {
    return readdirSync(dir).some((f) => f.endsWith('.podspec'));
  } catch {
    return false;
  }
}

/** Whether a package folder carries native code. */
export function isNative(dir: string, meta?: { codegenConfig?: unknown }): boolean {
  if (NATIVE_MARKS.some((m) => existsSync(join(dir, m)))) return true;
  if (meta?.codegenConfig) return true;
  return hasPodspec(dir);
}

/** The platforms an expo-module.config.json names ("android", "ios", "apple"), or null without one. */
function expoModulePlatforms(dir: string): string[] | null {
  const file = join(dir, 'expo-module.config.json');
  if (!existsSync(file)) return null;
  try {
    const platforms = (readJson(file) as { platforms?: unknown }).platforms;
    return Array.isArray(platforms) ? platforms.map(String) : [];
  } catch {
    return [];
  }
}

/**
 * The platforms a native package builds into. One platform only when every sign of native code
 * points to it: Android alone for an android/ folder with no ios/, apple/ or cpp/ folder, no
 * podspec, no react-native.config.js, no codegenConfig and an expo-module.config.json (if any) that
 * names Android alone; the iPhone alone for the reverse. Anything else counts for both, so a
 * package is never left out of a platform it might reach (react-native itself, with its podspecs,
 * ReactAndroid/ and react-native.config.js, is both).
 */
export function nativePlatforms(dir: string, meta?: { codegenConfig?: unknown }): NativePlatform[] {
  const has = (m: string) => existsSync(join(dir, m));
  const both: NativePlatform[] = ['android', 'ios'];
  if (has('cpp') || has('react-native.config.js') || meta?.codegenConfig) return both;
  const named = expoModulePlatforms(dir);
  const android = has('android');
  const apple = has('ios') || has('apple') || hasPodspec(dir);
  if (android && !apple && (named === null || named.every((p) => p === 'android'))) return ['android'];
  if (apple && !android && (named === null || named.every((p) => p === 'ios' || p === 'apple'))) return ['ios'];
  return both;
}

/** The package a config plugin entry names ("expo-foo", "expo-foo/plugin", "@a/b/plugin"), or null for a local one. */
function pluginPackage(entry: unknown): string | null {
  const ref = Array.isArray(entry) ? entry[0] : entry;
  if (typeof ref !== 'string' || ref.startsWith('.')) return null;
  const parts = ref.split('/');
  return ref.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

/** The app.json plugin entries that reach `platform`: an entry of a package native to the other platform only is left out. */
function pluginsFor(root: string, plugins: unknown, platform: NativePlatform): unknown {
  if (!Array.isArray(plugins)) return plugins;
  return plugins.filter((entry) => {
    const name = pluginPackage(entry);
    const dir = name ? resolvePackage(name, root) : null;
    if (!dir) return true;
    const meta = readJson(join(dir, 'package.json'));
    return !isNative(dir, meta) || nativePlatforms(dir, meta).includes(platform);
  });
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

/** The runtimeVersion an installed app of `platform` carries: its own key, else the top-level one. */
export function runtimeVersionFor(expo: Record<string, unknown>, platform: NativePlatform): string {
  const own = (expo[platform] as { runtimeVersion?: unknown } | undefined)?.runtimeVersion;
  return String(own ?? expo.runtimeVersion ?? '');
}

export function nativeSurface(platform: NativePlatform, root: string = ROOT): NativeSurface {
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
    if (isNative(dir, meta) && nativePlatforms(dir, meta).includes(platform)) {
      // By name, not by folder, so how npm laid out node_modules does not matter; two copies list both versions.
      const versions = new Set((packages[name] ?? '').split(' ').filter(Boolean)).add(meta.version);
      packages[name] = [...versions].sort().join(' ');
    }
    for (const dep of brings(meta)) queue.push([dep, dir]);
  }
  const runtimeVersion = runtimeVersionFor(expo, platform);
  // The other platform's own key never reaches this platform's build; nor do the plugins of its packages.
  const other = platform === 'android' ? 'ios' : 'android';
  const app = Object.fromEntries(
    Object.entries(expo)
      .filter(([k]) => !(APP_KEYS_UPDATES_CARRY as readonly string[]).includes(k) && k !== other)
      .map(([k, v]) => [k, k === 'plugins' ? pluginsFor(root, v, platform) : v]),
  );
  const surface = { runtimeVersion, packages, app, localPlugins: localPlugins(root, expo.plugins), buildConfigs: buildConfigs(root) };
  return { platform, runtimeVersion, packages, hash: createHash('sha256').update(stable(surface)).digest('hex').slice(0, 16) };
}

/** The recorded pairs, one per platform: `{ android: { runtimeVersion, hash }, ios: { ... } }`. */
export type RecordedPairs = Partial<Record<NativePlatform, Recorded>>;

/**
 * The pair recorded for `platform`, or null. A file in the earlier one-pair shape ({ runtimeVersion,
 * hash }) was made by a formula that hashed both platforms together, so its hash cannot be compared
 * with a platform's own: it counts as no record for either.
 */
export function readRecorded(platform: NativePlatform, file: string = RECORD_FILE): Recorded | null {
  if (!existsSync(file)) return null;
  const pairs = readJson(file) as RecordedPairs;
  const pair = pairs[platform];
  return pair && typeof pair.hash === 'string' && typeof pair.runtimeVersion === 'string' ? pair : null;
}

const APP_NAME: Record<NativePlatform, string> = { android: 'Android', ios: 'iPhone' };

/** null when the recorded pair matches; otherwise what the maintainer must do. */
export function tripwire(now: NativeSurface, recorded: Recorded | null): string | null {
  if (recorded && recorded.hash === now.hash && recorded.runtimeVersion === now.runtimeVersion) return null;
  const record = `HEALTHCAL_RECORD_NATIVE=1 npx vitest run src/features/updates/nativeSurface.test.ts`;
  const pair = JSON.stringify({ runtimeVersion: now.runtimeVersion, hash: now.hash });
  const app = APP_NAME[now.platform];
  if (recorded && recorded.runtimeVersion === now.runtimeVersion) {
    return [
      `The ${app} app's native surface changed (a package with native code, a native setting in app.json, a local config plugin or an .eas/build config) but its runtimeVersion is still "${now.runtimeVersion}".`,
      `An over-the-air update built now would reach phones whose installed app lacks that native code and could crash them.`,
      `1. Raise expo.${now.platform}.runtimeVersion in app.json (for example to "${bump(now.runtimeVersion)}"), or expo.runtimeVersion when both apps changed.`,
      `2. Rebuild and reinstall the ${app} app with the new runtime version.`,
      `3. Record the new pair: ${record}`,
      `Only then publish an update (node scripts/ops/publish-update.mjs).`,
    ].join('\n');
  }
  return [
    `The ${app} app's runtimeVersion is "${now.runtimeVersion}" but the recorded pair is ${recorded ? JSON.stringify(recorded) : 'missing'}.`,
    `If the ${app} app was rebuilt with runtimeVersion "${now.runtimeVersion}", record the new pair: ${record}`,
    `(it writes ${pair} under "${now.platform}" in src/features/updates/nativeSurface.json).`,
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
    `Not recording: the ${APP_NAME[now.platform]} app's native surface changed but its runtimeVersion is still "${now.runtimeVersion}" (recorded hash ${recorded.hash}, now ${now.hash}).`,
    `Raise expo.${now.platform}.runtimeVersion in app.json (for example to "${bump(now.runtimeVersion)}") and rebuild the ${APP_NAME[now.platform]} app, then record again.`,
    `Only if the installed apps are known to match this surface already (the hash formula changed, nothing native did), record with ${SAME_RUNTIME_VAR}=1 as well.`,
  ].join('\n');
}

function bump(v: string): string {
  return /^\d+$/.test(v) ? String(Number(v) + 1) : `${v}-2`;
}
