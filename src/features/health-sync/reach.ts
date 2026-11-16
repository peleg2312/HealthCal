/**
 * Where automatic sync works today, in the words every screen uses for it.
 *
 * The iPhone app can read Apple Health only once its native library is
 * installed and `adapter.ios.ts` is the binding (docs/health-sync.md,
 * "Finishing the iPhone side"). Until then no build reads Apple Health, so no
 * screen may say that it does: the Profile row, the sync screen where there is
 * no health store, and the privacy paragraph on About all read this one flag.
 * reach.test.ts fails when the flag and adapter.ios.ts disagree, so turning the
 * iPhone side on changes the words in the same change. Pure.
 */

/** True once adapter.ios.ts loads @kingstinct/react-native-healthkit. */
export const APPLE_HEALTH_IN_APP = false;

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
 * The words for a build that cannot sync. `os` is Platform.OS; `hasStore` is
 * whether this build has a health-store adapter at all (an iPhone build with
 * the library, on an iPad without Apple Health, has one but cannot use it).
 */
export function syncReach(os: string, hasStore: boolean, appleReady: boolean = APPLE_HEALTH_IN_APP): SyncReach {
  const files = 'Here, import the files Garmin Connect exports.';
  const here =
    os === 'ios'
      ? hasStore
        ? `Apple Health is not available on this device. ${files}`
        : `This version of the iPhone app cannot read Apple Health yet. ${files}`
      : `A browser has no health data. ${files}`;
  if (appleReady) {
    return {
      profile: 'In the iPhone and Android apps',
      header: 'Automatic, in the phone apps',
      heading: 'Automatic on iPhone and Android',
      body: 'There, workouts from Garmin Connect and other apps arrive by themselves through Apple Health or Health Connect, with your watch’s calories.',
      here,
    };
  }
  return {
    profile: os === 'ios' ? 'Not in the iPhone app yet' : 'In the Android app',
    header: 'Automatic, in the Android app',
    heading: 'Automatic on Android',
    body: 'There, workouts from Garmin Connect and other apps arrive by themselves through Health Connect, with your watch’s calories.',
    here,
  };
}

/** The privacy paragraph's first part on About: which stores are read. */
export function storesRead(appleReady: boolean = APPLE_HEALTH_IN_APP): { from: string; notBack: string } {
  return appleReady
    ? { from: 'Health Connect on Android or Apple Health on iPhone', notBack: 'Health Connect or Apple Health' }
    : { from: 'Health Connect on Android', notBack: 'Health Connect' };
}
