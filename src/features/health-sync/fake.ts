/**
 * A health store that lives in memory. It behaves like the Android and iPhone
 * adapters (ranges, what may be read, details only where asked) without a phone, so the
 * rules and the sync are tested against it, and the browser build can show the
 * sync screen's states in development (sync.ts, `__healthcalHealthSync`).
 */
import { HealthError, NO_ACCESS, type HealthAccess, type HealthAdapter, type HealthAvailability, type HealthStore, type HealthWorkout, type StepDayTotal } from './types';

export const FULL_ACCESS: HealthAccess = { workouts: true, activeEnergy: true, totalEnergy: true, distance: true, steps: true };

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
  /** Make reads fail: at once, or after this many workouts' details were read (access taken away mid-sync). */
  fail: { error: HealthError; afterDetails?: number } | null;
  /** Milliseconds each read takes. */
  delayMs: number;
  /** How often each question was asked. */
  calls: { availability: number; access: number; request: number; reads: number; details: number; steps: number; settings: number; install: number };
}

export function createFakeAdapter(init: Partial<Omit<FakeHealth, 'calls'>> = {}): { adapter: HealthAdapter; health: FakeHealth } {
  const health: FakeHealth = {
    store: 'health-connect',
    availability: 'available',
    access: NO_ACCESS,
    grant: FULL_ACCESS,
    workouts: [],
    steps: [],
    stepsFail: null,
    fail: null,
    delayMs: 0,
    ...init,
    calls: { availability: 0, access: 0, request: 0, reads: 0, details: 0, steps: 0, settings: 0, install: 0 },
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
    requestAccess: async () => {
      health.calls.request += 1;
      if (health.grant) health.access = health.grant;
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
        out.push({
          ...w,
          activeKcal: wanted && access.activeEnergy ? w.activeKcal : null,
          totalKcal: wanted && access.totalEnergy ? w.totalKcal : null,
          distanceM: wanted && access.distance ? w.distanceM : null,
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
    openSettings: () => {
      health.calls.settings += 1;
    },
    openInstall: () => {
      health.calls.install += 1;
    },
  };
  return { adapter, health };
}
