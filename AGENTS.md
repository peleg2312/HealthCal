This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md

---

# HealthCal project guide

HealthCal is a calorie, nutrition, training and hydration tracker for iOS, Android and web from one Expo codebase. It is local-first: the device holds the working copy, an optional Supabase backend adds accounts, sync and AI food analysis.

## Product principles (from user research on existing apps)

1. Logging speed wins. The fastest path (recents, favourites, one-tap add, copy a previous meal) must never be more than two taps away.
2. Honest numbers. Calorie burn and AI food estimates are estimates: show them as a value with a range or a plain label, never false precision. Exercise adds net calories (above resting), never gross, so nothing is counted twice.
3. Trust the data source. Every food shows where its numbers come from (bundled reference, community, your own, AI estimate). Community and AI data rank below reference data.
4. No shame. Neutral, factual copy. Going over a target is information, not failure: use the warning (amber) colour, never red alarm styling, never "You failed" or "cheat". Streaks forgive a missed day.
5. Reminders are useful or silent. They carry live numbers ("620 ml left"), respect quiet hours, and skip themselves when the goal is already met.
6. Everything reversible. Deletes are soft and offer Undo via `toast()`. Irreversible actions (delete account, clear data) confirm with `ConfirmSheet`.
7. No paywalls, no ads, full export.

## Layout of the code

```
src/app/            routes (expo-router). Files here are screens only.
src/ui/             design-system components. Import from '@/ui'.
src/theme/          tokens (colours, spacing, radius, type) and useTheme().
src/types/          all domain types.
src/lib/            pure maths and helpers (no React, no storage): energy, exercise,
                    hydration, trend, body, nutrition, dates, units, id.
src/store/          zustand store (index.ts), derived data (selectors.ts), on-device saving
                    (persistence.ts) and the clock hooks (clock.ts).
src/data/           bundled foods.ts (341 foods) and activities.ts (108 activities with MET values).
src/services/       supabase, auth, sync, openFoodFacts, notifications, ...
src/features/<x>/   components and helpers private to one feature area (food, activity, import, health-sync, friends, ...).
src/components/     app-level components (TabBar).
supabase/           SQL migrations with their tests, and the analyze-food and food-search edge functions.
scripts/dev/        seed.mjs (demo data), shot.mjs (browser screenshots), end-to-end tests, the stand-in backend.
scripts/ops/        provision-supabase.mjs and verify-backend.mjs for a real Supabase project.
```

## Data rules

