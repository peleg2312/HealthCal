import { describe, expect, it } from 'vitest';

import { addDays } from '@/lib/dates';
import type { ISODate } from '@/types';

import type { DayFacts } from './facts';
import { goodNightsInARow, isStreakMilestone, personalBody, personalLine, type PersonalInput } from './personal';

/** An ordinary logged day: nothing in it is a record (a 90 min ride two days a week, protein 140 g, water short of its goal). */
const ordinary = (date: ISODate, i: number): DayFacts => ({
  date,
  foodLogged: true,
  complete: true,
  overBand: false,
  approx: false,
  kcal: 2000,
  budget: 2190,
  protein: 140,
  proteinG: 152,
  waterMl: 2000,
  waterGoalMl: 3300,
  hasWater: true,
  activities: i % 3 === 0 ? [{ name: 'Cycling', emoji: '🚴', durationMin: 90 }] : [],
  guidelineMin: i % 3 === 0 ? 90 : 0,
});

/** 28 days ending yesterday, oldest first, with `patch` applied to the days named. */
function days(today: ISODate, patch: Record<ISODate, Partial<DayFacts>> = {}, base = ordinary): DayFacts[] {
  const out: DayFacts[] = [];
  for (let k = 28; k >= 1; k--) {
    const date = addDays(today, -k);
    out.push({ ...base(date, k), ...patch[date] });
  }
  return out;
}

const empty = (date: ISODate): DayFacts => ({
  date,
  foodLogged: false,
  complete: false,
  overBand: false,
  approx: false,
  kcal: 0,
  budget: 2190,
  protein: 0,
  proteinG: 152,
  waterMl: 0,
  waterGoalMl: 3300,
  hasWater: false,
  activities: [],
  guidelineMin: 0,
});

const input = (patch: Partial<PersonalInput> & { today: ISODate }): PersonalInput => ({
  onboardedDay: '2026-01-10',
  streak: 0,
  days: days(patch.today),
  sleepHours: {},
  ...patch,
});

// The seven cases of the specification (section 2.10).
const A = input({
  today: '2026-11-19',
  streak: 12,
  days: days('2026-11-19', {
    '2026-11-18': { kcal: 2095, protein: 159, waterMl: 3400, activities: [{ name: 'Volleyball', emoji: '🏐', durationMin: 75 }], guidelineMin: 75 },
    '2026-11-10': { protein: 170 },
  }),
  sleepHours: { '2026-11-19': 7.5, '2026-11-18': 6 + 50 / 60 },
});
const B = input({ today: '2026-11-18', streak: 3, days: days('2026-11-18', { '2026-11-17': { kcal: 2510, overBand: true, protein: 112 } }), sleepHours: { '2026-11-18': 5 + 40 / 60 } });
const C = input({ today: '2026-11-20', streak: 2, days: days('2026-11-20', { '2026-11-19': { kcal: 420, complete: false, protein: 18, waterMl: 0, hasWater: false } }) });
const D = input({ today: '2026-11-21', streak: 0, days: days('2026-11-21', { '2026-11-20': { ...empty('2026-11-20'), waterMl: 1200, hasWater: true } }) });
const E = input({ today: '2026-11-22', streak: 8, days: days('2026-11-22', { '2026-11-21': empty('2026-11-21') }) });
const F = input({
  today: '2026-11-17',
  onboardedDay: '2026-11-16',
  streak: 1,
  days: days('2026-11-17', { '2026-11-16': { kcal: 1350, budget: 1980, protein: 64, proteinG: 110, waterMl: 1500, waterGoalMl: 2600 } }, (d) => empty(d)),
});
const G = input({
  today: '2026-11-23',
  streak: 412,
  days: days('2026-11-23', {
    '2026-11-22': {
      kcal: 11480,
      budget: 2400,
      overBand: true,
      protein: 310,
      proteinG: 180,
      waterMl: 12500,
      waterGoalMl: 3312,
      activities: [
        { name: 'Running', emoji: '🏃', durationMin: 75 },
        { name: 'Cycling', emoji: '🚴', durationMin: 60 },
        { name: 'Swimming', emoji: '🏊', durationMin: 50 },
      ],
      guidelineMin: 185,
    },
  }),
  sleepHours: { '2026-11-23': 6 + 50 / 60 },
});

