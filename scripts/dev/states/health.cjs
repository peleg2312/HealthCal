// Automatic sync from the phone's health store, seen in the browser: the in-memory health store
// (src/features/health-sync/fake.ts) stands in for Apple Health or Health Connect through the
// state's `health` field (evidence.cjs header). Workouts and steps are made relative to now, so
// the week on Train always has them. The Train states have steps only, so no "workouts added" toast covers the card.
// The Train states run on this week's Thursday evening (`now`), whatever day the scan runs, so the
// longest line ("31,250 steps today, 29,420 a day this week") is always the one drawn.
//
//   node scripts/dev/with-build.cjs -- node scripts/dev/evidence.cjs --url={url} --states=health --out=<dir>
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const now = Date.now();
const atLocal = (daysAgo, hour, minute = 0, from = now) => {
  const d = new Date(from - daysAgo * DAY);
  d.setHours(hour, minute, 0, 0);
  return d.getTime();
};
/** This week's Thursday (weeks start on Monday, as Train's do), 18:00 local. */
const thursday = (() => {
  const d = new Date(now);
  const sinceMonday = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - sinceMonday + 3);
  d.setHours(18, 0, 0, 0);
  return d.getTime();
})();
const iso = (ms) => new Date(ms).toISOString();
const FULL = { workouts: true, activeEnergy: true, totalEnergy: false, distance: true, steps: true };

/** A workout as the health store lists it (HealthWorkout in types.ts). */
const workout = (store, id, origin, exerciseType, startMs, minutes, more = {}) => ({
  store,
  id,
  origin,
  originName: null,
  exerciseType,
  startTime: iso(startMs),
  endTime: iso(startMs + minutes * 60_000),
  zoneOffsetSec: null,
  title: null,
  activeKcal: null,
  totalKcal: null,
  distanceM: null,
  device: null,
  ...more,
});

