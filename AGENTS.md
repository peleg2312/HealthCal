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
src/store/          zustand store (index.ts) and derived data (selectors.ts).
src/data/           bundled foods.ts (341 foods) and activities.ts (108 activities with MET values).
src/services/       supabase, auth, sync, openFoodFacts, notifications, ...
src/features/<x>/   components and helpers private to one feature area.
src/components/     app-level components (TabBar).
supabase/           SQL migration and the analyze-food edge function (Claude vision).
scripts/dev/        seed.mjs (demo data) and shot.mjs (browser screenshots).
```

## Data rules

- Stored values are always metric (kg, cm, ml, km, kcal, g). Convert only for display and input with `@/lib/units` (`formatWeight`, `weightValue`, `weightToKg`, `formatVolume`, ...), driven by `profile.units`.
- Day keys are local-calendar `YYYY-MM-DD` strings from `@/lib/dates` (`today()`, `addDays`, `toISODate`). Never build one with `toISOString()`.
- Read with hooks from `@/store/selectors`: `useProfile()`, `useDay(date)`, `useDays(n)`, `useEnergyModel()`, `useWeightSeries()`, `useConsistency()`, `useLive('activities')`. They already filter soft-deleted records.
- Write with `useStore.getState().upsert(collection, record)`, `.remove(collection, id)` (soft delete), `.restore(collection, id)`, `.setProfile(patch)`, `.setSettings(patch)`, `.setReminders(patch)`. `upsert` fills `id` and `updatedAt`.
- Food goes to the diary only through `@/features/food/log` (`logFood`, `logQuickAdd`, `logAiItems`, `logItems`, `deleteEntry`), which handle recents, haptics and Undo.
- Zustand v5: a selector must return a stable reference. Select raw slices (`useStore((s) => s.settings)`) and derive with `useMemo`; never return a fresh object or array from the selector itself.
- React Compiler is on. Write plain components; do not add manual `useMemo`/`useCallback` for render performance (memoising expensive derived data is still fine).

## UI kit (`import { ... } from '@/ui'`)

- Layout: `Screen` (props: `header`, `footer`, `tabs`, `scroll`, `padded`), `Header` (`title`, `subtitle`, `back`, `close`, `right`), `LargeTitle`, `SectionTitle`, `goBack()`.
- Surfaces: `Card` (`onPress`, `gradient`, `tone`, `padding`), `Sheet`, `ConfirmSheet`, `Divider`.
- Text: `Text` with `variant` (display, h1, h2, h3, title, body, bodyStrong, label, caption, overline, numXL, numL, numM), `color` (any theme colour name), `tabular` for changing numbers.
- Actions: `Button` (variant primary/secondary/ghost/danger, size sm/md/lg, `icon`, `loading`), `IconButton`, `PressableScale`, `Chip`, `ChipRow`, `Segmented`, `Badge`.
- Input: `TextField`, `NumberField` (`value: number | null`), `Stepper`, `parseNumber`.
- Lists: `ListRow`, `ToggleRow`, `Avatar` (emoji tile), `EmptyState`, `Stat`.
- Data viz: `Ring`, `ProgressBar`, `BarChart`, `LineChart`, `Sparkline`, `MacroBar`.
- Feedback: `toast(message, { label, onPress })`, `haptic.tap/press/select/success/warn`.
- Icons: `lucide-react-native` (size 18 to 22 in rows, colour from the theme).

Read the component source in `src/ui/` for exact props before using one. If the kit lacks something you need, build it inside your own `src/features/<area>/` folder; do not edit `src/ui/`, `src/theme/`, `src/store/`, `src/lib/` or `src/types/` unless your brief says you own the file. Report gaps instead.

## Design rules

- Never hard-code a colour, font or radius. Use `useTheme()` (`colors`, `spacing`, `radius`). Both dark and light themes must look right.
- Semantic colours are fixed: calories `colors.calories`, protein `colors.protein`, carbs `colors.carbs`, fat `colors.fat`, water `colors.water`, exercise `colors.exercise`, sleep `colors.sleep`, weight `colors.weight`. A tinted background is the colour plus `'22'` (hex alpha).
- One primary action per screen, pinned in the `Screen` footer when the screen is a form.
- Numbers that matter are large (`numL`/`numXL`), their unit small and secondary beside them. Group related stats in one card rather than many small cards.
- Spacing comes from the scale (4, 8, 12, 16, 20, 24, 32). Screen side padding is 20 (handled by `Screen`). Cards use radius `lg`.
- Touch targets are at least 44 px. Every interactive element has an `accessibilityLabel` (the kit adds one from `title`/`label` where it can) and a stable `testID` in kebab-case (`food-search-input`, `log-activity-save`).
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
/activity/pick?date=          /activity/log?activityId=&entryId=&date=      /activity/strength?entryId=&date=
/water  /weight  /body  /sleep  /fasting
/profile  /settings/goals  /settings/reminders  /settings/account  /settings/data  /settings/about
```

## Working on this project

- A web dev server is already running at http://localhost:8081 with hot reload. Do not start another one and do not stop it.
- Look at your screens in a real browser: `node scripts/dev/shot.mjs <route> <out.png>` loads demo data, opens the route at phone size and saves a screenshot, printing any runtime errors. Flags: `--empty` (profile but no data), `--fresh` (no profile), `--light`, `--full`, `--tap=testIdA,testIdB`, `--type=testId:text`, `--wait=ms`, `--desktop`. Open the PNG with the Read tool and judge it critically: alignment, spacing, truncation, contrast, both themes, empty and filled states.
- Type-check with `npx tsc --noEmit`. Other people are editing other files at the same time, so errors in files you do not own are not yours to fix; if the bundle is broken by someone else's file, wait a minute and retry.
- Unit tests: `npx vitest run` (pure logic only, files named `*.test.ts`).
- Do not run git commands, do not install or remove packages, do not edit `package.json` or `app.json`. If you need a package or a change to a shared file, say so in your report.
