# Automatic workout sync and daily steps (Health Connect on Android, Apple Health on iPhone)

Garmin Connect, and other apps such as Samsung Health, Strava or Polar Flow, can write each workout to Android's **Health Connect** or to **Apple Health** on an iPhone (where an Apple Watch writes its workouts by itself). With one permission, HealthCal reads them from there and adds them to Train by themselves, with the calories the watch measured. No file export is needed. It also reads the day's **steps** and shows them on Train; steps are never added to the calorie budget (see "Steps").

Open it from **Profile > Workout sync** or **Train > Sync automatically** (route `/settings/health-sync`). The screen names Apple Health on an iPhone and Health Connect on Android. In the browser it says that automatic sync is in the Android app ("the iPhone and Android apps" once the iPhone side is finished, `reach.ts`) and points to the Garmin file import (`docs/garmin-import.md`); the browser never loads either native module.

The person has to switch sharing on in Garmin Connect too (Garmin Connect > settings > Health Connect, or > Connected apps > Apple Health on an iPhone). Only workouts recorded on a Garmin device are shared, according to Garmin's support pages as reported by the press.

**State of the iPhone side.** The Apple Health adapter, its mapping and every rule are built and tested, but the native library, `@kingstinct/react-native-healthkit`, is not installed in this repository yet (the install was refused by this session's permission settings), so an iPhone build still shows "This version of the iPhone app cannot read Apple Health yet". "Finishing the iPhone side" below lists the four steps that turn it on. Until then no screen says Apple Health sync exists: the Profile row, the sync screen in the browser and on the iPhone, and the privacy paragraph on About read one flag, `APPLE_HEALTH_IN_APP` in `src/features/health-sync/reach.ts`, and `reach.test.ts` fails when that flag and `adapter.ios.ts` disagree. Steps from Health Connect on Android work now.

## What is read

### Android: Health Connect

Five read permissions, declared in `app.json` (`android.permissions`) and requested by `READ_PERMISSIONS` in `src/features/health-sync/healthConnect.ts`:

| Permission | Used for |
|---|---|
| `READ_EXERCISE` | The workout: its type, start and end, zone offset, title, the app that wrote it and the device name. |
| `READ_ACTIVE_CALORIES_BURNED` | Energy above the device's resting rate inside the workout. Used when the workout has no total (see Calories). |
| `READ_TOTAL_CALORIES_BURNED` | Energy including resting inside the workout: the session's total, from which the net figure is worked out exactly as for a Garmin file. |
| `READ_DISTANCE` | Distance inside the workout. |
| `READ_STEPS` | Steps per day for Train, as Health Connect totals them (see "Steps"). Added after the first four: a phone that allowed those four is asked for steps only when the person taps "Allow" on the sync screen's steps row. |

Nothing else: no heart rate, sleep, weight, location or routes, no writing, no background reading and no `READ_HEALTH_DATA_HISTORY` (so Health Connect gives at most the 30 days before the permission was first granted). The person can allow only some of the five: with exercise alone, workouts are added with the app's own calorie estimate.

Energy and distance are read **only inside each workout's own interval and only from the app that wrote that workout** (`aggregateRecord` with the session's time range and `dataOriginFilter`). All-day energy is never imported. An aggregate whose `dataOrigins` does not include the workout's own app is ignored, and so is a total on its own that works out below 1.5 MET (Health Connect can answer a total-energy question with a resting estimate).

### iPhone: Apple Health (HealthKit)

Five read types, asked for by `READ_TYPES` in `src/features/health-sync/healthKit.ts` with `requestAuthorization({ toRead })`:

| HealthKit type | Used for |
|---|---|
| `HKWorkoutTypeIdentifier` | The workout: its activity type, start and end, the app that recorded it (`sourceRevision.source`), its device, and its metadata (`HKTimeZone`, `HKIndoorWorkout`, `HKSwimmingLocationType`). |
| `HKQuantityTypeIdentifierActiveEnergyBurned` | The workout's active energy (`workout.getStatistic(ActiveEnergyBurned)`, else `totalEnergyBurned`, which Apple documents as "the total active energy burned during the workout"). |
| `HKQuantityTypeIdentifierDistanceWalkingRunning`, `HKQuantityTypeIdentifierDistanceCycling` | Distance, when the workout has no `totalDistance` of its own. |
| `HKQuantityTypeIdentifierStepCount` | Steps per day for Train, as HealthKit's statistics total them (see "Steps"). |

