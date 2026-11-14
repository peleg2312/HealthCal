import { describe, expect, it } from 'vitest';

import { AUTO_SYNC_INTERVAL_MS, errorText, INITIAL_STATE, pruneHandled, readRange, restoreState, shouldAutoSync, syncMessage } from './state';

const NOON = Date.parse('2026-11-14T12:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString();

describe('sync state', () => {
  it('automatic syncs wait 15 minutes after any attempt', () => {
    expect(shouldAutoSync({ enabled: false, lastAttemptAt: null }, NOON)).toBe(false);
    expect(shouldAutoSync({ enabled: true, lastAttemptAt: null }, NOON)).toBe(true);
    expect(shouldAutoSync({ enabled: true, lastAttemptAt: iso(NOON - AUTO_SYNC_INTERVAL_MS + 1000) }, NOON)).toBe(false);
    expect(shouldAutoSync({ enabled: true, lastAttemptAt: iso(NOON - AUTO_SYNC_INTERVAL_MS) }, NOON)).toBe(true);
    // The phone's clock was set back: do not wait for a time that is in the future.
    expect(shouldAutoSync({ enabled: true, lastAttemptAt: iso(NOON + 3_600_000) }, NOON)).toBe(true);
    expect(shouldAutoSync({ enabled: true, lastAttemptAt: 'garbage' }, NOON)).toBe(true);
  });

  it('reads the last 30 days', () => {
    expect(readRange(NOON)).toEqual({ from: '2026-10-15T12:00:00.000Z', to: '2026-11-14T12:00:00.000Z' });
  });

  it('forgets handled workouts once they are well outside the window', () => {
    const handled = {
      recent: { how: 'saved' as const, at: '2026-11-10T06:00:00Z' },
      edge: { how: 'skipped' as const, at: '2026-10-05T06:00:00Z' },
      old: { how: 'saved' as const, at: '2026-09-20T06:00:00Z' },
    };
    expect(Object.keys(pruneHandled(handled, NOON))).toEqual(['recent', 'edge']);
  });

  it('words the confirmation', () => {
    expect(syncMessage(2, 0, ['Garmin Connect', 'Garmin Connect'], 'Health Connect')).toBe('2 workouts added from Garmin Connect');
    expect(syncMessage(1, 0, ['Strava'], 'Health Connect')).toBe('1 workout added from Strava');
    expect(syncMessage(0, 1, ['Garmin Connect'], 'Health Connect')).toBe('1 workout updated from Garmin Connect');
    expect(syncMessage(2, 1, ['Garmin Connect', 'Strava', 'Strava'], 'Health Connect')).toBe('2 workouts added, 1 updated from Health Connect');
  });

  it('has plain words for every failure', () => {
    for (const code of ['permission', 'not-installed', 'update-required', 'unsupported', 'unavailable', 'timeout', 'failed'] as const) {
      const t = errorText({ code, at: iso(NOON) }, 'Health Connect');
      expect(t.length).toBeGreaterThan(20);
      expect(t).not.toMatch(/!|error code|exception/i);
    }
  });

  it('restores a saved state, and falls back to the start value for anything damaged', () => {
    expect(restoreState(null)).toEqual(INITIAL_STATE);
    expect(restoreState('on')).toEqual(INITIAL_STATE);
    expect(restoreState({ enabled: 'yes', review: 'none', handled: [], choices: null, lastError: { code: 3 } })).toEqual(INITIAL_STATE);
    const good = {
      ...INITIAL_STATE,
      enabled: true,
      lastSyncedAt: iso(NOON),
      lastError: { code: 'permission', at: iso(NOON) },
      handled: { a: { how: 'saved', at: '2026-11-10T06:00:00Z' }, b: { how: 'maybe', at: 'x' } },
      choices: { 'health-connect:46': 'kayaking', bad: 4 },
      review: [{ id: 'r1', workout: { startTime: '2026-11-10T06:00:00Z' }, reason: 'because' }, { id: 5 }],
      extra: 'ignored',
    };
    const out = restoreState(good);
    expect(out.enabled).toBe(true);
    expect(out.lastError).toEqual({ code: 'permission', at: iso(NOON) });
    expect(out.handled).toEqual({ a: { how: 'saved', at: '2026-11-10T06:00:00Z' } });
    expect(out.choices).toEqual({ 'health-connect:46': 'kayaking' });
    expect(out.review).toHaveLength(1);
    expect('extra' in out).toBe(false);
  });
});