/** 'YYYY-MM-DD' of a local day, `daysAgo` before `from`. */
const localDay = (daysAgo, from) => {
  const d = new Date(atLocal(daysAgo, 12, 0, from));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** The store's own steps per day (StepDayTotal), today first, then the days before it. */
const stepDays = (from, counts) => counts.flatMap((count, i) => (count ? [{ day: localDay(i, from), count }] : []));

const steps = stepDays(now, [8432, 7900, 8150, 0, 7800, 8200, 7650, 9100, 6400, 10200]);
const thursdaySteps = stepDays(thursday, [8432, 7900, 8150, 7800, 8200, 7650, 9100, 6400, 10200]);
const bigThursdaySteps = stepDays(thursday, [31250, 28940, 29900, 29420]);

const appleWorkouts = [
  workout('apple-health', 'w-run', 'com.apple.health.watch', 37, atLocal(1, 7), 42, { activeKcal: 455, distanceM: 7600, device: 'Apple Watch' }),
  workout('apple-health', 'w-garmin-ride', 'com.garmin.connect.mobile', 13, atLocal(2, 17, 30), 64, { activeKcal: 610, distanceM: 24800, device: 'Garmin Edge 540' }),
  // "Other workout": the screen asks which activity it was.
  workout('apple-health', 'w-other', 'com.apple.health.watch', 3000, atLocal(3, 18), 35, { activeKcal: 240, device: 'Apple Watch' }),
];

/**
 * One night of raw sleep samples (SleepSample in types.ts), as an adapter lists them: woken `daysAgo`
 * days before today (or before `from`) at 06:35 local, asleep from 23:10 the evening before, with light,
 * deep, REM and two short wakings; `staged: false` is one unstaged block, as an app without stages writes.
 * `store` 'healthConnect' or 'healthKit'; offsets left out, so the phone's own calendar is used.
 */
function sleepNight(store, origin, kind, daysAgo, { from = now, staged = true } = {}) {
  const bed = atLocal(daysAgo + 1, 23, 10, from);
  if (!staged) return [{ store, origin, kind, start: iso(bed), end: iso(bed + 445 * 60_000), zoneOffsetSec: null, stage: 'asleep' }];
  const parts = [
    ['light', 95],
    ['deep', 70],
    ['light', 40],
    ['awake', 6],
    ['rem', 45],
    ['light', 60],
    ['deep', 25],
    ['rem', 50],
    ['awake', 4],
    ['light', 30],
  ];
  const out = [];
  let t = bed;
  for (const [stage, minutes] of parts) {
    out.push({ store, origin, kind, start: iso(t), end: iso(t + minutes * 60_000), zoneOffsetSec: null, stage });
    t += minutes * 60_000;
  }
  return out;
}
const GARMIN_ANDROID = 'com.garmin.android.apps.connectmobile';
const garminNights = [...sleepNight('healthConnect', GARMIN_ANDROID, 'watch', 0), ...sleepNight('healthConnect', GARMIN_ANDROID, 'watch', 1)];
const watchNights = [...sleepNight('healthKit', 'com.apple.health.watch', 'watch', 0), ...sleepNight('healthKit', 'com.apple.health.watch', 'watch', 1)];
/**
 * A phone that allowed the six types read before weight and heart rate, as Health Connect answers it
 * (healthConnect.ts accessFrom): the day's calories need only the two calorie types, so they count as
 * allowed already; weight, body fat and heart rate are not.
 */
const ALL_ANDROID = { workouts: true, activeEnergy: true, totalEnergy: true, distance: true, steps: true, sleep: true, dayEnergy: true, weight: false, bodyFat: false, heartRate: false };
/** Health Connect with sleep allowed and these samples, sync on (and this phone's memory on top). */
const syncedSleep = (sleep, state = {}) => ({ demo: { store: 'health-connect', availability: 'available', access: ALL_ANDROID, grant: ALL_ANDROID, workouts: [], steps: [], sleep }, state: { enabled: true, ...state } });
/** Tomorrow at 08:10 local: the morning page's yesterday is the seed's today (morning.cjs). */
const tomorrowMorning = (() => {
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  d.setHours(8, 10, 0, 0);
  return d.getTime();
})();
/**
 * Today at 09:30 local, for the states that show last night: the demo night ends at 06:35 and a night
 * that ended under 15 minutes ago is left for a later sync (sleep.ts, rule f), so a capture made before
 * about 06:50 would show "Not logged yet" (seen on 18 November 2026).
 */
const todayMidMorning = (() => {
  const d = new Date(now);
  d.setHours(9, 30, 0, 0);
  return d.getTime();
})();
/** Synced Garmin nights for the last week, the one three days ago unstaged. */
const garminWeek = [0, 1, 2, 3, 4, 5, 6].flatMap((d) => sleepNight('healthConnect', GARMIN_ANDROID, 'watch', d, { staged: d !== 3 }));

const iphone = (over = {}) => ({ store: 'apple-health', availability: 'available', access: FULL, grant: FULL, workouts: appleWorkouts, steps, ...over });

/** Steps from a Health export as this phone keeps them (FileSteps in steps.ts), exported at `from`. */
function fileSteps(from, counts) {
  const days = {};
  for (const d of stepDays(from, counts)) days[d.day] = d.count;
  return { days, asOf: iso(from), asOfDay: localDay(0, from) };
}

/**
 * A synthetic Health export made now by make-health-export.mjs (steps and nights relative to today), kept in the
 * system temp folder and made again on another day. `mb`: export.xml's size. ('-sleep': files made before the
 * generator wrote nights are not reused.)
 */
function exportFile(name, mb, workouts = 24) {
  const dir = path.join(os.tmpdir(), 'healthcal-states-health');
  const file = path.join(dir, `${name}-sleep-${new Date().toISOString().slice(0, 10)}.zip`);
  if (!fs.existsSync(file)) {
    fs.mkdirSync(dir, { recursive: true });
    const run = spawnSync('node', [path.join(__dirname, '..', 'make-health-export.mjs'), `--out=${file}`, `--mb=${mb}`, `--workouts=${workouts}`], { encoding: 'utf8' });
    if (run.status !== 0) throw new Error(`make-health-export failed: ${run.stderr}`);
  }
  return file;
}

// ---------------------------------------------------------------- weight, the day's calories, workout heart rate
/** Every type allowed, the four added after sleep included (weight, body fat, the day's calories, heart rate). */
const ALL_NEW = { ...ALL_ANDROID, weight: true, bodyFat: true, dayEnergy: true, heartRate: true };
/**
 * Garmin weigh-ins as Health Connect lists them (BodySample in types.ts): one each morning at 06:12 local
 * for the `days` days up to today, drifting down from `startKg`, with body fat two minutes later when `fat`.
 */
function garminWeighIns(days, { startKg = 83.6, fat = true, from = now, store = 'healthConnect', origin = GARMIN_ANDROID } = {}) {
  const out = [];
  for (let d = days - 1; d >= 0; d--) {
    const t = atLocal(d, 6, 12, from);
    const kg = Math.round((startKg - ((days - 1 - d) * 1.2) / Math.max(1, days - 1) + (d % 3 === 0 ? 0.3 : -0.1)) * 10) / 10;
    out.push({ store, origin, time: iso(t), zoneOffsetSec: null, kind: 'weight', value: kg });
    if (fat) out.push({ store, origin, time: iso(t + 120_000), zoneOffsetSec: null, kind: 'bodyFat', value: Math.round((21.4 - (days - 1 - d) * 0.05) * 10) / 10 });
  }
  return out;
}
/**
 * The store's calories burned per day (DayEnergyDay in types.ts) for the `days` days before today, from Garmin;
 * the days listed in `gaps` have no active calories (the watch was off), so they do not count.
 */
function garminEnergy(days, { gaps = [], from = now } = {}) {
  const out = [];
  for (let d = 1; d <= days; d++) {
    const active = gaps.includes(d) ? 0 : 520 + ((d * 137) % 380);
    out.push({ day: localDay(d, from), kcal: 2240 + active, activeKcal: active, origins: [GARMIN_ANDROID, 'com.google.android.apps.healthdata'] });
  }
  return out;
}
/** Health Connect with every type, sync on, and these weigh-ins, day calories and workouts. */
const androidAll = ({ weighIns = [], dayEnergy = [], workouts = [], access = ALL_NEW, grant = ALL_NEW } = {}, state = {}) => ({
  demo: { store: 'health-connect', availability: 'available', access, grant, workouts, steps, sleep: [], weighIns, dayEnergy },
  state: { enabled: true, ...state },
});
/** A Garmin run yesterday morning with its heart rate. */
const heartRun = workout('health-connect', 'hc-heart-run', GARMIN_ANDROID, 56, atLocal(1, 7), 45, { activeKcal: 480, totalKcal: 552, distanceM: 8200, avgHeartRate: 142, maxHeartRate: 171 });

module.exports = [
  {
    id: 'train-steps',
    route: '/train',
    now: thursday,
    health: { demo: iphone({ workouts: [], steps: thursdaySteps }), state: { enabled: true } },
    waitFor: 'train-steps',
    note: 'Train on a Thursday with sync on: the week card says today\'s steps and the daily average',
  },
  {
    id: 'train-steps-last-week',
    route: '/train?week={day}',
    day: -7,
    health: { demo: iphone({ workouts: [] }), state: { enabled: true } },
    waitFor: 'train-steps',
    note: 'Train on last week: that week\'s daily average',
  },
  {
    id: 'train-steps-big',
    route: '/train',
    data: 'stress',
    now: thursday,
    health: { demo: iphone({ workouts: [], steps: bigThursdaySteps }), state: { enabled: true } },
    waitFor: 'train-steps',
    note: 'Train on a Thursday with long content and five-figure step counts: the longest line',
  },
  {
    id: 'train-steps-today-only',
    route: '/train',
    health: { demo: iphone({ workouts: [], steps: stepDays(now, [8432]) }), state: { enabled: true } },
    waitFor: 'train-steps',
    note: 'Train with steps for today only (a Monday, or the first day of sync)',
  },
  {
    id: 'health-sync-iphone-off',
    route: '/settings/health-sync',
    health: { demo: iphone({ access: { workouts: false, activeEnergy: false, totalEnergy: false, distance: false, steps: false } }) },
    waitFor: 'health-sync-switch',
    note: 'iPhone: Apple Health, sync off, nothing asked yet',
  },
  {
    id: 'health-sync-iphone-explain',
    route: '/settings/health-sync',
    health: { demo: iphone({ access: { workouts: false, activeEnergy: false, totalEnergy: false, distance: false, steps: false } }) },
    taps: ['health-sync-switch'],
    sheet: true,
    note: 'iPhone: what will be asked, before Apple Health\'s own sheet',
  },
  {
    id: 'health-sync-iphone-on',
    route: '/settings/health-sync',
    health: { demo: iphone(), state: { enabled: true } },
    waitFor: 'health-sync-steps',
    note: 'iPhone: sync on, workouts from the watch and Garmin Connect, one to look at, steps',
  },
  {
    id: 'health-sync-iphone-not-entitled',
    route: '/settings/health-sync',
    health: { demo: iphone({ availability: 'not-entitled', access: { workouts: false, activeEnergy: false, totalEnergy: false, distance: false, steps: false } }) },
    waitFor: 'health-sync-problem-not-entitled',
    note: 'iPhone: a copy signed without the HealthKit entitlement (AltStore, Sideloadly), which HealthKit refuses',
  },
  {
    id: 'profile-iphone-not-entitled',
    route: '/profile',
    health: { demo: iphone({ availability: 'not-entitled', access: { workouts: false, activeEnergy: false, totalEnergy: false, distance: false, steps: false } }) },
    waitFor: 'profile-health-sync',
    note: 'Profile on an iPhone copy without the HealthKit entitlement: the Workout sync row says it is not available here, never "Off. Add ..."',
  },
  {
    id: 'health-sync-android-steps-off',
    route: '/settings/health-sync',
    health: {
      demo: {
        store: 'health-connect',
        availability: 'available',
        access: { workouts: true, activeEnergy: true, totalEnergy: true, distance: true, steps: false },
        workouts: [workout('health-connect', 'hc-run', 'com.garmin.android.apps.connectmobile', 56, atLocal(1, 7), 45, { activeKcal: 480, totalKcal: 552, distanceM: 8200 })],
      },
      state: { enabled: true },
    },
    waitFor: 'health-sync-steps',
    note: 'Android: sync on from an earlier version, steps not allowed yet',
  },
  {
    id: 'health-sync-android-steps-refused',
    route: '/settings/health-sync',
    health: {
      demo: {
        store: 'health-connect',
        availability: 'available',
        access: { workouts: true, activeEnergy: true, totalEnergy: true, distance: true, steps: false },
        grant: { workouts: true, activeEnergy: true, totalEnergy: true, distance: true, steps: false },
        workouts: [],
      },
      state: { enabled: true },
    },
    waitFor: 'health-sync-steps',
    taps: ['health-sync-steps'],
    note: 'Android: Allow tapped on the steps row and steps refused again: a toast says so and opens Health Connect',
  },


  // ---------------------------------------------------------------- sleep (the Sleep row on the sync screen)
  {
    id: 'health-sync-android-sleep',
    route: '/settings/health-sync',
    // A profile and no diary: the demo data has a night entered by hand for today, which a sync never replaces.
    data: 'empty',
    health: { demo: { store: 'health-connect', availability: 'available', access: ALL_ANDROID, grant: ALL_ANDROID, workouts: [], steps, sleep: garminNights }, state: { enabled: true } },
    waitFor: 'health-sync-sleep',
    note: 'Android: sleep allowed, two Garmin nights synced; the Sleep row says last night and where it came from',
  },
  {
    id: 'health-sync-iphone-sleep-not-asked',
    route: '/settings/health-sync',
    health: { demo: iphone({ access: { ...FULL, sleep: false }, sleep: watchNights }), state: { enabled: true } },
    waitFor: 'health-sync-sleep',
    note: 'iPhone: sync on from before sleep was read; the five are allowed, sleep was never asked: the Sleep row offers Allow',
  },
  {
    id: 'health-sync-iphone-sleep-allowed',
    route: '/settings/health-sync',
    // A profile and no diary: the demo data has a night entered by hand for today, which a sync never replaces.
    data: 'empty',
    health: { demo: iphone({ access: { ...FULL, sleep: false }, sleep: watchNights, grant: { ...FULL, sleep: true } }), state: { enabled: true } },
    waitFor: 'health-sync-sleep',
    taps: ['health-sync-sleep'],
    note: 'iPhone: Allow tapped on the Sleep row, sleep allowed: a toast says so and the sync brings in the Apple Watch nights',
  },
  {
    id: 'health-sync-android-sleep-refused',
    route: '/settings/health-sync',
    health: {
      demo: { store: 'health-connect', availability: 'available', access: { ...ALL_ANDROID, sleep: false }, grant: { ...ALL_ANDROID, sleep: false }, workouts: [], steps, sleep: garminNights },
      state: { enabled: true },
    },
    waitFor: 'health-sync-sleep',
    taps: ['health-sync-sleep'],
    note: 'Android: Allow tapped on the Sleep row and sleep refused: a toast says so and opens Health Connect; no night is read',
  },
  {
    id: 'health-sync-android-explain-sleep',
    route: '/settings/health-sync',
    health: { demo: { store: 'health-connect', availability: 'available', access: { workouts: false, activeEnergy: false, totalEnergy: false, distance: false, steps: false, sleep: false }, grant: ALL_ANDROID, workouts: [] } },
    taps: ['health-sync-switch'],
    sheet: true,
    note: 'Android: what will be asked before Health Connect\'s own screen, with the Sleep line',
  },

  // ---------------------------------------------------------------- synced nights where they show (a sync runs at start on any route)
  {
    id: 'sleep-synced',
    route: '/sleep',
    // A profile and no diary: the demo data has its own nights entered by hand, which a sync never replaces.
    data: 'empty',
    now: todayMidMorning,
    health: syncedSleep(garminWeek),
    waitFor: 'sleep-last-night-from',
    note: 'the sleep log with a week of Garmin nights from Health Connect, one without stages, none rated: "From Garmin Connect" and the stages line',
  },
  {
    id: 'sleep-synced-sheet',
    route: '/sleep',
    data: 'empty',
    now: todayMidMorning,
    health: syncedSleep(garminWeek),
    waitFor: 'sleep-last-night-from',
    taps: ['sleep-log'],
    sheet: true,
    note: 'a synced night opened to edit: where it came from, no quality yet, Delete',
  },
  {
    id: 'morning-synced',
    route: '/morning',
    now: tomorrowMorning,
    health: syncedSleep(sleepNight('healthConnect', GARMIN_ANDROID, 'watch', 0, { from: tomorrowMorning })),
    waitFor: 'morning-card',
    note: 'the morning page with last night synced from Garmin Connect (no quality): the sleep cup against 7 h',
  },
  {
    id: 'health-sync-sleep-deleted',
    route: '/settings/health-sync',
    data: 'empty',
    // Last night was deleted (or its sync undone) on this phone: the memory says so and the sync leaves it out.
    health: syncedSleep(garminNights, { handled: { [`sleep:${localDay(0, now)}`]: { how: 'skipped', at: iso(atLocal(1, 23, 10)) } } }),
    waitFor: 'health-sync-sleep',
    note: 'Android: last night deleted: the Sleep row says a sync does not add it again, never "not yet"',
  },

  // ---------------------------------------------------------------- the Health app's export file (import)
  { id: 'import-health-start', route: '/activity/import', waitFor: 'import-apple-guide', note: 'the import start: the Health export and Garmin files, what each is and how to get it' },
  {
    id: 'import-health-reading',
    route: '/activity/import',
    taps: [{ choose: 'import-choose-files', files: [exportFile('reading', 400)] }, { wait: 1500 }],
    waitFor: 'import-cancel',
    note: 'a big Health export being read: the share read, and Cancel',
  },
  {
    id: 'import-health-review',
    route: '/activity/import',
    data: 'empty',
    taps: [{ choose: 'import-choose-files', files: [exportFile('small', 2)] }, { wait: 2500 }],
    waitFor: 'import-list',
    note: 'a Health export read: its workouts to review first, the steps and nights that go in with the import in the footer, the file notes (steps, sleep) under the list',
  },
  {
    id: 'import-health-review-big',
    route: '/activity/import',
    // On the demo data (five weeks of hand-logged sessions) a workout can match one already logged: the fourth chip, Duplicates.
    data: 'demo',
    taps: [{ choose: 'import-choose-files', files: [exportFile('large', 40, 200)] }, { wait: 9000 }],
    waitFor: 'import-list',
    note: 'a real-size export (200 workouts, some to choose, a duplicate): four filter chips, two by two; the demo has its own nights, so the sleep note says the file’s are already in the sleep log and the footer names only the steps',
  },
  {
    id: 'import-health-steps-only',
    route: '/activity/import',
    data: 'empty',
    taps: [{ choose: 'import-choose-files', files: [exportFile('small', 2)] }, { wait: 2500 }, 'import-untick-all'],
    waitFor: 'import-list',
    note: 'every workout unticked: the button saves only the steps and sleep ("Save steps and sleep")',
  },
  {
    id: 'import-health-done-steps-only',
    route: '/activity/import',
    data: 'empty',
    taps: [{ choose: 'import-choose-files', files: [exportFile('small', 2)] }, { wait: 2500 }, 'import-untick-all', 'import-submit', { wait: 700 }, { wait: 12500 }],
    waitFor: 'import-done-steps',
    note: 'only the steps and nights saved: "Steps and sleep saved", what each means, and Import more files',
  },
  {
    id: 'import-health-done-sleep-undone',
    route: '/activity/import',
    data: 'empty',
    taps: [{ choose: 'import-choose-files', files: [exportFile('small', 2)] }, { wait: 2500 }, 'import-untick-all', 'import-submit', { wait: 700 }, 'toast-action', { wait: 1500 }],
    waitFor: 'import-undone',
    note: 'steps and nights saved, then Undo: the steps off this phone, the nights out of the sleep log and not added from a file again',
  },
  {
    id: 'import-health-done',
    route: '/activity/import',
    data: 'empty',
    taps: [{ choose: 'import-choose-files', files: [exportFile('small', 2)] }, { wait: 2500 }, 'import-submit', { wait: 700 }, { wait: 12500 }],
    waitFor: 'import-done-steps',
    note: 'imported: the days, "Steps for 35 days saved on this phone" and "Sleep for 25 nights added to your sleep log" (about 25 of the 28-day window) (saved with the workouts, by Import)',
  },
  { id: 'health-sync-web-export', route: '/settings/health-sync', waitFor: 'health-sync-import-export', note: 'the browser: no health store, and the way forward is the Health export' },
  {
    id: 'train-file-steps',
    route: '/train',
    now: thursday,
    health: { state: { fileSteps: fileSteps(thursday, [8432, 7900, 8150, 7800, 8200, 7650, 9100, 6400, 10200]) } },
    waitFor: 'train-steps-source',
    note: 'Train on the web with steps from a Health export: the line and where it is from',
  },
  {
    id: 'train-file-steps-big',
    route: '/train',
    data: 'stress',
    now: thursday,
    health: { state: { fileSteps: fileSteps(thursday, [31250, 28940, 29900, 29420]) } },
    waitFor: 'train-steps-source',
    note: 'the same with long content and five-figure counts',
  },
  { id: 'train-steps-empty-web', route: '/train', waitFor: 'train-steps-import', note: 'Train on the web with no steps: one quiet line that leads to the import' },

  // ---------------------------------------------------------------- weight, the day's calories and heart rate (rows, Weight, Progress, a workout)
  {
    id: 'health-sync-android-weight',
    route: '/settings/health-sync',
    // A profile and no diary: the demo data has its own weigh-ins entered by hand, which a sync never replaces.
    data: 'empty',
    health: androidAll({ weighIns: garminWeighIns(14), workouts: [heartRun] }),
    waitFor: 'health-sync-weight',
    taps: [{ wait: 3000 }],
    note: 'Android: weight allowed, a fortnight of Garmin weigh-ins with body fat: the Weight row says the latest and "from Garmin Connect"; heart rate allowed',
  },
  {
    id: 'health-sync-android-weight-none',
    route: '/settings/health-sync',
    data: 'empty',
    health: androidAll({}, { weightReadAt: iso(now - HOUR) }),
    waitFor: 'health-sync-weight',
    note: 'Android: weight allowed and read, no weigh-in in Health Connect: "None in Health Connect in the last 4 weeks"; calories burned allowed with no days yet',
  },
  {
    id: 'health-sync-android-weight-waiting',
    route: '/settings/health-sync',
    data: 'empty',
    // The read fails here so the browser's own sync (no account: never held) leaves the held state as it was.
    health: { ...androidAll({}, { weightWaitingSince: iso(now - HOUR) }), demo: { ...androidAll().demo, weighInsFail: { code: 'unknown', message: 'held' } } },
    waitFor: 'health-sync-weight',
    note: 'Android, signed in: weigh-ins read but held because the account sync has not finished a round: the Weight row says it waits for the account',
  },
  {
    id: 'health-sync-android-weight-not-allowed',
    route: '/settings/health-sync',
    health: androidAll({ weighIns: garminWeighIns(14), access: ALL_ANDROID, grant: ALL_ANDROID }),
    waitFor: 'health-sync-weight',
    note: 'Android: sync on from before weight and heart rate were read (the six allowed): Weight and Heart rate offer Allow; Calories burned is already allowed by the two calorie types',
  },
  {
    id: 'health-sync-android-weight-allow',
    route: '/settings/health-sync',
    data: 'empty',
    health: androidAll({ weighIns: garminWeighIns(14), access: ALL_ANDROID, grant: ALL_NEW }),
    waitFor: 'health-sync-weight',
    taps: ['health-sync-weight-allow', { wait: 1500 }],
    note: 'Android: Allow tapped on the Weight row and allowed: a toast says so and the sync brings in the weigh-ins',
  },
  {
    id: 'health-sync-android-weight-refused',
    route: '/settings/health-sync',
    health: androidAll({ weighIns: garminWeighIns(14), access: ALL_ANDROID, grant: ALL_ANDROID }),
    // Checked after the tap: only the refusal's toast has an action ("Open"); "did not answer" has none.
    waitFor: 'toast-action',
    taps: [{ wait: 1500 }, 'health-sync-weight-allow'],
    note: 'Android: Allow tapped on the Weight row and refused again: "Weight is still not shared. Allow it in Health Connect" with Open',
  },
  {
    id: 'health-sync-iphone-new-not-asked',
    route: '/settings/health-sync',
    health: { demo: iphone({ access: { ...FULL, sleep: true }, grant: { ...FULL, sleep: true } }), state: { enabled: true } },
    waitFor: 'health-sync-weight',
    note: 'iPhone: the five and sleep allowed before this round: Weight, Calories burned and Heart rate offer Allow',
  },
  {
    id: 'health-sync-android-energy',
    route: '/settings/health-sync',
    health: androidAll({ dayEnergy: garminEnergy(7, { gaps: [3] }) }),
    waitFor: 'health-sync-energy',
    taps: [{ wait: 2500 }],
    note: 'Android: 7 days of Garmin calories, one without active calories: "About … kcal a day over 6 full days, from Garmin Connect"',
  },
  {
    id: 'health-sync-android-energy-few',
    route: '/settings/health-sync',
    health: androidAll({ dayEnergy: garminEnergy(3) }),
    waitFor: 'health-sync-energy',
    taps: [{ wait: 2500 }],
    note: 'Android: only 3 days recorded: "Shown on Progress after 5 full days recorded"',
  },
  {
    id: 'weight-synced',
    route: '/weight',
    data: 'empty',
    health: androidAll({ weighIns: garminWeighIns(14) }),
    waitFor: 'weight-targets-behind',
    // The sync's toast ("13 weigh-ins added …", 12 s with its Undo) has gone by the time the screen is captured.
    taps: [{ wait: 13000 }],
    note: 'Weight with a fortnight of Garmin weigh-ins: "From Garmin Connect" on each row and the targets card, the targets still on 78.4 kg',
  },
  {
    id: 'weight-synced-imperial',
    route: '/weight',
    data: 'empty',
    imperial: true,
    health: androidAll({ weighIns: garminWeighIns(14) }),
    waitFor: 'weight-targets-behind',
    taps: [{ wait: 13000 }],
    note: 'the same in pounds',
  },
  {
    id: 'weight-synced-sheet',
    route: '/weight',
    data: 'empty',
    health: androidAll({ weighIns: garminWeighIns(14) }),
    waitFor: 'weight-row-0',
    taps: [{ wait: 13000 }, 'weight-row-0'],
    sheet: true,
    note: 'a synced weigh-in opened to edit: where and when it came from, and that changing it makes it yours',
  },
  {
    id: 'weight-synced-use',
    route: '/weight',
    data: 'empty',
    health: androidAll({ weighIns: garminWeighIns(14) }),
    // waitFor is checked after the taps: the card is gone by then, and the toast is there.
    waitFor: 'toast-action',
    absent: ['weight-targets-behind'],
    taps: [{ wait: 13000 }, 'weight-use-latest'],
    note: '"Use it for targets" tapped: the toast "Targets now use … kg" with Undo, and the card gone',
  },
  {
    id: 'weight-first-read-toast',
    route: '/weight',
    data: 'empty',
    health: androidAll({ weighIns: garminWeighIns(26, { startKg: 85.2 }), workouts: [heartRun] }),
    waitFor: 'toast-action',
    note: 'the first read brings 26 weigh-ins and a workout: one toast with the second sentence, and Undo',
  },
  {
    id: 'progress-watch',
    route: '/progress',
    health: androidAll({ dayEnergy: garminEnergy(7, { gaps: [3] }) }),
    waitFor: 'progress-energy-watch',
    taps: [{ wait: 2500 }, 'progress-segment-body'],
    note: "Progress with 6 valid days of Garmin calories: the watch's estimate beside HealthCal's figure for the same days",
  },
  {
    id: 'progress-watch-none',
    route: '/progress',
    health: androidAll({ dayEnergy: garminEnergy(3) }),
    waitFor: 'progress-energy',
    taps: [{ wait: 2500 }, 'progress-segment-body'],
    absent: ['progress-energy-watch'],
    note: 'Progress with only 3 days recorded: no watch block',
  },
  {
    id: 'activity-heart-rate',
    route: '/train',
    data: 'empty',
    health: androidAll({ workouts: [heartRun] }),
    waitFor: 'log-activity-heart-rate',
    taps: [{ wait: 2500 }, 'session-running'],
    note: 'a synced Garmin run opened: "Heart rate: average 142 bpm, highest 171 bpm" under where it came from',
  },
];
