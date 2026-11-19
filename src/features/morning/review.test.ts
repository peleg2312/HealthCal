import { describe, expect, it } from 'vitest';

import type { DayFacts } from './facts';
import { ADJUST_TITLE, LOGGED_TEXT, NOTE_NO_FOOD, NOTE_PART_LOGGED, PLAN_TITLE, WELL_TITLE, reviewNote, toAdjust, wentWell, type ReviewInput } from './review';

const GARMIN = 'com.garmin.android.apps.connectmobile';

const facts = (patch: Partial<DayFacts>): DayFacts => ({
  date: '2026-11-18',
  foodLogged: true,
  complete: true,
  overBand: false,
  approx: false,
  kcal: 2095,
  budget: 2190,
  protein: 159,
  proteinG: 152,
  waterMl: 3400,
  waterGoalMl: 3300,
  hasWater: true,
  activities: [],
  guidelineMin: 0,
  ...patch,
});

const input = (patch: Partial<ReviewInput> & { y: DayFacts }): ReviewInput => ({ weekBefore: 0, lastNight: null, units: 'metric', firstWeek: false, ...patch });
const texts = (items: { text: string }[]) => items.map((i) => i.text);

// The seven cases of the specification (section 2.10).
const A = input({
  y: facts({ activities: [{ name: 'Volleyball', emoji: '🏐', durationMin: 75 }], guidelineMin: 75 }),
  weekBefore: 30,
  lastNight: { hours: 7.5, source: 'health', origin: GARMIN },
});
const B = input({
  y: facts({ date: '2026-11-17', kcal: 2510, overBand: true, protein: 112, waterMl: 2000 }),
  weekBefore: 30,
  lastNight: { hours: 5 + 40 / 60 },
});
const C = input({ y: facts({ date: '2026-11-19', kcal: 420, complete: false, protein: 18, waterMl: 0, hasWater: false }), weekBefore: 40 });
const D = input({ y: facts({ date: '2026-11-20', foodLogged: false, complete: false, kcal: 0, protein: 0, waterMl: 1200 }), weekBefore: 75 });
const E = input({ y: facts({ date: '2026-11-21', foodLogged: false, complete: false, kcal: 0, protein: 0, waterMl: 0, hasWater: false }), weekBefore: 60 });
const F = input({ y: facts({ date: '2026-11-16', kcal: 1350, budget: 1980, protein: 64, proteinG: 110, waterMl: 1500, waterGoalMl: 2600 }), firstWeek: true });
const G = input({
  y: facts({
    date: '2026-11-22',
    kcal: 11480,
    budget: 2400,
    overBand: true,
    approx: true,
    protein: 310,
    proteinG: 180,
    waterMl: 12500,
    waterGoalMl: 112 * 29.5735,
    activities: [
      { name: 'Running', emoji: '🏃', durationMin: 75 },
      { name: 'Cycling', emoji: '🚴', durationMin: 60 },
      { name: 'Swimming', emoji: '🏊', durationMin: 50 },
    ],
    guidelineMin: 185,
  }),
  weekBefore: 40,
  lastNight: { hours: 6 + 50 / 60 },
  units: 'imperial',
});