- Stored values are always metric (kg, cm, ml, km, kcal, g). Convert only for display and input with `@/lib/units` (`formatWeight`, `weightValue`, `weightToKg`, `formatVolume`, ...), driven by `profile.units`.
- Day keys are local-calendar `YYYY-MM-DD` strings from `@/lib/dates` (`today()`, `addDays`, `toISODate`). Never build one with `toISOString()`.
- Read with hooks from `@/store/selectors`: `useProfile()`, `useDay(date)`, `useDays(n)`, `useEnergyModel()`, `useWeightSeries()`, `useConsistency()`, `useLive('activities')`. They already filter soft-deleted records.
- Write with `useStore.getState().upsert(collection, record)`, `.remove(collection, id)` (soft delete), `.restore(collection, id)`, `.setProfile(patch)`, `.setSettings(patch)`, `.setReminders(patch)`. `upsert` fills `id` and `updatedAt`.
- Food goes to the diary only through `@/features/food/log` (`logFood`, `logQuickAdd`, `logItems`, `logSavedMeal`, `setEntryAmount`, `deleteEntry`), which handle recents, haptics and Undo. AI estimates become items with `rowsToLogItems` (`@/features/ai/estimate`) and then go through `logItems`.
- Never read the clock while rendering (`today()`, `new Date()`, `Date.now()`, `mealForTime()`): the React Compiler caches a render's results, and tab screens stay mounted for the whole session, so the value would be hours or days old. Use `useToday()` and `useNow()` from `@/store/clock`; the plain functions are fine inside event handlers and effects. `useEnergyModel(date)`, `useDays(count, end)` and `useConsistency(end)` take the date explicitly for the same reason.
- One record per day for weights and sleep: `upsert` gives them an id derived from the date, so saving a second value for a date replaces the first on every device.
- A tab screen that shows a day other than today (Today's week strip, the diary's `?date=`) reports it with `useReportViewedDay(date)` from `@/features/today/viewedDay`; the + sheet logs to that day.
- Favourites are the synced `favorites` collection (each record holds the food); `favoriteFoodIds` is derived from it.
- Synced collections are listed once in `COLLECTIONS` (`src/store/index.ts`). Adding one means: the type in `src/types`, the store's empty maps, the SQL check constraint in a new migration, the probe list in `supabase/tests/policies_and_sync.sql`, and a validator in `src/features/settings/exportFormat.ts`. `src/store/collections.test.ts` fails until all of them agree.
- Shared rules live in one place: a fully logged day is `isCompleteDay` (`@/lib/trend`), minutes toward the weekly activity guideline are `guidelineMinutes` (`@/lib/exercise`), "usual foods for this meal" is `usualFoods` (`@/features/food/usuals`). Do not re-implement them in a feature.
- Friends are not a synced collection. They live on the server behind functions (`supabase/migrations/20261115000000_friends.sql`, changed since only by later migrations such as `20261116000000_friends_hardening.sql`) and are read through `@/services/friends` (`useFriends`, `refreshFriends`, ...). What a friend may see is built by `buildFriendSummary` (`@/features/friends/summary`): minutes, sessions, streak and recent workouts only (catalogue name and emoji, length, distance, date). Never add calories, weight, food, notes, heart rate, a time of day or a device title to it. A workout is published and cheered by `shareRef(shareKey, id)`, never its record id (an imported workout's id encodes its start time); the server refuses anything else. The week is published with the share key it was built with (`social_publish(summary, key)`); on `stale_key` the app reloads the card and builds it again. A cheer is accepted only for a workout the friend publishes now or a real day of the last two weeks. Declines are silent and kept in `friend_declines` (the decliner can Undo for 15 minutes, then only by entering the other person's code), and the wrong-code and turn-on limits in `social_limits`, so turning friends off and on clears neither.
- Imported workouts (Garmin files) come through `@/features/import` (`readImportFile`, `prepareImport`, `entriesToSave`). They are ordinary `activities` records with `source`, `externalId`, `startedAt` and `measured` set; a device's calorie figure is the session's `kcalGross`, and `kcalNet` is that minus the resting share, as for hand-logged sessions.
- Automatic workout sync (Android, Health Connect) is `@/features/health-sync` (docs/health-sync.md). A platform adapter (`adapter.android.ts`; `adapter.ios.ts` and `adapter.ts` answer "not available here", so web and iPhone never load the native module) only lists the workouts in a time range; every rule is pure and tested against the in-memory adapter (`fake.ts`): `planSync` (`plan.ts`) runs them through the file import's own pipeline, `workoutEnergy` (`energy.ts`) decides the calories (the total is gross and net is that minus the resting share, the file import's rule, so a workout gets one net figure from a file or from Health Connect; with only active, gross is active plus the BMR share; with neither it is the app's estimate), `mergeOrigins` (`merge.ts`) keeps one reading when two apps recorded the same time. A synced workout is an ordinary `activities` record with `source: 'health'` and the record id the file import derives from the same start instant (`recordIdFor`), so a file and Health Connect, on any phone, write one record; the app it came from is in `externalId` (`'garmin:<start>'` for Garmin Connect, else `'health:<package>:<start>'`) and is read back with `syncedFrom` (`origins.ts`). Start a sync only through `healthSync` or `autoSync` (`sync.ts`): at most every 15 minutes by itself, one toast with Undo, failures only as a note on `/settings/health-sync`. The switch, the "Needs a look" list and the memory of deleted or skipped workouts are per phone (`useHealthSync`, on-device storage under its own key), never in the synced settings. Only read permissions for exercise, active and total calories and distance are requested; adding a data type means app.json, `READ_PERMISSIONS`, the explanation sheet, docs/health-sync.md and the Play Console declaration together. Health data never goes to the AI functions, and to friends only what `buildFriendSummary` already allows.
- Zustand v5: a selector must return a stable reference. Select raw slices (`useStore((s) => s.settings)`) and derive with `useMemo`; never return a fresh object or array from the selector itself.
- React Compiler is on. Write plain components; do not add manual `useMemo`/`useCallback` for render performance (memoising expensive derived data is still fine).

## UI kit (`import { ... } from '@/ui'`)