Nothing to write (`toShare` is never passed, and the app has no `NSHealthUpdateUsageDescription`), no background delivery (the config plugin's `background: false`), no basal energy, heart rate, sleep, weight, routes or clinical records. HealthKit never tells an app whether a read was refused (a refused type simply returns nothing): once the question has been asked (`getRequestStatusForAuthorization` answers "unnecessary"), everything counts as readable and a refused type shows as "None in Apple Health". The screen says where to allow it: the Health app, Sharing, Apps, HealthCal. For the same reason HealthCal cannot honour a refused Active Energy read: a workout's own `totalEnergyBurned` is part of the workout sample and may come with it anyway, so the explanation sheet says so ("A workout can carry its own calorie total, which may still come with it when active energy is off; turn off workouts to keep them out") instead of promising an estimate.

Workouts from Apple's own devices carry the person's device name ("Dana's Apple Watch") and a source id with the device's UUID, `com.apple.health.<UUID>`: the iPhone's own sensors (and the Fitness app on it) as well as an Apple Watch. The kind of device comes from the sample's `sourceRevision.productType` ('Watch6,1', 'iPhone15,2'): a watch is kept as `com.apple.health.watch` ("Apple Watch"), the iPhone as `com.apple.health.iphone` ("iPhone"), and one without a product type as `com.apple.health.device` ("Apple Health"), so neither the name nor the UUID is saved in a record (`appleOrigin` in `origins.ts`).

### Steps

- **Shown, never counted as calories.** Steps appear as one line in Train's week card ("8,432 steps today, 7,950 a day this week"; for an earlier week "7,950 steps a day that week") and on the sync screen. They are never added to the budget: the activity level the budget is built on already counts everyday walking, and a walk logged or synced as a workout adds its own net calories, so adding steps would count the same walking twice. The sync screen says this once, in its explanation.
- **One count where apps overlap, and it is the store's own.** The phone and a watch (or Samsung Health and Google Fit) count the same steps. HealthCal does not merge samples itself: it asks the store for a total per day, and the store keeps one count by its own source priority, so the number on Train is the store's figure for that day (on an iPhone, the Health app's). On Android that is `aggregateGroupByPeriod({ recordType: 'Steps', timeRangeSlicer: { period: 'DAYS', length: 1 } })` (`COUNT_TOTAL` per day, `stepDaysFromPeriods` in `healthConnect.ts`); on an iPhone `queryStatisticsCollectionForQuantity('HKQuantityTypeIdentifierStepCount', ['cumulativeSum'], <first midnight>, { day: 1 })` (`stepDaysFromStatistics` in `healthKit.ts`). An earlier version spread samples over 15-minute slots and kept the largest app per slot; a review showed it counted a walk 1.75 times when one app wrote it in 15-minute pieces and another as one hour, so it was replaced.
- **The day is the phone's own calendar day**, as everywhere in the app, and both stores cut days the same way: Health Connect turns the range into local date-times in the phone's zone and names each period by its local start ('2026-11-12T00:00'); HealthKit's collection is anchored at the first day's local midnight with a one-day interval in the phone's calendar, and each interval is named by the day its middle falls on (so the days around a clock change keep their dates). A day with no steps has no entry and is left out of the average (not counted as 0). The average is over the week's earlier days, since today is not over. Under 360 px the line leaves out "this week" ("8,432 steps today, 7,950 a day"), so it stays one line; the spoken label keeps it.
- **35 days, on this phone only.** Steps are kept with the sync's memory under `healthcal-health-sync` (`steps: { days, readAt }`), the last 35 days, never in the synced store, the export, the account, the AI functions or the friends summary. Each sync re-reads the last three days (apps hand steps over late) or, after a pause, from the day before the last read; the first sync reads all 35 days. Switching sync off clears them.
- A failed or refused steps read never fails the sync: the workouts are still saved, and the days already kept stay.

## When it runs

- When the app starts or comes to the foreground, and when the Train tab opens: at most once every 15 minutes after any attempt.
- "Sync now" on the sync screen, at any time.
- It lists the workouts of the last 30 days each time (one inexpensive call), and the steps since the last read (see "Steps"). The three energy and distance questions per workout are only asked where the answer can still change something: a new workout, or a stored estimate from the last 7 days. "Sync now" asks for all of them. (This replaces the "since the last sync minus a day" window: a short window would miss a workout that reaches Health Connect days late, and a better reading of a recent one.)
- A failure never shows a pop-up. The screen shows "The last sync did not finish", what went wrong in plain words, when it was tried and a "Try again" (or "Allow again" when the permission was taken away, or a store link when Health Connect is missing or too old). The diary is not changed by a failed sync.

## What it saves

Every workout runs through the **same pipeline as the Garmin file import** (`prepareImport`, `entriesToSave` and the duplicate rules in `src/features/import`), so a workout means the same thing whether it came from a FIT file, a CSV row or Health Connect.

- One workout is one record. The record id is the one the file import derives from the start instant (`importedEntryId(garminExternalId(start))`), so the same workout from a file and from Health Connect, on any of the person's devices, writes one record that syncs as one.
- The record is an ordinary `activities` entry with `source: 'health'`, `startedAt`, `measured` when the calories came from the device, and the app it came from in `externalId` (`garmin:<start>` for Garmin Connect, on Android or iPhone, exactly what the file import writes; `health:<package or bundle id>:<start>` for any other app, `health:com.apple.health.watch:<start>` for an Apple Watch). Train shows "From Garmin Connect · measured" or "From Apple Watch · measured" under it. So a Garmin file, Health Connect on an Android phone and Apple Health on an iPhone write one record for one workout, and it reaches the person's other devices through the normal sync.
- The day is the one where the workout was done: the record's own zone offset decides it, as the file import's offset does. A workout that crosses midnight belongs to the day it started.
- Exercise types map to the app's activities in `exerciseTypes.ts` (Health Connect) and `appleHealthTypes.ts` (HealthKit's `HKWorkoutActivityType`, with indoor cycling, walking and rowing and open-water swimming read from the workout's metadata), in the same spirit as `sports.ts` for Garmin's sports. A type that could be several activities ("Other workout", "Skating", "Paddling") or that the table does not know waits for the person to choose; the choice is remembered for later workouts of the same kind.
- New workouts are saved by themselves, with one toast ("2 workouts added from Garmin Connect") whose Undo removes exactly those.

### Calories (exercise adds net calories, never gross)

One workout gets one net figure whichever way it arrives (Health Connect, a FIT file, a CSV row), and the figure does not change when the other source arrives later.

| Health Connect has | Gross (the session's total) | Net (added to the day) |
|---|---|---|
| total (with or without active) | total | total minus the resting share: exactly the file import's rule for Garmin's total |
| only active | active plus the person's resting rate (BMR) for those minutes, which is what the device's own total would be | gross minus the resting share |
| neither | the app's own MET estimate, shown as an estimate with its range | the estimate's net |

Apple Health has no workout total with resting included (HealthCal does not read basal energy), so an Apple Health workout with active energy always takes the "only active" row, and one without takes the estimate. A workout that also arrives as a Garmin file keeps whichever figure was saved first, as for Health Connect: the record id is the same, and a stored measured reading is not replaced.

The resting share is the person's daily baseline (`formulaTdee`) / 1440 x the session's minutes, the same figure a hand-logged session uses. A total that is not above the active figure is not used.

Why the active figure is not added as it is: Health Connect's "active" energy is energy above the device's BMR, while the day's budget already holds the baseline (BMR times the everyday activity factor) for every minute, the workout's included. Adding "active" would count the gap between the two twice: about 30 kcal an hour for a typical person, about 350 kcal on a 9-hour hike. This differs from the first brief ("with both: net = active") and was changed after a review found the same Garmin run got 629 kcal from Health Connect and 600 from its FIT file.

### Duplicates

- **Two apps, one workout.** Sessions from different apps that cover the same time (half or more of the shorter one) are one workout. The one with measured calories is kept; when both or neither have them, Garmin Connect. If the phone's reading was already saved and the watch's reading arrives later, the watch's reading takes its place (in the same toast, with Undo), whether the two starts are seconds or minutes apart: it is saved under its own id (the id a Garmin file gives that run) and says "From Garmin Connect". If the person had changed the phone's reading (its length, effort or activity), the watch's reading waits in "Needs a look" instead, with Replace and Skip.
- **Logged by hand.** A workout that might be a session the person logged by hand (same day, same kind of activity, length within 25%, logged after the workout started) is **not** saved by itself. It waits in "Needs a look" on the sync screen with the file import's choices: Replace (the hand log is soft-deleted and its note moves to the workout), Keep both, or Skip. Train shows a small count ("Sync, 2 to look at").
- **Already stored.** Imported before from a file, or synced on another phone: nothing is added.
- **Deleted.** A workout the person deleted is never brought back: the soft-deleted record stays as a marker, and this phone also remembers what it saved, so it stays deleted even after the marker is gone. A skipped workout is not asked again.
- **A better reading later.** If a stored workout is an estimate and Health Connect now has its calories (or distance), the stored record is updated in place, keeping its id, day, activity and the person's notes, as the file import's update rule does. A record the person changed (its length, or its effort or activity, which turns measured calories into an estimate) is left alone, by the file import's own rule (`personEdited`). Undo puts the old numbers back and that change is not made again.
- **Accidental starts.** A session under a minute is left out (counted as unusable on the screen); one longer than a day is a recording that was never stopped and is left out too.

## What is stored, and where

- **The workouts** are ordinary `activities` records. Without an account they stay on the device. With an account they sync to the person's own private space on the HealthCal server, like every other session they log. They are part of the full export.
- **The switch and its memory** (on or off, last synced, the last error, the apps found, the "Needs a look" list, which workouts were saved or skipped, activity choices, and the last 35 days of steps) are kept **only on this phone**, in on-device storage under the key `healthcal-health-sync`, never in the synced settings: the permission belongs to one phone. It is cleared when the person signs out or erases the data on the device.
- **Never sent anywhere else.** Health data, steps included, is never sent to the AI food analysis function (it only receives the photo or description the person submits). Friends see only what the friends summary already allows for any workout: minutes, sessions, streak, and recent workouts as the catalogue name and emoji, length, distance and date. Never calories, heart rate, notes, the time of day, the device or the app it came from. No analytics, no ads, no third parties.

## Turning it off

Switch it off on the sync screen: nothing more is read, and the "Needs a look" list and the kept steps are cleared. Workouts already added stay in Train, where any of them can be deleted. To take the permission away as well, open Health Connect > App permissions > HealthCal, or on an iPhone the Health app > Sharing > Apps > HealthCal (the screen's "Open Health Connect" / "Open Apple Health" row opens it). If the permission is taken away while sync is on, the next sync says so on the screen and offers "Allow again".

## Before release: what the owner has to do

1. **Play Console, Health apps declaration** (Policy > App content). Declare Health Connect access: feature "Activity and fitness", and justify each of the five data types with the uses in the table above (for `READ_STEPS`: shows the person's daily step count on their training week; not added to calories, not uploaded, not shared). Fill in Data safety: health and fitness info, collected, stored on device and in the person's account when they create one, not shared, not used for ads. Request no more data types than these five; a new type means a new declaration (steps are new since the first declaration). Approval can take up to a week, and Health Connect's allow-list a few more days. Without approval, a released app shows "app can't access Health Connect".
2. **Privacy policy.** Google requires the same privacy policy on the Play listing and behind Health Connect's link to the app's policy. What exists today: the sync screen's own "What happens to this data" section (what is read, where it is kept, that nothing is written back, and that it never goes to the AI food analysis or to friends beyond the friends summary), and the short "Privacy" section on `/settings/about`, which names Health Connect, Apple Health and steps. What does not exist: a hosted privacy policy page (URL) and any handling of the rationale intent. The `react-native-health-connect` config plugin sends Health Connect's privacy-policy link (`androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE` on MainActivity, and the `ViewPermissionUsageActivity` alias on Android 14+) to the app's normal start screen. The owner has to provide a hosted policy that names the five data types (and, for the App Store, the five HealthKit types), how they are used and stored, and that they are not shared; add it to the Play listing; and add a small config plugin (or intent handling) so that link opens the policy, for example by routing that intent to `/settings/about` with the policy link. Reviewers may reject the app until this is done.
3. **A development build** (`eas build --profile development`, Android), then a check on a real phone with Garmin Connect paired to a watch (see below).

4. **App Store (iPhone).** The HealthKit lines App Review asks for (usage text, the list of what is read, no ads or data mining, no iCloud, nothing written) are in `docs/store-listing.md`, under "Apple Health (HealthKit), for the review".

## Finishing the iPhone side

Everything below `adapter.ios.ts` exists and is tested against fixtures in the library's own shapes. Four steps remain, all blocked here only because this session may not install packages:

1. Install the library: `npx expo install @kingstinct/react-native-healthkit react-native-nitro-modules`. Written against 16.2.0 (with `@react-native-healthkit/core` 16.2.0 as its dependency and `react-native-nitro-modules` 0.37.2 for the peer, `>=0.35`).
2. Add its config plugin to `app.json` `plugins` (it adds the `com.apple.developer.healthkit` entitlement and the usage text; `false` leaves out the write text and the background-delivery entitlement):
   ```json
   ["@kingstinct/react-native-healthkit", {
     "NSHealthShareUsageDescription": "HealthCal reads the workouts and steps you choose from Apple Health to fill your training week. It never writes to Apple Health and never sends this data to the AI functions.",
     "NSHealthUpdateUsageDescription": false,
     "background": false
   }]
   ```
3. Replace `src/features/health-sync/adapter.ios.ts` with the binding (type-checked against the library's published declarations, 16.2.0):
   ```ts
   /**
    * iPhone: workouts and steps from Apple Health, through @kingstinct/react-native-healthkit.
    * Only this file loads the native module (Metro picks it by its .ios extension; Android and
    * the browser get the files beside it). Everything it does is in healthKitAdapter.ts.
    */
   import {
     getRequestStatusForAuthorization,
     isHealthDataAvailable,
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
     { isHealthDataAvailable, getRequestStatusForAuthorization, requestAuthorization, queryWorkoutSamples, queryStatisticsCollectionForQuantity },
     { openHealth },
   );
   ```
4. Set `APPLE_HEALTH_IN_APP` to `true` in `src/features/health-sync/reach.ts` (`reach.test.ts` fails until it matches `adapter.ios.ts`), so the Profile row, the sync screen and About start naming Apple Health.

Then `npx tsc --noEmit`, `npx expo-doctor`, `npx expo export --platform ios` and `--platform web` (the web bundle must not contain the module), and an EAS iOS build.

The calls relied on, with where they are declared in the package: `isHealthDataAvailable`, `getRequestStatusForAuthorization`, `requestAuthorization` (src/specs/CoreModule.nitro.ts), `queryWorkoutSamples({ limit: 0, ascending, filter: { date } })` (src/specs/WorkoutsModule.nitro.ts; `limit` 0 means all), `workout.getStatistic(type, unit)` and `workout.dispose()` (src/specs/WorkoutProxy.nitro.ts and nitro-core's HybridObject), `queryStatisticsCollectionForQuantity('HKQuantityTypeIdentifierStepCount', ['cumulativeSum'], anchorDate, { day: 1 }, { unit: 'count', filter: { date } })` (src/specs/QuantityTypeModule.nitro.ts; ios/QuantityTypeModule.swift runs an `HKStatisticsCollectionQuery` and serialises each interval's `sumQuantity`, `startDate` and `endDate`), `sourceRevision.productType` (core src/types/Source.ts, passed through by ios/Serializers.swift), and the exports in src/healthkit.ios.ts.

## Installing on an iPhone with a free Apple ID (Sideloadly, AltStore)

What was checked, 16 November 2026:

- **Apple allows HealthKit for a free account.** Apple's table of capabilities by membership ("Supported capabilities (iOS)", developer.apple.com/help/account/reference/supported-capabilities-ios) marks HealthKit as available to all three: the Apple Developer Program, the Enterprise Program and "Apple Developer" (a free Apple Account that agreed to the developer agreement). So a free account can have it, through a provisioning profile whose App ID has HealthKit enabled, as Xcode does when the capability is added with a free personal team.
- **AltStore does not give it.** AltStore signs an app with the entitlements of the provisioning profile it fetches, not the app's own (AltSign, `AltSign/Signing/ALTSigner.mm`: the entitlements written into the signature are `profile.entitlements`, plus only commented-out "Psychic Paper" entitlements). Before fetching the profile it switches on App ID features for the app's entitlements, but AltSign maps only App Groups and Inter-App Audio to features (`AltSign/Capabilities/ALTCapabilities.m`, used by `updateFeatures` in AltStore's `AltStore/Operations/FetchProvisioningProfilesOperation.swift`). So the profile, and the signed app, have no `com.apple.developer.healthkit`.
- **Sideloadly says custom entitlements are for paid accounts.** Its changelog (sideloadly.io/changelog), v0.60.0: "Added support for custom app entitlements (Apple Developer Program only); this is a Patreon-exclusive feature." Its FAQ says nothing more about entitlements with a free Apple ID, and it is closed source.
- **So the free route cannot be fixed in the build recipe.** Giving the unsigned `.ipa` an ad-hoc signature with the HealthKit entitlement would not help: both tools replace the signature, and iOS refuses an entitlement that the installing profile does not grant. `.eas/build/ios-unsigned.yml` is unchanged except for a note.
- **What the app does instead.** HealthKit refuses such a copy with "Missing com.apple.developer.healthkit entitlement." The adapter turns that into `not-entitled`, and the sync screen says, before the switch is touched: "Apple Health is not available in this install", then "This copy was signed without Apple's Health permission, which sideloading tools leave out. Import Garmin files instead." with an "Import Garmin files" button. (It names the tools, not the free account: Apple's table allows HealthKit for a free account, and a free install through Xcode can have it.) Garmin files still work there.
- **What would work.** A build signed through an Apple Developer Program account (TestFlight, the App Store, or EAS internal distribution with a registered device), or Xcode on a Mac with the person's own free account and the HealthKit capability added (7-day signing, as for any free install).
- **Unknown until tried.** Whether a later Sideloadly honours HealthKit for free accounts (v0.71.0's "Support for free Apple Accounts is coming in the next version" is about Apple Watch apps, not entitlements), and whether HealthKit already refuses `getRequestStatusForAuthorization` without the entitlement (the screen then shows the message at once) or only `requestAuthorization` (it shows it when the switch is turned on). Both paths are handled and tested.

## Not yet proven on iPhone (needs the library installed, a signed build and a phone)

- That the library (16.2.0, Nitro 0.37.2) compiles in this app on Expo SDK 58 / React Native 0.88. Its peer dependencies (`react >=19`, `react-native >=0.79`) allow it; its own example is on React Native 0.81.
- The permission sheet, what `getRequestStatusForAuthorization` answers before and after it, and that a refused type returns empty.
- What Garmin Connect writes to Apple Health: the bundle id (`com.garmin.connect.mobile` is what Apple's App Store lookup gives for Garmin Connect, app 583446403), whether it writes a workout's active energy and distance as statistics or only as `totalEnergyBurned`/`totalDistance`, and whether the workout's start matches the FIT file's to the second (the shared record id depends on it, as on Android).
- The metadata's shapes as serialised by the library: `HKIndoorWorkout` as `true` or `1`, `HKSwimmingLocationType` as `2`, `HKTimeZone` as an IANA name. Each is read defensively; a different shape only loses the indoor or open-water variant or the zone.
- That the steps collection's totals match the Health app's day figures on a phone with a watch, and that `statistics()` lists only the intervals with data (an empty day is left out either way).
- That the iPhone's own steps and workouts come from `com.apple.health.<UUID>` with an `iPhone…` product type, as they are assumed to (the Watch with `Watch…`); a source without a product type is kept as "Apple Health" rather than guessed.

## Not yet proven on Android (needs an Android build and a phone)

- That `react-native-health-connect` 4.1.3 compiles with Expo SDK 58 / React Native 0.88 (its own example is one SDK behind). The JavaScript bundles for Android and web, `expo config --type introspect` shows the five permissions (steps included), the rationale intent filter, the permission-usage alias and `minSdkVersion 26`, and `expo-doctor` passes; the Gradle build has not run.
- The permission sheet and the refused and revoked paths on a real device.
- What Garmin Connect actually writes: the data origin string (`com.garmin.android.apps.connectmobile` is the Play Store package id), whether it writes active calories, total calories or both inside the session, the exercise type numbers it uses for each sport, and the zone offset.
- Behaviour after long stretches in the background (sync only runs when the app is opened; there is no background delivery).
- `aggregateGroupByPeriod` for steps on a real phone: that its days match Samsung Health's or Google Fit's day figures, and how many of the 35 days come back (without `READ_HEALTH_DATA_HISTORY`, Health Connect gives only the 30 days before the permission was first granted, so a new install shows at most about 30).

## Code

`src/features/health-sync/`:

| File | What it does |
|---|---|
| `types.ts` | The adapter interface: availability, what is granted, ask, read workouts in a range and the store's step totals per day. |
| `adapter.android.ts` | Health Connect through `react-native-health-connect`. The only file that loads that native module. |
| `adapter.ios.ts` | iPhone. "Not available here" until the HealthKit library is installed; then the binding above, the only file that loads that module. |
| `adapter.ts`, `unsupported.ts` | "Not available here" for the browser. |
| `healthConnect.ts` | Health Connect's shapes to plain ones (pure, typed against the library). |
| `healthKit.ts` | HealthKit's shapes (written out from the library's types) to plain ones: workouts, step totals per day, what may be read, errors (pure). |
| `healthKitAdapter.ts` | `createHealthKitAdapter(api, links)`: the iPhone adapter, taking the library as an argument so it is tested without it. |
| `appleHealthTypes.ts` | `HKWorkoutActivityType` to the app's activities, with indoor and open-water variants. |
| `steps.ts` | The store's step totals as kept, the 35-day window and re-reads, the line on Train. |
| `reach.ts` | Where sync works today, in the words the Profile row, the sync screen and About use; names Apple Health only once `adapter.ios.ts` loads the library. |
| `energy.ts` | The calorie rule above. |
| `convert.ts` | A Health Connect workout as the file import's `ImportedWorkout`; the record id. |
| `merge.ts` | Two apps, one workout. |
| `plan.ts` | `planSync`: what one sync adds, updates, replaces and asks about. |
| `engine.ts` | The run itself, with every dependency passed in. |
| `state.ts`, `store.ts` | The per-phone memory and its on-device storage. |
| `sync.ts` | Wiring to the app: foreground, Train, the toast; a development-only in-memory store for browser checks. |
| `fake.ts`, `testing.ts` | The in-memory health store the tests run against. |

Unit tests (`npx vitest run src/features/health-sync`) cover no calories, only total, only active, two apps overlapping, a workout crossing midnight, another time zone, a hand-logged duplicate, a deleted workout, a better reading later, permission taken away mid-sync, 500 workouts and an unknown exercise type; for Apple Health, the workout mapping in the library's shapes (Apple Watch, Garmin Connect deduplicating with a Garmin file and with Health Connect, indoor and open water, zones, units), the adapter against an in-memory library (the entitlement refusal, statistics only where asked, every workout freed) and the type table against the library's enum; for steps, Health Connect's day totals and HealthKit's statistics collection in the libraries' own shapes, the day of an interval around both daylight-saving changes, midnight in zones with half- and three-quarter-hour offsets, a day with no data, the 35-day window and re-reads, a failed or refused steps read, and the line on Train (long and short).

In a development build of the web app, `window.__healthcalHealthDemo = { workouts: [...], steps: [{ day: '2026-11-16', count: 8432 }], store: 'apple-health' }` set before the page loads swaps in the in-memory store, so the sync screen's states (with Apple Health's or Health Connect's words) and Train's steps line can be seen in a browser. `scripts/dev/states/health.cjs` uses it through the evidence states' `health` field; its Train states set the page's clock to this week's Thursday (`now`), so the two-part line is drawn whatever day the scan runs.
