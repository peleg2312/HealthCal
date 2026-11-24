import { describe, expect, it } from 'vitest';

import { daysLeftInWeek, targetsLine, todayPlan, waterAmount, weekBeforeYesterday, weekSoFar, type PlanInput } from './plan';

const OZ = 29.5735;

const input = (patch: Partial<PlanInput> & { today: string }): PlanInput => ({
  waterMl: 0,
  waterGoalMl: 3300,
  weekMinutes: 0,
  lastWeighIn: null,
  lastNightLogged: true,
  firstAdjust: null,
  units: 'metric',
  ...patch,
});
const rows = (i: PlanInput) => todayPlan(i).map((p) => [p.title, p.subtitle]);

// The seven cases of the specification (section 2.10). Nov 16 2026 is a Monday.
describe('cases A to G', () => {
  it('A: water and the minutes left this week', () => {
    const plan = todayPlan(input({ today: '2026-11-19', weekMinutes: 105, lastWeighIn: '2026-11-17' }));
    expect(plan.map((p) => [p.title, p.subtitle])).toEqual([
      ['3.3 L of water to go', 'Nothing logged yet today'],
      ['45 active minutes left', '105 of 150 this week'],
    ]);
    expect(plan.map((p) => [p.kind, p.color, p.href, p.hint, p.future])).toEqual([
      ['water', 'water', '/water', 'Opens Water', false],
      ['move', 'exercise', '/activity/pick?date=2026-11-19', 'Opens the workout list', false],
    ]);
    expect(plan[0].progress).toBe(0);
    expect(plan[1].progress).toBeCloseTo(0.7);
  });

  it('B: water, move and a weigh-in nine days old; calories first in the list have no row', () => {
    const plan = todayPlan(input({ today: '2026-11-18', weekMinutes: 30, lastWeighIn: '2026-11-09', firstAdjust: 'cal' }));
    expect(plan.map((p) => [p.title, p.subtitle])).toEqual([
      ['3.3 L of water to go', 'Nothing logged yet today'],
      ['120 active minutes left', '30 of 150 this week'],
      ['Weigh in', 'Last one 9 days ago, Mon, Nov 9'],
    ]);
    expect(plan[2]).toMatchObject({ kind: 'weigh', color: 'weight', future: true, progress: 0, href: '/weight?log=1', hint: 'Opens Weight' });
  });

  it('C: water, move and last night', () => {
    const plan = todayPlan(input({ today: '2026-11-20', weekMinutes: 40, lastWeighIn: '2026-11-17', lastNightLogged: false }));
    expect(plan.map((p) => [p.title, p.subtitle])).toEqual([
      ['3.3 L of water to go', 'Nothing logged yet today'],
      ['110 active minutes left', '40 of 150 this week'],
      ["Add last night's sleep", 'Not logged yet'],
    ]);
    expect(plan[2]).toMatchObject({ kind: 'sleep', color: 'sleep', future: true, href: '/sleep?log=1', hint: 'Opens Sleep' });
  });

  it('D: Saturday with 75 minutes still doable', () => {
    expect(rows(input({ today: '2026-11-21', weekMinutes: 75, lastNightLogged: false }))).toEqual([
      ['3.3 L of water to go', 'Nothing logged yet today'],
      ['75 active minutes left', '75 of 150 this week'],
      ["Add last night's sleep", 'Not logged yet'],
    ]);
  });

  it('E: Sunday, 90 minutes left is not doable in a day', () => {
    expect(rows(input({ today: '2026-11-22', waterMl: 800, weekMinutes: 60, lastNightLogged: false }))).toEqual([
      ['2.5 L of water to go', '0.8 of 3.3 L so far'],
      ["Add last night's sleep", 'Not logged yet'],
    ]);
  });

  it('F: day 2, no weigh-in yet', () => {
    expect(rows(input({ today: '2026-11-17', waterMl: 900, waterGoalMl: 2600, lastNightLogged: false }))).toEqual([
      ['1.7 L of water to go', '0.9 of 2.6 L so far'],
      ['150 active minutes left', '0 of 150 this week'],
      ["Add last night's sleep", 'Not logged yet'],
    ]);
  });

  it('G: imperial, a Monday with nothing yet', () => {
    expect(rows(input({ today: '2026-11-23', waterGoalMl: 112 * OZ, weekMinutes: 0, units: 'imperial', lastWeighIn: '2026-11-22' }))).toEqual([
      ['112 fl oz of water to go', 'Nothing logged yet today'],
      ['150 active minutes left', 'A new week starts today'],
    ]);
  });
});

