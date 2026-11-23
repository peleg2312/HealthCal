# Store listing

Everything the App Store and Google Play pages need from this repository: the words, the eight screenshots and the command that makes them, plus a list of what only the owner can provide.

The listing leads with the Blossom look (raspberry, champagne, pink). Every frame is a real screen of the running app with the demo data. Nothing is a mock-up. The captions are short, sentence case, with no exclamation marks, no medical claims and no superlatives the app cannot prove.

## Screenshots

### Regenerate

```bash
node scripts/dev/store-frames.cjs
```

This needs the web dev server on http://localhost:8081 (`--url=` for another one). One run takes about two minutes and rewrites the whole set:

| Folder | Size (px) | Store slot |
| --- | --- | --- |
| `store/app-store/iphone-6.9/` | 1320 x 2868 | iPhone, Dynamic Island, large display (6.9") |
| `store/app-store/iphone-6.3/` | 1206 x 2622 | iPhone, Dynamic Island, medium display (6.3"). This is the size Apple requires. |
| `store/app-store/ipad-13/` | 2064 x 2752 | iPad 13". Required because `app.json` sets `ios.supportsTablet: true`. |
| `store/google-play/phone/` | 1440 x 2560 | Play phone screenshots, 9:16 portrait |
| `store/_sheet.png` | | Contact sheet of all four sets |

Every file is an RGB PNG with no alpha channel. The script checks the size and the colour type of each one and stops if either is wrong.

Other flags:

- `--no-backend` reuses the last photo and friends captures. Use it when only the dev-server screens changed.
- `--backend-only` does the opposite.
- `--compose` lays the frames out again from the last captures without opening the app.
- `--only=1,4` composes just those frames.
- `--describe` uses the "Describe a meal" path for frame 3 instead of the photo.

How the pictures are made:

- **Frames 1, 2, 4, 5, 6 and 8** are captured from the dev server, with `buildSeed({ store: true })` from `scripts/dev/seed.mjs`. That option only adds to the ordinary demo data, so every other script gets the same data as before:
  - yesterday's session is a run imported from a Garmin file, with measured calories;
  - today's water goal has been met.

  The browser clock is held at 7:30 pm, so the greeting and the logged meals agree. Frame 8 also captures Today in the dark and light themes.
- **Frames 3 and 7** need a backend. The script exports a web build pointed at the local stand-in, `scripts/dev/mock-backend.cjs`, on ports 54391 and 8091 (not the e2e ports). It then:
  1. signs up two people, Alex and Maya;
  2. makes them friends through the invite code;
  3. has each of them cheer the other's latest workout;
  4. analyses the meal photo.

  The screens and the flow are the real app. The analysis answer comes from the stand-in, which always replies "Eggs on toast": scrambled eggs 180 kcal and toast 160 kcal, about 340 kcal, likely 260 to 420. That is why the photo is eggs on toast. Before release, capture frame 3 once against the real backend (see "For the owner").
- Phone screens are captured at 390 x 844 CSS px at 3x. iPad screens are captured at 1032 x 1376 at 2x, which is the app's real tablet layout. The iPad set never shows a stretched phone screen.
- The frame design is in the Pour look:
  - a flat raspberry ground (`#C43670`);
  - a Bricolage Grotesque ExtraBold headline in champagne, with a tickle-pink level line under its second line;
  - Hanken Grotesk SemiBold for the support line;
  - an aubergine device that runs off the bottom of the frame.

  On most frames, the card that carries the frame's idea is shown again beside the device, larger, with cup corners (6 6 22 22 scaled) and an aubergine edge. There are no gradients and no shadows. Fonts load from `node_modules/@expo-google-fonts`.

### The eight frames

Upload them in this order. Frame 1 is the one shown in search results. The figures quoted below are from the run of 15 November 2026. The demo data is dated relative to the day of the run, so some of them shift a little from one run to the next.

| # | File | Headline | Support line | What it shows |
| --- | --- | --- | --- | --- |
| 1 | `01-day-fills-up.png` | Watch your day / fill up | Calories, macros and exercise in one cup | Today (`/`) in Blossom: Good evening, the week of mini cups and the energy card lifted out. The card shows the cup with hatched exercise headroom, **931 kcal left**, 1,219 eaten, the protein, carbs and fat bars, and "Budget 2,150 = 1,860 target + 290 from exercise". |
| 2 | `02-two-taps.png` | Log lunch in / two taps | Your usual foods are already waiting | Add to lunch (`/food/search?meal=lunch`) on the Usual tab. The first four usual foods are lifted out with their one-tap + buttons and their source marks ("Reference"). |
| 3 | `03-honest-estimate.png` | A photo, an / honest estimate | A likely range, and you check every item | The photo estimate (`/food/photo`) after analysing a CC0 photograph of eggs on toast. The lifted card shows the photo, "Eggs on toast", **~340 kcal, likely 260 to 420 kcal**, and the two item chips. On the screen behind it: the macros, the "Were the eggs cooked in butter or oil?" question and "Add to breakfast". |
| 4 | `04-water.png` | Water goals / fill to the brim | Reminders say what is left, then stay quiet | Water (`/water`) with the goal met: a brim-full cup with the brim line, 102%, 3.38 L drunk, "Goal reached for today". |
| 5 | `05-workouts.png` | Workouts from / your watch | App Store: Import Garmin files with measured calories. Play: From Garmin files or Health Connect | Train (`/train`): the week's 287 minutes against the 150-minute guideline, and the "Import workouts from Garmin" and "Automatic sync" links. Lifted out is yesterday's run: 46 min, 8.2 km, "Garmin · measured", 522 kcal net. |
| 6 | `06-weekly-recap.png` | A weekly check-in, / no shame | Wins first. Over budget is just information. | The weekly check-in (`/recap`). Lifted out are the win of the week (for example "Protein averaged 151 g, on your 152 g target") and the four tiles. Behind it is the day-by-day chart, where one day over budget wears an amber lip. |
| 7 | `07-friends.png` | Friends who / cheer you on | They see workouts, never food or weight | Friends (`/friends`): the invite code with its privacy line. Lifted out are Maya's week (270 min, 33 day streak, mini cups, a cheered volleyball session) and "Maya cheered your volleyball". |
| 8 | `08-free.png` | Free. No ads. / No paywall. | Three looks, full export, your data stays yours | Three whole devices showing Today: Blossom in front, dark and light behind. |

Each support line fits on one line at every size. On the App Store, frame 5 does not name Health Connect, because Apple refuses metadata that names another mobile platform.

## Words

Limits checked on the stores' own pages (see "Specifications read"). Counts are characters.

### Both stores

**App name** (Apple 30, Play 30): 26

```
HealthCal: Calorie Counter
```

**First sentence of the description**:

```
Log a meal in two taps and watch your day fill up: calories, macros, water and workouts in one place, free and with no ads.
```

### App Store

**Subtitle** (30): 30. "Counter" is already in the name, so the subtitle spends its words on the rest of the app. It leaves out "free": Apple's guideline 2.3.7 asks that the name, subtitle and keywords carry no pricing information.

```
Food, water, workouts. No ads.
```

**Promotional text** (170): 129

```
Log a meal in two taps and watch your day fill up: calories, macros, water and workouts in one place, with no ads and no paywall.
```

**Keywords** (100 bytes): 96. They are comma-separated, with no words from the name and no trademarks.

```
food diary,macro,protein,water tracker,diet,weight loss,nutrition,meal log,workout,fasting,carbs
```

**Description** (4,000): the full description below, without the Health Connect paragraph.

### Google Play

**Short description** (80): 79

```
Log food in two taps. Calories, macros, water and workouts. No ads, no paywall.
```

**Full description** (4,000): the full description below, with the Health Connect paragraph.

### Full description

App Store: 2,542 characters. Play, with the Health Connect paragraph: 2,716.

```
Log a meal in two taps and watch your day fill up: calories, macros, water and workouts in one place, free and with no ads.

YOUR DAY AS A CUP
Today shows your day as one cup: what you have eaten, what is left, and the exercise you added on top. Protein, carbs and fat sit beside it, and a strip of small cups shows the week at a glance.

FAST LOGGING
- Your usual foods for each meal are waiting at the top, with a one-tap add.
- Recents, favourites, saved meals and recipes, and repeat yesterday's meal.
- Search hundreds of built-in foods, scan a barcode, or quick-add calories.
- Every food shows where its numbers come from: built-in reference data, the community, your own foods or an estimate.

HONEST NUMBERS
- Describe a meal or take a photo, and get an estimate with a likely range rather than one exact number. You check and change every item before it is logged. (Needs a free account. There is a daily allowance.)
- Exercise adds only the calories above resting to your budget, so nothing is counted twice.
- Calorie burn is shown as an estimate with a range, unless a device measured it.

WATER, GOALS AND REMINDERS
- Water fills its own cup. Coffee, tea, juice and milk count toward the goal too.
- Reminders carry real numbers, such as how much water is left. They respect quiet hours and skip themselves once a goal is met.

WORKOUTS
- More than a hundred activities, plus strength workouts with sets and reps.
- Import workouts from Garmin files (FIT, TCX, GPX, CSV or a ZIP from Garmin Connect) with their measured calories, distance and heart rate.
- The weekly activity guideline (150 minutes) fills up as you go.

PROGRESS WITHOUT SHAME
- Weight trend, body measurements, sleep and fasting.
- A weekly check-in that starts with your win of the week. Going over budget is shown as information, never as failure.
- A logging calendar and streaks that forgive: one missed day does not break a streak.

FRIENDS WHO CHEER
Add friends with an invite code and cheer each other's workouts. Friends see your activity minutes, sessions, streak and recent workouts. They never see your calories, weight or food.

YOURS
- Works without an account; your data lives on your phone. Sign in only if you want sync across devices, friends, meal estimates or the AI coach.
- Full export of your data, and delete your account at any time.
- Three looks: Blossom, light and dark. Metric or imperial units.
- No ads. No paywall. No premium tier.

HealthCal gives estimates for everyday tracking. It is not a medical device and does not give medical advice.
```

Play only: add this paragraph at the end of WORKOUTS.

```
- On Android, sync workouts automatically from Health Connect: exercise sessions with their calories and distance from Garmin Connect, Samsung Health, Fitbit and other apps. Your daily steps show on your training week, and each night's sleep fills your sleep log; neither is ever added to your calories. With your permission it also brings in your weigh-ins from a connected scale, and the heart rate of each workout.
```

App Store only, once an iPhone build with Apple Health (the library is bound since November 2026: docs/health-sync.md, "How the iPhone side is bound") has been checked on a phone and is the one submitted: add this paragraph at the end of WORKOUTS. Apple's review asks that an app using HealthKit says so in its description and in the app (the sync screen is named "Workout sync" and says "From Apple Health"; the Profile row opens it).

```
- Works with Apple Health: workouts from your Apple Watch, Garmin Connect and other apps arrive by themselves, with their calories and distance. Your daily steps show on your training week, and each night's sleep fills your sleep log; neither is ever added to your calories. It can also bring in your weigh-ins from a connected scale, and the heart rate of each workout. HealthCal only reads from Apple Health and never writes to it.
```

## Specifications read

Read on 14 November 2026:

- Apple, screenshot specifications: https://developer.apple.com/help/app-store-connect/reference/screenshot-specifications/
  - iPhone with Dynamic Island, large display, accepts 1260 x 2736, 1290 x 2796 and 1320 x 2868.
  - iPhone with Dynamic Island, medium display, accepts 1206 x 2622 and 1179 x 2556. Its "Required device sizes" section asks for at least one of these.
  - iPad 13" accepts 2064 x 2752 and 2048 x 2732, and is required if the app runs on iPad.
  - 1 to 10 screenshots per size, as .png, .jpg or .jpeg, with no alpha channel.
- Apple, app information: https://developer.apple.com/help/app-store-connect/reference/app-information/app-information. The name and the subtitle are each 30 characters at most. A privacy policy URL is required.
- Apple, platform version information: https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information. Promotional text is 170 characters at most, the description 4,000 and keywords 100 bytes.
- Google Play, preview assets: https://support.google.com/googleplay/android-developer/answer/9866151
  - JPEG or 24-bit PNG with no alpha.
  - Each side between 320 and 3,840 px, and the long side at most twice the short side.
  - Up to 8 screenshots per device type.
  - To be eligible for featuring, an app needs at least four portrait screenshots at 9:16, at least 1080 x 1920.
- Google Play, store listing: https://support.google.com/googleplay/android-developer/answer/9859152. The app name is 30 characters, the short description 80 and the full description 4,000.

## Photograph

Frame 3 uses one photograph, kept at `store/source/scrambled-eggs-on-toast-cc0.jpg` (a 1920 px wide rendition of the original).

- **Title:** Scrambled eggs on toast - Joe's Cafe 2024-04-14
- **Author:** Andy Li (Wikimedia user Onthewings), own work, 14 April 2024
- **Source:** https://commons.wikimedia.org/wiki/File:Scrambled_eggs_on_toast_-_Joe%27s_Cafe_2024-04-14.jpg
- **Licence:** Creative Commons CC0 1.0 Universal Public Domain Dedication (https://creativecommons.org/publicdomain/zero/1.0/). The file page states that the copyright holder dedicates the work to the public domain. No attribution is required, and the page carries no personality-rights or trademark warning.

To leave the photo out, run with `--describe`. Frame 3 then shows the same estimate reached from a typed description, with the caption "Describe a meal, / get a range" and the support line "An honest estimate, and you check every item".

## For the owner

The stores will ask for these, and only you can provide them:

1. **A hosted privacy policy URL.** Both stores require one, and Play requires it for health data. It should say:
   - the app works on the device without an account;
   - with an account, data syncs to your Supabase project;
   - a meal photo or description is sent to the analyse-food function and on to the AI model provider to make an estimate;
   - a question typed to the AI coach, with the last few typed questions and answers of that chat and, only while the person has switched "Share my week" on (after agreeing once in the app), a short summary of their week written on the phone (`buildCoachNote`: the goal and pace, calories eaten against the budget, protein and water as shares of the targets, training and sleep averages and the weight trend's direction; never a name, email, body weight, age, notes, heart rate, food names or a single record; on iPhone, nothing from Apple Health), is sent to the coach-chat function and on to the AI model provider to answer it; the chat is kept on the phone only; HealthCal's server keeps a daily count of questions, never the words;
   - with Workout sync on, workouts, their active and total calories and distance, daily steps and how long the person slept each night (sleep sessions and their stages; time awake and in bed are not counted), and, each allowed apart, weigh-ins with body fat, the day's total calories burned and the heart rate inside each workout are read from Health Connect on Android or Apple Health on iPhone (the iPhone side reads steps on an iPhone simulator and has not yet run on a real phone; docs/health-sync.md, "State of the iPhone side"); workouts are kept like hand-logged sessions (with their heart rate), nights like nights entered by hand in the sleep log and weigh-ins like weigh-ins entered by hand, steps and the day's calories burned only on the phone; health data goes to the AI provider only inside the summary of the week the person chooses to share with the AI coach (on iPhone, never anything from Apple Health), never to the food estimate, advertisers or anyone else, and nothing is written back;
   - friends see only minutes, sessions, streak and recent workouts;
   - how export and deletion work.
2. **Apple: App Privacy answers** (the "nutrition label"). Data linked to the user when an account exists:
   - Health and Fitness: food, water, weight, sleep and workouts;
   - Contact Info: the email address;
   - User Content: meal photos and descriptions, sent for analysis; HealthCal's server does not store them;
   - Other User Content: questions to the AI coach, sent to the AI provider to answer them; HealthCal's server does not store them. With "Share my week" on, Health and Fitness (calories against the budget, protein and water as shares of the targets, training and sleep averages, the weight trend's direction) is shared likewise, as a summary, after the person's explicit agreement;
   - Identifiers: the user ID.

   No tracking and no ads. Declare Photos (or Other User Content) as shared with a third-party AI provider, Anthropic, for app functionality only and not used for tracking. Apple's guideline 5.1.2 also asks that people are told, and agree, before personal data goes to a third-party AI service: the app asks once per device before the first estimate (`src/features/ai/AiConsentSheet.tsx`), says on the estimate screen where the photo or description goes, and lets people withdraw in About HealthCal, under Privacy. The AI coach asks apart, before the first typed question (`src/features/coach/CoachSheet.tsx`, its own agreement and version), shows the line "AI coach · not medical advice" on its screen, shows word for word what "Share my week" sends, and has its own withdraw row in About, "Coach chat".
   **Apple Health (HealthKit), for the review, once the Apple Health build is the one submitted** (the library is installed and bound, but no signed iPhone build has read Apple Health on a phone yet: docs/health-sync.md, "State of the iPhone side"). These lines are what App Review checks for an app that reads HealthKit (App Store Review Guidelines 2.5.1 and 5.1.3, read 16 November 2026):
   - *Usage text* (`NSHealthShareUsageDescription`, which the library's config plugin sets from app.json; docs/health-sync.md): "HealthCal reads the workouts, steps and sleep you choose from Apple Health to fill your training week and sleep log. It never writes to Apple Health and never sends this data to the AI functions." (The lead sets this text in app.json with the sleep change; until then app.json still has the earlier text without sleep.) There is no `NSHealthUpdateUsageDescription`: nothing is written.
   - *What is read* (5.1.3(i): "You must disclose the specific health data that you are collecting from the device"): workouts, active energy, walking and running distance, cycling distance, step count, sleep analysis (how long the person slept each night and its stages; time awake and in bed are not counted), body mass and body fat percentage (weigh-ins), resting energy (with active energy, the day's total burn, shown beside the app's estimate and never added) and heart rate (inside a workout only). The usage text must name the new ones before they ship (the lead updates app.json). Put this list in the privacy policy and in the App Review notes.
   - *Not used for ads or data mining, not shared* (5.1.3(i)): workouts become ordinary sessions in the person's own diary and nights ordinary entries in their sleep log (and their account if they have one); steps stay on the phone. Nothing from Apple Health goes to the AI provider (the AI coach's summary of the week leaves it out on iPhone while the usage text says so: `APPLE_HEALTH_LEFT_OUT` in `src/features/coach/note.ts`), to analytics or to advertisers. Friends see only the friends summary (minutes, sessions, streak, recent workouts' names, lengths, distances and dates), which is the same for a workout logged by hand.
   - *No iCloud* (5.1.3(ii)): HealthCal stores nothing in iCloud; the account backend is Supabase.
   - *Nothing written* (5.1.3(ii)): HealthCal never writes to HealthKit.
   - *In the app* (2.5.1, HealthKit used for fitness and integrated with the Health app): the sync screen names Apple Health, explains each type before iOS asks, and links to the Health app.
   - *App Privacy answers*: add "Fitness" (workouts, steps) and "Health" (sleep) under Health and Fitness, linked to the user only for workouts and sleep when an account exists; steps are not collected off the device.
   - *Review notes*: list what is read (the six types above, sleep analysis included), say that sync is off until switched on in Profile > Workout sync, and that a reviewer can turn it on with a test iPhone that has a workout (and, to see sleep, a night of sleep) in the Health app.
3. **Google Play: Health Connect declaration and Data safety form.**
   - In App content, the Health Connect permissions declaration: read access to exercise, active calories, total calories, distance, steps, sleep, weight, body fat and heart rate only, as `READ_PERMISSIONS` and docs/health-sync.md list them, with the reason for each and a link to the privacy policy. Steps were added after the first four: if the declaration was already filed, file the change (steps: "shown as a daily count on the training week; never added to calories, never shared"; sleep: "how long the person slept each night, kept in their sleep log; never added to calories; shared with an AI service only as a summary, only after the person's explicit agreement, for coaching; never shared otherwise").
   - Weight, body fat and heart rate were added after sleep (18 November 2026), and the use of the two calorie types changed. File the change with these lines, and tick "Nutrition and weight management" beside "Activity and fitness":
     - `READ_WEIGHT`: "Fills the person's weigh-in log, one reading a day, for their weight trend and the learned estimate of what they burn. Stored on the device and in their account when they have one. Shared with an AI service only as a summary (the trend's direction and rate a week, never a weight), only after the person's explicit agreement, for coaching; never shared otherwise, never used for ads."
     - `READ_BODY_FAT`: "Saved with that day's weigh-in when the same app measured it. Same storage and limits."
     - `READ_HEART_RATE`: "Only inside a workout, for its average and highest heart rate, shown on that workout. Never added to calories, never shared, never sent to AI."
     - `READ_TOTAL_CALORIES_BURNED`: "The calories of each workout, from which only the part above the person's resting rate is added to their day, and one total per day, shown on the device beside the app's own estimate for comparison only; never added to calories, kept on the phone only."
     - `READ_ACTIVE_CALORIES_BURNED`: "The calories a workout burned above resting, used when an app records no total, and to tell which days a watch recorded."
   - The Health apps declaration.
   - The Data safety form, with the same facts as Apple's answers. Health info: weight and body fat (collected, stored on the device and in the account when there is one); Fitness info: workouts, steps, sleep and heart rate. Health and fitness info is shared with an AI service only as a summary, only after the person's explicit agreement, for coaching ("Share my week" in the AI coach); otherwise not shared. Messages: "Other in-app messages", the questions typed to the AI coach, sent to the AI provider (Anthropic) to answer them, not stored on the server.
4. **Account deletion web link (Play).** Play asks for a web page where someone can request deletion without the app. The in-app "Delete account" is not enough on its own there.
5. **Age rating answers.** Apple's questionnaire and Play's IARC questionnaire. The app has no ads, no purchases, no gambling and no mature content. Friends can see a chosen display name and send cheers; there is no messaging between people; the coach is a chat with an AI, labelled as one. Answer the user-to-user questions with that in mind.
6. **A support address.** Apple needs a support URL that leads to real contact details, and Play needs a contact email. Neither is in this repository.
7. **Recapture frame 3 against the real backend before release.** That makes the estimate on the screen the real model's answer for that photo. Sign in on the web build of the production project, analyse `store/source/scrambled-eggs-on-toast-cc0.jpg`, and check that the screen reads as sensible as the stand-in's answer.
8. **Two wording risks to decide on:**
   - Frame 8 says "Free" in a screenshot. That is not the name, subtitle or keywords, which Apple's 2.3.7 covers, but some reviewers still object to price words.
   - Frame 5 names Garmin, a trademark, to state compatibility. If either worries you, the captions are in `FRAMES` at the top of `scripts/dev/store-frames.cjs`.
9. **The app icon** in the stores is the one in `assets/images`. It is not changed here.
10. **The AI coach before a store submission.**
   - Play's policy for AI-generated content asks for a way to report an answer inside the app. A "Report this answer" control is not in this version: it is needed before a Play submission.
   - The iPhone permission sentence in app.json ("never sends this data to the AI functions") changes with the next iPhone build. With it, the iPhone rule's constant changes too (`APPLE_HEALTH_LEFT_OUT` and `APPLE_HEALTH_PROMISE` in `src/features/coach/note.ts`; its test reads app.json and fails while the two disagree).
