# Automatic workout sync (Health Connect, Android)

Garmin Connect, and other apps such as Samsung Health, Strava or Polar Flow, can write each workout to Android's **Health Connect**. With one permission, HealthCal reads them from there and adds them to Train by themselves, with the calories the watch measured. No file export is needed.

Open it from **Profile > Workout sync** or **Train > Sync automatically** (route `/settings/health-sync`). On iPhone and in the browser the same screen says that automatic sync is in the Android app and points to the Garmin file import (`docs/garmin-import.md`). Apple Health is not read yet; the code leaves room for it (see "Code" below).

The person has to switch sharing on in Garmin Connect too (Garmin Connect > settings > Health Connect). Only workouts recorded on a Garmin device are shared, according to Garmin's support pages as reported by the press.

## What is read

Four read permissions, declared in `app.json` (`android.permissions`) and requested by `READ_PERMISSIONS` in `src/features/health-sync/healthConnect.ts`:

| Permission | Used for |
|---|---|
| `READ_EXERCISE` | The workout: its type, start and end, zone offset, title, the app that wrote it and the device name. |
| `READ_ACTIVE_CALORIES_BURNED` | Energy above resting inside the workout. This is what is added to the day. |
| `READ_TOTAL_CALORIES_BURNED` | Energy including resting inside the workout, kept beside it as the session's total. |
| `READ_DISTANCE` | Distance inside the workout. |

Nothing else: no heart rate, steps, sleep, weight, location or routes, no writing, no background reading and no `READ_HEALTH_DATA_HISTORY` (so Health Connect gives at most the 30 days before the permission was first granted). The person can allow only some of the four: with exercise alone, workouts are added with the app's own calorie estimate.

Energy and distance are read **only inside each workout's own interval and only from the app that wrote that workout** (`aggregateRecord` with the session's time range and `dataOriginFilter`). All-day energy is never imported. An aggregate whose `dataOrigins` does not include the workout's own app is ignored, and so is a total on its own that works out below 1.5 MET (Health Connect can answer a total-energy question with a resting estimate).

## When it runs

- When the app starts or comes to the foreground, and when the Train tab opens: at most once every 15 minutes after any attempt.
- "Sync now" on the sync screen, at any time.
- It lists the workouts of the last 30 days each time (one inexpensive call). The three energy and distance questions per workout are only asked where the answer can still change something: a new workout, or a stored estimate from the last 7 days. "Sync now" asks for all of them. (This replaces the "since the last sync minus a day" window: a short window would miss a workout that reaches Health Connect days late, and a better reading of a recent one.)
- A failure never shows a pop-up. The screen shows "The last sync did not finish", what went wrong in plain words, when it was tried and a "Try again" (or "Allow again" when the permission was taken away, or a store link when Health Connect is missing or too old). The diary is not changed by a failed sync.

## What it saves

Every workout runs through the **same pipeline as the Garmin file import** (`prepareImport`, `entriesToSave` and the duplicate rules in `src/features/import`), so a workout means the same thing whether it came from a FIT file, a CSV row or Health Connect.

- One workout is one record. The record id is the one the file import derives from the start instant (`importedEntryId(garminExternalId(start))`), so the same workout from a file and from Health Connect, on any of the person's devices, writes one record that syncs as one.
- The record is an ordinary `activities` entry with `source: 'health'`, `startedAt`, `measured` when the calories came from the device, and the app it came from in `externalId` (`garmin:<start>` for Garmin Connect, exactly what the file import writes; `health:<package>:<start>` for any other app). Train shows "From Garmin Connect · measured" under it.
- The day is the one where the workout was done: the record's own zone offset decides it, as the file import's offset does. A workout that crosses midnight belongs to the day it started.
- Exercise types map to the app's activities in `exerciseTypes.ts`, in the same spirit as `sports.ts` for Garmin's sports. A type that could be several activities ("Other workout", "Skating", "Paddling") or that the table does not know waits for the person to choose; the choice is remembered for later workouts of the same kind.
- New workouts are saved by themselves, with one toast ("2 workouts added from Garmin Connect") whose Undo removes exactly those.

### Calories (exercise adds net calories, never gross)

