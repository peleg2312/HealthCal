import { describe, expect, it } from 'vitest';

import { AWAY_MS } from '@/features/today/backToToday';

import { createFakePort, type FakeUpdates } from './fake';
import { CHECK_EVERY_MS, RETRY_AFTER_FAIL_MS, type RestartAttempt } from './rules';
import { createUpdater, type UpdaterEnv } from './updater';

function setup(o: FakeUpdates = {}, over: Partial<UpdaterEnv> = {}) {
  const port = createFakePort({ running: { embedded: false, updateId: 'u1' }, ...o });
  let now = new Date(2026, 10, 16, 12, 0).getTime();
  let attempt: RestartAttempt | null = null;
  const warnings: unknown[][] = [];
  /** The store's unsent changes, as the app's revision() reads them. */
  const store = { marks: [] as string[], busy: false };
  const slept: number[] = [];
  const env: UpdaterEnv = {
    port,
    now: () => now,
    today: () => '2026-11-16',
    onTab: () => true,
    sheetOpen: () => false,
    busy: () => store.busy,
    revision: () => store.marks,
    flush: async () => true,
    readAttempt: async () => attempt,
    writeAttempt: async (a) => void (attempt = a),
    background: () => '#000000',
    sleep: async (ms) => void slept.push(ms),
    warn: (...args) => void warnings.push(args),
    ...over,
  };
  const u = createUpdater(env);
  return {
    u,
    port,
    warnings,
    store,
    slept,
    attempt: () => attempt,
    advance: (ms: number) => void (now += ms),
    away: async (ms: number) => {
      u.left();
      now += ms;
      return u.returned();
    },
  };
}

