/**
 * No screen says Apple Health sync exists before a build can do it: the flag
 * follows adapter.ios.ts, and the words follow the flag.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { APPLE_HEALTH_IN_APP, storesRead, syncReach } from './reach';

describe('where sync works', () => {
  it('says Apple Health only when adapter.ios.ts loads the HealthKit library', () => {
    const ios = readFileSync(join(__dirname, 'adapter.ios.ts'), 'utf8');
    // An import statement at the start of a line (the file's comment quotes the binding, indented).
    const loadsLibrary = /^import[^;]*from ['"]@kingstinct\/react-native-healthkit['"]/m.test(ios);
    expect(APPLE_HEALTH_IN_APP).toBe(loadsLibrary);
  });

  it('without the iPhone side: Android only, and the iPhone says it cannot yet', () => {
    const web = syncReach('web', false, false);
    const phone = syncReach('ios', false, false);
    for (const r of [web, phone]) {
      expect(`${r.profile} ${r.header} ${r.heading} ${r.body}`).not.toMatch(/iPhone and|Apple Health or/);
      expect(r.heading).toBe('Automatic on Android');
    }
    expect(web.profile).toBe('In the Android app');
    expect(phone.profile).toBe('Not in the iPhone app yet');
    expect(phone.here).toBe('This version of the iPhone app cannot read Apple Health yet. Here, import the files Garmin Connect exports.');
    expect(web.here).toBe('A browser has no health data. Here, import the files Garmin Connect exports.');
    expect(storesRead(false)).toEqual({ from: 'Health Connect on Android', notBack: 'Health Connect' });
  });

  it('with the iPhone side: both phones, and an iPad without Health says so', () => {
    expect(syncReach('web', false, true)).toMatchObject({ profile: 'In the iPhone and Android apps', heading: 'Automatic on iPhone and Android' });
    expect(syncReach('ios', true, true).here).toBe('Apple Health is not available on this device. Here, import the files Garmin Connect exports.');
    expect(storesRead(true).from).toBe('Health Connect on Android or Apple Health on iPhone');
  });
});
