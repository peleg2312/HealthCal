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
    expect(plainMove([run], 384)).toBe('🏃 Running, 42 min · about 380 kcal added');
    expect(plainMove([{ ...run, emoji: '' }], 384)).toBe('Running, 42 min · about 380 kcal added');
    expect(moveLine([run], 384, false).replace(/\u00A0/g, ' ')).toBe('🏃 Running, 42 min · about 380 kcal not added');
  });

  it('several: the count and the total minutes', () => {
    expect(plainMove([run, swim, ride], 612)).toBe('3 sessions, 95 min · about 610 kcal added');
  });

  it('a narrow line breaks after the dot, never between "about" and its figure', () => {
    expect(moveLine([run], 290)).toBe('🏃 Running, 42 min\u00A0· about\u00A0290 kcal added');
    expect(moveLine([run, swim], 2088)).toBe('2 sessions, 72 min\u00A0· about\u00A02,090 kcal added');
    expect(moveLine([swim], 437)).toBe('🏊 Swimming, 30 min\u00A0· about\u00A0437 kcal added');
  });

  it('none', () => {
    expect(plainMove([], 0)).toBe('No workout logged');
    expect(NO_WORKOUT).toBe('No workout logged');
  });

  it('always about (the part above resting is an estimate); all measured keeps its figure, any estimate rounds to 10', () => {
    expect(plainMove([swim, ride], 437)).toBe('2 sessions, 53 min · about 437 kcal added');
    expect(plainMove([swim], 1234)).toBe('🏊 Swimming, 30 min · about 1,234 kcal added');
    expect(plainMove([swim, run], 437)).toBe('2 sessions, 72 min · about 440 kcal added');
    expect(plainMove([run], 1234)).toBe('🏃 Running, 42 min · about 1,230 kcal added');
    expect(plainMove([run], 385)).toBe('🏃 Running, 42 min · about 390 kcal added');
  });
});

describe('moveAccessibilityLabel', () => {
  it('reads the line as drawn (label in name), the steps and where it leads', () => {
    expect(moveAccessibilityLabel([run], 384, 9210)).toBe('Running, 42 min · about 380 kcal added. 9,210 steps. Opens Train');
    expect(moveAccessibilityLabel([swim, ride], 437, 0)).toBe('2 sessions, 53 min · about 437 kcal added. From a measured burn. Opens Train');
    expect(moveAccessibilityLabel([run], 384, null, undefined, false)).toBe('Running, 42 min · about 380 kcal not added. Opens Train');
    expect(moveAccessibilityLabel([], 0, null)).toBe('No workout logged. Opens Train');
    expect(moveAccessibilityLabel([], 0, 4120, 'From your Health export, Nov 16')).toBe('No workout logged. 4,120 steps. From your Health export, Nov 16. Opens Train');
  });
  it('holds the drawn line, emoji aside, then the steps as drawn', () => {
    const plain = (s: string) => s.replace(/\u00A0/g, ' ').replace(/^\S*\p{Extended_Pictographic}\S*\s/u, '');
    for (const [acts, steps] of [[[run], 9210], [[swim, ride], 0], [[], 4120]] as const) {
      const label = moveAccessibilityLabel([...acts], 384, steps);
      expect(label.startsWith(plain(moveLine([...acts], 384)))).toBe(true);
      if (steps) expect(label).toContain(`${steps.toLocaleString('en-US')} steps`);
    }
  });
});
