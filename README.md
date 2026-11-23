# HealthCal

A calorie, nutrition, training and hydration tracker for iOS, Android and the web, built from one Expo (React Native) codebase.

HealthCal works fully on the device with no account. Connecting the optional Supabase backend adds sign-in, cross-device sync, AI meal analysis and an AI coach chat with Claude.

## What it does

- **Personal targets from your body data.** Resting metabolism from Mifflin-St Jeor, or the lean-mass Katch-McArdle equation when you enter body fat %. Calorie budget, protein / carbs / fat and a water goal follow from your goal and pace, with a safety floor.
- **Food diary.** Search 467 bundled foods (each checked against a USDA or national food composition record, apart from 20 labelled estimates) and Open Food Facts products, scan barcodes, quick-add calories, create your own foods, save meals, copy a previous day. Recents, favourites and "your usual for this meal" make repeat logging one tap, and the amount can be adjusted in place after adding.
- **AI meal analysis.** Photograph or describe a meal; Claude returns an itemised, editable estimate with a calorie range and a prompt about hidden fats.
- **108 activities.** Volleyball, basketball, yoga, running, swimming, strength and more, with calorie burn from the 2024 Compendium of Physical Activities MET values and your weight. Only net calories (above resting) are added to the budget, so nothing is counted twice. You choose whether a workout adds its calories on its own day, shared over the next seven days, or not at all. A set-by-set strength logger with rest timer, personal records and saved routines is included.
- **Garmin workouts.** Import the files Garmin Connect exports (FIT, TCX, GPX, the Activities CSV, or a ZIP of them): each workout arrives with its real duration, distance and the calories the watch measured, and only the part above resting is added to the day. See `docs/garmin-import.md`.
- **Automatic workout sync (Health Connect on Android, Apple Health on iPhone).** With one permission, HealthCal reads the workouts that Garmin Connect and other apps save to Health Connect or Apple Health and adds them by themselves when you open the app, with the watch's calories and an Undo. It reads workouts, their calories and distance, daily steps and sleep, and, each allowed on its own row, your weigh-ins with body fat (one a day, into Weight; one you enter or change is never replaced), the watch's own count of calories burned in a day (shown on Progress beside HealthCal's estimate, never added to your budget) and each workout's average and highest heart rate (shown on the workout). It writes nothing back, and asks first about anything that might repeat a session you logged by hand. Needs a build of the app (not Expo Go); on iPhone, one signed with Apple's HealthKit permission (through the paid Apple Developer Program, or from Xcode on a Mac with your own Apple ID), and the iPhone side has not yet run on a phone. In the browser, and in an iPhone copy sideloaded with AltStore or Sideloadly (which leave out Apple's Health permission), use the file import (Garmin files or the Health app's export). See `docs/health-sync.md`, which also lists what has to be declared in Play Console before release.
- **Friends.** Add people by a code and see each other's week: active minutes, sessions, streak and recent workouts, with a cheer for a workout. Each of those can be switched off, and calories, weight and food are never shared. Needs an account.
- **Hydration, weight, body composition, sleep and fasting** trackers. Milk, juice, soft drinks, sports drinks and tea or coffee with milk or sugar add their calories to the diary as you log them, with the calories shown on each glass first. A drink logged as food in the diary (a coffee, an energy drink) also adds its volume to Water, and one Undo takes both back.
- **Weight trend and adaptive expenditure.** A smoothed trend line ignores day-to-day water noise; once enough intake and weigh-ins are logged, your real energy expenditure is estimated from your own data.
- **Reminders that carry live numbers** ("620 ml to go, about 3 glasses"), respect quiet hours and skip themselves when the goal is met.
- **Yesterday, first thing in the morning.** The first time you open the app between 4 am and noon, a short page starts your day: a greeting by name, a line about your streak or a record of your own when there is one, your week as a row of cups with yesterday large and today waiting at the end, a short coach message in plain words (what went well, one next step, and the first thing to do today, always tied to your own numbers), a quote of the day (real quotes, bundled in the app), the day before in four figures for calories, protein, water and last night's sleep with one plain sentence, your workout and steps, what else went well and what else to improve (facts with their numbers, without repeating the coach), and a short plan for today (active minutes left this week, a weigh-in or last night's sleep), each one tap from where it is done, with a button to log the meal that comes next. One tap closes it onto Today. It shows once a day, only after a day with something logged, never on the day you set up, and not when a reminder or a link opened the app. Turn it off, or open it at any time, in Profile ("Morning summary", "See yesterday").
- **Progress, insights and weekly recaps** built from your numbers: an overview grid, your usual ranges beside your targets, and a consistency calendar with weekly rhythm targets and a streak that forgives a missed day.
- **Its own look, in six themes.** The design is called Pour: every amount is a flat colour poured into an open cup with a level line on top, so what is left is visible above it. Dark, light, the pink Blossom theme, and Butter, Honey and Java from a five-colour palette of butter, wine, cerulean and two browns (Profile, Appearance).
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
   supabase functions deploy coach-chat
   ```
   `food-search` is a small proxy the web build needs for searching packaged products by name (the Open Food Facts search service does not allow direct browser calls; phones call it directly).
   Optional secrets: `AI_DAILY_LIMIT` (analysis units per person per day, default 40; a careful pass counts as 5), `AI_GLOBAL_DAILY_LIMIT` (a ceiling across all users per day, default 3000, so a bug or abuse cannot run up an unbounded bill; for one person and a few friends 400 is plenty and caps a day at about half a dollar at the measured costs), `FOOD_MODEL` (default `claude-haiku-5-5`), `FOOD_MODEL_PRECISE` (default `claude-sonnet-5-5`), `FOOD_THINKING` and `FOOD_FORMAT` (see "What AI analysis costs"). The coach has four of its own, all optional: see "The AI coach".
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
| Photo, 768 px, since 18 November (stepwise guide, below) | the same | about 1,600 / 390 | $0.00035 to $0.00037 | $0.36 |
| Careful pass, typed | `claude-sonnet-5-5`, effort medium | about 540 / 130 | $0.002 | $2.39 |
| Careful pass, photo at 1024 px | the same | about 1,730 / 280 | $0.006 | $6.28 |

Two answer forms are in use, each where it measured better:

- A typed meal is answered in a few plain lines (`I name | grams | kcal | ...`), so no schema is sent: $0.18 per 1,000 against $0.22 as JSON, with every round in range either way. The lines are read strictly: a bulleted line, a missing cell or a number with a unit means the whole answer is asked for once more as schema-checked JSON (about one answer in twenty-five), capped at 900 tokens and counted in the figures above. Nothing is guessed from a line that is nearly right.
- A photo is answered as schema-checked JSON with one-letter field names ($0.27 per 1,000; $0.30 with full names). The plain lines cost the same on photos once their second tries were counted, and judged a whole pizza a quarter smaller.

On that small set the default put 60 of 60 typed rounds and 30 of 30 photo rounds inside the calorie range a careful person would accept (typically within 3% of its middle for typed meals and 6% for photos). What it gets wrong is what a photo cannot show: the size of a whole dish with nothing beside it for scale, and look-alikes (lentils read as minced meat). The careful pass is better at look-alikes, for ten to twenty times the price, which is why it is a button and not the default.

#### How close it gets: measured against weighed dishes (18 November 2026)

The figures above judged answers against a range a careful person would accept. In November 2026 the estimate was measured against weighed truth instead, through a temporary test route on the project's own backend (`scripts/ops/food-ai-lab/README.md`), with every request priced from its own usage into a money ledger (the whole round, planning runs included, cost $2.47):

- 60 photos of cafeteria plates from Nutrition5k (Google's dataset of weighed dishes with lab-checked calories), each looked at by eye against its ingredient list; 9 whose photo contradicts the list (food hidden under other food, food missing from the list, an undressed salad) were replaced. 51 of the 60 are 150 kcal or more, and the headline figures are on those, because a 30 kcal miss on a 50 kcal side is not what a person feels.
- 52 typed meals whose truth is computed from `src/data/foods.ts`, and 16 packaged products whose truth is the maker's label (Open Food Facts), so one typed set does not depend on the app's own table. The label set and the two drinks are now in `scripts/ops/food-ai-cases.json`.

What it showed and what changed:

| Quick pass (`claude-haiku-5-5`, effort low) | before | after | change, paired by dish (95% interval) |
| --- | --- | --- | --- |
| Photo: mean error on meals of 150 kcal or more | 40% | 31% | -9 points [-13, -5] |
| Photo: median error / median signed error | 30 to 34% / +24% | 23 to 26% / +7 to +9% | |
| Photo: mean miss in kcal, every dish | 139 to 144 kcal | 109 to 112 kcal | -30 to -36 kcal |
| Photo: within 20% of the truth | 32 to 38% | 40 to 48% | |
| Photo: cost / median time / slowest tenth | $0.00029 / 2.5 s / 3.2 s | $0.00035 to $0.00037 / 2.6 to 2.9 s / 3.6 to 5 s | |
| Typed (foods.ts truth / label truth): median error | 8% / 5% | 7% / 4% (unchanged code; the second run is the noise) | |

- **Typed meals were already close** (median error 5 to 8%) and stay as they were: the same plain-lines answer and the same guide.
- **Photos carry nearly all the error, and read high**: before, a quick photo answer was off by a median of about 30%, over-estimating by a median of 24%, mostly portions about 1.25 times too large and cooking fat counted twice (once in the food, once as "oil"). The quick pass now reads a photo with the same rules worked through as five steps (items, portion from what is visible and not a typical serving, energy per 100 g, fat counted once, the arithmetic checked): `GUIDE_PHOTO` in `supabase/functions/analyze-food/analyze.ts`. The same model, effort and answer form; about 270 more input tokens and 70 to 110 more output tokens a photo (a longer guide and a longer answer: 1,657 in and 377 out against 1,384 and 306 before), about $0.00035 a photo against $0.00029.
- **How sure that is.** The gain was found in two runs and confirmed in a third that ran both prompts side by side in the same hour (two trials each); the code as built was then run once more and landed on the same figures. Trial-to-trial spread of one setup was about 1 to 4 points, so a difference under 3 to 4 points on this set is noise. The gain shows on dishes with and without recorded oil, under and over 300 g. Nutrition5k's truth leaves out cooking fat it did not weigh: if that fat adds 10% the gain is about -8 points, if 20% about -5, if 30% it is inside the noise. Honestly put: about 5 to 10 points less error on these dishes.
- **The careful pass keeps the plain guide.** With the stepwise guide it was no more accurate (-2 points, inside the noise) and turned large meals into under-counts (median -29% over 500 g), the harmful direction for a calorie diary.
- **Drinks keep their alcohol.** The server's check that calories agree with the macros cut half a litre of beer from 215 to 78 kcal and a glass of wine from 128 to 16, because alcohol's 7 kcal a gram is in no macro. A drink-like item (named as a drink, almost no protein or fat) now keeps the calories its alcohol can explain; kale, virgin olive oil, margarita pizza, whisked eggs, cider vinegar and wine sauce are still checked (`alcoholRoom`, tested both ways).
- **The range shown is wider for photos.** "likely X to Y" held the true calories in only 44 to 52% of quick photo answers. A photo answer's band is now one and a half times as wide (`PHOTO_SPREAD` in `src/features/ai/estimate.ts`), which holds them in about two thirds (67% on the final run, about +-38%), and a quick photo answer says "rough X to Y" rather than "likely". The careful pass on a photo holds about four in five at that width and keeps "likely"; typed meals keep their band and their word. Holding four in five on the quick pass would need +-50%. Once logged, the diary shows any estimate's band as "Estimate, between X and Y kcal", without "likely" or the model's confidence figure (which is not the chance the band holds the truth), and a food logged again from Recent keeps the width of its last band (`bandSpread` in `src/features/food/build.ts`), so a photo estimate stays as wide as when it was first logged.

Tried and not adopted (each measured on the same dishes): effort medium on the quick pass (-3 points, inside the noise, slowest tenth 5.7 s); the app's food table in the prompt, as energy per 100 g or to compute the nutrients (no gain, two answers cut off, 40% more cost); the model's own low and high weight (no better than the confidence band at the same width); `claude-sonnet-5-5` as the quick pass (-8 points, at about 18 times the cost and 3.8 s); `claude-opus-5-5` for either pass (no better than Sonnet, twice its cost, 4.7 s).

What these numbers do not show: anything about your own meals. The test photos are small plates shot from straight above at 640 x 480. Telling the model the true total weight was worth about -8 to -10 points (below) and a true size word (small, medium, large) about -7, as an upper bound; a size question for the person was neither built nor measured (sizes were only ever given true, never as a person's own judgement), and would take the place of the added-fat question, which already appears on three answers in four. The real check is 10 to 20 of your own meals, weighed and photographed in the app.

#### Most accurate while cheap: what was weighed up, and what shipped (18 November 2026, second round)

Every option was scored from the rows the first round already paid for (no new requests), paired by photo with a bootstrap interval, against limits set before scoring: at most about one US cent a photo with every request counted, about 4.5 s at the median, a gain of at least 4 points whose interval excludes 0, and no reading low on large meals (low is the harmful direction for someone eating at a deficit). Combinations used fixed rules (a mean, a median), never weights fitted on these photos. On the 51 photos of 150 kcal or more, monthly cost at 5 photos a day:

| Setup | Mean error | Against today, points [95%] | Signed bias: all / over 500 g (mean) | Per photo | Per month | Median / slowest tenth |
| --- | --- | --- | --- | --- | --- | --- |
| **Today: quick pass, one request** (5 stored readings a photo) | 31.6% | | +21% / +2% | $0.00037 | $0.055 | 2.7 s / 4.7 s |
| **Today + weighed total** (true weight, 1 reading) | 24.1% | -7.9 [-17, +0.2]; -6.0 [-15.5, +3.0] counting the one cut-off answer as a full miss | +8% / +19% | $0.00050 | $0.074 | 2.9 s / 7.4 s |
| Two to four quick readings averaged or the median | 31.3 to 31.7% | -0.3 to +0.1 | | 2 to 4x | | |
| Quick and careful averaged | 28.8% | -2.8 [-6.8, +0.9] | / -7% | $0.0063 | $0.95 | 4.1 s / 6.8 s |
| Careful pass for every photo (`claude-sonnet-5-5`, effort medium) | 30.2% | -1.4 [-8, +5] | +10% / -15% | $0.0059 | $0.89 | 3.8 s / 6.1 s |
| Careful only when two quick readings disagree (15, 25, 40%) | | -0.4 to 0.0 | | | | up to 7.8 s |
| `claude-sonnet-5-5` at effort low as the quick pass | 25.5% | -6.1 [-12.9, +0.4] | -4% / -27% | $0.0069 | $1.04 | 3.8 s / 4.7 s |
| `claude-opus-5-5` at effort low | 26.2% | -5.4 [-10.6, -0.4] | +10% / -15% | $0.0135 | $2.03 | 4.7 s / 5.9 s |

- **Asking the same model again does not help**: two quick readings of a photo agree at +0.93 (it is wrong the same way each time), and how much they disagree barely predicts the error. The model's own low confidence is no signal either (those answers were the more accurate ones).
- **The careful pass stays a button.** It fixes the worst over-reads but not the average, and reads large meals low (-15%, an interval that excludes 0). `claude-sonnet-5-5` at effort low was the one robust gain under a cent, but it reads large plates 27% low and costs 19 times as much, so it was not adopted.
- **What shipped: the quick pass unchanged, plus an optional "Weighed it? Total grams" field on the photo screen** (food only, without the plate). The app sends the total as the photo's text in exactly the measured words, `About N g of food in total.` with N rounded to 10 g (`src/features/ai/weight.ts`), so the function receives `Details from the user: About N g of food in total.`; any note follows it. It is still one quick request and one unit of the daily allowance (`costOf` unchanged). The review says "Made with your weighed total, 418 g", the total as typed. With imperial units the field takes ounces and converts them ("16 oz (about 450 g)"), so the request carries the same sentence in grams. A thousands separator is read as one ("1,500"), a decimal in grams is refused rather than guessed, and text that is not a number is an error, never silently dropped; the error shows once the field is left or Estimate is tapped, not while typing. The range and its word "rough" stay: with the weight the band held the truth 75% of the time (70% without) at the same width.
- **How sure that is**: the weight was measured once, with the exact weight, on a form that also asked for a gram range per item (the request now sent is otherwise byte for byte the same; checked free against the lab code), so "about 8 points" holds for exact weights on these 60 photos, not as a promise; a person's own scale, or the bowl left in, was not measured. One answer in 60 ran into the 2,000-token cap and was lost (it still counts against the allowance). The over-500 g figures rest on 8 or 9 photos. `supabase/functions/analyze-food/measured.test.ts` replays the stored answers through the function's code and reproduces the figures above for both shipped setups.
- **To measure it on the production form** (about $0.25: two trials of four setups on the 60 photos, from the stored rows at $0.00037 a photo plain and $0.0005 with the weight; `--trials=1` halves it): `--photos=<dir> --configs=current,weight,weight/off=15,weight/off=-15 --trials=2` in `scripts/ops/eval-food-ai.mjs` (`weight` sends the case's weighed total as the app does; `off` sends it that many percent off).

Two switches, as function secrets, change the trade without a deploy:

- `FOOD_THINKING=off` is the cheapest setting for typed meals: $0.11 per 1,000. It is also measurably less accurate (54 of 60 typed rounds in range: eggs counted twice, a cooked weight priced as dry), so it is not the default.
- `FOOD_FORMAT=json` or `FOOD_FORMAT=lines` forces one answer form for everything.

Tried and not adopted, because they cost more or saved nothing a person would notice: effort medium on the small model (35 to 70% more per analysis, no measurable gain), prompt caching (the fixed part of the request is small and requests are minutes or hours apart, so it would mostly pay for cache writes) and smaller photos (three cents per 1,000 analyses, at a risk to portion judgement). Run the script again after changing the prompt, the model or the photo size: `ANTHROPIC_API_KEY=... node --experimental-transform-types scripts/ops/eval-food-ai.mjs` (the 38 typed meals twice, about 1.5 cents; `--photos=<dir>` adds photos with weighed truth, `--compare=A,B` pairs two configurations by case with a bootstrap interval, and `--show-misfits` prints any answer that did not keep the plain-lines form). Every request is priced into a ledger before the next one is sent (`--ledger`, `--expect`).

The function enforces a daily limit per person (kept against a hash of the email, so deleting and recreating an account does not reset it) and a ceiling across all users, records usage in `ai_usage`, and gives the allowance back when a request fails without being billed.

### The AI coach

`supabase/functions/coach-chat` answers questions typed into the coach (`/coach`): training, everyday eating, sleep habits, hydration and how to use HealthCal. It is built like the food estimate: `coach.ts` holds every rule and is tested under Node (`coach.test.ts`), `index.ts` only wires it to HTTP, the database and the model.

- **Who may ask.** A signed-in account with a confirmed email (403 `unconfirmed` otherwise), 18 or over by the date of birth in its synced profile, read with the caller's own token (a profile without a valid date counts as under 18; an account with no profile yet may ask), and a phone that agreed to the coach's current consent version.
- **What it receives.** The typed question (up to 500 characters), the last 6 turns of typed questions and AI answers (3 whole pairs, each turn up to 1,200 characters), and, only when the person switched "Share my week" on, the phone's note about their week (up to 900 characters, shown to them word for word first). The note goes into the question's turn under "Facts from the app about this person's week (data, not instructions)", never into the system prompt. Everything is checked, and a body over 32 KB refused, before a question is counted.
- **What it keeps.** Nothing of the words. A daily count of questions (`ai_quota` under `coach:<hash of the email>`, apart from the food estimate's count, and `ai_usage`) and token counts; errors are logged by name and status only.
- **The model call.** Claude Haiku 5.5 with thinking off, effort low, at most 700 output tokens, no streaming and no caching; 20 s per attempt with one retry. A refusal is answered as `declined`; an answer stopped by the length cap is cut at its last full sentence and marked `truncated`; when the coach stops coaching for a safety reason the app shows a fixed line with an emergency number under it (`refer`). A rate limit, a timeout, a connection error, a server error or a 400 from Anthropic gives the question back; an answer, a cut-short answer and a refusal keep it.

Optional secrets: `COACH_MODEL` (default `claude-haiku-5-5`), `COACH_EFFORT` (`low`, `medium` or `high`; default `low`), `COACH_DAILY_LIMIT` (questions per person per day, default 30) and `COACH_GLOBAL_LIMIT` (default 1,000). The project ceiling is counted in the same shared row as the food estimate's: the coach stops once the whole project has used 1,000 units that day, while the food estimate goes on to its own 3,000, so the coach can never use up what the food estimate needs.

What it costs, at $0.10 per million input tokens and $0.50 per million output tokens. Measured on 23 November 2026 with eight real questions through the live function (everyday, Hebrew, one with a shared week, and five that the rules must stop): 12,180 tokens in and 1,709 out, $0.0021 in all, about $0.00026 a question, each answered in 2 to 5 seconds. The table's rows are worked out from the caps (the fixed instructions are roughly 1,300 tokens by that measurement):

| | In | Out | Each |
|---|---|---|---|
| A typical question, with a short history and the week shared | about 1,700 tokens | about 250 | about $0.0003 |
| Every cap full, in Hebrew (about 1 character a token) | about 9,300 tokens | 700 | about $0.0013 |

So about $0.27 a month for someone asking 30 typical questions a day, at most about $1.15 a month for one person asking 30 of the longest questions a day in Hebrew, and at most about $1.30 a day for the whole project, when every one of the 1,000 questions is the longest. `costOfQuestion` in `coach.ts` holds the arithmetic. `node scripts/ops/verify-backend.mjs --chat` asks one real question (about $0.0003); without `--chat` it checks only the coach's two free refusals.

### Setting it up with the scripts

Two scripts do the steps above through Supabase's management API and then check the result:

```bash
SUPABASE_ACCESS_TOKEN=sbp_... node scripts/ops/provision-supabase.mjs   # create the project, apply migrations, deploy the functions,
                                                                         # allow the app's links, write .env (public URL and key only)
