import { describe, expect, it } from 'vitest';

import { AWAY_MS } from '@/features/today/backToToday';

import { CHECK_EVERY_MS, checkDue, checkLine, RESTART_PAUSE_MS, restartOnReturn, runningLine, type ReturnFacts } from './rules';

const at = new Date(2026, 10, 16, 12, 0).getTime();
const base: ReturnFacts = {
  away: { at, day: '2026-11-16' },
  now: at + AWAY_MS,
  today: '2026-11-16',
  pending: true,
  pendingId: 'u2',
  runningId: 'u1',
  onTab: true,
  sheetOpen: false,
  saved: true,
  emergency: false,
  reloadFailed: false,
  attempt: null,
};

describe('checkDue', () => {
  it('asks when it never asked', () => expect(checkDue(null, at)).toBe(true));
  it('waits a few hours between checks', () => {
    expect(checkDue(at, at + CHECK_EVERY_MS - 1)).toBe(false);
    expect(checkDue(at, at + CHECK_EVERY_MS)).toBe(true);
  });
  it('treats a clock set back as due', () => expect(checkDue(at, at - 1000)).toBe(true));
});

describe('restartOnReturn', () => {
  it('starts a waiting update after five minutes away on a tab, with everything saved', () => {
    expect(restartOnReturn(base)).toBe(true);
  });
  it('does nothing when nothing is waiting', () => expect(restartOnReturn({ ...base, pending: false })).toBe(false));
  it('never restarts after a short look elsewhere, or when the app never left', () => {
    expect(restartOnReturn({ ...base, now: at + AWAY_MS - 1 })).toBe(false);
    expect(restartOnReturn({ ...base, away: null })).toBe(false);
  });
  it('restarts on another calendar day, however short the time away', () => {
    expect(restartOnReturn({ ...base, away: { at, day: '2026-11-15' }, now: at + 60_000 })).toBe(true);
  });
  it('never restarts in the middle of something', () => {
    expect(restartOnReturn({ ...base, onTab: false })).toBe(false);
    expect(restartOnReturn({ ...base, sheetOpen: true })).toBe(false);
    expect(restartOnReturn({ ...base, saved: false })).toBe(false);
  });
  it('never loops', () => {
    // The same update waiting again after a restart into it: it did not stick.
    expect(restartOnReturn({ ...base, attempt: { target: 'u2', at: at - 10 * RESTART_PAUSE_MS } })).toBe(false);
    // Any restart a short while ago.
    expect(restartOnReturn({ ...base, attempt: { target: 'u0', at: base.now - RESTART_PAUSE_MS + 1 } })).toBe(false);
    expect(restartOnReturn({ ...base, attempt: { target: null, at: base.now - 60_000 } })).toBe(false);
    // A failed reload, an emergency launch, or the waiting update being the running one.
    expect(restartOnReturn({ ...base, reloadFailed: true })).toBe(false);
    expect(restartOnReturn({ ...base, emergency: true })).toBe(false);
    expect(restartOnReturn({ ...base, pendingId: 'u1' })).toBe(false);
  });
  it('allows a newer update long after an earlier restart', () => {
    expect(restartOnReturn({ ...base, attempt: { target: 'u1', at: base.now - RESTART_PAUSE_MS } })).toBe(true);
  });
});

describe('runningLine', () => {
  it('says nothing for the code the app was installed with', () => {
    expect(runningLine({ embedded: true, emergency: false, createdAt: new Date(2026, 9, 1) }, '2026-11-16')).toBeNull();
    expect(runningLine(null, '2026-11-16')).toBeNull();
  });
  it('names the day of the running update, with the year only when it is not this one', () => {
    expect(runningLine({ embedded: false, emergency: false, createdAt: new Date(2026, 10, 17, 9, 30) }, '2026-11-18')).toBe('Updated Nov 17');
    expect(runningLine({ embedded: false, emergency: false, createdAt: new Date(2025, 11, 30, 9) }, '2026-01-02')).toBe('Updated Dec 30, 2025');
  });
  it('says when the installed code runs because an update did not start', () => {
    expect(runningLine({ embedded: true, emergency: true, createdAt: null }, '2026-11-16')).toBe('Running the installed version');
  });
});

describe('checkLine', () => {
  it('uses neutral words', () => {
    expect(checkLine('idle')).toBeNull();
    expect(checkLine('checking')).toBeNull();
    expect(checkLine('current')).toBe('Up to date');
    for (const p of ['current', 'ready', 'failed', 'restart-failed'] as const) expect(checkLine(p)).not.toMatch(/!/);
  });
});