describe('cases A to G', () => {
  it('A: a strong day', () => {
    expect(texts(wentWell(A))).toEqual(['75 active minutes toward the weekly 150', '7 h 30 min of sleep last night, from Garmin Connect', "Within the day's budget: 2,095 of 2,190 kcal"]);
    expect(wentWell(A).map((i) => i.color)).toEqual(['exercise', 'sleep', 'calories']);
    expect(wentWell(A).map((i) => i.mark)).toEqual(['filled', 'filled', 'filled']);
    expect(toAdjust(A)).toEqual([]);
    expect(reviewNote(A.y)).toBeNull();
  });

  it('B: a heavy day', () => {
    expect(texts(wentWell(B))).toEqual(['The whole day is logged']);
    expect(texts(toAdjust(B))).toEqual(['Calories at 2,510 of 2,190 kcal', 'Sleep last night: 5 h 40 min of 7 h', 'Water stopped at 2.0 of 3.3 L']);
    expect(toAdjust(B).map((i) => i.kind)).toEqual(['cal', 'sleep', 'water']);
    expect(toAdjust(B).map((i) => i.mark)).toEqual(['warning', 'outline', 'outline']);
    expect(reviewNote(B.y)).toBeNull();
  });

  it('B without the short night: protein (26% short) ranks under water (39% short)', () => {
    expect(texts(toAdjust({ ...B, lastNight: null }))).toEqual(['Calories at 2,510 of 2,190 kcal', 'Water stopped at 2.0 of 3.3 L', 'Protein at 112 of 152 g']);
  });

  it('C: half logged is not judged on food or water', () => {
    expect(wentWell(C)).toEqual([]);
    expect(toAdjust(C)).toEqual([]);
    expect(reviewNote(C.y)).toBe(NOTE_PART_LOGGED);
    expect(NOTE_PART_LOGGED).toBe('With part of the day logged, its totals are not compared with your targets.');
  });

  it('D: only water', () => {
    expect(wentWell(D)).toEqual([]);
    expect(toAdjust(D)).toEqual([]);
    expect(reviewNote(D.y)).toBe(NOTE_NO_FOOD);
    expect(NOTE_NO_FOOD).toBe("With no food logged, the day's totals are not compared with your targets.");
  });

  it('E: nothing logged has no lists and no note', () => {
    expect(wentWell(E)).toEqual([]);
    expect(toAdjust(E)).toEqual([]);
    expect(reviewNote(E.y)).toBeNull();
  });

  it('F: day 2, one adjust item in the first week', () => {
    // 1,350 of 1,980 kcal is 68% of the budget: under 80%, so the budget is not praised, and the logged day is.
    expect(texts(wentWell(F))).toEqual(['The whole day is logged']);
    expect(texts(toAdjust(F))).toEqual(['Water stopped at 1.5 of 2.6 L']);
    expect(texts(toAdjust({ ...F, firstWeek: false }))).toEqual(['Water stopped at 1.5 of 2.6 L', 'Protein at 64 of 110 g']);
  });

  it('G: long content, imperial; protein not praised on a day over the band', () => {
    expect(texts(wentWell(G))).toEqual(['Weekly 150 active minutes reached: 225 min', 'Water reached: 423 of 112 fl oz', 'The whole day is logged']);
    // The figures only: the card's sentence states the difference once.
    expect(texts(toAdjust(G))).toEqual(['Calories at about 11,480 of 2,400 kcal']);
  });

  it('section titles', () => {
    expect([WELL_TITLE, ADJUST_TITLE, PLAN_TITLE]).toEqual(['What went well', 'What to improve', 'For today']);
  });
});

