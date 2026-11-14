# HealthCal

A calorie, nutrition, training and hydration tracker for iOS, Android and the web, built from one Expo (React Native) codebase.

HealthCal works fully on the device with no account. Connecting the optional Supabase backend adds sign-in, cross-device sync and AI meal analysis with Claude.

## What it does

- **Personal targets from your body data.** Resting metabolism from Mifflin-St Jeor, or the lean-mass Katch-McArdle equation when you enter body fat %. Calorie budget, protein / carbs / fat and a water goal follow from your goal and pace, with a safety floor.
- **Food diary.** Search 341 bundled foods (321 of them checked against USDA records) and Open Food Facts products, scan barcodes, quick-add calories, create your own foods, save meals, copy a previous day. Recents, favourites and "your usual for this meal" make repeat logging one tap, and the amount can be adjusted in place after adding.
- **AI meal analysis.** Photograph or describe a meal; Claude returns an itemised, editable estimate with a calorie range and a prompt about hidden fats.
- **108 activities.** Volleyball, basketball, yoga, running, swimming, strength and more, with calorie burn from the 2024 Compendium of Physical Activities MET values and your weight. Only net calories (above resting) are added to the budget, so nothing is counted twice. A set-by-set strength logger with rest timer, personal records and saved routines is included.
- **Garmin workouts.** Import the files Garmin Connect exports (FIT, TCX, GPX, the Activities CSV, or a ZIP of them): each workout arrives with its real duration, distance and the calories the watch measured, and only the part above resting is added to the day. See `docs/garmin-import.md`.
- **Automatic workout sync (Android).** With one permission, HealthCal reads the workouts that Garmin Connect and other apps save to Health Connect and adds them by themselves when you open the app, with the watch's calories and an Undo. It reads workouts, their calories and distance only, writes nothing back, and asks first about anything that might repeat a session you logged by hand. Needs an Android build of the app (not Expo Go); on iPhone and in the browser, use the file import. See `docs/health-sync.md`, which also lists what has to be declared in Play Console before release.
- **Friends.** Add people by a code and see each other's week: active minutes, sessions, streak and recent workouts, with a cheer for a workout. Each of those can be switched off, and calories, weight and food are never shared. Needs an account.
- **Hydration, weight, body composition, sleep and fasting** trackers.
- **Weight trend and adaptive expenditure.** A smoothed trend line ignores day-to-day water noise; once enough intake and weigh-ins are logged, your real energy expenditure is estimated from your own data.
- **Reminders that carry live numbers** ("620 ml to go, about 3 glasses"), respect quiet hours and skip themselves when the goal is met.
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
   Optional secrets: `AI_DAILY_LIMIT` (analysis units per person per day, default 40; a careful pass counts as 5), `AI_GLOBAL_DAILY_LIMIT` (a ceiling across all users per day, default 3000, so a bug or abuse cannot run up an unbounded bill), `FOOD_MODEL` (default `claude-haiku-5-5`), `FOOD_MODEL_PRECISE` (default `claude-sonnet-5-5`).
   In the Supabase dashboard (Authentication, URL Configuration) add your site URL and the app's link scheme to the allowed redirect URLs, so password-reset links can return to the app.
4. Copy `.env.example` to `.env` and fill in the project URL and anon key from the Supabase dashboard (Project Settings, API), then restart the dev server.

### What AI analysis costs

The design keeps token use low without giving up accuracy:

- The app resizes each photo to 768 px on its long edge before upload. Vision input is billed by pixel area, so this is roughly 750 input tokens instead of several thousand for a camera original.
- The smallest current Claude model answers by default with a compact structured (JSON schema) response. A stronger model runs only when the user taps "Check again more carefully".
- The server validates every number (macros cannot outweigh the food, calories must agree with macros) before the app sees it.

At list prices this works out to a few hundredths of a US cent per analysis on the default model and under one cent on the careful pass. These figures are estimates from the published per-token prices, not measurements: check the usage page of your Anthropic console after real use. The function enforces a daily limit per person (kept against a hash of the email, so deleting and recreating an account does not reset it) and a ceiling across all users, records usage in `ai_usage`, and gives the allowance back when a request fails without being billed.

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
npx eas-cli build --profile preview --platform android   # installable APK
npx eas-cli build --profile production --platform all    # store builds
npm run build:web                                        # host dist/ on any static host
```

Set a unique bundle identifier and package name in `app.json` before a store build.

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
