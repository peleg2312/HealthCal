import { describe, expect, it } from 'vitest';

import { BRING_IN_TITLE, bringInChoices, bringInLine, choiceWords, type BringInState } from './bringIn';

const off: BringInState = { enabled: false, waiting: 0, attention: false, store: 'health-connect', offerSteps: false };
const web: BringInState = { enabled: false, waiting: 0, attention: false, store: null, offerSteps: true };

describe('Bring in workouts', () => {
  it('is one row with one plain line', () => {
    expect(BRING_IN_TITLE).toBe('Bring in workouts');
    expect(bringInLine(off)).toEqual({ line: 'Sync automatically or import a file', flag: false });
    expect(bringInLine(web)).toEqual({ line: 'Garmin files or the Health app’s export', flag: false });
    expect(bringInLine({ ...off, enabled: true })).toEqual({ line: 'Workout sync is on', flag: false });
  });

  it('says what waits, with the amber key, only while sync is on', () => {
    expect(bringInLine({ ...off, enabled: true, waiting: 1 })).toEqual({ line: '1 workout needs a look', flag: true });
    expect(bringInLine({ ...off, enabled: true, waiting: 2, attention: true })).toEqual({ line: '2 workouts need a look', flag: true });
    expect(bringInLine({ ...off, enabled: true, attention: true })).toEqual({ line: 'The last sync did not finish', flag: true });
    expect(bringInLine({ ...off, waiting: 3 }).flag).toBe(false);
    expect(choiceWords('sync', { ...off, enabled: true, waiting: 2 })).toMatchObject({ title: 'Workout sync', line: '2 workouts need a look', flag: true });
  });

  it('offers sync first where the phone can sync, and last where it cannot', () => {
    expect(bringInChoices(off)).toEqual(['sync', 'import']);
    expect(bringInChoices({ ...off, store: 'apple-health', offerSteps: true })).toEqual(['sync', 'import', 'steps']);
    expect(bringInChoices(web)).toEqual(['import', 'steps', 'sync']);
    expect(bringInChoices({ ...web, offerSteps: false })).toEqual(['import', 'sync']);
  });

  it('names the store, and says where sync works when this build has none', () => {
    expect(choiceWords('sync', off)).toMatchObject({ title: 'Sync automatically', line: 'Workouts from Health Connect, by themselves' });
    expect(choiceWords('sync', { ...off, store: 'apple-health' }).line).toBe('Workouts from Apple Health, by themselves');
    expect(choiceWords('sync', { ...off, store: 'apple-health', enabled: true }).line).toBe('On, from Apple Health');
    expect(choiceWords('sync', web)).toMatchObject({ title: 'Automatic sync', line: 'In the iPhone and Android apps' });
    expect(choiceWords('import', web).title).toBe('Import workouts');
    // Steps are shown, never counted: the line says so.
    expect(choiceWords('steps', web).line).toBe('Shown on Train, never added to your budget');
  });

  it('keeps the words calm', () => {
    const states = [off, web, { ...off, enabled: true, waiting: 2 }, { ...off, enabled: true, attention: true }];
    const shown = states.flatMap((s) => [bringInLine(s).line, ...bringInChoices(s).flatMap((c) => [choiceWords(c, s).title, choiceWords(c, s).line])]);
    for (const w of shown) expect(w).not.toMatch(/!|failed|error|should|\bMET\b/i);
    // Short enough for two lines of a sheet row at 320 px.
    for (const w of shown) expect(w.length).toBeLessThanOrEqual(48);
  });
});
