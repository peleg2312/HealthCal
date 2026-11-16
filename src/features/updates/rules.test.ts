import { describe, expect, it } from 'vitest';

import { AWAY_MS } from '@/features/today/backToToday';

import { aboutState, CHECK_EVERY_MS, checkDue, frontIsTab, phaseAfterRestart, RESTART_NOTE, RESTART_PAUSE_MS, restartOnReturn, runningLine, writeMarks, wroteSince, type CheckPhase, type ReturnFacts, type UnsentState } from './rules';

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
  it('needs five minutes away even across midnight (a look just after midnight never restarts)', () => {
    expect(restartOnReturn({ ...base, away: { at, day: '2026-11-15' }, now: at + 60_000 })).toBe(false);
    expect(restartOnReturn({ ...base, away: { at, day: '2026-11-15' }, now: at + AWAY_MS })).toBe(true);
  });
  it('treats a clock set back as no time away', () => {
    expect(restartOnReturn({ ...base, now: at - 60_000 })).toBe(false);
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
    expect(runningLine({ embedded: false, emergency: false, createdAt: new Date(2026, 10, 12, 9, 30) }, '2026-11-16')).toBe('Updated Nov 12');
    expect(runningLine({ embedded: false, emergency: false, createdAt: new Date(2025, 11, 30, 9) }, '2026-01-02')).toBe('Updated Dec 30, 2025');
  });
  it('says when the installed code runs because an update did not start', () => {
    expect(runningLine({ embedded: true, emergency: true, createdAt: null }, '2026-11-16')).toBe('Running the version you installed. The next update arrives by itself.');
  });
});

describe('aboutState', () => {
  const phases: CheckPhase[] = ['idle', 'checking', 'current', 'ready', 'failed', 'restart-wait', 'restart-failed'];

  it('never shows a check result beside a waiting update', () => {
    for (const p of phases) {
      const s = aboutState(true, p);
      expect(s.line, p).not.toMatch(/Up to date|Could not check/);
    }
    expect(aboutState(true, 'current')).toEqual({ line: 'An update is ready', restart: true, restartNote: RESTART_NOTE });
  });

  it('says what a restart does, and never "close the app" while something is still saving', () => {
    expect(RESTART_NOTE).toMatch(/opens again on Today/);
    const wait = aboutState(true, 'restart-wait');
    expect(wait.restart).toBe(true);
    expect(wait.restartNote).toBeNull();
    expect(wait.line).not.toMatch(/close/i);
  });

  it('stops offering the restart once it failed in this run', () => {
    expect(aboutState(true, 'restart-failed')).toEqual({ line: 'The update starts the next time HealthCal opens', restart: false, restartNote: null });
  });

  it('keeps a line (empty when idle) and uses neutral words', () => {
    expect(aboutState(false, 'idle').line).toBe('');
    expect(aboutState(false, 'checking').line).toBe('Checking for updates');
    expect(aboutState(false, 'current').line).toBe('Up to date');
    expect(aboutState(false, 'failed').line).toBe('Could not check right now');
    for (const p of phases) for (const pending of [true, false]) expect(aboutState(pending, p).line).not.toMatch(/!/);
  });
});

describe('phaseAfterRestart', () => {
  it('maps each reason', () => {
    expect(phaseAfterRestart('busy', true)).toBe('restart-wait');
    expect(phaseAfterRestart('unsaved', true)).toBe('restart-wait');
    expect(phaseAfterRestart('failed', true)).toBe('restart-failed');
    expect(phaseAfterRestart('nothing-waiting', false)).toBe('idle');
    expect(phaseAfterRestart('restarted', false)).toBe('idle');
  });
});

describe('writeMarks and wroteSince', () => {
  const base: UnsentState & Record<string, unknown> = {
    dirty: { waterEntries: { w1: true }, foodEntries: {} },
    waterEntries: { w1: { updatedAt: 't1' } },
    foodEntries: { f1: { updatedAt: 't1' } },
    profileDirty: false,
    settingsDirty: false,
    profile: { updatedAt: 'p1' },
    settings: { updatedAt: 's1' },
  };
  const marks = (over: Partial<typeof base>) => writeMarks({ ...base, ...over });

  it('marks each unsent record with the time it was written', () => {
    expect(writeMarks(base)).toEqual(['waterEntries/w1@t1']);
    expect(marks({ profileDirty: true, settingsDirty: true })).toEqual(['waterEntries/w1@t1', 'profile@p1', 'settings@s1']);
  });

  it('sees a new record, a record written again, and a profile or settings change', () => {
    const before = writeMarks(base);
    expect(wroteSince(before, marks({ dirty: { waterEntries: { w1: true }, foodEntries: { f1: true } } }))).toBe(true);
    expect(wroteSince(before, marks({ waterEntries: { w1: { updatedAt: 't2' } } }))).toBe(true);
    expect(wroteSince(before, marks({ settingsDirty: true }))).toBe(true);
    expect(wroteSince(before, writeMarks(base))).toBe(false);
  });

  it('does not count a sync that sent what was waiting, and assumes a write when it cannot read', () => {
    const before = marks({ profileDirty: true });
    expect(wroteSince(before, marks({ dirty: { waterEntries: {}, foodEntries: {} } }))).toBe(false);
    expect(wroteSince(null, before)).toBe(true);
    expect(wroteSince(before, null)).toBe(true);
  });
});

describe('frontIsTab', () => {
  it('counts only the tab group in front, after setup', () => {
    expect(frontIsTab('(tabs)', true)).toBe(true);
    expect(frontIsTab('(tabs)', false)).toBe(false);
    // The reset link replaces the tabs with a stack of one: not a tab.
    expect(frontIsTab('auth', true)).toBe(false);
    expect(frontIsTab('friends', true)).toBe(false);
    expect(frontIsTab(null, true)).toBe(false);
    expect(frontIsTab(undefined, true)).toBe(false);
  });
});
