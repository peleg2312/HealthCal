/**
 * No screen says Apple Health sync exists unless a build can do it: the flag
 * follows adapter.ios.ts (the binding, so the flag is true), and the words
 * follow the flag. The `false` words are not shown in this app any more; they
 * are checked so turning the flag off stays one change.
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

  it('without the iPhone binding (not shown since the library is bound): Android only, and the iPhone says it cannot yet', () => {
    const web = syncReach('web', false, false);
    const phone = syncReach('ios', false, false);
    for (const r of [web, phone]) {
      expect(`${r.profile} ${r.header} ${r.heading} ${r.body}`).not.toMatch(/iPhone and|Apple Health or/);
      expect(r.heading).toBe('Automatic on Android');
    }
    expect(web.profile).toBe('In the Android app');
    expect(phone.profile).toBe('Not in the iPhone app yet');
    expect(phone.here).toBe('This version of the iPhone app cannot read Apple Health yet. Here, import the Health app’s export or the files Garmin Connect exports.');
    expect(web.here).toBe('A browser has no health data. Here, import the Health app’s export or the files Garmin Connect exports.');
    expect(storesRead(false)).toEqual({ from: 'Health Connect on Android', notBack: 'Health Connect' });
  });

  it('with the iPhone side bound (what the app shows): both phones, not a sideloaded copy, and an iPad without Health says so', () => {
    expect(syncReach('web', false, true)).toMatchObject({ profile: 'In the iPhone and Android apps', heading: 'Automatic on iPhone and Android' });
    expect(syncReach('web', false).body).toBe(
      'There, workouts from Garmin Connect and other apps arrive by themselves through Apple Health or Health Connect, with your watch’s calories. An iPhone copy installed with a sideloading tool cannot read Apple Health.',
    );
    expect(syncReach('ios', true, true).here).toBe('Apple Health is not available on this device. Here, import the Health app’s export or the files Garmin Connect exports.');
    expect(storesRead(true).from).toBe('Health Connect on Android or Apple Health on iPhone');
  });
});