describe('went well', () => {
  it('move: the week crossing 150 exactly, a week already past it, and sessions with no guideline minutes', () => {
    const one = { name: 'Walk', emoji: '🚶', durationMin: 75 };
    expect(texts(wentWell(input({ y: facts({ activities: [one], guidelineMin: 75 }), weekBefore: 75 })))[0]).toBe('Weekly 150 active minutes reached: 150 min');
    expect(texts(wentWell(input({ y: facts({ activities: [one], guidelineMin: 74 }), weekBefore: 75 })))[0]).toBe('74 active minutes toward the weekly 150');
    expect(texts(wentWell(input({ y: facts({ activities: [one], guidelineMin: 30 }), weekBefore: 150 })))[0]).toBe('30 more active minutes, 180 this week');
    expect(texts(wentWell(input({ y: facts({ activities: [one], guidelineMin: 180 }), weekBefore: 220 })))[0]).toBe('180 more active minutes, 400 this week');
    expect(texts(wentWell(input({ y: facts({ activities: [one], guidelineMin: 1 }), weekBefore: 160 })))[0]).toBe('1 more active minute, 161 this week');
    expect(texts(wentWell(input({ y: facts({ activities: [one], guidelineMin: 75 }), weekBefore: 149 })))[0]).toBe('Weekly 150 active minutes reached: 224 min');
    expect(texts(wentWell(input({ y: facts({ activities: [{ name: 'Walk', emoji: '🚶', durationMin: 1 }], guidelineMin: 1 }) })))[0]).toBe('1 active minute toward the weekly 150');
    expect(texts(wentWell(input({ y: facts({ activities: [{ name: 'Yoga', emoji: '🧘', durationMin: 40 }], guidelineMin: 0 }) })))[0]).toBe('Yoga, 40 min');
    expect(texts(wentWell(input({ y: facts({ activities: [one, { name: 'Yoga', emoji: '🧘', durationMin: 40 }], guidelineMin: 0 }) })))[0]).toBe('2 sessions, 115 min');
  });

  it('sleep: 7 h exactly went well, from an app only for a synced night', () => {
    expect(texts(wentWell(input({ y: facts({}), lastNight: { hours: 7 } })))[0]).toBe('7 h of sleep last night');
    expect(texts(wentWell(input({ y: facts({}), lastNight: { hours: 6.99 } })))[0]).not.toContain('sleep');
    expect(texts(wentWell(input({ y: facts({}), lastNight: { hours: 8, origin: GARMIN } })))[0]).toBe('8 h of sleep last night');
  });

  it('budget: 80% to 100% of the budget is within; under 80% and between 100% and 110% are neither', () => {
    expect(texts(wentWell(input({ y: facts({ kcal: 1752, protein: 0, waterMl: 0 }) })))).toEqual(["Within the day's budget: 1,752 of 2,190 kcal"]);
    expect(texts(wentWell(input({ y: facts({ kcal: 1751, protein: 0, waterMl: 0 }) })))).toEqual([LOGGED_TEXT]);
    expect(texts(wentWell(input({ y: facts({ kcal: 1100, protein: 0, waterMl: 0 }) })))).toEqual([LOGGED_TEXT]);
    expect(toAdjust(input({ y: facts({ kcal: 1100, waterMl: 3300 }) }))).toEqual([]);
    expect(texts(wentWell(input({ y: facts({ approx: true }) })))[0]).toBe("Within the day's budget: about 2,095 of 2,190 kcal");
    expect(texts(wentWell(input({ y: facts({ kcal: 2190 }) })))[0]).toBe("Within the day's budget: 2,190 of 2,190 kcal");
    expect(texts(wentWell(input({ y: facts({ kcal: 2409, protein: 0, waterMl: 0 }) })))).toEqual([LOGGED_TEXT]);
  });

  it('protein exactly at its goal is reached; on a 110% day too; not on a day over the band', () => {
    expect(texts(wentWell(input({ y: facts({ kcal: 2409, protein: 152, waterMl: 0 }) })))).toEqual(['Protein reached: 152 of 152 g', LOGGED_TEXT]);
    expect(texts(wentWell(input({ y: facts({ kcal: 2410, overBand: true, protein: 152, waterMl: 0 }) })))).toEqual([LOGGED_TEXT]);
  });

  it('the logged day and the budget item never show together (one calorie mark)', () => {
    expect(wentWell(input({ y: facts({ protein: 0, waterMl: 0 }) })).map((i) => i.kind)).toEqual(['budget']);
    expect(wentWell(input({ y: facts({ kcal: 2300, protein: 0, waterMl: 0 }) })).map((i) => i.kind)).toEqual(['logged']);
    expect(wentWell(input({ y: facts({ complete: false, kcal: 2000, protein: 0, waterMl: 0 }) }))).toEqual([]);
  });

  it('a target of zero is never reached or listed', () => {
    const y = facts({ budget: 0, proteinG: 0, waterGoalMl: 0, kcal: 1200, protein: 50, waterMl: 500 });
    expect(texts(wentWell(input({ y })))).toEqual([LOGGED_TEXT]);
    expect(toAdjust(input({ y }))).toEqual([]);
  });

  it('a water goal under 1 L', () => {
    expect(texts(wentWell(input({ y: facts({ waterMl: 800, waterGoalMl: 750, kcal: 2300 }) })))).toEqual(['Protein reached: 159 of 152 g', 'Water reached: 800 of 750 ml', LOGGED_TEXT]);
    expect(texts(wentWell(input({ y: facts({ waterMl: 800, waterGoalMl: 750 }) })))).toEqual(["Within the day's budget: 2,095 of 2,190 kcal", 'Protein reached: 159 of 152 g', 'Water reached: 800 of 750 ml']);
  });

  it('at most three', () => {
    const y = facts({ activities: [{ name: 'Run', emoji: '🏃', durationMin: 30 }], guidelineMin: 30 });
    expect(wentWell(input({ y, lastNight: { hours: 8 } })).map((i) => i.kind)).toEqual(['move', 'sleep', 'budget']);
    expect(wentWell(input({ y: facts({}) })).map((i) => i.kind)).toEqual(['budget', 'protein', 'water']);
  });
});

