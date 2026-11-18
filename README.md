# HealthCal

A calorie, nutrition, training and hydration tracker for iOS, Android and the web, built from one Expo (React Native) codebase.

HealthCal works fully on the device with no account. Connecting the optional Supabase backend adds sign-in, cross-device sync and AI meal analysis with Claude.

## What it does

- **Personal targets from your body data.** Resting metabolism from Mifflin-St Jeor, or the lean-mass Katch-McArdle equation when you enter body fat %. Calorie budget, protein / carbs / fat and a water goal follow from your goal and pace, with a safety floor.
- **Food diary.** Search 341 bundled foods (321 of them checked against USDA records) and Open Food Facts products, scan barcodes, quick-add calories, create your own foods, save meals, copy a previous day. Recents, favourites and "your usual for this meal" make repeat logging one tap, and the amount can be adjusted in place after adding.
- **AI meal analysis.** Photograph or describe a meal; Claude returns an itemised, editable estimate with a calorie range and a prompt about hidden fats.
- **108 activities.** Volleyball, basketball, yoga, running, swimming, strength and more, with calorie burn from the 2024 Compendium of Physical Activities MET values and your weight. Only net calories (above resting) are added to the budget, so nothing is counted twice. A set-by-set strength logger with rest timer, personal records and saved routines is included.
- **Garmin workouts.** Import the files Garmin Connect exports (FIT, TCX, GPX, the Activities CSV, or a ZIP of them): each workout arrives with its real duration, distance and the calories the watch measured, and only the part above resting is added to the day. See `docs/garmin-import.md`.
- **Automatic workout sync (Health Connect on Android, Apple Health on iPhone).** With one permission, HealthCal reads the workouts that Garmin Connect and other apps save to Health Connect or Apple Health and adds them by themselves when you open the app, with the watch's calories and an Undo. It reads workouts, their calories and distance, and daily steps only, writes nothing back, and asks first about anything that might repeat a session you logged by hand. Needs a build of the app (not Expo Go); on iPhone, one signed with Apple's HealthKit permission (through the paid Apple Developer Program, or from Xcode on a Mac with your own Apple ID), and the iPhone side has not yet run on a phone. In the browser, and in an iPhone copy sideloaded with AltStore or Sideloadly (which leave out Apple's Health permission), use the file import (Garmin files or the Health app's export). See `docs/health-sync.md`, which also lists what has to be declared in Play Console before release.
- **Friends.** Add people by a code and see each other's week: active minutes, sessions, streak and recent workouts, with a cheer for a workout. Each of those can be switched off, and calories, weight and food are never shared. Needs an account.
- **Hydration, weight, body composition, sleep and fasting** trackers.
- **Weight trend and adaptive expenditure.** A smoothed trend line ignores day-to-day water noise; once enough intake and weigh-ins are logged, your real energy expenditure is estimated from your own data.
- **Reminders that carry live numbers** ("620 ml to go, about 3 glasses"), respect quiet hours and skip themselves when the goal is met.
- **Yesterday, first thing in the morning.** The first time you open the app between 4 am and noon, a short page starts your day: a greeting by name, a line about your streak or a record of your own when there is one, a quote of the day (real quotes, bundled in the app), the day before in four cups for calories, protein, water and last night's sleep with one plain sentence, your workout and steps, what went well and what to improve (facts with their numbers), and a short plan for today (water to go, active minutes left this week, a weigh-in or last night's sleep), each one tap from where it is done, with a button to log the meal that comes next. One tap closes it onto Today. It shows once a day, only after a day with something logged, never on the day you set up, and not when a reminder or a link opened the app. Turn it off, or open it at any time, in Profile ("Morning summary", "See yesterday").
- **Progress, insights and weekly recaps** built from your numbers: an overview grid, your usual ranges beside your targets, and a consistency calendar with weekly rhythm targets and a streak that forgives a missed day.
- **Its own look, in three themes.** The design is called Pour: every amount is a flat colour poured into an open cup with a level line on top, so what is left is visible above it. Dark, light and the pink Blossom theme (Profile, Appearance).
- No ads, no paywalls, full data export and import, account deletion in the app.

