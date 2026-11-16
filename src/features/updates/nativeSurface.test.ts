/**
 * The runtime-version tripwire. An over-the-air update runs only on installed apps with the same
 * runtimeVersion (app.json), which is a fixed string here (see AGENTS.md). This fails when the
 * native surface changed while runtimeVersion did not, and says what to do. Record a new pair
 * (after raising runtimeVersion and rebuilding both apps) with:
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

import { isNative, nativeSurface, readRecorded, RECORD_FILE, RECORD_VAR, recordRefusal, SAME_RUNTIME_VAR, stable, tripwire } from './nativeSurface';

describe('runtime version tripwire', () => {
  const now = nativeSurface();

  if (process.env[RECORD_VAR] === '1') {
    it('records the new pair', () => {
      const refused = recordRefusal(now, readRecorded(), process.env[SAME_RUNTIME_VAR] === '1');
      if (refused) throw new Error(refused);
      writeFileSync(RECORD_FILE, `${JSON.stringify({ runtimeVersion: now.runtimeVersion, hash: now.hash }, null, 2)}\n`);
      console.log(`Recorded ${JSON.stringify({ runtimeVersion: now.runtimeVersion, hash: now.hash })} in ${RECORD_FILE}`);
      console.log(`Native packages: ${Object.entries(now.packages).map(([n, v]) => `${n}@${v}`).join(', ')}`);
    });
  }

  it('matches the pair recorded for this runtimeVersion', () => {
    const problem = tripwire(now, readRecorded());
    if (problem) throw new Error(problem);
  });

  it('counts packages with native code and leaves pure JavaScript out', () => {
    for (const name of ['expo', 'expo-updates', 'react-native', 'react-native-health-connect', '@kingstinct/react-native-healthkit', 'expo-modules-core']) {
      expect(now.packages[name], name).toBeTruthy();
    }
    for (const name of ['date-fns', 'zustand', 'fflate', 'lucide-react-native', '@supabase/supabase-js', 'react']) {
      expect(now.packages[name], name).toBeUndefined();
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
    const now = { runtimeVersion: '1', hash: 'new', packages: {} };
    expect(recordRefusal(now, { runtimeVersion: '1', hash: 'old' }, false)).toMatch(/Raise expo.runtimeVersion/);
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
    const first = nativeSurface(root);
    expect(Object.keys(first.packages).sort()).toEqual(['codegen-only', 'dev-native', 'opt-native', 'peer-native']);
    // A version bump or an update-carried key leaves it alone; a native key does not.
    write({ dependencies: { 'js-lib': '*', 'codegen-only': '*' }, devDependencies: { 'dev-native': '*' } }, { scheme: 'a', version: '1.0.1', extra: { x: 1 } });
    expect(nativeSurface(root).hash).toBe(first.hash);
    for (const key of [{ scheme: 'b' }, { orientation: 'landscape' }, { updates: { url: 'other' } }, { name: 'Other' }]) {
      write({ dependencies: { 'js-lib': '*', 'codegen-only': '*' }, devDependencies: { 'dev-native': '*' } }, { scheme: 'a', version: '1.0.0', ...key });
      expect(nativeSurface(root).hash, JSON.stringify(key)).not.toBe(first.hash);
    }
    // A local config plugin is hashed by its source, not only its path.
    mkdirSync(join(root, 'plugins'));
    writeFileSync(join(root, 'plugins', 'withThing.js'), 'module.exports = (c) => c;');
    write({ dependencies: {} }, { plugins: [['./plugins/withThing', { a: 1 }]] });
    const before = nativeSurface(root).hash;
    writeFileSync(join(root, 'plugins', 'withThing.js'), 'module.exports = (c) => ({ ...c, name: "x" });');
    expect(nativeSurface(root).hash).not.toBe(before);
    // So is a custom EAS build config (how an installed app was built and signed).
    mkdirSync(join(root, '.eas', 'build'), { recursive: true });
    writeFileSync(join(root, '.eas', 'build', 'ios-x.yml'), 'build:\n  steps: []\n');
    const withConfig = nativeSurface(root).hash;
    writeFileSync(join(root, '.eas', 'build', 'ios-x.yml'), 'build:\n  steps: [eas/checkout]\n');
    expect(nativeSurface(root).hash).not.toBe(withConfig);
  });

  it('tells the maintainer what to do', () => {
    const changed = tripwire({ runtimeVersion: '1', hash: 'new', packages: {} }, { runtimeVersion: '1', hash: 'old' });
    expect(changed).toMatch(/Raise expo.runtimeVersion in app.json \(for example to "2"\)/);
    expect(changed).toMatch(/Rebuild and reinstall both apps/);
    expect(changed).toMatch(/HEALTHCAL_RECORD_NATIVE=1 npx vitest run/);
    expect(tripwire({ runtimeVersion: '2', hash: 'new', packages: {} }, { runtimeVersion: '1', hash: 'old' })).toMatch(/record the new pair/);
    expect(tripwire({ runtimeVersion: '1', hash: 'same', packages: {} }, { runtimeVersion: '1', hash: 'same' })).toBeNull();
  });
});