SUPABASE_SERVICE_ROLE_KEY=... node scripts/ops/verify-backend.mjs       # two throwaway accounts: sync, isolation, friends, the functions, deletion
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

The stand-in answers the coach with fixed answers and no model; the words that trigger its limit, refusal, cut-short, referral and error answers, and the accounts that get its unconfirmed and under-18 answers, are listed at its `coach-chat` route, and `/__state` shows every coach request it received (`coachRequests`).

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
- `drinks.yml` (after first-day, run with `flows=first-day,drinks`): a milk logged on the water screen with its choices and the calorie line, its row in Today's log and the diary, then the drink sheet with calories typed while the keyboard is up. Passed on the Android 15 emulator on 18 November 2026 (run 44319058732).
- `diary-drink.yml` (after first-day, run with `flows=first-day,diary-drink`): "monster" typed in lunch's food search, the + on the bundled energy drink, the toast that says both effects (photographed at once, with the keyboard up), the diary row's "also in Water" mark, and the Water screen's row that came from the diary (the one required proof). Passed on the Android 15 emulator on 19 November 2026 (run 44587317694, the released code): "248 ml drink · counts as 223 ml · Energy drink, sugared · from lunch". That run's pictures also showed the toast hidden behind the keyboard in food search, which only a phone shows; with the toast made to rest above the keyboard, run 44594921478 passed on the Android 15 emulator and the iPhone simulator, and picture 71 shows "Added to lunch and 248 ml to Water" with Undo above the footer on both.
- `drink-search.yml` (after first-day, run with `flows=first-day,drink-search`): Water, the Search button beside "Add a drink", "monster" typed on the phone's keyboard, the bundled energy drink picked with one tap while the keyboard is up, a glass, and its row in Today's log with its calories (the one required proof). Then, best effort: the drink offered again as a chip on the Water kind, and a mocha from the same search landing on Coffee with its own calories. Passed on the Android 15 emulator on 23 November 2026 (run 45166383809, the released code): with the keyboard up the sheet shows "Energy drink, sugared · 108 kcal per 250 ml" and, under "Online products", two Monster products from the live backend with their pack; one tap picks it, the kind row moves to Other and the toast reads "Energy drink, sugared chosen, under Other. Tap a glass to add it."; the mocha lands on Coffee at 188 kcal per 250 ml.
- `coach.yml` (after first-day, run with `flows=first-day,coach`): the "Ideas that fit" chip on Today, Train's week card with its "Coach" link, the training overview sheet and its "Ask the coach", the chat's first view, a phone answer, the field and send button riding on the keyboard with the two buttons above them, and the app's own line for a typed question without an account (no question reaches the AI on the test phone, so nothing is paid for).
- `hebrew.yml` (after first-day, run with `flows=first-day,hebrew`; best effort, its screenshots are the evidence): the app's second start, then the food search with a Hebrew word typed on the phone's keyboard ("קוטג"), the result added to dinner, a Latin spelling ("tehina") and the diary.

