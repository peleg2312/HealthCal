/**
 * No shame (product principle 4): no string the morning page's own functions can return holds a
 * word from the banned list or an exclamation mark, across a generated grid of inputs. The quote of
 * the day is on the same page, so every bundled quote is held to the page's own list (AGENTS.md:
 * "bad", "failed", "missed your", "should", "cheat", "great", in every form); quotes.test.ts checks
 * the rest of their rules.
 */
import { describe, expect, it } from 'vitest';

import { addDays } from '@/lib/dates';
import type { ISODate, UnitSystem } from '@/types';

import type { DayFacts } from './facts';
import { morningLine, moveLine } from './line';
import { personalLine } from './personal';
import { targetsLine, todayPlan } from './plan';
import { QUOTES } from './quotes';
import { ADJUST_TITLE, NOTHING_CAPTION, NOTHING_LINE, PLAN_TITLE, WELL_TITLE, reviewNote, toAdjust, wentWell, type ReviewKind } from './review';

const BANNED =
  /\b(bad|fail|failed|failure|cheat|cheated|should|guilty|lazy|great|amazing|well done|keep it up|too much|missed your|goal missed|over budget|make up|only|unfortunately|oops|sorry)\b/i;

/**
 * The page's own list (AGENTS.md, the morning page), every form of each word: what a quote may never
 * say on this page. ("Only" and "well done", banned above in the page's own sentences as words that
 * belittle or praise without a figure, are not on it: in a quote they do neither.)
 */
const PAGE_BANNED = /\b(bad|badly|worse|worst|fail|fails|failed|failing|failure|failures|missed your|should|cheat|cheats|cheated|cheating|great|greater|greatest|greatly|greatness)\b/i;

function check(strings: Set<string>) {
  // Also "1 active minutes": one is singular.
  const bad = [...strings].filter((s) => BANNED.test(s) || s.includes('!') || /(^|[^\d,.])1 (more )?active minutes/.test(s));
  expect(bad).toEqual([]);
}

const kcals = [0, 300, 420, 1100, 2000, 2190, 2300, 2409, 2410, 2510, 11480];
const budgets = [0, 1980, 2190];
const shares = [0, 0.5, 0.79, 0.8, 1, 1.3];
const nights = [null, 4, 5.99, 6, 6.99, 7, 9];
const units: UnitSystem[] = ['metric', 'imperial'];
const acts = [
  [],
  [{ name: 'Walk', emoji: '🚶', durationMin: 1 }],
  [{ name: 'Volleyball', emoji: '🏐', durationMin: 75 }],
  [
    { name: 'Running', emoji: '🏃', durationMin: 75 },
    { name: 'Yoga', emoji: '🧘', durationMin: 40 },
  ],
];

function factsGrid(): DayFacts[] {
  const out: DayFacts[] = [];
  for (const kcal of kcals)
    for (const budget of budgets)
      for (const share of shares)
        for (const a of acts)
          for (const foodLogged of [true, false]) {
            const complete = foodLogged && kcal >= Math.max(1000, budget * 0.5);
            out.push({
              date: '2026-11-18',
              foodLogged,
              complete,
              overBand: complete && budget > 0 && kcal - budget > budget * 0.1 + 1e-9,
              approx: kcal % 2 === 1,
              kcal: foodLogged ? kcal : 0,
              budget,
              protein: 152 * share,
              proteinG: budget ? 152 : 0,
              waterMl: 3300 * share,
              waterGoalMl: budget ? 3300 : 750,
              hasWater: share > 0,
              activities: a,
              guidelineMin: a.reduce((sum, x) => sum + x.durationMin, 0),
            });
          }
  return out;
}