describe('cases A to G', () => {
  it('A: the streak, with the name when the title dropped it', () => {
    expect(personalLine(A, null)).toBe('12 days in your logging streak.');
    expect(personalLine(A, 'Gilad')).toBe('Gilad, 12 days in your logging streak.');
  });
  it('B: the streak', () => expect(personalLine(B, null)).toBe('3 days in your logging streak.'));
  it('C: nothing notable, no line', () => {
    expect(personalLine(C, null)).toBeNull();
    expect(personalLine(C, 'Gilad')).toBeNull();
  });
  it('D: nothing notable, no line', () => expect(personalLine(D, null)).toBeNull());
  it('E: no food yesterday, the forgiving streak is still on', () => {
    expect(personalLine(E, null)).toBe('Your 8-day logging streak is still on; one missed day does not end it.');
  });
  it('F: day 2 of the first week', () => expect(personalLine(F, null)).toBe('Day 2 of your first week.'));
  it('G: a 412-day streak and a 22-character name; protein over the band is no record', () => {
    expect(personalLine(G, 'Maximiliana Rosenkranz')).toBe('Maximiliana Rosenkranz, 412 days in your logging streak.');
    expect(personalLine({ ...G, streak: 1412 }, null)).toBe('1,412 days in your logging streak.');
  });
});

