// The morning page (/morning): a greeting, the week in cups with the coach (what went well, the next step, the
// first step for today), the quote of the day, yesterday at a glance, what went well, what to improve and a plan
// for today (each without what the coach and the card already say), opened by itself on the first visit
// of a morning (src/features/morning/rule.ts) or from Profile > See yesterday. The format is in the
// header of scripts/dev/evidence.cjs.
//
//   node scripts/dev/with-build.cjs --dir=<build> --port=<port> -- node scripts/dev/evidence.cjs --url={url} \
//        --states=morning --widths=360 --out=<dir> [--only=morning-within]
// (one width per command: 360 first, then 390 and 320)
//
// How yesterday gets chosen values. The demo seed builds its days around the real today, and `values`
// shapes that today. Setting the page's clock (`now`) to TOMORROW 08:10 makes the seed's today the app's
// yesterday, carrying the values; last night's sleep is then dated tomorrow, which the seed never writes,
// so those states show the sleep cup's "Add". The states without `now` show the demo's real yesterday,
// with its sleep.
//
// Do not let a run cross local midnight. The clocks below (`now`, `evening`, `morningOf`) are worked out
// once, when this list is loaded, but the seed is built from the real today at each capture: after
// midnight the page's yesterday is no longer the seed's today and the case states fail (seen once at 390 px:
// morning-a-strong NOT CAPTURED, morning-c-half and morning-d-water timed out). evidence.cjs takes `now` as
// a number, so a run started late in the evening is split, or started again after midnight.
//
// The automatic opening: an automated browser never sees the page unless the window carries
// __healthcalMorning before the app starts (src/features/morning/allowed.ts), so morning-auto sets that
// flag and the morning clock and waits for the card, and morning-not-auto has the same clock without the
// flag and must stay on Today.

/** Tomorrow at 08:10, local time (the page runs in this time zone), in milliseconds. */
function tomorrowMorning() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(8, 10, 0, 0);
  return d.getTime();
}
const now = tomorrowMorning();

/** `daysAgo` days before today at 08:10 local: the stress seed's feast (two days ago) and 0 kcal day (three) become the page's yesterday. */
function morningOf(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(8, 10, 0, 0);
  return d.getTime();
}

/** Tomorrow at 19:30 local: the page opened in the evening from Profile ("Good evening", "Log dinner"). */
function tomorrowEvening() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(19, 30, 0, 0);
  return d.getTime();
}
const evening = tomorrowEvening();

