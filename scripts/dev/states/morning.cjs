// The morning page ("Yesterday", /morning): yesterday at a glance, opened by itself on the first visit
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

/** 'YYYY-MM-DD' of the local day `daysAgo` before today. */
function localDay(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

module.exports = [
  // Yesterday as the demo has it, last night's sleep present.
  { id: 'morning', route: '/morning', waitFor: 'morning-card', note: "yesterday from the demo data, with last night's sleep" },
  { id: 'morning-first', route: '/morning?first=1', waitFor: 'morning-first', note: 'the first automatic showing: the line under the card about turning it off in Profile' },

  // Yesterday at chosen values (the seed's today, seen from tomorrow 08:10): no sleep for last night.
  { id: 'morning-within', route: '/morning', now, values: { eaten: 0.95, protein: 1.05, water: 1.1 }, waitFor: 'morning-card', note: "within the budget, protein and water reached (brim lines), last night's sleep missing: Add" },
  { id: 'morning-band', route: '/morning', now, values: { eaten: 1.06 }, waitFor: 'morning-card', note: '6% above the budget: "Within 10% of the budget"' },
  { id: 'morning-over', route: '/morning', now, values: { eaten: 1.3, exercise: 400 }, waitFor: 'morning-card', note: '30% above the budget with 400 kcal of exercise: the amber lip and the hatched headroom' },
  { id: 'morning-noeatback', route: '/morning', now, values: { eaten: 0.9, exercise: 300, eatBack: 0 }, waitFor: 'morning-card', note: 'exercise not added to the budget: no hatched headroom' },
  { id: 'morning-partial', route: '/morning', now, values: { eaten: 0.3 }, waitFor: 'morning-card', note: 'a day logged in part: the pale calorie cup, "partly logged"' },
  { id: 'morning-no-food', route: '/morning', now, values: { eaten: 0, water: 0.5 }, waitFor: 'morning-card', note: 'no food, half the water: dashed calorie and protein cups, "No food logged."' },

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
  { id: 'morning-empty', route: '/morning', data: 'empty', waitFor: 'morning-screen', absent: ['morning-cups'], note: 'nothing logged yesterday: the empty state in place of the shelf' },

  // The automatic opening (the hook in src/app/(tabs)/index.tsx): with the flag it rises over Today ...
  { id: 'morning-auto', route: '/', now, flags: { __healthcalMorning: true }, waitFor: 'morning-card', note: 'opened by itself on the first visit of the morning (the test flag set)' },
  // ... and without it an automated browser stays on Today.
  { id: 'morning-not-auto', route: '/', now, waitFor: 'today-friends', absent: ['morning-card', 'morning-screen'], note: 'the same morning without the flag: Today, no page' },

  // Profile's two rows (the switch and "See yesterday"): below the first view, so look at the __full.png.
  { id: 'profile-morning', route: '/profile', waitFor: 'profile-morning', note: "Profile's Morning summary switch and See yesterday row (in the __full.png)" },
];
