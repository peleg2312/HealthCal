/**
 * A health store that lives in memory. It behaves like the Android and iPhone
 * adapters (ranges, what may be read, details only where asked) without a phone, so the
 * rules and the sync are tested against it, and the browser build can show the
 * sync screen's states in development (sync.ts, `__healthcalHealthSync`).
 */
import {
  HealthError,
  NO_ACCESS,
  type BodySample,
  type DayEnergyDay,
  type HealthAccess,
  type HealthAdapter,
  type HealthAvailability,
  type HealthStore,
  type HealthWorkout,
  type SleepSample,
  type StepDayTotal,
} from './types';

export const FULL_ACCESS: HealthAccess = {
  workouts: true,
  activeEnergy: true,
  totalEnergy: true,
  distance: true,
  steps: true,
  sleep: true,
  weight: true,
  bodyFat: true,
  dayEnergy: true,
  heartRate: true,
};

export interface FakeHealth {
  store: HealthStore;
  availability: HealthAvailability;
  access: HealthAccess;
  /** What the permission sheet gives when asked; null: the person refuses. */
  grant: HealthAccess | null;
  workouts: HealthWorkout[];
  /** The store's own steps per day (already one count where apps overlap). */
  steps: StepDayTotal[];
  /** Make step reads fail (workouts are still read). */
  stepsFail: HealthError | null;
  /** The store's raw sleep samples, from every app, as the adapters list them (sleep.ts makes the nights). */
  sleep: SleepSample[];
  /** Make sleep reads fail (workouts and steps are still read). */
  sleepFail: HealthError | null;
  /** The store's raw weight and body-fat readings, from every app (body.ts makes one weigh-in a day). */
  weighIns: BodySample[];
  /** Make weigh-in reads fail (everything else is still read). */
  weighInsFail: HealthError | null;
  /** The store's own calories burned per day (dayEnergy.ts). */
  dayEnergy: DayEnergyDay[];
  /** Make day-energy reads fail (everything else is still read). */
  dayEnergyFail: HealthError | null;
  /** Make reads fail: at once, or after this many workouts' details were read (access taken away mid-sync). */
  fail: { error: HealthError; afterDetails?: number } | null;
  /** Milliseconds each read takes. */
  delayMs: number;
  /** How often each question was asked. */
  calls: {
    availability: number;
    access: number;
    request: number;
    reads: number;
    details: number;
    steps: number;
    sleep: number;
    weighIns: number;
    dayEnergy: number;
    settings: number;
    install: number;
  };
}

/** What each row's own "Allow" asks for (the rows added after sleep): only these flags can change. */
const ROW_FLAGS: Record<'steps' | 'sleep' | 'weight' | 'dayEnergy' | 'heartRate', (keyof HealthAccess)[]> = {
  steps: ['steps'],
  sleep: ['sleep'],
  weight: ['weight', 'bodyFat'],
  dayEnergy: ['dayEnergy'],
  heartRate: ['heartRate'],
};

