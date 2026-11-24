/**
 * Where automatic sync works today, in the words every screen uses for it.
 *
 * The iPhone app reads Apple Health because its native library is installed
 * and `adapter.ios.ts` is the binding (docs/health-sync.md, "How the iPhone
 * side is bound"); a copy signed without the HealthKit entitlement says so on
 * the sync screen itself ('not-entitled'). The Profile row, the sync screen
 * where there is no health store, and the privacy paragraph on About all read
 * this one flag. reach.test.ts fails when the flag and adapter.ios.ts disagree,
 * so no screen names Apple Health unless a build can load it. Pure.
 */

/** True while adapter.ios.ts loads @kingstinct/react-native-healthkit (reach.test.ts holds the two together). */
export const APPLE_HEALTH_IN_APP = true;

export interface SyncReach {
  /** The Profile row's line where this build cannot sync. */
  profile: string;
  /** The sync screen's short line under its title, where this build cannot sync. */
  header: string;
  /** The card that says where it does work. */
  heading: string;
  body: string;
  /** What works here instead. */
  here: string;
}

/**
 * The words for a build that cannot sync: the browser, and an iPad without
 * Apple Health (the iPhone build has the adapter, `hasStore`, but cannot use
 * it there). `os` is Platform.OS; `hasStore` is whether this build has a
 * health-store adapter at all.
 */
export function syncReach(os: string, hasStore: boolean, appleReady: boolean = APPLE_HEALTH_IN_APP): SyncReach {
  // What works everywhere: the Health app's export (a snapshot, imported again whenever wanted) and Garmin's files.
  const files = 'Here, import the Health app’s export or the files Garmin Connect exports.';
  const here =
    os === 'ios'
      ? hasStore
        ? `Apple Health is not available on this device. ${files}`
        : // Not reached since adapter.ios.ts is the binding (every iPhone build has a store); kept for an iPhone build without the library, and reach.test.ts still checks it.
          `This version of the iPhone app cannot read Apple Health yet. ${files}`
      : `A browser has no health data. ${files}`;
  if (appleReady) {
    return {
      profile: 'In the iPhone and Android apps',
      // The screen's short line says where you are; the heading under it says where sync works (no word twice).
      header: 'Not available here',
      heading: 'Automatic on iPhone and Android',
      // "iPhone" means a copy with the HealthKit entitlement: AltStore and Sideloadly leave it out, and Impactor or xtool may keep
      // it (not yet tried; docs/health-sync.md, "Installing on an iPhone with a free Apple ID"), so the body says "may".
      body: 'There, workouts and nights of sleep from Garmin Connect and other apps arrive by themselves through Apple Health or Health Connect, with your watch’s calories. An iPhone copy installed with a sideloading tool may be signed without Apple’s Health permission; its Workout sync screen says so.',
      here,
    };
  }
  // The words for an app whose iPhone build does not load the library (APPLE_HEALTH_IN_APP false). Not shown
  // since the binding; kept so turning the flag off stays one change, and reach.test.ts still checks them.
  return {
    profile: os === 'ios' ? 'Not in the iPhone app yet' : 'In the Android app',
    header: 'Not available here',
    heading: 'Automatic on Android',
    body: 'There, workouts from Garmin Connect and other apps arrive by themselves through Health Connect, with your watch’s calories.',
    here,
  };
}

/** The privacy paragraph's first part on About: which stores are read (the `false` words are not shown since the binding; reach.test.ts checks them). */
export function storesRead(appleReady: boolean = APPLE_HEALTH_IN_APP): { from: string; notBack: string } {
  return appleReady
    ? { from: 'Health Connect on Android or Apple Health on iPhone', notBack: 'Health Connect or Apple Health' }
    : { from: 'Health Connect on Android', notBack: 'Health Connect' };
}