describe('edges', () => {
  it('weigh-in: 6 days old is no row, 7 is', () => {
    expect(todayPlan(input({ today: '2026-11-19', waterMl: 3300, weekMinutes: 150, lastWeighIn: '2026-11-13' }))).toEqual([]);
    expect(rows(input({ today: '2026-11-19', waterMl: 3300, weekMinutes: 150, lastWeighIn: '2026-11-12' }))).toEqual([['Weigh in', 'Last one 7 days ago, Thu, Nov 12']]);
  });

  it('move: exactly 150 or past it is done; the doable rule on a Sunday', () => {
    expect(todayPlan(input({ today: '2026-11-19', weekMinutes: 150 })).map((p) => p.kind)).toEqual(['water']);
    expect(todayPlan(input({ today: '2026-11-19', weekMinutes: 240 })).map((p) => p.kind)).toEqual(['water']);
    expect(rows(input({ today: '2026-11-22', waterMl: 3300, weekMinutes: 90 }))).toEqual([['60 active minutes left', '90 of 150 this week']]);
    expect(todayPlan(input({ today: '2026-11-22', waterMl: 3300, weekMinutes: 89 }))).toEqual([]);
    expect(rows(input({ today: '2026-11-19', waterMl: 3300, weekMinutes: 149 }))).toEqual([['1 active minute left', '149 of 150 this week']]);
    expect(rows(input({ today: '2026-11-16', waterMl: 3300, weekMinutes: 20 }))).toEqual([['130 active minutes left', '20 of 150 this week']]);
  });

  it('water: exactly met is done, a goal of zero has no row, a goal under 1 L reads in ml', () => {
    expect(todayPlan(input({ today: '2026-11-19', waterMl: 3300, weekMinutes: 150 }))).toEqual([]);
    expect(todayPlan(input({ today: '2026-11-19', waterGoalMl: 0, weekMinutes: 150 }))).toEqual([]);
    expect(rows(input({ today: '2026-11-19', waterMl: 250, waterGoalMl: 750, weekMinutes: 150 }))).toEqual([['500 ml of water to go', '250 of 750 ml so far']]);
    expect(rows(input({ today: '2026-11-19', waterMl: 40 * OZ, waterGoalMl: 112 * OZ, units: 'imperial', weekMinutes: 150 }))).toEqual([['72 fl oz of water to go', '40 of 112 fl oz so far']]);
  });

  it('at most three, in the order water, move, weigh, sleep', () => {
    expect(todayPlan(input({ today: '2026-11-18', weekMinutes: 30, lastWeighIn: '2026-11-01', lastNightLogged: false })).map((p) => p.kind)).toEqual(['water', 'move', 'weigh']);
    expect(todayPlan(input({ today: '2026-11-18', waterMl: 3300, weekMinutes: 30, lastWeighIn: '2026-11-01', lastNightLogged: false })).map((p) => p.kind)).toEqual(['move', 'weigh', 'sleep']);
  });

  it('the first item to improve leads when it has a row', () => {
    for (const k of ['water', 'sleep', 'protein', 'cal'] as const) {
      expect(todayPlan(input({ today: '2026-11-18', weekMinutes: 30, lastNightLogged: false, firstAdjust: k }))[0].kind).toBe('water');
    }
  });

  it('MiniCup levels follow the numbers', () => {
    const [w, m] = todayPlan(input({ today: '2026-11-17', waterMl: 1650, weekMinutes: 75 }));
    expect(w.progress).toBeCloseTo(0.5);
    expect(m.progress).toBeCloseTo(0.5);
  });
});

describe('helpers', () => {
  it('targetsLine: budget and protein, budget alone, nothing without a budget', () => {
    expect(targetsLine({ budget: 2190, proteinG: 152 })).toBe("Today's budget: 2,190 kcal and 152 g of protein.");
    expect(targetsLine({ budget: 1980.4, proteinG: 0 })).toBe("Today's budget: 1,980 kcal.");
    expect(targetsLine({ budget: 0, proteinG: 152 })).toBeNull();
  });

  it('waterAmount uses the goal unit', () => {
    expect(waterAmount(2500, 3300, 'metric')).toBe('2.5 L');
    expect(waterAmount(750, 750, 'metric')).toBe('750 ml');
    expect(waterAmount(112 * OZ, 112 * OZ, 'imperial')).toBe('112 fl oz');
  });

  it('days left in the week, today counted', () => {
    expect(daysLeftInWeek('2026-11-16')).toBe(7);
    expect(daysLeftInWeek('2026-11-19')).toBe(4);
    expect(daysLeftInWeek('2026-11-22')).toBe(1);
  });

  it('week ranges for the screen', () => {
    expect(weekSoFar('2026-11-19')).toEqual({ from: '2026-11-16', to: '2026-11-19' });
    expect(weekBeforeYesterday('2026-11-19')).toEqual({ from: '2026-11-16', to: '2026-11-17' });
    expect(weekBeforeYesterday('2026-11-17')).toBeNull();
    expect(weekBeforeYesterday('2026-11-16')).toEqual({ from: '2026-11-09', to: '2026-11-14' });
  });
});

// Today's water that is only drinks from the diary (waterTracked false) reads as no water, as
// before drinks from the diary counted in Water.
describe('today with only drinks from the diary', () => {
  it('the water row is the one of a day with no water', () => {
    const latte = rows(input({ today: '2026-11-19', waterMl: 223, waterTracked: false }));
    expect(latte).toEqual(rows(input({ today: '2026-11-19', waterMl: 0, waterTracked: false })));
    expect(latte[0]).toEqual(['3.3 L of water to go', 'Nothing logged yet today']);
    expect(todayPlan(input({ today: '2026-11-19', waterMl: 223, waterTracked: false }))[0].progress).toBe(0);
  });

  it('water logged on Water counts the diary drinks too', () => {
    expect(rows(input({ today: '2026-11-19', waterMl: 473, waterTracked: true }))[0]).toEqual(['2.8 L of water to go', '0.5 of 3.3 L so far']);
  });
});