export function createFakeAdapter(init: Partial<Omit<FakeHealth, 'calls'>> = {}): { adapter: HealthAdapter; health: FakeHealth } {
  const health: FakeHealth = {
    store: 'health-connect',
    availability: 'available',
    workouts: [],
    steps: [],
    stepsFail: null,
    sleep: [],
    sleepFail: null,
    weighIns: [],
    weighInsFail: null,
    dayEnergy: [],
    dayEnergyFail: null,
    fail: null,
    delayMs: 0,
    ...init,
    // A flag left out is not allowed (false), never undefined: a browser demo written before a flag existed
    // (window.__healthcalHealthDemo) then answers a row's Allow as refused, as a phone would, not as "no answer".
    access: { ...NO_ACCESS, ...init.access },
    grant: init.grant === undefined ? FULL_ACCESS : init.grant && { ...NO_ACCESS, ...init.grant },
    calls: { availability: 0, access: 0, request: 0, reads: 0, details: 0, steps: 0, sleep: 0, weighIns: 0, dayEnergy: 0, settings: 0, install: 0 },
  };
  const adapter: HealthAdapter = {
    get store() {
      return health.store;
    },
    availability: async () => {
      health.calls.availability += 1;
      return health.availability;
    },
    access: async () => {
      health.calls.access += 1;
      return health.access;
    },
    requestAccess: async (what = 'all') => {
      health.calls.request += 1;
      // Asked from one row (Steps, Sleep, Weight, Calories burned, Heart rate): only that row's flags can change.
      if (health.grant) {
        if (what === 'all') health.access = health.grant;
        else {
          const next = { ...health.access };
          for (const flag of ROW_FLAGS[what]) next[flag] = health.grant[flag];
          health.access = next;
        }
      }
      return health.access;
    },
    readWorkouts: async (range, access, options) => {
      health.calls.reads += 1;
      if (health.delayMs) await new Promise((resolve) => setTimeout(resolve, health.delayMs));
      if (!access.workouts || !health.access.workouts) throw new HealthError('permission', 'Reading exercise sessions is not allowed.');
      if (health.fail && health.fail.afterDetails === undefined) throw health.fail.error;
      const from = Date.parse(range.from);
      const to = Date.parse(range.to);
      const out: HealthWorkout[] = [];
      let detailsRead = 0;
      for (const w of health.workouts) {
        const start = Date.parse(w.startTime);
        if (Number.isFinite(start) && (start < from || start >= to)) continue;
        const wanted = options?.needsDetail ? options.needsDetail(w) : true;
        if (wanted) {
          if (health.fail && detailsRead >= (health.fail.afterDetails ?? 0)) throw health.fail.error;
          detailsRead += 1;
          health.calls.details += 1;
        }
        const heart = wanted && access.heartRate && health.access.heartRate;
        out.push({
          ...w,
          activeKcal: wanted && access.activeEnergy ? w.activeKcal : null,
          totalKcal: wanted && access.totalEnergy ? w.totalKcal : null,
          distanceM: wanted && access.distance ? w.distanceM : null,
          avgHeartRate: heart ? (w.avgHeartRate ?? null) : null,
          maxHeartRate: heart ? (w.maxHeartRate ?? null) : null,
        });
      }
      return out;
    },
    readStepDays: async (range, access) => {
      health.calls.steps += 1;
      if (health.delayMs) await new Promise((resolve) => setTimeout(resolve, health.delayMs));
      if (!access.steps || !health.access.steps) return [];
      if (health.stepsFail) throw health.stepsFail;
      // Like both stores: the days of the range that have steps.
      return health.steps.filter((d) => d.day >= range.fromDay && d.day <= range.toDay);
    },
    readSleep: async (range, access) => {
      health.calls.sleep += 1;
      if (health.delayMs) await new Promise((resolve) => setTimeout(resolve, health.delayMs));
      if (!access.sleep || !health.access.sleep) return [];
      if (health.sleepFail) throw health.sleepFail;
      // Like both stores: every sample that overlaps the range, the ones across its edges included.
      const from = Date.parse(range.from);
      const to = Date.parse(range.to);
      return health.sleep.filter((s) => Date.parse(s.end) > from && Date.parse(s.start) < to).map((s) => ({ ...s }));
    },
    readWeighIns: async (range, access) => {
      health.calls.weighIns += 1;
      if (health.delayMs) await new Promise((resolve) => setTimeout(resolve, health.delayMs));
      if (!access.weight || !health.access.weight) return [];
      if (health.weighInsFail) throw health.weighInsFail;
      // Like both stores: readings whose instant is in the range; body fat only where it may be read.
      const from = Date.parse(range.from);
      const to = Date.parse(range.to);
      const fat = access.bodyFat && health.access.bodyFat;
      return health.weighIns
        .filter((s) => (s.kind === 'weight' || fat) && Date.parse(s.time) >= from && Date.parse(s.time) <= to)
        .map((s) => ({ ...s }));
    },
    readDayEnergy: async (range, access) => {
      health.calls.dayEnergy += 1;
      if (health.delayMs) await new Promise((resolve) => setTimeout(resolve, health.delayMs));
      if (!access.dayEnergy || !health.access.dayEnergy) return [];
      if (health.dayEnergyFail) throw health.dayEnergyFail;
      return health.dayEnergy.filter((d) => d.day >= range.fromDay && d.day <= range.toDay).map((d) => ({ ...d, origins: [...d.origins] }));
    },
    openSettings: () => {
      health.calls.settings += 1;
    },
    openInstall: () => {
      health.calls.install += 1;
    },
  };
  return { adapter, health };
}