describe('no-shame words', () => {
  it('the quote of the day: no quote holds a word from the page\'s banned list', () => {
    const held = QUOTES.filter((q) => PAGE_BANNED.test(q.text.replace(/\n/g, ' '))).map((q) => `${q.id}: ${q.text}`);
    expect(held).toEqual([]);
  });

  it('review: went well, to improve, the note and the titles', () => {
    const seen = new Set<string>([NOTHING_LINE, NOTHING_CAPTION, WELL_TITLE, ADJUST_TITLE, PLAN_TITLE]);
    for (const y of factsGrid())
      for (const night of nights)
        for (const u of units)
          for (const weekBefore of [0, 75, 140, 149, 150, 200])
            for (const firstWeek of [true, false]) {
              const i = { y, weekBefore, lastNight: night === null ? null : { hours: night, source: 'health', origin: 'com.garmin.android.apps.connectmobile' }, units: u, firstWeek };
              for (const item of [...wentWell(i), ...toAdjust(i)]) seen.add(item.text);
              const note = reviewNote(y);
              if (note) seen.add(note);
            }
    expect(seen.size).toBeGreaterThan(40);
    check(seen);
  });

  it('the sentence and the movement line', () => {
    const seen = new Set<string>();
    for (const y of factsGrid()) {
      seen.add(morningLine({ kcal: y.kcal, budget: y.budget, complete: y.complete, foodLogged: y.foodLogged, proteinMet: y.protein >= y.proteinG && y.proteinG > 0, waterMet: y.waterMl >= y.waterGoalMl }));
      seen.add(moveLine(y.activities, 290));
    }
    check(seen);
  });

  it('the personal line', () => {
    const seen = new Set<string>();
    const today: ISODate = '2026-11-19';
    for (const streak of [0, 2, 3, 7, 12, 100, 412])
      for (const onboarded of [null, today, addDays(today, -1), addDays(today, -6), addDays(today, -30)])
        for (const yFood of [true, false])
          for (const nightRun of [0, 3, 11])
            for (const name of [null, 'Gilad']) {
              const days: DayFacts[] = [];
              for (let k = 28; k >= 1; k--) {
                const food = k === 1 ? yFood : true;
                days.push({
                  date: addDays(today, -k),
                  foodLogged: food,
                  complete: food,
                  overBand: false,
                  approx: false,
                  kcal: food ? 2000 : 0,
                  budget: 2190,
                  protein: k === 1 ? 200 : 100,
                  proteinG: 152,
                  waterMl: k <= 4 ? 3300 : 0,
                  waterGoalMl: 3300,
                  hasWater: k <= 4,
                  activities: [{ name: 'Run', emoji: '🏃', durationMin: k === 1 ? 120 : 30 }],
                  guidelineMin: 30,
                });
              }
              const sleepHours: Record<ISODate, number> = {};
              for (let k = 0; k < nightRun; k++) sleepHours[addDays(today, -k)] = 7.5;
              const line = personalLine({ today, onboardedDay: onboarded, streak, days, sleepHours }, name);
              if (line) seen.add(line);
              // Every later rule, reached by switching the earlier ones off.
              const later = personalLine({ today, onboardedDay: null, streak, days: days.map((d) => ({ ...d, protein: 100, activities: [] })), sleepHours: {} }, name);
              if (later) seen.add(later);
            }
    expect(seen.size).toBeGreaterThan(10);
    check(seen);
  });

  it('the plan and the targets line', () => {
    const seen = new Set<string>();
    const firsts: (ReviewKind | null)[] = [null, 'cal', 'sleep', 'water', 'protein'];
    for (const today of ['2026-11-16', '2026-11-19', '2026-11-22'])
      for (const waterMl of [0, 800, 3300])
        for (const waterGoalMl of [0, 750, 3300])
          for (const weekMinutes of [0, 60, 90, 149, 150, 300])
            for (const lastWeighIn of [null, '2026-11-12', '2026-11-01'])
              for (const lastNightLogged of [true, false])
                for (const u of units)
                  for (const firstAdjust of firsts)
                    for (const p of todayPlan({ today, waterMl, waterGoalMl, weekMinutes, lastWeighIn, lastNightLogged, firstAdjust, units: u })) {
                      seen.add(p.title);
                      seen.add(p.subtitle);
                      seen.add(p.hint);
                    }
    for (const budget of [0, 1980, 2190]) for (const proteinG of [0, 152]) seen.add(targetsLine({ budget, proteinG }) ?? '');
    check(seen);
  });
});