/** 'YYYY-MM-DD' of the local day `daysAgo` before today. */
function localDay(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

module.exports = [
  // Yesterday as the demo has it, last night's sleep present.
  { id: 'morning', route: '/morning', waitFor: 'morning-card', note: "yesterday from the demo data, with last night's sleep" },
  { id: 'morning-first', route: '/morning?first=1', waitFor: 'morning-first', note: 'the first automatic showing: the line about turning it off in Profile, in the pinned footer over the two buttons' },

  // Yesterday at chosen values (the seed's today, seen from tomorrow 08:10): no sleep for last night.
  { id: 'morning-within', route: '/morning', now, values: { eaten: 0.95, protein: 1.05, water: 1.1 }, waitFor: 'morning-card', note: "within the budget, protein and water reached (brim lines), last night's sleep missing: Add" },
  { id: 'morning-band', route: '/morning', now, values: { eaten: 1.06 }, waitFor: 'morning-card', note: '6% above the budget: "Within 10% of the budget"' },
  { id: 'morning-over', route: '/morning', now, values: { eaten: 1.3, exercise: 400 }, waitFor: 'morning-card', note: '30% above the budget with 400 kcal of exercise: the amber lip and the hatched headroom' },
  { id: 'morning-noeatback', route: '/morning', now, values: { eaten: 0.9, exercise: 300, eatBack: 0 }, waitFor: 'morning-card', note: 'exercise not added to the budget: no hatched headroom' },
  { id: 'morning-week', route: '/morning', now, values: { eaten: 0.9, exercise: 400, spread: 1 }, waitFor: 'morning-card', note: 'workout calories over 7 days: the headroom of yesterday is its first share and the carried ones' },
  { id: 'morning-partial', route: '/morning', now, values: { eaten: 0.3 }, waitFor: 'morning-card', note: 'a day logged in part: the pale calorie cup, "partly logged"' },
  { id: 'morning-no-food', route: '/morning', now, values: { eaten: 0, water: 0.5 }, waitFor: 'morning-card', note: 'no food yesterday after a week with food, half the water: the large cup empty under "Not logged", dashed calorie and protein keys, "No food logged."' },

  // Long content, imperial units and nothing at all.
  { id: 'morning-stress', route: '/morning', data: 'stress', waitFor: 'morning-card', note: 'long names and big numbers' },
  { id: 'morning-stress-feast', route: '/morning', data: 'stress', now: morningOf(1), waitFor: 'morning-card', note: "the stress seed's 11,480 kcal feast as yesterday: the widest calorie number in a 62 px column at 320" },
  { id: 'morning-stress-zero', route: '/morning', data: 'stress', now: morningOf(2), waitFor: 'morning-card', note: 'a day logged with entries of 0 kcal: "Part of the day logged.", a 0 in the cup' },
  // Steps synced from the phone's health store (this phone's sync memory, as states/health.cjs keeps it), on the
  // stress seed's yesterday: the longest movement line beside a five-figure step count.
  {
    id: 'morning-steps',
    route: '/morning',
    data: 'stress',
    health: { state: { enabled: true, steps: { days: { [localDay(1)]: 28940 }, readAt: new Date().toISOString() } } },
    waitFor: 'morning-steps',
    note: 'yesterday with 28,940 steps from the health store, beside the longest movement line',
  },
  { id: 'morning-imperial', route: '/morning', imperial: true, waitFor: 'morning-card', note: 'water in fl oz' },
  { id: 'morning-empty', route: '/morning', data: 'empty', waitFor: 'morning-screen', absent: ['morning-cups', 'morning-week-yesterday'], note: 'nothing logged yesterday: no week picture, the plain card in place of the figures' },

  // The second edition's cases (the specification's A to G): a greeting, a personal line, the quote, yesterday's
  // card, "What went well", "What to improve" and "For today". The values knobs lastNight, weighInGap,
  // onboardedToday and name are described in scripts/dev/seed.mjs.
  {
    id: 'morning-a-strong',
    route: '/morning',
    now,
    values: { eaten: 0.95, protein: 1.05, water: 1.03, exercise: 290, weekMinutes: 105, lastNight: 7.5 },
    waitFor: 'morning-week',
    absent: ['morning-adjust', 'morning-note', 'morning-coach-improve', 'morning-plan-water'],
    note: 'a strong day: the week in cups with a workout, the coach naming two good things and the step for today (no improve line), the whole coach and the first line of the quote above the footer at 360 x 740; no "What went well" left to say (the coach names the workout and the night, the card the budget, protein and water), nothing to improve, the plan without the water row the coach names',
  },
  {
    id: 'morning-b-heavy',
    route: '/morning',
    now,
    values: { eaten: 1.3, protein: 0.74, water: 0.6, exercise: 0, lastNight: 5.67, weighInGap: 9 },
    waitFor: 'morning-plan-weigh',
    absent: ['morning-note'],
    note: 'more than 10% above the budget, a short night (a rest quote on the 10 days of 31 that have one, else the day\'s again quote), a weigh-in 9 days old: the coach names the logging habit and protein (74%, cut from the three-item list) as the next step, with today\'s share per meal; What to improve keeps the night and water (the card states the calories); the Eaten cell shows its share of the budget',
  },
  {
    id: 'morning-c-half',
    route: '/morning',
    now,
    values: { eaten: 0.19, protein: 0.12, water: 0, exercise: 0 },
    waitFor: 'morning-plan-sleep',
    absent: ['morning-well', 'morning-adjust'],
    note: 'breakfast only: the coach opens neutrally with "log the rest" as the next step, the note under the card, no lists, the plan with last night\'s sleep',
  },
  {
    id: 'morning-d-water',
    route: '/morning',
    now,
    values: { eaten: 0, water: 0.36, exercise: 0 },
    waitFor: 'morning-note',
    absent: ['morning-well', 'morning-adjust'],
    note: 'only water yesterday: "No food logged.", the note, no lists',
  },
  {
    id: 'morning-e-empty',
    route: '/morning',
    data: 'empty',
    now,
    waitFor: 'morning-coach',
    absent: ['morning-cups', 'morning-well', 'morning-adjust', 'morning-week-yesterday'],
    note: 'nothing logged yesterday, in the morning ("Good morning", "Log breakfast"): no week picture, only the coach in the block, the plain card, a plan and the quote',
  },
  {
    id: 'morning-f-day2',
    route: '/morning',
    now: evening,
    values: { eaten: 0.68, protein: 0.58, water: 0.58, onboardedToday: true, name: '' },
    waitFor: 'morning-week-yesterday',
    // The seed's today is the setup day and the page's yesterday; the day before it must not be drawn.
    // No streak tag in the first week: the seed's five weeks before setup would make it "33-day streak" beside "Day 2".
    absent: [`morning-week-day-${localDay(1)}`, 'morning-streak'],
    note: 'day 2, no name, opened in the evening: "Good evening", "Day 2 of your first week.", only two cups (Yesterday and Today, nothing before setup), no streak tag, "Log dinner"; the week\'s minutes count from the setup day, so nothing from the seed\'s history before setup is praised',
  },
  {
    id: 'morning-g-stress',
    route: '/morning',
    data: 'stress',
    imperial: true,
    now: morningOf(1),
    waitFor: 'morning-week',
    note: 'long content, imperial: the 22-character name left out of the title and shown in the personal line, the 11,480 kcal feast over the large cup a size down',
  },
  {
    id: 'morning-quote-longest',
    route: '/morning?quote=stevenson-quiet-minds',
    data: 'stress',
    now: morningOf(1),
    waitFor: 'morning-quote-text',
    note: 'the longest quote (143 characters) with the long name; run it at 320',
  },
  {
    id: 'morning-quote-verse',
    route: '/morning?quote=longfellow-up-and-doing',
    waitFor: 'morning-quote-text',
    note: 'a four-line verse quote: its line breaks kept',
  },
  {
    id: 'morning-evening',
    route: '/morning',
    now: evening,
    values: { eaten: 0.95, protein: 1.05, water: 1.03, exercise: 290, weekMinutes: 105, lastNight: 7.5 },
    waitFor: 'morning-coach',
    note: 'case A opened in the evening from Profile: "Good evening, ..." and "Log dinner"',
  },

  // The automatic opening (the hook in src/app/(tabs)/index.tsx): with the flag it rises over Today ...
  { id: 'morning-auto', route: '/', now, flags: { __healthcalMorning: true }, waitFor: 'morning-card', note: 'opened by itself on the first visit of the morning (the test flag set)' },
  // ... and without it an automated browser stays on Today.
  { id: 'morning-not-auto', route: '/', now, waitFor: 'today-friends', absent: ['morning-card', 'morning-screen'], note: 'the same morning without the flag: Today, no page' },

  // Profile's two rows (the switch and "See yesterday"): below the first view, so look at the __full.png.
  { id: 'profile-morning', route: '/profile', waitFor: 'profile-morning', note: "Profile's Morning summary switch and See yesterday row (in the __full.png)" },
];
