// Automatic sync from the phone's health store, seen in the browser: the in-memory health store
// (src/features/health-sync/fake.ts) stands in for Apple Health or Health Connect through the
// state's `health` field (evidence.cjs header). Workouts and steps are made relative to now, so
// the week on Train always has them. The Train states have steps only, so no "workouts added" toast covers the card.
// The Train states run on this week's Thursday evening (`now`), whatever day the scan runs, so the
// longest line ("31,250 steps today, 29,420 a day this week") is always the one drawn.
//
//   node scripts/dev/with-build.cjs -- node scripts/dev/evidence.cjs --url={url} --states=health --out=<dir>
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
];

const iphone = (over = {}) => ({ store: 'apple-health', availability: 'available', access: FULL, grant: FULL, workouts: appleWorkouts, steps, ...over });

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
    note: 'iPhone: a copy signed with a free Apple ID, which HealthKit refuses',
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
];