describe('the rules in order', () => {
  it('P1: days 2 to 7 of the first week, not day 1 or day 8, and before every other rule', () => {
    expect(personalBody({ ...A, onboardedDay: '2026-11-19' })).toBe('12 days in your logging streak');
    expect(personalBody({ ...A, onboardedDay: '2026-11-13' })).toBe('day 7 of your first week');
    expect(personalBody({ ...A, onboardedDay: '2026-11-12' })).toBe('12 days in your logging streak');
    expect(personalBody({ ...A, onboardedDay: null })).toBe('12 days in your logging streak');
  });

  it('P2: a milestone only with food yesterday', () => {
    expect(personalLine({ ...A, streak: 14 }, null)).toBe('Your logging streak reaches 14 days.');
    expect(personalLine({ ...A, streak: 400 }, null)).toBe('Your logging streak reaches 400 days.');
    expect(personalLine({ ...E, streak: 14 }, null)).toBe('Your 14-day logging streak is still on; one missed day does not end it.');
    expect([7, 14, 21, 30, 50, 75, 100, 200, 365, 1000].every(isStreakMilestone)).toBe(true);
    expect([0, 1, 12, 99, 101, 412].some(isStreakMilestone)).toBe(false);
  });

  it('P3: nights of 7 h or more in a row, from the night dated today; 6 h 59 min breaks it', () => {
    const nights = { '2026-11-19': 7, '2026-11-18': 8, '2026-11-17': 7.2 };
    expect(goodNightsInARow(nights, '2026-11-19')).toBe(3);
    expect(personalLine({ ...A, sleepHours: nights }, null)).toBe('A third night in a row with 7 hours or more of sleep.');
    expect(goodNightsInARow({ ...nights, '2026-11-18': 6.99 }, '2026-11-19')).toBe(1);
    expect(goodNightsInARow({ '2026-11-18': 8, '2026-11-17': 8, '2026-11-16': 8 }, '2026-11-19')).toBe(0);
    const ten: Record<ISODate, number> = {};
    const eleven: Record<ISODate, number> = {};
    for (let k = 0; k < 10; k++) ten[addDays('2026-11-19', -k)] = 7.5;
    for (let k = 0; k < 11; k++) eleven[addDays('2026-11-19', -k)] = 7.5;
    expect(personalBody({ ...A, sleepHours: ten })).toBe('a tenth night in a row with 7 hours or more of sleep');
    expect(personalBody({ ...A, sleepHours: eleven })).toBe('11 nights in a row with 7 hours or more of sleep');
  });

  it('P4: the most protein in two weeks, strictly, with 7 days of food, not on a day over the band', () => {
    const today = '2026-11-19';
    const y = '2026-11-18';
    const rec = input({ today, days: days(today, { [y]: { protein: 160 } }) });
    expect(personalBody(rec)).toBe('your most protein in two weeks: 160 g yesterday');
    // A day more than 13 days back does not count.
    expect(personalBody({ ...rec, days: days(today, { [y]: { protein: 160 }, '2026-11-04': { protein: 200 } }) })).toBe('your most protein in two weeks: 160 g yesterday');
    // A tie is not a record.
    expect(personalBody({ ...rec, days: days(today, { [y]: { protein: 160 }, '2026-11-05': { protein: 160 } }) })).toBeNull();
    // Under its goal, or over the band, or part-logged.
    expect(personalBody({ ...rec, days: days(today, { [y]: { protein: 150 } }) })).toBeNull();
    expect(personalBody({ ...rec, days: days(today, { [y]: { protein: 160, overBand: true } }) })).toBeNull();
    expect(personalBody({ ...rec, days: days(today, { [y]: { protein: 160, complete: false } }) })).toBeNull();
    // Only 6 of the 13 days before had food.
    const sparse: Record<ISODate, Partial<DayFacts>> = { [y]: { protein: 160 } };
    for (let k = 2; k <= 8; k++) sparse[addDays(today, -k)] = empty(addDays(today, -k));
    expect(personalBody({ ...rec, days: days(today, sparse) })).toBeNull();
  });

  it('P5: the longest session in two weeks, strictly, with 4 sessions before', () => {
    const today = '2026-11-19';
    const y = '2026-11-18';
    const long = { activities: [{ name: ' Long ride ', emoji: '🚴', durationMin: 120.4 }], guidelineMin: 120 };
    expect(personalBody(input({ today, days: days(today, { [y]: long }) }))).toBe('your longest session in two weeks: Long ride, 120 min');
    expect(personalBody(input({ today, days: days(today, { [y]: { ...long, activities: [{ name: 'Ride', emoji: '🚴', durationMin: 90 }] } }) }))).toBeNull();
    // Only 3 sessions in the 13 days before (the ride every third day gives 4: days 3, 6, 9, 12).
    expect(personalBody(input({ today, days: days(today, { [y]: long, '2026-11-07': { activities: [] } }) }))).toBeNull();
  });

  it('P6: the water goal three days in a row, exactly met counts', () => {
    const today = '2026-11-19';
    const met = { waterMl: 3300 };
    expect(personalBody(input({ today, days: days(today, { '2026-11-18': met, '2026-11-17': met, '2026-11-16': met }) }))).toBe('water goal reached 3 days in a row');
    expect(personalBody(input({ today, days: days(today, { '2026-11-18': met, '2026-11-17': met }) }))).toBeNull();
    expect(personalBody(input({ today, days: days(today, { '2026-11-18': met, '2026-11-17': met, '2026-11-16': met, '2026-11-15': { waterGoalMl: 0 } }) }))).toBe('water goal reached 3 days in a row');
  });

  it('P7 and P8: the streak from 3; never "in a row"', () => {
    expect(personalBody({ ...A, streak: 2 })).toBeNull();
    expect(personalBody({ ...E, streak: 2 })).toBeNull();
    expect(personalBody({ ...A, streak: 3 })).toBe('3 days in your logging streak');
    expect(personalBody({ ...A, streak: 3 })).not.toMatch(/in a row/);
    expect(personalBody({ ...E, streak: 3 })).not.toMatch(/in a row/);
  });

  it('no history at all: no line', () => {
    expect(personalLine({ today: '2026-11-19', onboardedDay: null, streak: 0, days: [], sleepHours: {} }, 'Gilad')).toBeNull();
  });

  it('a blank name reads as no name', () => {
    expect(personalLine(A, '  ')).toBe('12 days in your logging streak.');
  });
});