## Run it

Requirements: Node 20 or newer.

```bash
npm install
npm run web        # opens the app in a browser
npm start          # Expo dev server: scan the QR code with Expo Go, or press i / a for a simulator
```

Barcode scanning, the camera and scheduled notifications need a real device. Expo Go covers most of it; for full notification behaviour make a development build (`npx expo run:ios`, `npx expo run:android`, or `npx eas-cli build --profile development`).

```bash
npm run typecheck  # TypeScript, app and edge functions
npm run lint       # ESLint with the React Compiler rules
npm test           # unit tests (vitest)
npm run test:e2e   # a new user's first day in a real browser (needs `npm run web` running)
npm run test:sql   # the database migrations and policies on a throwaway local PostgreSQL
npm run build:web  # static web build in dist/
```

## Connect the backend (optional)

Without these steps the app keeps everything on the device, and the AI screen runs in a clearly labelled demo mode.

1. Create a project at [supabase.com](https://supabase.com) and install the [Supabase CLI](https://supabase.com/docs/guides/cli).
2. Link it and apply the schema:
   ```bash
   supabase link --project-ref <your-project-ref>
   supabase db push
   ```
   This applies both migrations in `supabase/migrations/`: the `profiles`, `records`, `ai_usage` and `ai_quota` tables with row-level security (each user can only read and write their own rows), the sync functions and the AI quota functions.
3. Deploy the AI function and give it your Anthropic API key. The key is stored only as a server-side secret and never ships in the app:
   ```bash
   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
   supabase functions deploy analyze-food
   supabase functions deploy food-search
   ```
   `food-search` is a small proxy the web build needs for searching packaged products by name (the Open Food Facts search service does not allow direct browser calls; phones call it directly).
   Optional secrets: `AI_DAILY_LIMIT` (analysis units per person per day, default 40; a careful pass counts as 5), `AI_GLOBAL_DAILY_LIMIT` (a ceiling across all users per day, default 3000, so a bug or abuse cannot run up an unbounded bill; for one person and a few friends 400 is plenty and caps a day at about half a dollar at the measured costs), `FOOD_MODEL` (default `claude-haiku-5-5`), `FOOD_MODEL_PRECISE` (default `claude-sonnet-5-5`), `FOOD_THINKING` and `FOOD_FORMAT` (see "What AI analysis costs").
   In the Supabase dashboard (Authentication, URL Configuration) add your site URL and the app's link scheme to the allowed redirect URLs, so password-reset links can return to the app.
4. Copy `.env.example` to `.env` and fill in the project URL and anon key from the Supabase dashboard (Project Settings, API), then restart the dev server.

### What AI analysis costs

The design keeps token use low without giving up accuracy:

- The app resizes each photo to 768 px on its long edge before upload. Vision input is billed by pixel area, so this is 300 to 800 input tokens instead of several thousand for a camera original.
- The smallest current Claude model answers by default, in the most compact form that measured accurate (below). A stronger model runs only when the user taps "Check again more carefully".
- The server validates every number (macros cannot outweigh the food, calories must agree with macros) before the app sees it.

Measured on 16 November 2026 with `scripts/ops/eval-food-ai.mjs` (the function's own code against the API: 20 typed meals and 5 photos, several rounds), at the published per-token prices. These are averages: most answers use fewer tokens and about one in six, where the model stops to think, several times more.

| Analysis | Model | Tokens in / out | Each | Per 1,000 |
| --- | --- | --- | --- | --- |
| Typed meal | `claude-haiku-5-5`, effort low | about 500 / 270 | $0.00018 | $0.18 |
| Photo, 768 px | the same | about 1,480 / 240 | $0.00027 | $0.27 |
| Careful pass, typed | `claude-sonnet-5-5`, effort medium | about 540 / 130 | $0.002 | $2.39 |
| Careful pass, photo at 1024 px | the same | about 1,730 / 280 | $0.006 | $6.28 |

Two answer forms are in use, each where it measured better:

- A typed meal is answered in a few plain lines (`I name | grams | kcal | ...`), so no schema is sent: $0.18 per 1,000 against $0.22 as JSON, with every round in range either way. The lines are read strictly: a bulleted line, a missing cell or a number with a unit means the whole answer is asked for once more as schema-checked JSON (about one answer in twenty-five), capped at 900 tokens and counted in the figures above. Nothing is guessed from a line that is nearly right.
- A photo is answered as schema-checked JSON with one-letter field names ($0.27 per 1,000; $0.30 with full names). The plain lines cost the same on photos once their second tries were counted, and judged a whole pizza a quarter smaller.

On that small set the default put 60 of 60 typed rounds and 30 of 30 photo rounds inside the calorie range a careful person would accept (typically within 3% of its middle for typed meals and 6% for photos). What it gets wrong is what a photo cannot show: the size of a whole dish with nothing beside it for scale, and look-alikes (lentils read as minced meat). The careful pass is better at look-alikes, for ten to twenty times the price, which is why it is a button and not the default.

Two switches, as function secrets, change the trade without a deploy:

- `FOOD_THINKING=off` is the cheapest setting for typed meals: $0.11 per 1,000. It is also measurably less accurate (54 of 60 typed rounds in range: eggs counted twice, a cooked weight priced as dry), so it is not the default.
- `FOOD_FORMAT=json` or `FOOD_FORMAT=lines` forces one answer form for everything.

Tried and not adopted, because they cost more or saved nothing a person would notice: effort medium on the small model (35 to 70% more per analysis, no measurable gain), prompt caching (the fixed part of the request is small and requests are minutes or hours apart, so it would mostly pay for cache writes) and smaller photos (three cents per 1,000 analyses, at a risk to portion judgement). Run the script again after changing the prompt, the model or the photo size: `ANTHROPIC_API_KEY=... node --experimental-transform-types scripts/ops/eval-food-ai.mjs` (40 requests, about one cent; `--show-misfits` prints any answer that did not keep the plain-lines form).

The function enforces a daily limit per person (kept against a hash of the email, so deleting and recreating an account does not reset it) and a ceiling across all users, records usage in `ai_usage`, and gives the allowance back when a request fails without being billed.

### Setting it up with the scripts

Two scripts do the steps above through Supabase's management API and then check the result:

```bash
SUPABASE_ACCESS_TOKEN=sbp_... node scripts/ops/provision-supabase.mjs   # create the project, apply migrations, deploy both functions,
                                                                         # allow the app's links, write .env (public URL and key only)
SUPABASE_SERVICE_ROLE_KEY=... node scripts/ops/verify-backend.mjs       # two throwaway accounts: sync, isolation, friends, both functions, deletion
```

The access token comes from supabase.com, Account, Access tokens. The Anthropic key is the one thing the script cannot set: add it in the dashboard page it prints. `verify-backend.mjs` needs the service-role key only when the project confirms email addresses on sign-up (the default), to create confirmed test accounts; it deletes them again.

### Testing without a live backend

Three checks run entirely on your machine:

```bash
npm test                              # 800+ unit tests: formulas, sync engine, reminders, search, AI validation, insights
npm run test:e2e                      # a new user's first day in a real browser (needs `npm run web` running);
                                      # every number is checked against an independent calculation
npm run test:sql                      # applies the migrations to a throwaway PostgreSQL 16 and tests row-level
                                      # security, last-write-wins sync, the AI quota and account deletion
```

Accounts, two-device sync and the AI request can be exercised against a local stand-in for Supabase:

```bash
EXPO_PUBLIC_SUPABASE_URL=http://localhost:54321 \
EXPO_PUBLIC_SUPABASE_ANON_KEY=mock-anon-key-for-local-end-to-end-tests \
EXPO_PUBLIC_E2E=1 \
  npx expo export --platform web --output-dir /tmp/healthcal-mock
node scripts/dev/mock-backend.cjs --static=/tmp/healthcal-mock --static-port=8090 &
node scripts/dev/e2e-backend.cjs      # sign-up, sign-in on a second device, sync both ways, AI, password reset,
                                      # sign-out with unsaved changes, delete account
```

`EXPO_PUBLIC_E2E=1` lets the browser tests read the app's state in a production build. Leave it unset in a build you ship.

The stand-in follows the same rules as the SQL, but it is not Supabase: run through sign-up, sync and one photo analysis once against your real project before relying on it.

## Ship it

```bash
npx eas-cli build --profile preview --platform android   # installable APK, built in Expo's cloud
npx eas-cli build --profile production --platform all    # store builds
npm run build:web                                        # host dist/ on any static host
```

Set a unique bundle identifier and package name in `app.json` before a store build.

### Getting it onto a phone today

The repository is linked to an Expo project (`app.json`: `owner`, `extra.eas.projectId`); the commands below need an Expo access token for that account in `EXPO_TOKEN`.

| Phone | How | Command | Limits |
|---|---|---|---|
| Android | An APK installed by hand | `bash scripts/ops/build-android-apk.sh` (builds on this machine, about 40 minutes the first time, 15 after) or the `preview` profile above | Signed with the template's debug key; a Play Store release needs its own key |
| iPhone, free, no computer | The web app added to the Home Screen from Safari | `node scripts/ops/deploy-web.mjs` publishes it to https://healthcal.expo.app | No reminders and no Health sync; the camera goes through Safari. Workouts and steps come in from the Health app's own export (Health app, your picture, Export All Health Data; then Train > Import, docs/health-sync.md) |
| iPhone, free, with a computer | An `.ipa` with no Apple signing, signed with the person's own Apple ID by a sideloading tool | `npx eas-cli@latest build -p ios --profile ios-unsigned` (`.eas/build/ios-unsigned.yml`) | Must be signed again every 7 days; three such apps per Apple ID; no Apple Health sync with Sideloadly or AltStore (they sign without the HealthKit entitlement, and the sync screen says so and offers the Health export import instead); Impactor or xtool may keep it, not yet tried (docs/health-sync.md) |
| iPhone, TestFlight or the App Store | A signed build | `npx eas-cli@latest build -p ios --profile production` | Needs an Apple Developer account; signed with the HealthKit entitlement, so this is the route for Apple Health sync (the library is installed and bound, and reads steps on an iPhone simulator; not yet run on a real phone; Xcode on a Mac with a free Apple ID can also sign a copy with it; docs/health-sync.md) |

`public/` holds what makes the web app installable (the manifest, the icons, the full-screen tags in `index.html`). The backend must allow the published address as a return address for sign-up and reset emails (Supabase: Authentication, URL configuration).

Store listing: the name, subtitle, descriptions, keywords and the owner's checklist are in `docs/store-listing.md`. The eight App Store and Google Play screenshots are in `store/`, and `node scripts/dev/store-frames.cjs` makes them again from the running app (contact sheet: `store/_sheet.png`).

### Fixes without reinstalling

The Android and iPhone apps take over-the-air updates through EAS Update (`expo-updates`, channel `production`). An update replaces the JavaScript, the screens and the bundled images; it cannot add a package with native code, a permission, an entitlement or any other native setting in `app.json`, which need a new build. An app downloads an update in the background when it starts and starts it at the next cold start, or earlier when it comes back to the front after five minutes or more away (a new calendar day alone is not enough) while a tab is showing with no sheet open, no sync running and everything saved, at most once every 6 hours and never into the same update twice. In the phone apps, Profile, About shows "Updated Nov 17" under the version and has a "Check for updates" button; the browser shows the version only. The web app is not affected (publish it with `deploy-web.mjs`).

```bash
EXPO_TOKEN=... node scripts/ops/publish-update.mjs --message "Fix the water total"   # --dry-run to see what it would do
```

`EXPO_TOKEN` is an access token from expo.dev (Account settings, Access tokens) for the account that owns the project (`owner` and `extra.eas.projectId` in `app.json`). The script publishes the current commit and refuses when the working tree has uncommitted changes, when `EXPO_TOKEN` is missing, when the runtime-version tripwire fails, or when the bundles it made hold the test hooks or lack a public setting. It makes the bundles itself with `expo export`, with exactly the `EXPO_PUBLIC_*` values in `eas.json` (`build.production.env`), `EXPO_PUBLIC_E2E=0` and no `.env` file, and uploads them as they are (`eas update --skip-bundler`), so neither a variable stored on the EAS dashboard nor a local `.env` file reaches the phones. A dry run makes the same export (a few minutes) and stops before the upload.

To check that an update arrived: open the app, close it fully, open it again (the first start downloads it, the second runs it), then Profile, About shows "Updated <the day it was published>". An app takes only an update published after the app itself was built: a build made later already holds newer code and answers "no update" to an older one (the first try at watching an update arrive failed for exactly this reason). To undo a bad update, publish the previous good commit again with the script, or roll the last update back with `npx eas-cli@latest update:rollback <update group id> --non-interactive` (the group id is printed by the publish; it republishes the group before it, or the installed code when there is none). Either way a phone takes the fix the same way as any update, at its next start.

The runtime version is the fixed string `expo.runtimeVersion` in `app.json`. An update reaches only installed apps built with the same one. Whenever a package with native code is added or upgraded, or a native setting in `app.json` changes, raise it, rebuild and reinstall both apps, and record the new pair (`HEALTHCAL_RECORD_NATIVE=1 npx vitest run src/features/updates/nativeSurface.test.ts`) before the next update. `nativeSurface.test.ts` fails until you do: it hashes every package with native code (wherever it comes from in `node_modules`), every key of `app.json` except those an update carries (`web`, `extra`, `owner`, `slug`, `version`, `experiments`), the source of local config plugins (`./plugins`) and the custom build configs in `.eas/build`. Image files are hashed by path, not content: a new icon needs a new build to show but cannot break an old one. Recording refuses a new hash under the runtime version already recorded; only when nothing native changed (the hash itself was changed) add `HEALTHCAL_RECORD_SAME_RUNTIME=1`. An app installed before updates were added has no updater and has to be replaced once by a build that has it. Expo's free plan covers updates for 1,000 monthly active users.

### Testing on a phone

The scripts under `scripts/dev` test the web build in a browser. The flows in `.maestro/` do the same on a real Android or iPhone build, driven by testID with [Maestro](https://maestro.mobile.dev), with a screenshot at each step:

- `first-day.yml`: setup with the keyboard on every field, food added to lunch and opened again, the four tabs and the sync screen.
- `health-and-about.yml` (after first-day): Workout sync turned on, the app's explanation, the system's permission screen (Apple Health or Health Connect), the sync screen and Train's steps line, then About and its version block with "Check for updates".
- `health-data-ios.yml` (iPhone only, best effort): types steps into the simulator's Health app, syncs, and looks for them on Train.

**On GitHub's machines, free.** The repository is public, so GitHub Actions' standard runners, macOS included, cost nothing. `.github/workflows/phone-test.yml` builds the app in Release (the JavaScript inside, no Metro; the Supabase settings from `eas.json`'s `build.production.env`) and runs the flows on an iPhone simulator (macOS 26, Xcode 26.4 or later) and an Android emulator (Android 15, x86_64; Health Connect is expected on this image, and the job log lists the health packages it found). It starts only by hand.

What the first runs showed (16 and 17 November 2026):

- Android 15 emulator: `first-day` and `health-and-about` pass in about two minutes each. Health Connect's own permission screen is answered ("Allow all", "Allow") and the sync screen then reads "On, last synced just now".
- iPhone 17 simulator, iOS 26.5: `first-day` and `health-and-about` pass: setup with the keyboard on every field, the diary, the tabs, Apple's Health access sheet ("Turn On All", "Allow") and a sync from an empty Apple Health. It is the first time the iPhone app ran anywhere.
- An update published to a test channel arrived on both: About reads "Updated Nov 16" and "Up to date" after the second start.
- `health-data-ios` showed the whole path once: 8,432 steps typed into the simulator's Health app were read through HealthKit and shown on the sync screen ("8,432 today, shown on Train") and on Train. Adding a workout by hand in the Health app did not go through, so reading a workout from Apple Health is still unproven.

Two things that cost a run each: GitHub's `macos-26` machines are not always free (the job waits 15 minutes and is cancelled without starting: start it again; `macos-15` cannot build this app, because its newest Xcode is 26.3 and expo-modules-jsi does not compile before 26.4), and on a cold simulator the first flow can lose Maestro's driver ("Device became unreachable"): start the run again with `app_run_id` and it passes. The system screens' labels in the flows are the ones these runs showed; they are still tapped as optional, and health-data-ios never fails the job.

```bash
# Actions tab > Phone test > Run workflow (choose the branch, platform, flows), or:
gh workflow run phone-test.yml --ref claude/health-fitness-app-17mku3 -f platform=both -f flows=all
# or the API (a token with Actions: write; the answer is HTTP 204 with no body):
gh api -X POST repos/peleg2312/HealthCal/actions/workflows/phone-test.yml/dispatches \
  -f ref=claude/health-fitness-app-17mku3 -f 'inputs[platform]=ios' -f 'inputs[flows]=first-day,health-and-about'
# (with curl: -H 'Authorization: Bearer <token>' -H 'Accept: application/vnd.github+json' and the same JSON body)

# Changed only a flow? Reuse the app an earlier run built (the number in its URL) and skip the 20 to 30 minute build.
# That run must have built the platform asked for (platform=both, or the same platform):
gh workflow run phone-test.yml --ref claude/health-fitness-app-17mku3 -f platform=android -f app_run_id=<run id>
```

Each run leaves, per phone, an artifact `phone-test-ios` / `phone-test-android`: every flow's screenshots, Maestro's output and debug files, on a failure the screen and its view hierarchy at that moment, the app's own log (the simulator's log for HealthCal and React Native, or logcat for the app's process), and `contact-<platform>.jpg`, one picture with every screenshot in a grid. The job log ends with one line per flow (passed, or failed with the step that failed), and the run's summary page shows the same table. Results and the built apps (`app-ios` and `app-android`, for `app_run_id`) are kept for 14 days. The iPhone build is signed to run locally on the simulator and is meant to fail if the HealthKit entitlement is missing from it. The test builds ask the update server for the channel `phone-test`, which has no updates, so they always run the commit's own JavaScript. To watch an update arrive, publish one to a channel of its own (`node scripts/ops/publish-update.mjs --channel ota-proof`) and start the run with `-f update_channel=ota-proof`: `first-day` starts the app from nothing and the update downloads behind it, `health-and-about` starts it again, and About then reads "Updated" with the day. Starting a run cancels a run of the same branch and platform that is still going.

```bash
# On Expo's cloud phones instead (an Android Emulator, an iOS Simulator; first-day only).
# Expo runs these test jobs on its paid plans only; the free plan refuses them.
npx eas-cli@latest workflow:run .eas/workflows/phone-test-android.yml
npx eas-cli@latest workflow:run .eas/workflows/phone-test-ios.yml

# On a phone or emulator connected to your own computer, with the app installed.
maestro test .maestro/first-day.yml .maestro/health-and-about.yml
```

## How the code is organised

```
src/app/            screens (expo-router)
src/ui/             design system: Text, Card, Button, Vessel, MiniCup, Trough, charts, Sheet, ...
src/theme/          colour, type, spacing tokens for the dark, light and Blossom themes
src/lib/            pure calculation code: energy, exercise, hydration, trend, body, nutrition
src/store/          local-first store (zustand), on-device saving, derived selectors
src/data/           bundled food list and activity catalogue
src/services/       Supabase client, auth, sync, Open Food Facts, AI, notifications, export
src/features/       per-feature components and helpers (food, ai, activity, import, health-sync, friends, progress, ...)
supabase/           SQL migrations, their tests, and the analyze-food and food-search edge functions
scripts/dev/        demo data, screenshot tool, end-to-end tests, local stand-in backend
scripts/ops/        set up a real Supabase project and check it end to end
docs/               competitive research (33 comparable apps), the Garmin import guide and the Health Connect sync notes
```

`AGENTS.md` holds the conventions for working in the codebase (data rules, the UI kit, design rules).

### Data and sync

Every record is written locally first, so the app is instant and works offline. On the device the data is saved in small pieces (one per collection and month), so logging a glass of water rewrites a few kilobytes, not the whole history.

Changed records are flagged and pushed to Supabase in batches; the server keeps the newest version of each record (last write wins on the edit time) and other devices pull what changed. Deletes are soft so they propagate. A record the server refuses is set aside and retried later, so it cannot hold up everything else.

Signing in on a device that already has data uploads what was logged there to the account. If the account already has a profile, its profile, goals and settings are kept and the ones made on the device are dropped. When the server holds a newer copy of a record than the device sent, the device takes the server's copy. Signing in to a different account clears the device first, and asks before doing so if the previous account still has changes that were never uploaded. Signing out does the same check.

## Accuracy notes and limits

- 321 of the 341 bundled foods name the USDA FoodData Central record they were checked against (SR Legacy 2018-04 and FNDDS 2024-10-31) and carry that record's values; an independent second pass looked every record up again. The other 20 have no honest USDA equivalent (labneh, halloumi, shakshuka, shawarma, protein products and a few more) and are labelled as unverified estimates. Household serving weights were corrected where USDA lists the same portion; the rest are typical values. `scripts/check-foods.mjs` enforces internal consistency.
- Garmin's calorie figure for an activity includes resting energy. HealthCal stores it as the session's total and adds only the part above your own resting rate to the day, the same rule as for hand-logged sessions.
- A workout synced from Health Connect is priced exactly like its Garmin file: its total calories are the session's total, and only the part above your own resting rate is added to the day, so the same run gets the same figure whichever way it arrives. With only an "active" figure, the total is rebuilt from it and your resting rate (BMR); with neither, the session gets the app's own estimate, shown as an estimate. Automatic sync has been tested against a stand-in health store only; it has not yet run on a phone (see `docs/health-sync.md`).
- Open Food Facts data is crowd-sourced. The app labels it as community data and drops entries whose calories and macros contradict each other.
- Calorie burn from MET tables describes an average adult. The app shows it as an estimate with a range.
- Photo-based calorie estimates are approximate in every app that offers them; independent tests of commercial apps found average underestimates of a few hundred kcal per meal, mostly from fat the camera cannot see. HealthCal's review step exists for that reason.
- HealthCal is not a medical device and does not give medical advice.

### The project behind this repository

Phone builds made with EAS point at the Supabase project `ffdttbbuwwkwlkyycpoa` (EU): its public address and public key are in `eas.json` under each build profile's `env`. Both are meant to ship in the app; nothing secret is stored in the repository. Local development and the browser tests run without a backend unless you create a `.env` (see `.env.example`). Changes to the database after the first setup go in a new file under `supabase/migrations/`, never by editing one that has been applied; `scripts/ops/provision-supabase.mjs` applies whatever is new, and `scripts/ops/verify-backend.mjs --via-management` checks the result end to end.