**On GitHub's machines, free.** The repository is public, so GitHub Actions' standard runners, macOS included, cost nothing. `.github/workflows/phone-test.yml` builds the app in Release (the JavaScript inside, no Metro; the Supabase settings from `eas.json`'s `build.production.env`) and runs the flows on an iPhone simulator (macOS 26, Xcode 26.4 or later) and an Android emulator (Android 15, x86_64; Health Connect is expected on this image, and the job log lists the health packages it found). It starts only by hand.

What the first runs showed (16 and 17 November 2026):

- Android 15 emulator: `first-day` and `health-and-about` pass in about two minutes each. Health Connect's own permission screen is answered ("Allow all", "Allow") and the sync screen then reads "On, last synced just now".
- iPhone 17 simulator, iOS 26.5: `first-day` and `health-and-about` pass: setup with the keyboard on every field, the diary, the tabs, Apple's Health access sheet ("Turn On All", "Allow") and a sync from an empty Apple Health. It is the first time the iPhone app ran anywhere.
- An update published to a test channel arrived on both: About reads "Updated Nov 16" and "Up to date" after the second start.
- `health-data-ios` showed the whole path once: 8,432 steps typed into the simulator's Health app were read through HealthKit and shown on the sync screen ("8,432 today, shown on Train") and on Train. Adding a workout by hand in the Health app did not go through, so reading a workout from Apple Health is still unproven.

Hebrew, on the Android 15 emulator (18 November 2026):

- The phone in English (run 44349310828): Maestro typed "קוטג" and the search showed "Cottage cheese, 5% fat" first with the name it matched under it, a tap added 238 kcal to dinner, and "tehina" found the tahini sauce first with an online product under "Online products".
- The phone set to Hebrew (`-f android_locale=system:he-IL`): a build from before `src/features/layout/leftToRight.ts` came up mirrored on every screen, the tabs in reverse order and English text against the right edge (run 44337190400). A build with that file was left to right from its first start, with only the phone's own status bar mirrored, and both flows passed (run 44354679253).
- The released code on the phone set to Hebrew (commit db6f5b9, run 44414991637): both flows passed, the app left to right, "קוטג" listing the five cottage cheeses with the Hebrew name each matched (the 9% one among them) and the first added to dinner (the diary went from 225 to 462 kcal eaten).
- `android_locale` takes a language tag for the app alone (`he-IL`, through Android's per-app language, which did not mirror the app and on one run met the emulator's "Pixel Launcher isn't responding" dialog) or `system:<tag>` for the whole emulator, which is what a phone set to Hebrew is. Leave it empty for a phone in English. Not tried: a real phone, and an iPhone set to Hebrew (iOS does not mirror an app that ships no right-to-left language).

The emulator's own "Pixel Launcher isn't responding" dialog once covered the app's welcome screen and failed every flow at its first step (run 44582333635; the app itself had started). The Android flows job now hides system error dialogs before the app is opened (`settings put global hide_error_dialogs 1`), so such a failure is the emulator's and a re-run with `app_run_id` settles it.

Two things that cost a run each: GitHub's `macos-26` machines are not always free (the job waits 15 minutes and is cancelled without starting: start it again; `macos-15` cannot build this app, because its newest Xcode is 26.3 and expo-modules-jsi does not compile before 26.4), and on a cold simulator the first flow can lose Maestro's driver ("Device became unreachable"): start the run again with `app_run_id` and it passes. The system screens' labels in the flows are the ones these runs showed; they are still tapped as optional, and health-data-ios never fails the job.

```bash
# Actions tab > Phone test > Run workflow (choose the branch, platform, flows), or:
gh workflow run phone-test.yml --ref claude/health-fitness-app-17mku3 -f platform=both -f flows=all
# or the API (a token with Actions: write; the answer is HTTP 204 with no body):
gh api -X POST repos/peleg2312/HealthCal/actions/workflows/phone-test.yml/dispatches \
  -f ref=claude/health-fitness-app-17mku3 -f 'inputs[platform]=ios' -f 'inputs[flows]=first-day,health-and-about'
# (with curl: -H 'Authorization: Bearer <token>' -H 'Accept: application/vnd.github+json' and the same JSON body)

# Hebrew typed into the food search, on an emulator whose own language is Hebrew:
gh workflow run phone-test.yml --ref claude/health-fitness-app-17mku3 -f platform=android -f flows=first-day,hebrew -f android_locale=system:he-IL

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
src/theme/          colour, type, spacing tokens for the six themes (dark, light, Blossom, Butter, Honey, Java)
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

- 329 of the 467 bundled foods name the USDA FoodData Central record they were checked against (SR Legacy 2018-04 and FNDDS 2024-10-31) and carry that record's values; an independent second pass looked every record up again. 118 name a record of Israel's national nutrition database (Tzameret, Ministry of Health, published on data.gov.il; foods updated October 2022), 55 of them recipes the Ministry computed from ingredients. That database stores carbohydrate without fibre, so the app stores its carbohydrate plus fibre (total carbohydrate, like USDA's), and its servings are the database's own household units. The other 20 have no honest record (Caesar and Greek salads, shawarma, milky coffees, protein products and a few more, and six tea and coffee drinks computed from reference rows) and are labelled as unverified estimates. Household serving weights were corrected where USDA lists the same portion; the rest are typical values. `scripts/check-foods.mjs` enforces internal consistency, and `scripts/ops/check-national-foods.mjs` checks the national rows against the downloaded tables (docs/food-data.md).
- Garmin's calorie figure for an activity includes resting energy. HealthCal stores it as the session's total and adds only the part above your own resting rate to the day, the same rule as for hand-logged sessions.
- A workout synced from Health Connect is priced exactly like its Garmin file: its total calories are the session's total, and only the part above your own resting rate is added to the day, so the same run gets the same figure whichever way it arrives. With only an "active" figure, the total is rebuilt from it and your resting rate (BMR); with neither, the session gets the app's own estimate, shown as an estimate. Automatic sync has been tested against a stand-in health store only; it has not yet run on a phone (see `docs/health-sync.md`).
- Open Food Facts data is crowd-sourced. The app labels it as community data and drops entries whose calories and macros contradict each other.
- Calorie burn from MET tables describes an average adult. The app shows it as an estimate with a range.
- Photo-based calorie estimates are approximate in every app that offers them; independent tests of commercial apps found average underestimates of a few hundred kcal per meal, mostly from fat the camera cannot see. HealthCal's review step exists for that reason.
- HealthCal is not a medical device and does not give medical advice.

### The project behind this repository

Phone builds made with EAS point at the Supabase project `ffdttbbuwwkwlkyycpoa` (EU): its public address and public key are in `eas.json` under each build profile's `env`. Both are meant to ship in the app; nothing secret is stored in the repository. Local development and the browser tests run without a backend unless you create a `.env` (see `.env.example`). Changes to the database after the first setup go in a new file under `supabase/migrations/`, never by editing one that has been applied; `scripts/ops/provision-supabase.mjs` applies whatever is new, and `scripts/ops/verify-backend.mjs --via-management` checks the result end to end.