The visual identity is "Pour": the day fills up like a cup. Every amount is a flat colour poured into an open, straight-sided vessel, topped by a crisp level line (the `rim` colour), with what is left visible above it. The cup is a tumbler: straight sides, a round base, an open top with no lip. The rules for each piece are in its source comments (`src/ui/Vessel.tsx` for the cups, `src/theme/tokens.ts` for colours, type and the cup corner).

- Layout: `Screen` (props: `header`, `footer`, `tabs`, `scroll`, `padded`; `backdrop` is accepted but ignored, there is no glow), `Header` (`title`, `subtitle`, `back`, `close`, `right`; the header of every pushed screen), `SectionTitle`, `goBack()`, `TAB_BAR_SPACE`. The four tabs use `TabHeader` from `@/components/TabHeader` instead (see "The top of a screen").
- Surfaces: `Card` (`onPress`, `tone` surface/alt/transparent, `padding`; cup corners, 1 px border, flat; `gradient` is ignored), `Sheet` (a lid: 6 px top corners, the only shadow), `ConfirmSheet`, `Divider`.
- Text: `Text` with `variant` (display, h1, h2, h3, title, body, bodyStrong, label, caption, overline, numXL, numL, numM, unit), `color` (any theme colour name), `tabular`. Headings and every num variant are Bricolage Grotesque, the rest Hanken Grotesk. A unit is a nested `<Text variant="unit">` inside the number. `Text` keeps a number with its unit, a macro letter with its number ("P 102 g"), a portion ("1.5 × 1/2 cup") and a range ("59-79 kg") on one line (`keepTogether` from `@/lib/text`, no-break spaces and word joiners), so a line of numbers breaks only at its words and separators: build lines with plain spaces and let `Text` do it; a string drawn by anything else (an SVG label, a placeholder) needs `keepTogether` itself. Browser tests that read text normalise `\u00A0` and drop `\u2060`. `Text` and the text fields cap the phone's text-size setting at `MAX_FONT_SCALE` (1.3) so large text grows without breaking a row; web ignores it, so check it on a phone.
- Actions: `Button` (variant primary/secondary/ghost/danger/soft, size sm/md/lg, `icon`, `tint` for a data-coloured edge, `loading`), `IconButton` (44 square cup by default), `PressableScale` (`dimDisabled`; `hitSlop` widens the touch target on web as well as natively, without changing the look or the layout), `Chip` (`dropdown`), `ChipRow`, `Segmented` (underline tabs), `Badge`.
- Input: `TextField`, `NumberField` (`value: number | null`), `Stepper` (`compact` for a row that also holds a label on a 320 px phone), `parseNumber`. A button beside a field matches the field's 50 px height (`style={{ height: 50 }}`). A one-line field's placeholder must fit the field at 320 px (the browser clips it mid-word): give narrow phones a shorter one, as food search does.
- Lists: `ListRow`, `ToggleRow` and `Toggle` (the Pour switch: a 40 x 24 cup with a square-ish knob, the same on every platform, never the platform's pill), `Avatar` (cup tile: `initials`, `emoji` or an icon), `EmptyState` (draws an empty dashed cup; `emoji` is ignored), `Stat` (`color` gives a cup key, the number stays text-coloured), `CupKey` (legend key and data-source mark: filled, outline, dashed).
- Amounts: `Vessel` (the open cup: `value`, `max`, `headroom` hatched at the top, amber lip when over, `labels` at the height they describe, `children` under the labels; `lip` is accepted but ignored), `MiniCup` (week strips and lists, 30 x 38), `Trough` (the sideways vessel), `ProgressBar` (flat fill with the rim tick; over target turns amber), `Hatch`. All four take `goalKind` ('limit' by default, 'reach' for a goal that is meant to be reached) and `onReached`; see "Reaching a goal" under Design rules.
- Data viz: `BarChart` (slim cups with a rim, amber above `goal`, `openIndex` hatched; `highlightIndex` prints that bar's value and never dims the others, so every finished bar keeps its colour and its rim), `LineChart`, `Sparkline`, `MacroBar`. `goalKind="reach"` on `BarChart` for a goal that is not a limit (water, minutes): nothing turns amber, and a bar at or past the goal wears the brim line (its rim 1 to 2 px wider each side and 1 px heavier). Bar fills are drawn at `useTheme().chartFill` (42% on the light papers, 70% in dark, where 42% would turn every colour brown); a tint you draw yourself to sit beside a chart is `withOpacity(color, chartFill)` from `@/theme`, never a hex suffix. There is no ring: amounts are shown with `Vessel`, `MiniCup`, `Trough` or `ProgressBar`.
- Feedback: `toast(message, { label, onPress, tint })`, `haptic.tap/press/select/success/warn`. The toast is an ink cup with a level line along its top in `tint` (the data colour of what was logged, as a theme colour name such as `'water'`, which also works from code outside React, or a colour value; the primary by default). It rests 12 px above the bottom chrome of the screen that is showing (the tab bar, a `Screen` footer or the home indicator; `Screen` reports it with `useToastDock` while it is focused, so a toast raised on one screen moves above the next one's tab bar the moment it shows), never mid-screen and never over the tab bar or a footer. A `Sheet` shows toasts itself, just above its top edge, so there is one `toast-action` on screen at a time.
- Icons: `lucide-react-native` only, stroke 1.9 (2.2 when active or on a button), 18 to 22 px, colour from the theme. A data icon takes its data colour only when it stands alone; next to a number use a `CupKey`.
- Motion (three verbs: pour, settle, tick; tokens in `motion` from `@/theme`, see `src/theme/motion.ts`):
  - `useReducedMotion()` is the one switch for the whole app (the system setting, prefers-reduced-motion on web, and any automated browser unless the page sets `window.__healthcalMotion = true` before loading). Every kit animation already obeys it; anything you animate yourself must too (`isReducedMotion()` outside components).
  - `Vessel`, `MiniCup`, `Trough` and `ProgressBar` pour on mount and on change and the rim settles. `delay`, `duration`, `animate`, and `memoryKey` (a stable key such as `cal-${date}`, so a remount with the same level does not pour again). `MiniCup` takes `index` for a left-to-right stagger in a row. With `goalKind="reach"`, crossing the goal on screen makes the rim flash once in the data colour (`useReachFlash`; skipped under reduced motion and when Celebrations is off in Profile).
  - `AnimatedNumber`: a `Text` whose number ticks to each new value (`value`, `format`, `decimals`, `from` to count up on mount, `memoryKey`; children go after the number, e.g. the unit).
  - `FadeUp` (`index` for a sequence): content fading up 8 px on mount. `Screen` does this for every screen (`enter={false}` to opt out); on web it is the page change.
  - `AnimatedList` + `AnimatedItem` (keyed by the row's id): rows slide in, fade out and the rest move smoothly. Key the list by the day it shows.
  - Charts pour their columns and draw their line once on mount; `Sheet` slides with a fading backdrop; tabs cross-fade; task screens (food search, quick add, scan, photo, import, add friend) rise from the bottom.
  - Only transforms and opacity animate. The stored value changes at once; never wait for an animation in code or tests. Screenshots (`shot.mjs`) and e2e runs are reduced motion; `shot.mjs --motion --frames=8` captures an animation frame by frame.

Read the component source in `src/ui/` for exact props before using one. If the kit lacks something you need, build it inside your own `src/features/<area>/` folder; do not edit `src/ui/`, `src/theme/`, `src/store/`, `src/lib/` or `src/types/` unless your brief says you own the file. Report gaps instead.

## Design rules

- Never hard-code a colour, font or radius. Use `useTheme()` (`colors`, `spacing`, `radius`) and the helpers from `@/theme` (`cup`, `cupFor`, `fonts`). There are three themes (dark: a warm black with cream text, no brown in the surfaces; light oat paper; and the pink Blossom theme) and all must look right, so never branch on `dark` to pick a colour: add a token instead.
- Flat only: no gradients, no glow, no blur, no shadows (the Sheet is the one exception). Everything is a flat fill plus one line.
- The level line is the signature: a 3 px `colors.rim` bar on top of every fill (2.5 px in mini cups and bar charts), the tick on every progress bar, the active tab and the selected segment. `rim` is never a data colour.
- Empty reads as empty. The part of a cup that is not filled is `colors.vesselEmpty` (equal to the card colour), outlined in `colors.vesselEdge`: never `track`, never a tint that could be taken for content. `colors.track` is for the unfilled part of a progress bar only. A cup drawn by hand follows the same rule and has no lip. Hatched exercise headroom stays visible as hatching.
- Reaching a goal. A goal that is meant to be reached (water, activity minutes, protein, a habit) is `goalKind="reach"` on `Vessel`, `MiniCup`, `Trough`, `ProgressBar` and `BarChart`; a budget (calories) is the default `'limit'`. Pass the real value, not one capped at the goal. At or past a reach goal the cup is brim-full and the level line becomes the brim line: it lies across the open top, 3 to 6 px wider than the cup on each side and 1 to 2 px heavier (on a bar or trough, a taller, heavier tick at the end). That is the whole reached state: no amber, no badge, no check mark on the cup, no confetti. When the level crosses the goal while the cup is on screen the brim line spreads into place and flashes once in the data colour; a cup that mounts already full, or again with the same `memoryKey`, does not. `onReached` fires once at that crossing (in the same tick as the change, also under reduced motion), so the screen adds `haptic.success()` and a line of neutral text there. Two things to know: a cup that can show more than one day needs a `memoryKey` with the day in it (a new key is a mount, so paging onto a day that met its goal marks nothing), and every mounted cup that sees the crossing calls its `onReached`, so a tab screen that stays mounted under another screen should react only while it is focused.
- Containers are cups: square shoulders on top, a round base. Spread `cup(radius.card)` on cards (6 6 22 22), `cup(radius.button)` on buttons, `cup(radius.buttonSm, 5)` on small buttons, `cup(radius.tile, 5)` or `cupFor(size)` on tiles, avatars and icon buttons. Labels (chips, segments, keys, badges) keep small equal corners (`radius.chip`, 6). Nothing is a pill, nothing is fully round, and no large uniform radius. `radius.pill` is 6 now; do not use it in new code.
- Semantic colours are fixed: calories `colors.calories`, protein `colors.protein`, carbs `colors.carbs`, fat `colors.fat`, water `colors.water`, exercise `colors.exercise`, sleep `colors.sleep`, weight `colors.weight`. Data colours are fills and key marks only, never text. Calorie numbers use `colors.caloriesInk`; other numbers use `text`. Exercise-added budget is hatched in `colors.headroom`; vessel outlines are `colors.vesselEdge`.
- Over target is `colors.warning` (amber lip on a vessel, the over part of a bar), with neutral words. Never red, and never for a goal that was reached. `warning` is a fill or a key mark only: warning text, and a warning icon beside text, use `colors.warningInk`.
- Status colours: `colors.success` is ink (equal to `text`), for done marks and checks; there is no status green, because it could not be told from exercise or carbs. `colors.danger` is a red of its own, at least 15 ΔE from the primary in every theme, for destructive actions and field errors.
- Contrast: 4.5:1 for small text, 3:1 for large numbers, for the level line against the empty part of a cup, for the cup outline and for a data fill on a card. `textTertiary` goes on `bg`, `surface` and the tab bar, never on `surfaceAlt`. `primary` as text goes only on `surface` (light primary on `bg` is 4.48); anywhere else (on `bg`, `surfaceAlt`, the soft button's fill) use `colors.primaryInk`. These rules are a test: `src/theme/contrast.test.ts` computes every pair for all three palettes and fails when a palette change breaks one (its last block records the one thing that cannot hold: the level line at 3:1 on top of a fill, which only the light palette reaches).
- One primary action per screen, pinned in the `Screen` footer when the screen is a form.
- The top of a screen. There are two headers and every screen uses one of them, passed as `Screen`'s `header` so it stays put while the page scrolls. Tab screens (Today, Diary, Train, Progress) use `TabHeader` (`@/components/TabHeader`): an overline (the date, the week, the range) over a one-line title, and on the right always Friends then the profile tile (which opens Profile, where settings live), the same on all four, with their own testIDs (`today-friends`, `diary-profile`, ...). Nothing else goes in it: a screen's own controls (Today's share, the diary's day arrows, Progress's range) sit in its content under the header. Today's title is its greeting; the name is left out when the line would not fit (`greetingTitle`). Pushed screens use the kit's `Header`: a back cup on the left, a title, always one short line under it (where you are or what it is for: "Today", "Target 74 kg", "Settings and goals"; a few words, never a sentence), so every title sits at the same height, and at most one action on the right, an `IconButton` cup (share, delete, favourite), never a text link. The screens that rise from the bottom as tasks (`TASK_SCREENS` in `src/app/_layout.tsx`: food search, quick add, scan, photo or describe, Garmin import, add a friend) close with the X (`close`); every other pushed screen goes back with the chevron. The header's title is the screen's title: never a second large title under it, in any state of the screen (a review step, a done step, an error, an empty state): what changes between steps goes in the short line ("Two things to check", "1 workout added"), and a heading in the content is at most a section title's size (`h3`, 18 px) unless it sits inside a card (a food's name, the recap's win of the week). The first-run flow (welcome, onboarding with its progress header, the sign-in gate's waiting screens) is the one exception and keeps its large question titles. Both headers start 8 px below the safe area and leave 16 px to the first content (the scroll area's 8 px top padding plus the header's own 8 px); keep it that way by not adding top margins or padding to a screen's first block. `node scripts/dev/tops.cjs <dir>` shows the top of every screen side by side and prints these numbers.
- Numbers that matter are large Bricolage (`numL`/`numXL`), their unit small (`unit` variant) beside them. Group related stats in one card, separated by dividers, rather than many small cards.
- Emoji are content marks only: 17 px, no tile, in food and activity rows. Never in headers, buttons, navigation or empty states. People get initials in a cup tile.
- Spacing comes from the scale (4, 8, 12, 16, 20, 24, 32). Screen side padding is 20 (handled by `Screen`). Card padding 16 to 18.
- Touch targets are at least 44 px (small buttons and chips are 32 to 36 visible with `hitSlop`, which the kit turns into a real hit area on web too: on anything built on `PressableScale`, pass `hitSlop={(44 - size) / 2}`). Every interactive element has an `accessibilityLabel` (the kit adds one from `title`/`label` where it can) and a stable `testID` in kebab-case (`food-search-input`, `log-activity-save`).
- Content is capped at 560 px wide and centred (handled by `Screen`), so the app reads well on tablets and desktop web.
- Empty states explain what the screen will show and offer the action that fills it.
- Sentence case everywhere. No exclamation marks in routine copy. Units always shown.

## Platform rules

- The same code runs on iOS, Android and web. Guard native-only APIs (camera, notifications, haptics, file system, sharing) with `Platform.OS` and give web a working fallback.
- `Alert.alert` does not work on web. Use `ConfirmSheet` or `toast`.
- Never nest one pressable inside another (for example a `Card` with `onPress` that contains a `Button` or `IconButton`). On web both render as `<button>`, which is invalid HTML and breaks keyboard and screen-reader use. Make them siblings: a row `View` holding the main `PressableScale` and the secondary button side by side.
- Navigation: `router.push('/path?x=1')`, `useLocalSearchParams()`. Leave a screen with `goBack()` from `@/ui` so a deep-linked page still has somewhere to go.

## Routes

```
/                      Today dashboard            (tabs)
/diary                 Food diary                 (tabs)   ?date=
/train                 Activity overview          (tabs)
/progress              Trends and insights        (tabs)
/welcome  /auth?mode=signin|signup  /onboarding
/food/search?meal=&date=      /food/detail?meal=&date=&entryId=   (new food arrives via @/features/food/draft)
/food/scan?meal=&date=        /food/photo?meal=&date=&mode=photo|text
/food/quick?meal=&date=       /food/custom?barcode=               /food/meals?meal=&date=
/food/meal-edit?id=&meal=&date=   saved meal or recipe builder     /food/meal-pick   adds foods to the open builder draft
/activity/pick?date=          /activity/log?activityId=&entryId=&date=      /activity/strength?entryId=&date=
/activity/import              Garmin import: pick FIT/TCX/GPX/CSV/ZIP files, review, save (docs/garmin-import.md)
/water  /weight  /body  /sleep  /fasting
/profile  /settings/goals  /settings/reminders  /settings/account  /settings/data  /settings/about
/settings/health-sync  automatic workout sync from Health Connect (Android): the switch, permission, last synced, "Needs a look"
/recap?week=           weekly check-in                /consistency   logging calendar
/friends               friends, invite code, requests, cheers (needs an account)
/friends/add?invite=   add a friend by code; invite links (healthcal://friends/add?invite=, never ?code=, which web sign-in reads) open here; an old ?code= still works
```

## Working on this project

- A web dev server is already running at http://localhost:8081 with hot reload. Do not start another one and do not stop it.
- Look at your screens in a real browser: `node scripts/dev/shot.mjs <route> <out.png>` loads demo data, opens the route at phone size and saves a screenshot, printing any runtime errors. Flags: `--empty` (profile but no data), `--fresh` (no profile), `--light`, `--theme=blossom`, `--imperial`, `--full`, `--2x`, `--tap=testIdA,testIdB`, `--type=testId:text`, `--wait=ms`, `--desktop`. Open the PNG with the Read tool and judge it critically: alignment, spacing, truncation, contrast, both themes, empty and filled states.
- Type-check with `npx tsc --noEmit`. Other people are editing other files at the same time, so errors in files you do not own are not yours to fix; if the bundle is broken by someone else's file, wait a minute and retry.
- Unit tests: `npx vitest run` (pure logic only, files named `*.test.ts`). `react-native`, AsyncStorage and `expo-crypto` are stubbed for tests (see `test/stubs/`).
- Browser tests read the app's live state with `await page.evaluate(() => JSON.parse(JSON.stringify(window.__healthcal.getState())))`. Do not parse `localStorage` yourself: the store is saved as many small values (`src/store/persistence.ts`), not one.
- `node scripts/dev/e2e.cjs` runs a new user's first day end to end; keep it passing.
- `node scripts/dev/evidence.cjs --out=<dir> --routes=/,/diary` gathers the facts about a set of screens with no judgement: every theme at 390 and 320 px, runtime errors, text that is cut off, pages wider than the screen and touch targets under 44 px, and the layout of the whole page: text drawn over text or running into the next text, a word split over two lines, text or a box reaching past the card or row that holds it, controls that overlap, content left under the tab bar or a footer at the end of the page, cards closer than 8 px, text closer than 4 px to its card's edge, text running into the screen's side gutter, cards with uneven side margins, a header that breaks the rule above (no short line, a second large title under it) and a toast over the tab bar, a footer or an open sheet's controls (judged at the real window height). Names that end in an ellipsis after their allowed lines are listed apart as "shortened by design"; `cut` is text clipped with no ellipsis, including a placeholder wider than its field. It writes `report.json` and one sheet per screen (`--empty`, `--fresh`, `--checks` to also run the test suite, `--show=100` to print more screens). Run it before asking anyone to review a screen; the header comment says what it leaves out on purpose, and `node scripts/dev/evidence-selftest.cjs` proves every scan (and every exception) against a hand-made fault: add a case there when you change a scan.
- States: `--states=<list>` runs `scripts/dev/states/<list>.cjs`, an array of `{ id, route, data: demo|empty|fresh|stress, imperial, day, type, taps, waitFor, sheet }` (format in the header of `evidence.cjs`; `sample.cjs` has one of each kind), so open sheets, other sections, first-run steps and edit modes are captured and scanned like routes; `--only=<id>` runs one. A capture that is blank, half-loaded or whose tap failed is retried, then reported as NOT CAPTURED, never clean.
- With a sheet open only the sheet is scanned, plus its top above the screen, content cut by the bottom, its last control under 12 px from the bottom, content inside its side padding and a toast over a control; `node scripts/dev/evidence-selftest.cjs` proves every scan against hand-made faults.
- Long content: `buildSeed({ stress: true })` (`shot.mjs --stress`, `data: 'stress'`, a fourth mode in `check-routes.cjs`) is the same five weeks with a 22-character name, 50 to 60 character food names, a 12-item meal, 11,480 and 0 kcal days, 12.5 L of water, 142.6 kg and a 412-day streak.
- `node scripts/dev/tops.cjs <dir> [--theme=blossom|light|dark] [--width=390]` crops the top of every screen into one sheet (`<dir>/_sheet.png`) and prints, per screen, where the header starts, its height, the gap to the content under it, where the title sits and how many lines the title block has. The four tabs must match each other, and so must the pushed screens.
- `node scripts/dev/check-routes.cjs` opens every route with nothing stored, with an empty profile and with demo data, and fails on any error screen. Add a new route to its list. A screen opened before setup is sent to `/welcome` by one rule in `src/app/_layout.tsx` (`OPEN_WITHOUT_PROFILE`); a new screen that must work without a profile is added there.
- `bash scripts/dev/test-sql.sh` applies the migrations to a throwaway local PostgreSQL and runs `supabase/tests/`. `scripts/dev/e2e-backend.cjs` exercises accounts, two-device sync, AI analysis and password reset against `scripts/dev/mock-backend.cjs` (see the README for the build it needs).
- Do not run git commands, do not install or remove packages, do not edit `package.json` or `app.json`. If you need a package or a change to a shared file, say so in your report.
