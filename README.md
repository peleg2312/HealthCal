# HealthCal

A calorie, nutrition, training and hydration tracker for iOS, Android and the web, built from one Expo (React Native) codebase.

HealthCal works fully on the device with no account. Connecting the optional Supabase backend adds sign-in, cross-device sync and AI meal analysis with Claude.

## What it does

- **Personal targets from your body data.** Resting metabolism from Mifflin-St Jeor, or the lean-mass Katch-McArdle equation when you enter body fat %. Calorie budget, protein / carbs / fat and a water goal follow from your goal and pace, with a safety floor.
- **Food diary.** Search 341 bundled foods and Open Food Facts products, scan barcodes, quick-add calories, create your own foods, save meals, copy a previous day. Recents and favourites make repeat logging one tap.
- **AI meal analysis.** Photograph or describe a meal; Claude returns an itemised, editable estimate with a calorie range and a prompt about hidden fats.
- **108 activities.** Volleyball, basketball, yoga, running, swimming, strength and more, with calorie burn from the 2024 Compendium of Physical Activities MET values and your weight. Only net calories (above resting) are added to the budget, so nothing is counted twice. A set-by-set strength logger is included.
- **Hydration, weight, body composition, sleep and fasting** trackers.
- **Weight trend and adaptive expenditure.** A smoothed trend line ignores day-to-day water noise; once enough intake and weigh-ins are logged, your real energy expenditure is estimated from your own data.
- **Reminders that carry live numbers** ("620 ml to go, about 3 glasses"), respect quiet hours and skip themselves when the goal is met.
- **Progress, insights and weekly recaps** built from your numbers.
- No ads, no paywalls, full data export, account deletion in the app.

## Run it

Requirements: Node 20 or newer.

```bash
npm install
npm run web        # opens the app in a browser
npm start          # Expo dev server: scan the QR code with Expo Go, or press i / a for a simulator
```

Barcode scanning, the camera and scheduled notifications need a real device. Expo Go covers most of it; for full notification behaviour make a development build (`npx expo run:ios`, `npx expo run:android`, or `npx eas-cli build --profile development`).

```bash
npm run typecheck  # TypeScript
npm test           # unit tests (vitest)
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
   This creates the `profiles`, `records` and `ai_usage` tables with row-level security (each user can only read and write their own rows) and the sync functions.
3. Deploy the AI function and give it your Anthropic API key. The key is stored only as a server-side secret and never ships in the app:
   ```bash
   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
   supabase functions deploy analyze-food
   supabase functions deploy food-search
   ```
   `food-search` is a small proxy the web build needs for searching packaged products by name (the Open Food Facts search service does not allow direct browser calls; phones call it directly).
   Optional secrets: `AI_DAILY_LIMIT` (analyses per user per day, default 40), `FOOD_MODEL` (default `claude-haiku-5-5`), `FOOD_MODEL_PRECISE` (default `claude-sonnet-5-5`).
4. Copy `.env.example` to `.env` and fill in the project URL and anon key from the Supabase dashboard (Project Settings, API), then restart the dev server.

### What AI analysis costs

The design keeps token use low without giving up accuracy:

- The app resizes each photo to 768 px on its long edge before upload. Vision input is billed by pixel area, so this is roughly 750 input tokens instead of several thousand for a camera original.
- The smallest current Claude model answers by default with a compact structured (JSON schema) response. A stronger model runs only when the user taps "Check again more carefully".
- The server validates every number (macros cannot outweigh the food, calories must agree with macros) before the app sees it.

At list prices this works out to a few hundredths of a US cent per analysis on the default model and under one cent on the careful pass. These figures are estimates from the published per-token prices, not measurements: check the usage page of your Anthropic console after real use. Per-user daily limits are enforced by the function and recorded in `ai_usage`.

### Testing without a live backend

Three checks run entirely on your machine:

```bash
npm test                              # 540+ unit tests: formulas, sync engine, reminders, search, AI validation
node scripts/dev/e2e.cjs              # a new user's first day in a real browser (needs `npm run web` running);
                                      # every number is checked against an independent calculation
bash scripts/dev/test-sql.sh          # applies the migration to a throwaway PostgreSQL and tests row-level
                                      # security, last-write-wins sync, the AI quota and account deletion
```

Accounts, two-device sync and the AI request can be exercised against a local stand-in for Supabase:

```bash
EXPO_PUBLIC_SUPABASE_URL=http://localhost:54321 \
EXPO_PUBLIC_SUPABASE_ANON_KEY=mock-anon-key-for-local-end-to-end-tests \
  npx expo export --platform web --output-dir /tmp/healthcal-mock
node scripts/dev/mock-backend.cjs --static=/tmp/healthcal-mock --static-port=8090 &
node scripts/dev/e2e-backend.cjs      # sign-up, sign-in on a second device, sync both ways, AI, sign-out, delete account
```

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
src/ui/             design system: Text, Card, Button, Ring, charts, Sheet, ...
src/theme/          colour, type, spacing tokens for dark and light themes
src/lib/            pure calculation code: energy, exercise, hydration, trend, body, nutrition
src/store/          local-first store (zustand + AsyncStorage) and derived selectors
src/data/           bundled food list and activity catalogue
src/services/       Supabase client, auth, sync, Open Food Facts, AI, notifications, export
src/features/       per-feature components and helpers
supabase/           SQL migration and the analyze-food edge function
scripts/dev/        demo data seeder and browser screenshot tool
```

`AGENTS.md` holds the conventions for working in the codebase (data rules, the UI kit, design rules).

### Data and sync

Every record is written locally first, so the app is instant and works offline. Changed records are flagged and pushed to Supabase in batches; the server keeps the newest version of each record (last write wins on the edit time) and other devices pull what changed. Deletes are soft so they propagate. Signing in on a device that already has data uploads it to the account; signing in to a different account clears the device first.

## Accuracy notes and limits

- The bundled food values are transcribed from USDA FoodData Central figures but were **not** individually re-checked against the live USDA records while building (the public API key was rate-limited), so every bundled food is labelled as unverified in the data. A self-check script enforces internal consistency (`scripts/check-foods.mjs`). Re-verifying against USDA with your own free API key is the first thing to do before a public release.
- Open Food Facts data is crowd-sourced. The app labels it as community data and drops entries whose calories and macros contradict each other.
- Calorie burn from MET tables describes an average adult. The app shows it as an estimate with a range.
- Photo-based calorie estimates are approximate in every app that offers them; independent tests of commercial apps found average underestimates of a few hundred kcal per meal, mostly from fat the camera cannot see. HealthCal's review step exists for that reason.
- HealthCal is not a medical device and does not give medical advice.
