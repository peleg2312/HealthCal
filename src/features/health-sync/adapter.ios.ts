/**
 * iPhone: workouts, steps and sleep from Apple Health, through @kingstinct/react-native-healthkit.
 * Only this file loads the native module (Metro picks it by its .ios extension; Android and
 * the browser get the files beside it). Everything it does is in healthKitAdapter.ts.
 *
 * reach.ts says on every screen that the iPhone app reads Apple Health because this file is
 * the binding (APPLE_HEALTH_IN_APP; reach.test.ts fails when the two disagree). A copy signed
 * without Apple's HealthKit entitlement still answers 'not-entitled' (docs/health-sync.md).
 */
import {
  getRequestStatusForAuthorization,
  isHealthDataAvailable,
  queryCategorySamples,
  queryStatisticsCollectionForQuantity,
  queryWorkoutSamples,
  requestAuthorization,
} from '@kingstinct/react-native-healthkit';
import { Linking } from 'react-native';

import { createHealthKitAdapter } from './healthKitAdapter';

/** The Health app, where Sharing > Apps > HealthCal lists what may be read; the app's own settings if it cannot be opened. */
function openHealth(): void {
  Linking.openURL('x-apple-health://').catch(() => Linking.openSettings().catch(() => {}));
}

export const adapter = createHealthKitAdapter(
  { isHealthDataAvailable, getRequestStatusForAuthorization, requestAuthorization, queryWorkoutSamples, queryStatisticsCollectionForQuantity, queryCategorySamples },
  { openHealth },
);
