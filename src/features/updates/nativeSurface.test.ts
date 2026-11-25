/**
 * The runtime-version tripwire. An over-the-air update runs only on installed apps with the same
 * runtimeVersion (app.json), which is a fixed string here (see AGENTS.md); Android and the iPhone
 * each have their own (`expo.android.runtimeVersion` / `expo.ios.runtimeVersion` win over
 * `expo.runtimeVersion`), so each platform has its own surface and its own recorded pair. This
 * fails when a platform's native surface changed while its runtimeVersion did not, and says what
 * to do. Record the pairs (after raising runtimeVersion and rebuilding the app that changed) with:
 *
 *   HEALTHCAL_RECORD_NATIVE=1 npx vitest run src/features/updates/nativeSurface.test.ts
 *
 * Recording refuses a new hash under the runtimeVersion already recorded (that is the native change
 * without a runtime bump the tripwire exists to stop) unless HEALTHCAL_RECORD_SAME_RUNTIME=1 is set
 * too, for a change known not to touch the installed apps (such as a change to how the hash is made).
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { isNative, NATIVE_PLATFORMS, nativePlatforms, nativeSurface, readRecorded, RECORD_FILE, RECORD_VAR, recordRefusal, SAME_RUNTIME_VAR, stable, tripwire } from './nativeSurface';

describe('runtime version tripwire', () => {
  const now = { android: nativeSurface('android'), ios: nativeSurface('ios') };

  if (process.env[RECORD_VAR] === '1') {
    it('records the new pairs', () => {
      for (const p of NATIVE_PLATFORMS) {
        const refused = recordRefusal(now[p], readRecorded(p), process.env[SAME_RUNTIME_VAR] === '1');
        if (refused) throw new Error(refused);
      }
      const pairs = Object.fromEntries(NATIVE_PLATFORMS.map((p) => [p, { runtimeVersion: now[p].runtimeVersion, hash: now[p].hash }]));
      writeFileSync(RECORD_FILE, `${JSON.stringify(pairs, null, 2)}\n`);
      console.log(`Recorded ${JSON.stringify(pairs)} in ${RECORD_FILE}`);
      for (const p of NATIVE_PLATFORMS) console.log(`${p} native packages: ${Object.entries(now[p].packages).map(([n, v]) => `${n}@${v}`).join(', ')}`);
    });
  }

  for (const p of NATIVE_PLATFORMS) {
    it(`${p}: matches the pair recorded for its runtimeVersion`, () => {
      const problem = tripwire(now[p], readRecorded(p));
      if (problem) throw new Error(problem);
    });
  }

  it('counts packages with native code and leaves pure JavaScript out', () => {
    // Native code for both platforms, or with a sign of both (react-native.config.js, codegenConfig), counts for both, to be safe.
    for (const name of ['expo', 'expo-updates', 'react-native', 'expo-modules-core', 'react-native-health-connect', '@kingstinct/react-native-healthkit']) {
      expect(now.android.packages[name], name).toBeTruthy();
      expect(now.ios.packages[name], name).toBeTruthy();
    }
    // Native code for one platform only counts toward that platform only: the home-screen widget is Android's.
    expect(now.android.packages['react-native-android-widget']).toBeTruthy();
    expect(now.ios.packages['react-native-android-widget']).toBeUndefined();
    for (const name of ['date-fns', 'zustand', 'fflate', 'lucide-react-native', '@supabase/supabase-js', 'react']) {
      expect(now.android.packages[name], name).toBeUndefined();
      expect(now.ios.packages[name], name).toBeUndefined();
    }
  });
});

describe('the pieces', () => {
  it('sorts keys so the hash does not depend on their order', () => {
    expect(stable({ b: 1, a: [{ d: 2, c: 3 }] })).toBe(stable({ a: [{ c: 3, d: 2 }], b: 1 }));
  });

  it('knows native code by its folders and files', () => {
    const dir = mkdtempSync(join(tmpdir(), 'native-'));
    expect(isNative(dir)).toBe(false);
    writeFileSync(join(dir, 'Thing.podspec'), '');
    expect(isNative(dir)).toBe(true);
    const other = mkdtempSync(join(tmpdir(), 'native-'));
    mkdirSync(join(other, 'android'));
    expect(isNative(other)).toBe(true);
  });

  it('refuses to record a new hash under the same runtimeVersion without the second variable', () => {
    const now = { platform: 'android' as const, runtimeVersion: '1', hash: 'new', packages: {} };
    expect(recordRefusal(now, { runtimeVersion: '1', hash: 'old' }, false)).toMatch(/Raise expo.android.runtimeVersion/);
    expect(recordRefusal(now, { runtimeVersion: '1', hash: 'old' }, true)).toBeNull();
    expect(recordRefusal(now, { runtimeVersion: '0', hash: 'old' }, false)).toBeNull();
    expect(recordRefusal(now, { runtimeVersion: '1', hash: 'new' }, false)).toBeNull();
    expect(recordRefusal(now, null, false)).toBeNull();
  });

  it('counts a native package in devDependencies, a required peer, an optional dependency, and the native keys of app.json', () => {
    const root = mkdtempSync(join(tmpdir(), 'surface-'));
    const pkg = (dir: string, meta: object, native = true) => {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ version: '1.0.0', ...meta }));
      if (native) mkdirSync(join(dir, 'android'), { recursive: true });
    };
    const write = (pkgJson: object, expo: object) => {
      writeFileSync(join(root, 'package.json'), JSON.stringify(pkgJson));
      writeFileSync(join(root, 'app.json'), JSON.stringify({ expo: { runtimeVersion: '1', ...expo } }));
    };
    pkg(join(root, 'node_modules', 'dev-native'), {});
    pkg(join(root, 'node_modules', 'js-lib'), { peerDependencies: { 'peer-native': '*', 'opt-peer': '*' }, peerDependenciesMeta: { 'opt-peer': { optional: true } }, optionalDependencies: { 'opt-native': '*' } }, false);
    pkg(join(root, 'node_modules', 'peer-native'), {});
    pkg(join(root, 'node_modules', 'opt-peer'), {});
    pkg(join(root, 'node_modules', 'opt-native'), {});
    pkg(join(root, 'node_modules', 'codegen-only'), { codegenConfig: { name: 'x' } }, false);
    write({ dependencies: { 'js-lib': '*', 'codegen-only': '*' }, devDependencies: { 'dev-native': '*' } }, { scheme: 'a', version: '1.0.0' });
    const first = nativeSurface('android', root);
    expect(Object.keys(first.packages).sort()).toEqual(['codegen-only', 'dev-native', 'opt-native', 'peer-native']);
    // A version bump or an update-carried key leaves it alone; a native key does not.
    write({ dependencies: { 'js-lib': '*', 'codegen-only': '*' }, devDependencies: { 'dev-native': '*' } }, { scheme: 'a', version: '1.0.1', extra: { x: 1 } });
    expect(nativeSurface('android', root).hash).toBe(first.hash);
    for (const key of [{ scheme: 'b' }, { orientation: 'landscape' }, { updates: { url: 'other' } }, { name: 'Other' }]) {
      write({ dependencies: { 'js-lib': '*', 'codegen-only': '*' }, devDependencies: { 'dev-native': '*' } }, { scheme: 'a', version: '1.0.0', ...key });
      expect(nativeSurface('android', root).hash, JSON.stringify(key)).not.toBe(first.hash);
    }
    // A local config plugin is hashed by its source, not only its path.
    mkdirSync(join(root, 'plugins'));
    writeFileSync(join(root, 'plugins', 'withThing.js'), 'module.exports = (c) => c;');
    write({ dependencies: {} }, { plugins: [['./plugins/withThing', { a: 1 }]] });
    const before = nativeSurface('android', root).hash;
    writeFileSync(join(root, 'plugins', 'withThing.js'), 'module.exports = (c) => ({ ...c, name: "x" });');
    expect(nativeSurface('android', root).hash).not.toBe(before);
    // So is a custom EAS build config (how an installed app was built and signed).
    mkdirSync(join(root, '.eas', 'build'), { recursive: true });
    writeFileSync(join(root, '.eas', 'build', 'ios-x.yml'), 'build:\n  steps: []\n');
    const withConfig = nativeSurface('android', root).hash;
    writeFileSync(join(root, '.eas', 'build', 'ios-x.yml'), 'build:\n  steps: [eas/checkout]\n');
    expect(nativeSurface('android', root).hash).not.toBe(withConfig);
  });

  it('an Android-only package, its plugin and its runtimeVersion change the Android surface and leave the iPhone one alone', () => {
    const root = mkdtempSync(join(tmpdir(), 'surface-'));
    const pkg = (name: string, folders: string[], files: string[] = []) => {
      const dir = join(root, 'node_modules', name);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ version: '1.0.0' }));
      for (const f of folders) mkdirSync(join(dir, f), { recursive: true });
      for (const f of files) writeFileSync(join(dir, f), '');
    };
    pkg('both-native', ['android', 'ios']);
    pkg('widget-native', ['android']);
    pkg('kit-native', ['ios'], ['Kit.podspec']);
    pkg('shared-cpp', ['android', 'cpp']);
    pkg('rn-like', ['ReactAndroid'], ['React-Core.podspec', 'react-native.config.js']);
    const write = (deps: string[], expo: object) => {
      writeFileSync(join(root, 'package.json'), JSON.stringify({ dependencies: Object.fromEntries(deps.map((d) => [d, '*'])) }));
      writeFileSync(join(root, 'app.json'), JSON.stringify({ expo: { runtimeVersion: '3', ...expo } }));
    };
    expect(nativePlatforms(join(root, 'node_modules', 'widget-native'))).toEqual(['android']);
    expect(nativePlatforms(join(root, 'node_modules', 'kit-native'))).toEqual(['ios']);
    expect(nativePlatforms(join(root, 'node_modules', 'shared-cpp'))).toEqual(['android', 'ios']);
    // react-native itself: podspecs, ReactAndroid/ and a react-native.config.js, so both.
    expect(nativePlatforms(join(root, 'node_modules', 'rn-like'))).toEqual(['android', 'ios']);

    write(['both-native', 'kit-native'], { plugins: ['both-native', ['kit-native', { a: 1 }]], ios: { bundleIdentifier: 'x' } });
    const before = { android: nativeSurface('android', root), ios: nativeSurface('ios', root) };
    write(['both-native', 'kit-native', 'widget-native'], {
      plugins: ['both-native', ['kit-native', { a: 1 }], ['widget-native', { widgets: [{ name: 'W' }] }]],
      ios: { bundleIdentifier: 'x' },
      android: { runtimeVersion: '4' },
    });
    const after = { android: nativeSurface('android', root), ios: nativeSurface('ios', root) };
    expect(after.ios.hash).toBe(before.ios.hash);
    expect(after.ios.runtimeVersion).toBe('3');
    expect(after.android.hash).not.toBe(before.android.hash);
    expect(after.android.runtimeVersion).toBe('4');
    expect(Object.keys(after.android.packages).sort()).toEqual(['both-native', 'widget-native']);
    expect(Object.keys(after.ios.packages).sort()).toEqual(['both-native', 'kit-native']);
    // A change in the iPhone's own key or its plugin's options still moves the iPhone surface, and not Android's.
    write(['both-native', 'kit-native', 'widget-native'], {
      plugins: ['both-native', ['kit-native', { a: 2 }], ['widget-native', { widgets: [{ name: 'W' }] }]],
      ios: { bundleIdentifier: 'x' },
      android: { runtimeVersion: '4' },
    });
    expect(nativeSurface('ios', root).hash).not.toBe(after.ios.hash);
    expect(nativeSurface('android', root).hash).toBe(after.android.hash);
  });

  it('reads one pair per platform, and an earlier one-pair file as no record', () => {
    const dir = mkdtempSync(join(tmpdir(), 'record-'));
    const file = join(dir, 'pairs.json');
    writeFileSync(file, JSON.stringify({ android: { runtimeVersion: '4', hash: 'a' }, ios: { runtimeVersion: '3', hash: 'i' } }));
    expect(readRecorded('android', file)).toEqual({ runtimeVersion: '4', hash: 'a' });
    expect(readRecorded('ios', file)).toEqual({ runtimeVersion: '3', hash: 'i' });
    writeFileSync(file, JSON.stringify({ runtimeVersion: '3', hash: 'both' }));
    expect(readRecorded('android', file)).toBeNull();
    expect(readRecorded('ios', file)).toBeNull();
    expect(readRecorded('ios', join(dir, 'none.json'))).toBeNull();
  });

  it('tells the maintainer what to do', () => {
    const changed = tripwire({ platform: 'android', runtimeVersion: '1', hash: 'new', packages: {} }, { runtimeVersion: '1', hash: 'old' });
    expect(changed).toMatch(/Raise expo.android.runtimeVersion in app.json \(for example to "2"\)/);
    expect(changed).toMatch(/Rebuild and reinstall the Android app/);
    expect(changed).toMatch(/HEALTHCAL_RECORD_NATIVE=1 npx vitest run/);
    expect(tripwire({ platform: 'ios', runtimeVersion: '2', hash: 'new', packages: {} }, { runtimeVersion: '1', hash: 'old' })).toMatch(/record the new pair/);
    expect(tripwire({ platform: 'ios', runtimeVersion: '1', hash: 'same', packages: {} }, { runtimeVersion: '1', hash: 'same' })).toBeNull();
  });
});
