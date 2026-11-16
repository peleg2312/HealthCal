/**
 * iPhone: the health-store adapter for Apple Health.
 *
 * The Apple Health adapter is built and tested (healthKitAdapter.ts, with the
 * mapping in healthKit.ts), but this build does not contain its native library,
 * @kingstinct/react-native-healthkit, so the iPhone answers "not available
 * here" until the library is installed. Installing it replaces this file's one
 * line with the binding in docs/health-sync.md ("Finishing the iPhone side"):
 *
 *   import { getRequestStatusForAuthorization, isHealthDataAvailable, queryStatisticsCollectionForQuantity, queryWorkoutSamples, requestAuthorization } from '@kingstinct/react-native-healthkit';
 *   ...
 *   export const adapter = createHealthKitAdapter({ ... }, { openHealth });
 *
 * In the same change, set APPLE_HEALTH_IN_APP in reach.ts to true (reach.test.ts
 * fails until it is), so the screens start naming Apple Health.
 *
 * Metro picks this file by its .ios extension, so the browser (adapter.ts) and
 * Android (adapter.android.ts) never load the HealthKit module.
 */
export { unsupportedAdapter as adapter } from './unsupported';
