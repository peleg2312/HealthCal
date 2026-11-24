import { describe, expect, it } from 'vitest';

import { goalMet, moveAccessibilityLabel, moveLine, morningLine, NO_WORKOUT, type MorningLineInput, type MoveActivity } from './line';

const base: MorningLineInput = { kcal: 1840, budget: 2160, complete: true, foodLogged: true, proteinMet: false, waterMet: false };
const line = (patch: Partial<MorningLineInput>) => morningLine({ ...base, ...patch });

describe('morningLine', () => {
  it('within the budget', () => {
    expect(line({})).toBe("Within the day's budget.");
    expect(line({ kcal: 2160 })).toBe("Within the day's budget.");
  });

  it('anything over the budget is above it, with the amount, never "within 10%" (budgetMark)', () => {
    expect(line({ kcal: 2161 })).toBe("1 kcal above the day's budget.");
    expect(line({ kcal: 2290 })).toBe("130 kcal above the day's budget.");
    expect(line({ kcal: 2200, budget: 2000 })).toBe("200 kcal above the day's budget.");
    expect(line({ kcal: 2377 })).toBe("217 kcal above the day's budget.");
    for (const kcal of [2161, 2290, 2376, 2377]) expect(line({ kcal })).not.toMatch(/within 10%/i);
  });

  it('above the budget names the amount in plain words', () => {
    expect(line({ kcal: 2480 })).toBe("320 kcal above the day's budget.");
    expect(line({ kcal: 11480, budget: 2160 })).toBe("9,320 kcal above the day's budget.");
  });

  it('a partly logged day says so, with what was logged', () => {
    expect(line({ kcal: 650, complete: false })).toBe('Part of the day logged, 650 kcal.');
    expect(line({ kcal: 1250, complete: false, budget: 2600 })).toBe('Part of the day logged, 1,250 kcal.');
  });

  it('a partly logged day of 0 kcal leaves the figure to the cup', () => {
    expect(line({ kcal: 0, complete: false })).toBe('Part of the day logged.');
    expect(line({ kcal: 0, complete: false, waterMet: true })).toBe('Part of the day logged, with water reached.');
  });

  it('no food, with and without water', () => {
    expect(line({ kcal: 0, complete: false, foodLogged: false })).toBe('No food logged.');
    expect(line({ kcal: 0, complete: false, foodLogged: false, waterMet: true })).toBe('No food logged; water reached.');
  });

  it('a budget of 0 only counts what was logged', () => {
    expect(line({ budget: 0 })).toBe('1,840 kcal logged.');
    expect(line({ budget: -50, complete: false })).toBe('1,840 kcal logged.');
    expect(line({ budget: 0, waterMet: true })).toBe('1,840 kcal logged, with water reached.');
  });

  it('joins the goals reached, protein first', () => {
    expect(line({ proteinMet: true, waterMet: true })).toBe("Within the day's budget, with protein and water reached.");
    expect(line({ proteinMet: true })).toBe("Within the day's budget, with protein reached.");
    expect(line({ kcal: 2480, waterMet: true })).toBe("320 kcal above the day's budget, with water reached.");
    expect(line({ kcal: 650, complete: false, proteinMet: true })).toBe('Part of the day logged, 650 kcal, with protein reached.');
  });

  it('never blames or praises', () => {
    const all = [
      line({}),
      line({ kcal: 2290 }),
      line({ kcal: 4000, proteinMet: true, waterMet: true }),
      line({ complete: false }),
      line({ foodLogged: false, waterMet: true }),
    ].join(' ');
    expect(all).not.toMatch(/over|fail|cheat|great|well done|!|should|try/i);
  });
});

describe('goalMet', () => {
  it('needs a goal and a value at or past it', () => {
    expect(goalMet(152, 152)).toBe(true);
    expect(goalMet(160, 152)).toBe(true);
    expect(goalMet(151.9, 152)).toBe(false);
    expect(goalMet(0, 0)).toBe(false);
    expect(goalMet(500, 0)).toBe(false);
  });
});

const run: MoveActivity = { name: 'Running', emoji: '🏃', durationMin: 42, measured: false };
const swim: MoveActivity = { name: 'Swimming', emoji: '🏊', durationMin: 30.4, measured: true };
const ride: MoveActivity = { name: 'Cycling', emoji: '🚴', durationMin: 23, measured: true };

/** The line with its no-break spaces read as plain spaces (the next test checks where they are). */
const plainMove = (a: MoveActivity[], kcal: number) => moveLine(a, kcal).replace(/\u00A0/g, ' ');

describe('moveLine', () => {
  it('one activity: its mark, name, minutes and calories', () => {
    expect(plainMove([run], 384)).toBe('🏃 Running, 42 min · about 380 kcal');
    expect(plainMove([{ ...run, emoji: '' }], 384)).toBe('Running, 42 min · about 380 kcal');
  });

  it('several: the count and the total minutes', () => {
    expect(plainMove([run, swim, ride], 612)).toBe('3 sessions, 95 min · about 610 kcal');
  });

  it('a narrow line breaks after the dot, never between "about" and its figure', () => {
    expect(moveLine([run], 290)).toBe('🏃 Running, 42 min\u00A0· about\u00A0290 kcal');
    expect(moveLine([run, swim], 2088)).toBe('2 sessions, 72 min\u00A0· about\u00A02,090 kcal');
    expect(moveLine([swim], 437)).toBe('🏊 Swimming, 30 min\u00A0· 437 kcal measured');
  });

  it('none', () => {
    expect(plainMove([], 0)).toBe('No workout logged');
    expect(NO_WORKOUT).toBe('No workout logged');
  });

  it('all measured is exact and says so; any estimate makes it about, to the nearest 10', () => {
    expect(plainMove([swim, ride], 437)).toBe('2 sessions, 53 min · 437 kcal measured');
    expect(plainMove([swim], 1234)).toBe('🏊 Swimming, 30 min · 1,234 kcal measured');
    expect(plainMove([swim, run], 437)).toBe('2 sessions, 72 min · about 440 kcal');
    expect(plainMove([run], 1234)).toBe('🏃 Running, 42 min · about 1,230 kcal');
    expect(plainMove([run], 385)).toBe('🏃 Running, 42 min · about 390 kcal');
  });
});

describe('moveAccessibilityLabel', () => {
  it('reads the activity, the net calories, the steps and where it leads', () => {
    expect(moveAccessibilityLabel([run], 384, 9210)).toBe('Running, 42 minutes, about 380 kilocalories above resting. 9,210 steps. Opens Train');
    expect(moveAccessibilityLabel([swim, ride], 437, 0)).toBe('2 sessions, 53 minutes, 437 kilocalories above resting, measured. Opens Train');
    expect(moveAccessibilityLabel([], 0, null)).toBe('No workout logged. Opens Train');
    expect(moveAccessibilityLabel([], 0, 4120, 'From your Health export, Nov 16')).toBe('No workout logged. 4,120 steps. From your Health export, Nov 16. Opens Train');
  });
});