describe('to adjust', () => {
  it('sleep: exactly 6 h is neither, under 6 h is listed on any day', () => {
    expect(toAdjust(input({ y: facts({}), lastNight: { hours: 6 } }))).toEqual([]);
    expect(texts(toAdjust(input({ y: facts({ foodLogged: false, complete: false }), lastNight: { hours: 5.99 } })))).toEqual(['Sleep last night: 5 h 59 min of 7 h']);
  });

  it('protein at 80% is not listed, under it is', () => {
    expect(toAdjust(input({ y: facts({ protein: 121.6, waterMl: 3300 }) }))).toEqual([]);
    expect(texts(toAdjust(input({ y: facts({ protein: 121, waterMl: 3300 }) })))).toEqual(['Protein at 121 of 152 g']);
  });

  it('water exactly at its goal is not listed; none at all says so', () => {
    expect(toAdjust(input({ y: facts({ waterMl: 3300 }) }))).toEqual([]);
    expect(texts(toAdjust(input({ y: facts({ waterMl: 0 }) })))).toEqual(['No water logged, goal 3.3 L']);
    expect(texts(toAdjust(input({ y: facts({ waterMl: 0, waterGoalMl: 112 * 29.5735 }), units: 'imperial' })))).toEqual(['No water logged, goal 112 fl oz']);
    expect(texts(toAdjust(input({ y: facts({ waterMl: 500, waterGoalMl: 750 }) })))).toEqual(['Water stopped at 500 of 750 ml']);
  });

  it('a tie in the share missing puts water first', () => {
    expect(toAdjust(input({ y: facts({ protein: 76, waterMl: 1650 }) })).map((i) => i.kind)).toEqual(['water', 'protein']);
  });

  it('calories: an item only over the band; exactly 110% and 100 to 110% are neither', () => {
    expect(toAdjust(input({ y: facts({ kcal: 2409 }) }))).toEqual([]);
    expect(toAdjust(input({ y: facts({ kcal: 2300 }) }))).toEqual([]);
    expect(texts(toAdjust(input({ y: facts({ kcal: 2410, overBand: true }) })))).toEqual(['Calories at 2,410 of 2,190 kcal']);
    expect(texts(toAdjust(input({ y: facts({ kcal: 2410, overBand: true, approx: true }) })))).toEqual(['Calories at about 2,410 of 2,190 kcal']);
  });

  it('first week: one item, and calories win when they hold', () => {
    const y = facts({ kcal: 2600, overBand: true, waterMl: 1000, protein: 50 });
    expect(toAdjust(input({ y, firstWeek: true, lastNight: { hours: 4 } })).map((i) => i.kind)).toEqual(['cal']);
    expect(toAdjust(input({ y, lastNight: { hours: 4 } })).map((i) => i.kind)).toEqual(['cal', 'sleep', 'water']);
    expect(toAdjust(input({ y: facts({ waterMl: 1000, protein: 50 }), firstWeek: true, lastNight: { hours: 4 } })).map((i) => i.kind)).toEqual(['sleep']);
  });

  it('eat-back off: the day is judged on the budget it carries', () => {
    // With eat-back off the stored budget has no exercise in it; dayFacts passes it through as it is.
    expect(texts(toAdjust(input({ y: facts({ kcal: 2600, budget: 2000, overBand: true, waterMl: 3300 }) })))).toEqual(['Calories at 2,600 of 2,000 kcal']);
  });

  it('a part-logged day lists only sleep', () => {
    expect(toAdjust(input({ y: facts({ complete: false, kcal: 500, protein: 10, waterMl: 0 }), lastNight: { hours: 4 } })).map((i) => i.kind)).toEqual(['sleep']);
  });
});

describe('reviewNote', () => {
  it('a workout alone counts as no food', () => {
    expect(reviewNote(facts({ foodLogged: false, complete: false, hasWater: false, activities: [{ name: 'Run', emoji: '🏃', durationMin: 30 }] }))).toBe(NOTE_NO_FOOD);
  });
  it('0 kcal entries are part of a day', () => {
    expect(reviewNote(facts({ kcal: 0, complete: false }))).toBe(NOTE_PART_LOGGED);
  });
});

// Drinks logged in the diary count in the water total but do not make a day water tracked
// (hasWater false): the review then reads the day exactly as a day with no water at all.
describe('a day whose only water came with drinks from the diary', () => {
  const latte = (p: Partial<DayFacts>) => facts({ hasWater: false, ...p });
  const none = (p: Partial<DayFacts>) => facts({ hasWater: false, ...p, waterMl: 0 });

  it('to improve: "No water logged", as without the diary water', () => {
    const y = { kcal: 2095, protein: 159, waterMl: 223, waterGoalMl: 3300 };
    expect(texts(toAdjust(input({ y: latte(y) })))).toEqual(texts(toAdjust(input({ y: none(y) }))));
    expect(texts(toAdjust(input({ y: latte(y) })))).toEqual(['No water logged, goal 3.3 L']);
  });

  it('went well: never "Water reached" from diary drinks alone', () => {
    const y = { waterMl: 3400, waterGoalMl: 3300 };
    expect(texts(wentWell(input({ y: latte(y) })))).toEqual(texts(wentWell(input({ y: none(y) }))));
    expect(wentWell(input({ y: latte(y) })).map((i) => i.kind)).not.toContain('water');
  });

  it('a day with water logged on Water counts the diary drinks in its total', () => {
    expect(texts(toAdjust(input({ y: facts({ waterMl: 473, hasWater: true }) })))).toEqual(['Water stopped at 0.5 of 3.3 L']);
  });
});
