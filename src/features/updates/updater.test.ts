import { describe, expect, it } from 'vitest';

import { AWAY_MS } from '@/features/today/backToToday';

import { createFakePort, type FakeUpdates } from './fake';
import { CHECK_EVERY_MS, type RestartAttempt } from './rules';
import { createUpdater, type UpdaterEnv } from './updater';

function setup(o: FakeUpdates = {}, over: Partial<UpdaterEnv> = {}) {
  const port = createFakePort({ running: { embedded: false, updateId: 'u1' }, ...o });
  let now = new Date(2026, 10, 16, 12, 0).getTime();
  let attempt: RestartAttempt | null = null;
  const warnings: unknown[][] = [];
  const env: UpdaterEnv = {
    port,
    now: () => now,
    today: () => '2026-11-16',
    onTab: () => true,
    sheetOpen: () => false,
    flush: async () => true,
    readAttempt: async () => attempt,
    writeAttempt: async (a) => void (attempt = a),
    background: () => '#000000',
    warn: (...args) => void warnings.push(args),
    ...over,
  };
  const u = createUpdater(env);
  return {
    u,
    port,
    warnings,
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
    for (const over of [{ sheetOpen: () => true }, { onTab: () => false }, { flush: async () => false }]) {
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
    expect(await t.u.restartNow()).toBe(true);
  });

  it('restarts on request only when everything is saved', async () => {
    const t = setup({ pending: { pending: true, id: 'u2' } }, { flush: async () => false });
    expect(await t.u.restartNow()).toBe(false);
    expect(t.port.calls.reload).toBe(0);
  });
});