| Health Connect has | Net (added to the day) | Gross (kept as the session's total) |
|---|---|---|
| active and total | active | total |
| only total | total minus the resting share of those minutes (as the file import does with Garmin's total) | total |
| only active | active | active plus the resting share |
| neither | the app's own MET estimate, shown as an estimate with its range | the estimate |

The resting share is the person's daily baseline / 1440 x the session's minutes, the same figure a hand-logged session uses. A total that is not above the active figure is not used.

### Duplicates

- **Two apps, one workout.** Sessions from different apps that cover the same time (half or more of the shorter one) are one workout. The one with measured calories is kept; when both or neither have them, Garmin Connect. If the phone's reading was already saved and the watch's reading arrives later, the watch's reading takes its place (in the same toast, with Undo).
- **Logged by hand.** A workout that might be a session the person logged by hand (same day, same kind of activity, length within 25%, logged after the workout started) is **not** saved by itself. It waits in "Needs a look" on the sync screen with the file import's choices: Replace (the hand log is soft-deleted and its note moves to the workout), Keep both, or Skip. Train shows a small count ("Sync, 2 to look at").
- **Already stored.** Imported before from a file, or synced on another phone: nothing is added.
- **Deleted.** A workout the person deleted is never brought back: the soft-deleted record stays as a marker, and this phone also remembers what it saved, so it stays deleted even after the marker is gone. A skipped workout is not asked again.
- **A better reading later.** If a stored workout is an estimate and Health Connect now has its calories (or distance), the stored record is updated in place, keeping its id, day, activity and the person's notes, as the file import's update rule does. A record whose length the person edited is left alone. Undo puts the old numbers back and that change is not made again.

## What is stored, and where

- **The workouts** are ordinary `activities` records. Without an account they stay on the device. With an account they sync to the person's own private space on the HealthCal server, like every other session they log. They are part of the full export.
- **The switch and its memory** (on or off, last synced, the last error, the apps found, the "Needs a look" list, which workouts were saved or skipped, and activity choices) are kept **only on this phone**, in on-device storage under the key `healthcal-health-sync`, never in the synced settings: the permission belongs to one phone. It is cleared when the person signs out or erases the data on the device.
- **Never sent anywhere else.** Health data is never sent to the AI food analysis function (it only receives the photo or description the person submits). Friends see only what the friends summary already allows for any workout: minutes, sessions, streak, and recent workouts as the catalogue name and emoji, length, distance and date. Never calories, heart rate, notes, the time of day, the device or the app it came from. No analytics, no ads, no third parties.

## Turning it off

Switch it off on the sync screen: nothing more is read, and the "Needs a look" list is cleared. Workouts already added stay in Train, where any of them can be deleted. To take the permission away as well, open Health Connect > App permissions > HealthCal (the screen has an "Open Health Connect" link). If the permission is taken away while sync is on, the next sync says so on the screen and offers "Allow again".

## Before release: what the owner has to do

1. **Play Console, Health apps declaration** (Policy > App content). Declare Health Connect access: feature "Activity and fitness", and justify each of the four data types with the uses in the table above. Fill in Data safety: health and fitness info, collected, stored on device and in the person's account when they create one, not shared, not used for ads. Request no more data types than these four; a new type means a new declaration. Approval can take up to a week, and Health Connect's allow-list a few more days. Without approval, a released app shows "app can't access Health Connect".
2. **Privacy policy.** Google requires the same privacy policy on the Play listing and behind Health Connect's link to the app's policy. What exists today: the short "Privacy" section on `/settings/about` in the app, which does not mention Health Connect yet. What does not exist: a hosted privacy policy page (URL) and any handling of the rationale intent. The `react-native-health-connect` config plugin sends Health Connect's privacy-policy link (`androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE` on MainActivity, and the `ViewPermissionUsageActivity` alias on Android 14+) to the app's normal start screen. The owner has to provide a hosted policy that names the four data types, how they are used and stored, and that they are not shared; add it to the Play listing; and add a small config plugin (or intent handling) so that link opens the policy, for example by routing that intent to `/settings/about` with the policy link. Reviewers may reject the app until this is done.
3. **A development build** (`eas build --profile development`, Android), then a check on a real phone with Garmin Connect paired to a watch (see below).

## Not yet proven (needs an Android build and a phone)

- That `react-native-health-connect` 4.1.3 compiles with Expo SDK 58 / React Native 0.88 (its own example is one SDK behind). The JavaScript bundles for Android and web, `expo config --type introspect` shows the four permissions, the rationale intent filter, the permission-usage alias and `minSdkVersion 26`, and `expo-doctor` passes; the Gradle build has not run.
- The permission sheet and the refused and revoked paths on a real device.
- What Garmin Connect actually writes: the data origin string (`com.garmin.android.apps.connectmobile` is the Play Store package id), whether it writes active calories, total calories or both inside the session, the exercise type numbers it uses for each sport, and the zone offset.
- Behaviour after long stretches in the background (sync only runs when the app is opened; there is no background delivery).

## Code

`src/features/health-sync/`:

| File | What it does |
|---|---|
| `types.ts` | The adapter interface: availability, what is granted, ask, read workouts in a range. |
| `adapter.android.ts` | Health Connect through `react-native-health-connect`. The only file that loads the native module. |
| `adapter.ios.ts`, `adapter.ts`, `unsupported.ts` | "Not available here" for iPhone and the browser. An Apple Health adapter replaces `adapter.ios.ts` and adds its type table beside `exerciseTypes.ts`; no rule changes. |
| `healthConnect.ts` | Health Connect's shapes to plain ones (pure, typed against the library). |
| `energy.ts` | The calorie rule above. |
| `convert.ts` | A Health Connect workout as the file import's `ImportedWorkout`; the record id. |
| `merge.ts` | Two apps, one workout. |
| `plan.ts` | `planSync`: what one sync adds, updates, replaces and asks about. |
| `engine.ts` | The run itself, with every dependency passed in. |
| `state.ts`, `store.ts` | The per-phone memory and its on-device storage. |
| `sync.ts` | Wiring to the app: foreground, Train, the toast; a development-only in-memory store for browser checks. |
| `fake.ts`, `testing.ts` | The in-memory health store the tests run against. |

Unit tests (`npx vitest run src/features/health-sync`) cover no calories, only total, only active, two apps overlapping, a workout crossing midnight, another time zone, a hand-logged duplicate, a deleted workout, a better reading later, permission taken away mid-sync, 500 workouts and an unknown exercise type.

In a development build of the web app, `window.__healthcalHealthDemo = { workouts: [...] }` set before the page loads swaps in the in-memory store, so the sync screen's states can be seen in a browser.
