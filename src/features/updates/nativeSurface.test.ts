/**
 * The runtime-version tripwire. An over-the-air update runs only on installed apps with the same
 * runtimeVersion (app.json), which is a fixed string here (see AGENTS.md). This fails when the
 * native surface changed while runtimeVersion did not, and says what to do. Record a new pair
 * (after raising runtimeVersion and rebuilding both apps) with:
 *
 *   HEALTHCAL_RECORD_NATIVE=1 npx vitest run src/features/updates/nativeSurface.test.ts
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { isNative, nativeSurface, readRecorded, RECORD_FILE, stable, tripwire } from './nativeSurface';

describe('runtime version tripwire', () => {
  const now = nativeSurface();

  if (process.env.HEALTHCAL_RECORD_NATIVE === '1') {
    writeFileSync(RECORD_FILE, `${JSON.stringify({ runtimeVersion: now.runtimeVersion, hash: now.hash }, null, 2)}\n`);
    console.log(`Recorded ${JSON.stringify({ runtimeVersion: now.runtimeVersion, hash: now.hash })} in ${RECORD_FILE}`);
    console.log(`Native packages: ${Object.entries(now.packages).map(([n, v]) => `${n}@${v}`).join(', ')}`);
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

  it('tells the maintainer what to do', () => {
    const changed = tripwire({ runtimeVersion: '1', hash: 'new', packages: {} }, { runtimeVersion: '1', hash: 'old' });
    expect(changed).toMatch(/Raise expo.runtimeVersion in app.json \(for example to "2"\)/);
    expect(changed).toMatch(/Rebuild and reinstall both apps/);
    expect(changed).toMatch(/HEALTHCAL_RECORD_NATIVE=1 npx vitest run/);
    expect(tripwire({ runtimeVersion: '2', hash: 'new', packages: {} }, { runtimeVersion: '1', hash: 'old' })).toMatch(/record the new pair/);
    expect(tripwire({ runtimeVersion: '1', hash: 'same', packages: {} }, { runtimeVersion: '1', hash: 'same' })).toBeNull();
  });
});
