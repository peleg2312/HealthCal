/**
 * An update server and library in memory: for the tests, and for About's phone-only states in a
 * browser build made with the test hooks (./updates.ts reads `?updatesDemo=<preset>` from the
 * address in those builds only; scripts/dev/states/updates.cjs).
 */
import type { Pending, RunningInfo, UpdatesPort } from './port';

export interface FakeUpdates {
  running?: Partial<RunningInfo>;
  /** What the server has: nothing, or a newer update with this id. */
  server?: string | null;
  /** Already downloaded and waiting. */
  pending?: Pending;
  /** The next call to this fails, as with no network. */
  failCheck?: boolean;
  failReload?: boolean;
  /** How long a check takes, in ms. */
  delay?: number;
}

export interface FakePort extends UpdatesPort {
  calls: { check: number; fetch: number; reload: number };
}

const INSTALLED: RunningInfo = { embedded: true, emergency: false, emergencyReason: null, createdAt: null, updateId: null, runtimeVersion: '1', channel: 'production' };

export function createFakePort(o: FakeUpdates = {}): FakePort {
  let pending: Pending = o.pending ?? { pending: false, id: null };
  const listeners = new Set<() => void>();
  const calls = { check: 0, fetch: 0, reload: 0 };
  const wait = () => (o.delay ? new Promise((r) => setTimeout(r, o.delay)) : Promise.resolve());
  return {
    calls,
    running: { ...INSTALLED, ...o.running },
    check: async () => {
      calls.check += 1;
      await wait();
      if (o.failCheck) throw new Error('Network request failed');
      return !!o.server && o.server !== pending.id && o.server !== o.running?.updateId;
    },
    fetch: async () => {
      calls.fetch += 1;
      await wait();
      if (!o.server) return false;
      pending = { pending: true, id: o.server };
      for (const l of listeners) l();
      return true;
    },
    reload: async () => {
      calls.reload += 1;
      if (o.failReload) throw new Error('Could not reload');
      // As if the app had started again on the waiting update.
      pending = { pending: false, id: null };
      for (const l of listeners) l();
    },
    pending: () => pending,
    onChange: (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}

/** The demo presets About's browser states use. */
export const DEMO_PRESETS: Record<string, FakeUpdates> = {
  /** The code the app was installed with; a check finds nothing. */
  installed: { delay: 500 },
  /** An update from Nov 17 is running; a check finds nothing. */
  updated: { delay: 500, running: { embedded: false, updateId: 'demo-update-1', createdAt: new Date(2026, 10, 17, 9, 30) } },
  /** An update is running and a newer one is downloaded. */
  ready: { running: { embedded: false, updateId: 'demo-update-1', createdAt: new Date(2026, 10, 17, 9, 30) }, pending: { pending: true, id: 'demo-update-2' } },
  /** The last update did not start; the installed code runs. */
  emergency: { delay: 500, running: { emergency: true, emergencyReason: 'demo: the update failed to launch' } },
};