describe('createUpdater', () => {
  it('does not ask again on the first return after launch (the library asked)', async () => {
    const t = setup({ server: 'u2' });
    expect(await t.away(AWAY_MS)).toBe('nothing');
    expect(t.port.calls.check).toBe(0);
  });

  it('looks and downloads when back after a few hours, without starting it under the finger', async () => {
    const t = setup({ server: 'u2' });
    expect(await t.away(CHECK_EVERY_MS)).toBe('looked');
    expect(t.port.calls.fetch).toBe(1);
    expect(t.port.calls.reload).toBe(0);
    expect(t.port.pending()).toEqual({ pending: true, id: 'u2' });
    // The next return after five minutes away starts it, once.
    expect(await t.away(AWAY_MS)).toBe('restarted');
    expect(t.attempt()?.target).toBe('u2');
  });

  it('starts a waiting update only after five minutes away', async () => {
    const t = setup({ pending: { pending: true, id: 'u2' } });
    expect(await t.away(60_000)).toBe('nothing');
    expect(t.port.calls.reload).toBe(0);
    expect(await t.away(AWAY_MS)).toBe('restarted');
  });

  it('never restarts with a sheet open, off the tabs, or with a save that did not land', async () => {
    for (const over of [{ sheetOpen: () => true }, { onTab: () => false }, { flush: async () => false }, { busy: () => true }]) {
      const t = setup({ pending: { pending: true, id: 'u2' } }, over);
      expect(await t.away(AWAY_MS)).not.toBe('restarted');
      expect(t.port.calls.reload).toBe(0);
    }
  });

  it('does not loop when the same update is waiting again after a restart', async () => {
    // A new run of the app (the restart) finds its own record of starting u2, and u2 is waiting again.
    const t = setup({ pending: { pending: true, id: 'u2' } }, { readAttempt: async () => ({ target: 'u2', at: 0 }) });
    expect(await t.away(AWAY_MS)).toBe('nothing');
    expect(t.port.calls.reload).toBe(0);
  });

  it('stays silent and stops trying after a failed reload', async () => {
    const t = setup({ pending: { pending: true, id: 'u2' }, failReload: true });
    expect(await t.away(AWAY_MS)).toBe('nothing');
    expect(t.port.calls.reload).toBe(1);
    t.advance(24 * 3_600_000);
    await t.away(AWAY_MS);
    expect(t.port.calls.reload).toBe(1);
    expect(t.warnings.length).toBeGreaterThan(0);
  });

  it('does not restart when the attempt cannot be recorded', async () => {
    const t = setup({ pending: { pending: true, id: 'u2' } }, { writeAttempt: async () => Promise.reject(new Error('disk full')) });
    expect(await t.away(AWAY_MS)).toBe('nothing');
    expect(t.port.calls.reload).toBe(0);
  });

  it('reports a failed check as failed, never throws', async () => {
    const t = setup({ failCheck: true, server: 'u2' });
    expect(await t.u.look()).toBe('failed');
    expect(t.warnings).toHaveLength(1);
  });

  it('answers current, then ready, from a manual check', async () => {
    expect(await setup().u.look()).toBe('current');
    const t = setup({ server: 'u2' });
    expect(await t.u.look()).toBe('ready');
    expect(await t.u.restartNow()).toBe('restarted');
  });

  it('restarts on request only when everything is saved, and says why not', async () => {
    const t = setup({ pending: { pending: true, id: 'u2' } }, { flush: async () => false });
    expect(await t.u.restartNow()).toBe('unsaved');
    expect(t.port.calls.reload).toBe(0);
    expect(await setup().u.restartNow()).toBe('nothing-waiting');
    const busy = setup({ pending: { pending: true, id: 'u2' } });
    busy.store.busy = true;
    expect(await busy.u.restartNow()).toBe('busy');
    expect(busy.port.calls.reload).toBe(0);
  });

  it('does not try a restart on request again after a reload failed', async () => {
    const t = setup({ pending: { pending: true, id: 'u2' }, failReload: true });
    expect(await t.u.restartNow()).toBe('failed');
    expect(await t.u.restartNow()).toBe('failed');
    expect(t.port.calls.reload).toBe(1);
  });

  it('waits a quiet moment after the return before restarting', async () => {
    const t = setup({ pending: { pending: true, id: 'u2' } });
    expect(await t.away(AWAY_MS)).toBe('restarted');
    expect(t.slept[0]).toBeGreaterThanOrEqual(1000);
  });

  it('waits for a running sync to end, and gives up on one that does not', async () => {
    const t = setup({ pending: { pending: true, id: 'u2' } });
    t.store.busy = true;
    let polls = 0;
    const ends = setup({ pending: { pending: true, id: 'u2' } }, { busy: () => ++polls < 4 });
    expect(await ends.away(AWAY_MS)).toBe('restarted');
    expect(await t.away(AWAY_MS)).toBe('nothing');
    expect(t.port.calls.reload).toBe(0);
  });

  it('does not restart over something written since the app left (a reminder action, a synced workout)', async () => {
    // Written during the quiet moment after the return.
    const t = setup({ pending: { pending: true, id: 'u2' } }, {});
    const during = setup(
      { pending: { pending: true, id: 'u2' } },
      {
        sleep: async () => {
          during.store.marks = ['waterEntries/w1@1'];
        },
      },
    );
    expect(await during.away(AWAY_MS)).toBe('nothing');
    expect(during.port.calls.reload).toBe(0);
    // Written while the restart record was being saved: the record is put back as it was.
    const late = setup(
      { pending: { pending: true, id: 'u2' } },
      {
        writeAttempt: async (a) => {
          late.store.marks = ['waterEntries/w1@1'];
          recorded.push(a);
        },
      },
    );
    const recorded: (RestartAttempt | null)[] = [];
    expect(await late.away(AWAY_MS)).toBe('nothing');
    expect(late.port.calls.reload).toBe(0);
    expect(recorded.at(-1)).toBeNull();
    // Written before leaving does not count.
    t.store.marks = ['foodEntries/f1@1'];
    expect(await t.away(AWAY_MS)).toBe('restarted');
  });

  it('restarts after a sync only sent what was waiting (marks taken away are not a write)', async () => {
    const t = setup(
      { pending: { pending: true, id: 'u2' } },
      {
        sleep: async () => {
          t.store.marks = [];
        },
      },
    );
    t.store.marks = ['foodEntries/f1@1', 'profile@2'];
    expect(await t.away(AWAY_MS)).toBe('restarted');
  });

  it('does not restart when what was unsent cannot be read', async () => {
    const t = setup(
      { pending: { pending: true, id: 'u2' } },
      {
        revision: () => {
          throw new Error('no store');
        },
      },
    );
    expect(await t.away(AWAY_MS)).toBe('nothing');
    expect(t.port.calls.reload).toBe(0);
  });

  it('does not restart when the app left again during the quiet moment', async () => {
    const t = setup(
      { pending: { pending: true, id: 'u2' } },
      {
        sleep: async () => {
          t.u.left();
        },
      },
    );
    expect(await t.away(AWAY_MS)).toBe('nothing');
    expect(t.port.calls.reload).toBe(0);
  });

  it('looks again soon after a check that failed, not hours later', async () => {
    const t = setup({ failCheck: true, server: 'u2' });
    expect(await t.away(CHECK_EVERY_MS)).toBe('looked');
    expect(t.port.calls.check).toBe(1);
    expect(await t.away(RETRY_AFTER_FAIL_MS - 60_000)).toBe('nothing');
    expect(await t.away(60_000)).toBe('looked');
    expect(t.port.calls.check).toBe(2);
  });

  it('waits the full four hours after a check that worked', async () => {
    const t = setup();
    expect(await t.away(CHECK_EVERY_MS)).toBe('looked');
    expect(await t.away(RETRY_AFTER_FAIL_MS)).toBe('nothing');
    expect(t.port.calls.check).toBe(1);
  });
});
