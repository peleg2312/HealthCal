import { describe, expect, it } from 'vitest';

import { addDays } from './dates';
import {
  computeMilestones,
  generateInsights,
  hydrationPattern,
  rankInsights,
  sleepAppetite,
  summarizePeriod,
  weekendPattern,
  guidelineMinutes,
  isCompleteDay,
  compareText,
  direction,
  percentile,
  usualKcalRange,
  usualRange,
  usualWeightRange,
  weekdayUsual,
  budgetBalanceText,
  budgetMark,
  planChangeText,
  recapTiles,
  recapWeeks,
  weeklyRecap,
  type Insight,
  type InsightContext,
  type InsightDay,
  type SleepLike,
} from './insights';
import type { AdaptiveTdee, TrendPoint } from './trend';
import { isCompleteDay as sharedComplete, weightTrend } from './trend';

// 2026-11-13 is a Friday. Weeks are Monday-based: Mon Nov 9 .. Sun Nov 15.
const TODAY = '2026-11-13';

function at(date: string, hour: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d, hour, 0, 0).toISOString();
}

interface DayOpts {
  kcal?: number;
  budget?: number;
  protein?: number;
  proteinTarget?: number;
  carbs?: number;
  fat?: number;
  fiber?: number | null;
  fiberTarget?: number;
  water?: { ml: number; hour: number }[];
  waterGoal?: number;
  minutes?: number;
  sessions?: number;
  /** MET of each session (default 4, moderate). */
  met?: number;
  logged?: boolean;
}

function day(date: string, o: DayOpts = {}): InsightDay {
  const logged = o.logged ?? true;
  const kcal = logged ? (o.kcal ?? 2000) : 0;
  const fiber = o.fiber === null ? undefined : (o.fiber ?? 28);
  const water = o.water ?? [{ ml: 2500, hour: 10 }];
  const waterMl = water.reduce((s, w) => s + w.ml, 0);
  return {
    date,
    entries: logged ? [{ nutrients: { fiber } }] : [],
    eaten: { kcal, protein: logged ? (o.protein ?? 140) : 0, carbs: o.carbs ?? 200, fat: o.fat ?? 70, fiber: fiber ?? 0 },
    budget: o.budget ?? 2000,
    macros: { proteinG: o.proteinTarget ?? 140, carbsG: 200, fatG: 70, fiberG: o.fiberTarget ?? 28 },
    activities: Array.from({ length: o.sessions ?? (o.minutes ? 1 : 0) }, (_, __, n = o.sessions ?? 1) => ({ met: o.met ?? 4, durationMin: (o.minutes ?? 0) / n })),
    activeMinutes: o.minutes ?? 0,
    waterEntries: water.map((w) => ({ ml: w.ml, beverage: 'water' as const, loggedAt: at(date, w.hour) })),
    waterMl,
    waterGoalMl: o.waterGoal ?? 2500,
  };
}

/** n days ending today (oldest first), built by a per-date function. */
function run(n: number, f: (date: string, i: number) => InsightDay): InsightDay[] {
  return Array.from({ length: n }, (_, i) => {
    const date = addDays(TODAY, i - (n - 1));
    return f(date, i);
  });
}

const adaptivePending: AdaptiveTdee = { tdee: 2400, observed: null, confidence: 0, loggedDays: 4, weighIns: 2, windowDays: 28, needs: '6 more fully logged days and 3 more weigh-ins' };

function ctx(days: InsightDay[], over: Partial<InsightContext> = {}): InsightContext {
  const sleep = over.sleep ?? [];
  const summary = summarizePeriod({ days, trend: [], sleep, today: TODAY });
  return {
    summary,
    days,
    sleep,
    today: TODAY,
    units: 'metric',
    goal: 'lose',
    chosenWeeklyKg: 0.4,
    weightKg: 80,
    currentWeeklyRateKg: null,
    weighInsTotal: 0,
    energy: { formulaTdee: 2400, adaptive: adaptivePending, usingAdaptive: false, useAdaptiveSetting: true, tdee: 2400 },
    streak: 0,
    ...over,
  };
}

const ids = (list: Insight[]) => list.map((i) => i.id);
const find = (list: Insight[], id: string) => list.find((i) => i.id === id);

describe('summarizePeriod', () => {
  it('averages only closed, fully logged days', () => {
    const days = run(7, (d, i) => {
      if (i === 6) return day(d, { kcal: 500 }); // today, in progress
      if (i === 0) return day(d, { logged: false });
      if (i === 1) return day(d, { kcal: 600 }); // partial: under half the budget
      return day(d, { kcal: 2100, protein: 120 });
    });
    const s = summarizePeriod({ days, trend: [], sleep: [], today: TODAY });
    expect(s.totalDays).toBe(7);
    expect(s.loggedDays).toBe(5);
    expect(s.loggedDaysInclToday).toBe(6);
    expect(s.completeDays).toBe(4);
    expect(s.partialDays).toBe(1);
    expect(s.calories!.avgKcal).toBe(2100);
    expect(s.calories!.avgDiff).toBe(100);
    // 2,100 of 2,000 is above the budget: never on it.
    expect(s.calories!.onBudget).toBe(0);
    expect(s.calories!.above).toBe(4);
    expect(s.macros!.protein.avg).toBe(120);
  });

  it('counts days on budget (90 to 100%), above and below by the one rule', () => {
    const kcals = [2000, 2250, 1700, 2150, 1800];
    const days = run(6, (d, i) => (i < 5 ? day(d, { kcal: kcals[i] }) : day(d, { logged: false })));
    const c = summarizePeriod({ days, trend: [], sleep: [], today: TODAY }).calories!;
    expect(c.onBudget).toBe(2);
    expect(c.above).toBe(2);
    expect(c.below).toBe(1);
  });

  it('marks a day on budget at 90 to 100% of its budget, above over 100%, nothing under 90%', () => {
    expect(budgetMark(1800, 2000)).toBe('on');
    expect(budgetMark(2000, 2000)).toBe('on');
    expect(budgetMark(2001, 2000)).toBe('above');
    expect(budgetMark(2190, 2000)).toBe('above');
    expect(budgetMark(1799, 2000)).toBeNull();
    expect(budgetMark(500, 0)).toBeNull();
  });

  it('drops fibre when most foods carry no value', () => {
    const days = run(5, (d) => day(d, { fiber: null }));
    expect(summarizePeriod({ days, trend: [], sleep: [], today: TODAY }).macros!.fiber).toBeNull();
  });

  it('averages sleep quality only over rated nights, and gives none when no night is rated', () => {
    const days = run(6, (d) => day(d, {}));
    const rated: SleepLike[] = days.map((d, i) => ({ date: d.date, hours: 7, ...(i < 2 ? { quality: i + 3 } : {}) }));
    const s = summarizePeriod({ days, trend: [], sleep: rated, today: TODAY });
    expect(s.sleep!.nights).toBe(6);
    expect(s.sleep!.avgQuality).toBe(3.5);
    expect(s.sleep!.rated).toBe(2);
    const unrated = summarizePeriod({ days, trend: [], sleep: days.map((d) => ({ date: d.date, hours: 7 })), today: TODAY });
    expect(unrated.sleep!.avgQuality).toBeNull();
    expect(unrated.sleep!.rated).toBe(0);
  });

  it('summarises water, activity, sleep and weight', () => {
    const days = run(14, (d, i) => day(d, { water: [{ ml: i % 2 ? 2600 : 1500, hour: 9 }], minutes: i % 3 === 0 ? 30 : 0 }));
    const sleep: SleepLike[] = days.map((d, i) => ({ date: d.date, hours: i % 2 ? 6 : 8, quality: 3 }));
    const trend = weightTrend(days.map((d, i) => ({ date: d.date, kg: 80 - i * 0.1 })));
    const s = summarizePeriod({ days, trend, sleep, today: TODAY });
    expect(s.water!.daysTracked).toBe(13);
    expect(s.water!.daysAtGoal).toBe(6); // odd indices 1..11 before today
    expect(s.activity.minutes).toBe(150);
    expect(s.activity.sessions).toBe(5);
    expect(s.activity.weeklyMinutes).toBe(75);
    expect(s.sleep!.avgHours).toBe(7);
    expect(s.sleep!.nights).toBe(14);
    expect(s.weight!.changeKg).toBeLessThan(0);
    expect(s.weight!.weighIns).toBe(14);
    expect(s.weight!.weeklyRateKg).not.toBeNull();
  });

  it('does not extrapolate a short history to a full week of activity', () => {
    const days = run(30, (d, i) => (i >= 27 ? day(d, { minutes: 60 }) : day(d, { logged: false, water: [] })));
    const s = summarizePeriod({ days, trend: [], sleep: [], today: TODAY });
    expect(s.effectiveDays).toBe(3);
    expect(s.activity.weeklyMinutes).toBe(180); // 180 min over a 7-day floor
  });
});

describe('generateInsights thresholds', () => {
  it('asks for more days instead of guessing', () => {
    const days = run(3, (d) => day(d));
    const out = generateInsights(ctx(days));
    expect(ids(out)).toEqual(['log-more']);
    expect(out[0].body).toContain('2 so far');
  });

  it('returns at most five, ranked, with a positive one included', () => {
    const days = run(14, (d) => day(d, { kcal: 2500, protein: 90, fiber: 10, water: [{ ml: 1000, hour: 9 }], minutes: 0 }));
    const out = generateInsights(ctx(days, { sleep: days.map((d) => ({ date: d.date, hours: 6, quality: 3 })) }));
    expect(out.length).toBeLessThanOrEqual(5);
    for (let i = 1; i < out.length; i++) {
      if (out[i].tone !== 'positive') expect(out[i - 1].score).toBeGreaterThanOrEqual(out[i].score);
    }
    expect(new Set(ids(out)).size).toBe(out.length);
  });
});

describe('insight content cites the numbers', () => {
  const base = (o: DayOpts) => run(8, (d, i) => (i === 7 ? day(d, { kcal: 300 }) : day(d, o)));

  it('protein gap with a concrete food', () => {
    const out = generateInsights(ctx(base({ protein: 96, proteinTarget: 134 })));
    const p = find(out, 'protein-low')!;
    expect(p.tone).toBe('attention');
    expect(p.body).toContain('Protein averaged 96 g, 38 g under your 134 g goal.');
    expect(p.body).toMatch(/Greek yogurt/);
  });

  it('protein on target is positive', () => {
    const out = generateInsights(ctx(base({ protein: 150, proteinTarget: 140 })));
    expect(find(out, 'protein-on-target')?.tone).toBe('positive');
  });

  it('calories above budget quote the difference and the effect on pace', () => {
    const out = generateInsights(ctx(base({ kcal: 2400, budget: 2000 })));
    const c = find(out, 'calories-above')!;
    expect(c.body).toContain('You averaged 2,400 kcal on 7 fully logged days against a 2,000 kcal budget: 400 kcal a day above.');
    expect(c.body).toContain('0.4 kg a week');
    expect(c.body).not.toMatch(/fail|cheat|bad/i);
  });

  it('the calories step promises only what one snack or portion can keep', () => {
    const step = (kcal: number) => find(generateInsights(ctx(base({ kcal, budget: 2000 }))), 'calories-above')!.step;
    expect(step(2200)).toBe('Leaving out one snack of about 200 kcal a day would close it.');
    expect(step(2400)).toBe('A portion about 400 kcal smaller each day would close it.');
    expect(step(2995)).toBe('The diary shows which meals carry most of it.');
  });

  it('calories on budget are positive, counted by the one rule', () => {
    const on = find(generateInsights(ctx(base({ kcal: 1950, budget: 2000 }))), 'calories-on-budget');
    expect(on).toMatchObject({ tone: 'positive', title: 'Calories on budget' });
    expect(on?.body).toContain('and 7 of 7 days were on budget, at 90 to 100% of it.');
    // A little above on average is said as above, never "on budget".
    const above = find(generateInsights(ctx(base({ kcal: 2050, budget: 2000 }))), 'calories-on-budget');
    expect(above).toMatchObject({ tone: 'neutral', title: 'Calories just above budget' });
    expect(above?.body).toContain('50 kcal a day above. 0 of 7 days were on budget, at 90 to 100% of it, and 7 above it.');
    expect(above?.body).not.toMatch(/within 10%|near budget/);
  });

  it('activity measured against 150 weekly minutes', () => {
    const days = run(14, (d, i) => day(d, { minutes: i % 7 === 0 ? 40 : 0 }));
    const out = generateInsights(ctx(days));
    const a = find(out, 'activity-low');
    expect(a).toBeDefined();
    expect(a!.title).toBe('Under 150 active minutes a week');
    expect(a!.body).toContain('You averaged 40 active minutes a week');
    expect(a!.body).toContain('110 short of the 150 minutes a week guideline');
    expect(a!.step).toBe('4 brisk 30-minute walks a week would cover it.');
  });

  it('sleep under 7 h suggests a specific bedtime shift', () => {
    const days = base({});
    const sleep = days.map((d) => ({ date: d.date, hours: 6.5, quality: 3 }));
    const out = generateInsights(ctx(days, { sleep }));
    expect(find(out, 'sleep-short')?.body).toContain('Sleep averaged 6 h 30 min over 8 nights');
    expect(find(out, 'sleep-short')?.step).toContain('30 minutes earlier');
  });
});

describe('weight pace', () => {
  const days = run(10, (d) => day(d));
  it('on pace', () => {
    const out = generateInsights(ctx(days, { currentWeeklyRateKg: -0.4, weighInsTotal: 12 }));
    expect(find(out, 'pace-on-track')?.body).toBe('Your trend weight fell 0.4 kg a week, right at the 0.4 kg pace you chose.');
  });
  it('flags losing faster than 1% of body weight calmly', () => {
    const out = generateInsights(ctx(days, { currentWeeklyRateKg: -1.1, weighInsTotal: 12 }));
    const p = find(out, 'pace-too-fast')!;
    expect(p.tone).toBe('attention');
    expect(p.body).toContain('falling 1.1 kg a week');
    expect(p.body).toContain('0.8 kg a week upper limit');
    expect(p.step).toContain('770 kcal more a day'); // (1.1 - 0.4) * 7700 / 7 = 770
    expect(out[0].id).toBe('pace-too-fast');
  });
  it('slower than chosen', () => {
    const out = generateInsights(ctx(days, { currentWeeklyRateKg: -0.05, weighInsTotal: 12 }));
    expect(find(out, 'pace-slower')?.body).toContain('falling 0.05 kg a week against the 0.4 kg a week you chose');
  });
  it('needs enough weigh-ins', () => {
    const out = generateInsights(ctx(days, { currentWeeklyRateKg: -1.5, weighInsTotal: 3 }));
    expect(ids(out).some((i) => i.startsWith('pace'))).toBe(false);
  });
  it('maintenance drift', () => {
    const out = generateInsights(ctx(days, { goal: 'maintain', currentWeeklyRateKg: 0.3, weighInsTotal: 12 }));
    expect(find(out, 'pace-drift')?.body).toContain('rising 0.3 kg a week');
  });
});

describe('patterns are computed, not asserted', () => {
  it('weekend vs weekday difference', () => {
    // Nov 1 (Sun) .. Nov 12 (Thu): weekends at 2420, weekdays at 2000.
    const days = run(13, (d) => {
      const wd = new Date(`${d}T12:00:00`).getDay();
      return day(d, { kcal: wd === 0 || wd === 6 ? 2420 : 2000 });
    });
    const p = weekendPattern(days, TODAY)!;
    expect(p.diff).toBe(420);
    const out = generateInsights(ctx(days));
    expect(find(out, 'weekend-higher')?.body).toContain('Weekends average 420 kcal more than weekdays');
  });

  it('no weekend claim without enough weekend days', () => {
    // Mon Nov 9 .. Fri Nov 13: no weekend days at all.
    const days = run(5, (d) => day(d, { kcal: 2000 }));
    expect(weekendPattern(days, TODAY)).toBeNull();
  });

  it('afternoon hydration drop only when the logs show it', () => {
    const dropping = run(7, (d) => day(d, { water: [{ ml: 1000, hour: 9 }, { ml: 150, hour: 14 }, { ml: 800, hour: 19 }] }));
    expect(hydrationPattern(dropping, TODAY)?.low).toBe('afternoon');
    const even = run(7, (d) => day(d, { water: [{ ml: 700, hour: 9 }, { ml: 650, hour: 14 }, { ml: 800, hour: 19 }] }));
    expect(hydrationPattern(even, TODAY)).toBeNull();
    const out = generateInsights(ctx(dropping));
    const w = find(out, 'water-low')!;
    // The finding is the pattern, never the count Progress's Water tile already shows.
    expect(w.title).toBe('Less water in the afternoon');
    expect(w.title).not.toMatch(/\d+ of \d+ days/);
    expect(w.body).toContain('You averaged');
    expect(w.body).toContain('from noon to 5 pm against');
    // Said once, in the finding.
    expect(w.step).not.toContain('afternoon');
  });

  it('sleep and appetite need 3+ days on each side', () => {
    const days = run(9, (d) => day(d));
    const sleep = days.map((d, i) => ({ date: d.date, hours: i % 2 ? 6 : 8, quality: 3 }));
    const withKcal = days.map((d, i) => ({ ...d, eaten: { ...d.eaten, kcal: i % 2 ? 2300 : 2000 } }));
    expect(sleepAppetite(withKcal, sleep, TODAY)?.diff).toBe(300);
    expect(sleepAppetite(withKcal.slice(-4), sleep, TODAY)).toBeNull();
  });
});

describe('adaptive estimate insight', () => {
  const days = run(6, (d) => day(d));
  it('says exactly what is still needed', () => {
    const out = generateInsights(ctx(days));
    const a = find(out, 'adaptive-pending')!;
    expect(a.body).toContain('needs 6 more fully logged days and 3 more weigh-ins');
    expect(a.action?.route).toBe('/weight');
  });
  it('describes an active estimate with its confidence', () => {
    const adaptive: AdaptiveTdee = { tdee: 2480, observed: 2600, confidence: 0.62, loggedDays: 24, weighIns: 18, windowDays: 28, needs: null };
    const out = generateInsights(ctx(days, { energy: { formulaTdee: 2300, adaptive, usingAdaptive: true, useAdaptiveSetting: true, tdee: 2480 } }));
    const a = find(out, 'adaptive-active')!;
    expect(a.body).toContain('about 2,600 kcal a day before logged workouts, 300 kcal above the body\'s estimate of about 2,300 kcal');
    expect(a.body).toContain('a blend of the two, about 2,480 kcal a day');
    expect(a.body).toContain('good confidence (62%)');
  });
});

describe('weeklyRecap', () => {
  it('always reports the last closed week, so its numbers stop moving', () => {
    const days = run(21, (d) => day(d, { kcal: 2000, minutes: 40 }));
    const r = weeklyRecap({ days, trend: [], sleep: [], today: TODAY, units: 'metric', goal: 'lose' })!;
    expect(r.label).toBe('Last week');
    expect(r.weekStart).toBe('2026-11-02');
    expect(r.weekEnd).toBe('2026-11-08');
    expect(r.summary.completeDays).toBe(7);
    expect(r.days).toHaveLength(7);
    expect(r.previous?.completeDays).toBe(7);
    expect(r.budgetBalance).toBe(0);
    expect(r.bestDay).not.toBeNull();
    expect(r.win.length).toBeGreaterThan(0);
  });

  it('reports a chosen week, including the one in progress', () => {
    const days = run(21, (d) => day(d, { kcal: 2100 }));
    const r = weeklyRecap({ days, trend: [], sleep: [], today: TODAY, units: 'metric', goal: 'lose', week: '2026-11-09' })!;
    expect(r.label).toBe('This week');
    expect(r.days.map((d) => d.date)).toEqual(['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13']);
    expect(r.budgetBalance).toBe(400); // 4 closed days at +100
    const old = weeklyRecap({ days, trend: [], sleep: [], today: TODAY, units: 'metric', goal: 'lose', week: '2026-10-26' })!;
    expect(old.label).toBe('Week');
    expect(old.previous?.completeDays).toBe(2); // Oct 24 and 25 only
  });

  it('says "last week" in the win when it shows last week (insights-9)', () => {
    const tue = '2026-11-10';
    const days = Array.from({ length: 14 }, (_, i) => day(addDays(tue, i - 13), { kcal: 1200, budget: 2000, protein: 50, water: [{ ml: 500, hour: 9 }] }));
    const r = weeklyRecap({ days, trend: [], sleep: [], today: tue, units: 'metric', goal: 'lose' })!;
    expect(r.label).toBe('Last week');
    expect(r.win).toBe('You logged food on 7 days last week.');
    expect(r.win).not.toContain('this week');
  });

  it('falls back to last week early in the week', () => {
    const tue = '2026-11-10';
    const days = Array.from({ length: 14 }, (_, i) => day(addDays(tue, i - 13), { kcal: 2400, budget: 2000 }));
    const r = weeklyRecap({ days, trend: [], sleep: [], today: tue, units: 'metric', goal: 'lose' })!;
    expect(r.label).toBe('Last week');
    expect(r.weekStart).toBe('2026-11-02');
    expect(r.focus).toContain('400 kcal above budget');
  });

  it('promises only what one snack or portion can keep (D9-F3)', () => {
    const tue = '2026-11-10';
    const focus = (kcal: number) =>
      weeklyRecap({ days: Array.from({ length: 14 }, (_, i) => day(addDays(tue, i - 13), { kcal, budget: 2000 })), trend: [], sleep: [], today: tue, units: 'metric', goal: 'lose' })!.focus;
    expect(focus(2400)).toBe('Calories averaged 400 kcal above budget; a portion about 400 kcal smaller each day would close it.');
    // 995 kcal a day: no single portion closes it, so no such promise.
    const big = focus(2995);
    expect(big).toBe('Calories averaged 995 kcal above budget; the diary shows which meals carry most of it.');
    expect(big).not.toMatch(/close|portion|snack/);
  });

  it('leaves the days on budget to the Day by day headline, never the win', () => {
    const tue = '2026-11-10';
    const days = Array.from({ length: 14 }, (_, i) => day(addDays(tue, i - 13), { kcal: 1950, budget: 2000 }));
    const r = weeklyRecap({ days, trend: [], sleep: [], today: tue, units: 'metric', goal: 'lose' })!;
    expect(r.win).not.toMatch(/on budget/);
  });

  it('lists earlier weeks with a recap', () => {
    const days = run(35, (d, i) => (i < 7 ? day(d, { logged: false, water: [] }) : day(d)));
    // Last closed week is Nov 2; earlier: Oct 26, Oct 19, Oct 12 (Oct 13+ logged).
    expect(recapWeeks(days, TODAY)).toEqual(['2026-10-26', '2026-10-19', '2026-10-12']);
  });

  it('returns null with nothing to recap', () => {
    const days = run(10, (d) => day(d, { logged: false }));
    expect(weeklyRecap({ days, trend: [], sleep: [], today: TODAY, units: 'metric', goal: 'lose' })).toBeNull();
  });

  it('picks the day closest to plan as best day', () => {
    const days = run(5, (d, i) => day(d, { kcal: i === 2 ? 2000 : 2300, budget: 2000 }));
    const r = weeklyRecap({ days, trend: [], sleep: [], today: TODAY, units: 'metric', goal: 'lose', week: '2026-11-09' })!;
    expect(r.bestDay?.date).toBe('2026-11-11');
    expect(r.bestDay?.detail).toContain('2,000 of 2,000 kcal');
  });
});

describe('computeMilestones', () => {
  it('counts cumulative totals so breaks never take anything away', () => {
    const days = run(20, (d, i) => (i % 3 === 0 ? day(d, { logged: false, water: [] }) : day(d, { minutes: 30 })));
    const weighIns = days.slice(0, 11).map((d) => d.date);
    const trend: TrendPoint[] = weightTrend(days.map((d, i) => ({ date: d.date, kg: 80 - i * 0.2 })));
    const m = computeMilestones({ days, weighInDates: weighIns, trend, goal: 'lose', units: 'metric' });
    const get = (id: string) => m.find((x) => x.id === id)!;
    expect(get('first-day').achieved).toBe(true);
    expect(get('first-week').achieved).toBe(true);
    expect(get('first-week').date).toBe(days.filter((d) => d.entries.length)[6].date);
    expect(get('month-logged').achieved).toBe(false);
    expect(get('month-logged').current).toBe(13);
    expect(get('weigh-ins-10').date).toBe(weighIns[9]);
    expect(get('water-7').achieved).toBe(true);
    expect(get('sessions-10').achieved).toBe(true);
    expect(get('active-week').achieved).toBe(true);
    expect(get('trend-first-unit').title).toBe('First 1 kg of trend change');
    expect(get('trend-first-unit').achieved).toBe(true);
  });

  it('has nothing achieved for a new user', () => {
    const m = computeMilestones({ days: run(3, (d) => day(d, { logged: false, water: [] })), weighInDates: [], trend: [], goal: 'lose', units: 'metric' });
    expect(m.every((x) => !x.achieved)).toBe(true);
  });
});

describe('rankInsights', () => {
  it('keeps a positive insight in the top five', () => {
    const mk = (id: string, tone: Insight['tone'], score: number): Insight => ({ id, tone, title: id, step: id, body: id, score });
    const list = [mk('a', 'attention', 90), mk('b', 'attention', 80), mk('c', 'neutral', 70), mk('d', 'neutral', 60), mk('e', 'attention', 50), mk('f', 'neutral', 45), mk('g', 'positive', 10)];
    expect(ids(rankInsights(list))).toEqual(['a', 'b', 'c', 'd', 'g']);
  });
});

describe('review findings', () => {
  const base = (o: DayOpts) => run(8, (d, i) => (i === 7 ? day(d, { kcal: 300 }) : day(d, o)));

  it('insights-5: no current pace from weigh-ins that stopped weeks ago', () => {
    const days = run(10, (d) => day(d));
    const out = generateInsights(ctx(days, { currentWeeklyRateKg: -0.6, weighInsTotal: 40, lastWeighIn: '2026-08-30' }));
    expect(ids(out).filter((i) => i.startsWith('pace'))).toEqual(['pace-stale']);
    expect(find(out, 'pace-stale')!.body).toContain('75 days ago');
    expect(find(out, 'pace-stale')!.body).not.toContain('0.6');
    const fresh = generateInsights(ctx(days, { currentWeeklyRateKg: -0.4, weighInsTotal: 40, lastWeighIn: '2026-11-11' }));
    expect(find(fresh, 'pace-on-track')).toBeDefined();
  });

  it('insights-6: weekend insight does not call an under-budget average "on budget"', () => {
    const days = run(13, (d) => {
      const wd = new Date(`${d}T12:00:00`).getDay();
      return day(d, { kcal: wd === 0 || wd === 6 ? 1750 : 1450, budget: 2000 });
    });
    const out = generateInsights(ctx(days));
    expect(find(out, 'calories-well-under')).toBeDefined();
    const w = find(out, 'weekend-higher')!;
    expect(w.body).not.toContain('on budget');
    expect(w.body).toContain('under budget');
  });

  it('insights-8: 10 h of sleep is not called healthy', () => {
    const days = base({});
    const sleep = days.map((d) => ({ date: d.date, hours: 10, quality: 3 }));
    const out = generateInsights(ctx(days, { sleep, energy: { formulaTdee: 2000, adaptive: { ...adaptivePending, observed: 2000, needs: null }, usingAdaptive: true, useAdaptiveSetting: true, tdee: 2000 } }));
    expect(find(out, 'sleep-on-track')).toBeUndefined();
    expect(find(out, 'sleep-long')?.tone).toBe('neutral');
    expect(find(out, 'sleep-long')?.body).toContain('above the 7 to 9 h');
    const ok = generateInsights(ctx(days, { sleep: days.map((d) => ({ date: d.date, hours: 8, quality: 3 })) }));
    expect(find(ok, 'sleep-long')).toBeUndefined();
  });

  it('imperial-6: water suggestions use 8 fl oz glasses in imperial', () => {
    const dropping = run(7, (d) => day(d, { water: [{ ml: 1000, hour: 9 }, { ml: 150, hour: 14 }, { ml: 800, hour: 19 }] }));
    const w = find(generateInsights(ctx(dropping, { units: 'imperial' })), 'water-low')!;
    expect(w.body).not.toContain('ml');
    expect(w.step).not.toContain('ml');
    expect(w.step).toContain('more 8 fl oz glasses');
  });

  it('consistency-3: guideline minutes count vigorous double and light not at all, as Train does', () => {
    expect(guidelineMinutes([{ met: 2.8, durationMin: 30 }, { met: 4, durationMin: 20 }, { met: 8, durationMin: 30 }])).toBe(80);
    // Five easy 30-minute walks: 150 logged minutes, 0 guideline minutes.
    const walks = run(7, (d, i) => day(d, { minutes: i < 5 ? 30 : 0, met: 2.8 }));
    const s = summarizePeriod({ days: walks, trend: [], sleep: [], today: TODAY });
    expect(s.activity.minutes).toBe(150);
    expect(s.activity.guidelineMinutes).toBe(0);
    // 75 minutes of hard running meets the guideline.
    const runs = run(14, (d, i) => day(d, { minutes: i % 7 === 0 ? 75 : 0, met: 9.8 }));
    const out = generateInsights(ctx(runs));
    expect(find(out, 'activity-on-track')).toBeDefined();
    const m = computeMilestones({ days: walks, weighInDates: [], trend: [], goal: 'lose', units: 'metric' });
    expect(m.find((x) => x.id === 'active-week')!.achieved).toBe(false);
  });
});

describe('weekly check-in tiles', () => {
  it('compares each tile with the week before', () => {
    const days = run(21, (d) => (d >= '2026-11-02' ? day(d, { kcal: 2100, protein: 130, minutes: 30, met: 7 }) : day(d, { kcal: 1900, protein: 120 })));
    const r = weeklyRecap({ days, trend: [], sleep: [], today: TODAY, units: 'metric', goal: 'lose' })!;
    const t = Object.fromEntries(recapTiles(r).map((x) => [x.id, x]));
    expect(t.calories.value).toBe(2100);
    expect(t.calories.delta).toBe(200);
    expect(t.calories.upIsGood).toBe(false);
    expect(t.protein.delta).toBe(10);
    expect(t.activity.value).toBe(420); // 7 × 30 min at 7 MET, counted double
    expect(t.activity.delta).toBe(420);
    expect(t.water.unit).toBe('of 7 days');
    const now = weeklyRecap({ days, trend: [], sleep: [], today: TODAY, units: 'metric', goal: 'lose', week: '2026-11-09' })!;
    const n = Object.fromEntries(recapTiles(now).map((x) => [x.id, x]));
    expect(n.activity.delta).toBeNull();
    expect(n.activity.soFar).toBe(true);
    expect(n.protein.delta).toBe(0);
  });

  it('describes the week against budget', () => {
    expect(budgetBalanceText(-310)).toBe('310 kcal under budget for the week');
    expect(budgetBalanceText(420)).toBe('420 kcal above budget for the week');
    expect(budgetBalanceText(20)).toBe('At budget for the week');
    expect(budgetBalanceText(null)).toContain('No fully logged days');
  });
});

describe('planChangeText', () => {
  it('explains a target that follows what the logs show you burn', () => {
    expect(planChangeText({ target: 2000, tdee: 2500, usingAdaptive: true }, { target: 2010, tdee: 2510, usingAdaptive: true })).toBe('Same target as last week.');
    expect(planChangeText({ target: 2000, tdee: 2500, usingAdaptive: true }, { target: 1940, tdee: 2440, usingAdaptive: true })).toBe(
      'Your logs now show you burn about 2,440 kcal a day outside logged workouts, down from about 2,500 kcal, so the target moved down 60 kcal.',
    );
    expect(planChangeText({ target: 2000, tdee: 2500, usingAdaptive: false }, { target: 1800, tdee: 2500, usingAdaptive: false })).toContain('change to your goal');
  });
});

describe('isCompleteDay (shared rule with the Energy card)', () => {
  it('uses the app-wide rule: at least 800 kcal and half the budget', () => {
    // A small budget: 700 kcal is more than half of 1,200 but under 800, so the Energy card does not count it.
    expect(isCompleteDay(day('2026-11-10', { kcal: 700, budget: 1200 }), TODAY)).toBe(false);
    expect(isCompleteDay(day('2026-11-10', { kcal: 820, budget: 1200 }), TODAY)).toBe(true);
    expect(isCompleteDay(day('2026-11-10', { kcal: 999, budget: 2000 }), TODAY)).toBe(false);
    expect(isCompleteDay(day('2026-11-10', { kcal: 1000, budget: 2000 }), TODAY)).toBe(true);
    // Today never counts.
    expect(isCompleteDay(day(TODAY, { kcal: 2000 }), TODAY)).toBe(false);
  });

  it('agrees with trend.isCompleteDay for every logged closed day', () => {
    for (const [kcal, budget] of [[700, 1200], [900, 2400], [1300, 2400], [1200, 2400], [790, 1000]]) {
      expect(isCompleteDay(day('2026-11-10', { kcal, budget }), TODAY)).toBe(sharedComplete(kcal, budget));
    }
  });
});

describe('compareText', () => {
  const g = { period: '30 days', format: (n: number) => `${Math.round(n)} g`, same: 2 };
  it('compares with the previous period in neutral words', () => {
    expect(compareText(130, 118, g)).toBe('12 g more than the previous 30 days');
    expect(compareText(110, 118, g)).toBe('8 g less than the previous 30 days');
    expect(compareText(119, 118, g)).toBe('About the same as the previous 30 days');
    expect(compareText(7.5, 6.9, { period: '7 days', format: (n) => `${n.toFixed(1)} h`, same: 0.1, more: 'longer', less: 'shorter' })).toBe(
      '0.6 h longer than the previous 7 days',
    );
  });
  it('says nothing without both sides', () => {
    expect(compareText(130, null, g)).toBeNull();
    expect(compareText(undefined, 118, g)).toBeNull();
    expect(compareText(NaN, 118, g)).toBeNull();
  });
});

describe('baselines', () => {
  it('takes percentiles by interpolation', () => {
    expect(percentile([1, 2, 3, 4, 5], 0.5)).toBe(3);
    expect(percentile([1, 2, 3, 4], 0.25)).toBeCloseTo(1.75);
  });

  it('needs at least 7 samples for a usual range', () => {
    expect(usualRange([1, 2, 3, 4, 5, 6])).toBeNull();
    expect(usualRange([1, 2, 3, 4, 5, 6, 7])).toEqual({ low: 2.5, median: 4, high: 5.5, samples: 7 });
  });

  it('builds the usual intake from complete days in the last 28 only', () => {
    const days = run(40, (d, i) => (i === 39 ? day(d, { kcal: 9000 }) : i < 12 ? day(d, { kcal: 5000 }) : i % 5 === 0 ? day(d, { kcal: 300 }) : day(d, { kcal: 1800 + (i % 3) * 100 })));
    const r = usualKcalRange(days, TODAY)!;
    // Today (9,000), days older than 28 (5,000) and partial days (300) are all left out.
    expect(r.low).toBeGreaterThanOrEqual(1800);
    expect(r.high).toBeLessThanOrEqual(2000);
    expect(usualKcalRange(days.slice(-8), TODAY)).toBeNull();
  });

  it('takes the usual weight from weigh-ins in the last 28 days', () => {
    const w = Array.from({ length: 10 }, (_, i) => ({ date: addDays(TODAY, -i * 3), kg: 80 + i * 0.1 }));
    const r = usualWeightRange(w, TODAY)!;
    expect(r.samples).toBe(10);
    expect(r.median).toBeCloseTo(80.45);
    expect(usualWeightRange(w.slice(0, 3), TODAY)).toBeNull();
  });

  it('uses the same weekday over the previous six weeks, with at least three samples', () => {
    const days = run(50, (d, i) => day(d, { kcal: 1500 + i }));
    const pick = (d: InsightDay) => (d.entries.length ? d.eaten.kcal : null);
    // Fridays before Nov 13: i = 42, 35, 28, 21, 14, 7 → 1,542 .. 1,507, median 1,524.5.
    expect(weekdayUsual(days, TODAY, pick)).toBeCloseTo(1524.5);
    const sparse = days.map((d, i) => (i === 42 || i === 35 || i === 28 ? d : { ...d, entries: [] }));
    expect(weekdayUsual(sparse, TODAY, pick)).toBe(1535);
    const tooFew = days.map((d, i) => (i === 42 || i === 35 ? d : { ...d, entries: [] }));
    expect(weekdayUsual(tooFew, TODAY, pick)).toBeNull();
  });

  it('gives a direction against the previous period', () => {
    expect(direction(10, 5, 1)).toBe('up');
    expect(direction(5, 10, 1)).toBe('down');
    expect(direction(5.5, 5, 1)).toBe('same');
    expect(direction(5, null, 1)).toBeNull();
  });
});

describe('insight titles are neutral (principle 4)', () => {
  // The morning page's banned list (src/features/morning/words.test.ts), plus "missed": a title says what was
  // reached or what the numbers are, never what was missed.
  const BANNED =
    /\b(bad|fail|failed|failure|cheat|cheated|should|guilty|lazy|great|amazing|well done|keep it up|too much|missed your|goal missed|over budget|make up|only|unfortunately|oops|sorry|missed)\b/i;

  it('no title or step from a grid of periods holds a banned word or an exclamation mark; a step is one short sentence', () => {
    const titles = new Set<string>();
    const steps = new Set<string>();
    const bodies: { step: string; body: string }[] = [];
    const kcals = [0, 900, 1500, 1900, 2000, 2150, 2400, 3000];
    const waters = [0, 800, 1600, 2500, 3200];
    const minutes = [0, 20, 60];
    const goals = ['lose', 'maintain', 'gain'] as const;
    const rates = [null, -1.2, -0.4, -0.1, 0, 0.1, 0.4, 1.2];
    for (const kcal of kcals)
      for (const ml of waters)
        for (const min of minutes) {
          const days = run(14, (d, i) => day(d, { kcal: i % 7 >= 5 ? kcal + 300 : kcal, protein: kcal / 20, fiber: kcal / 100, water: [{ ml: ml * (i % 3 ? 1 : 0.4), hour: i % 2 ? 9 : 19 }], minutes: min }));
          const sleep = days.map((d, i) => ({ date: d.date, hours: [5, 6.5, 8, 10][i % 4], quality: 3 }));
          for (const goal of goals)
            for (const rate of rates)
              for (const out of [
                generateInsights(ctx(days, { goal, currentWeeklyRateKg: rate, weighInsTotal: 20, lastWeighIn: TODAY, sleep, streak: 12 })),
                generateInsights(ctx(days.slice(-4), { goal, currentWeeklyRateKg: rate, weighInsTotal: 2 })),
              ])
                for (const i of out) {
                  titles.add(i.title);
                  steps.add(i.step);
                  bodies.push(i);
                }
        }
    expect(titles.size).toBeGreaterThan(15);
    expect(steps.size).toBeGreaterThan(15);
    expect([...titles].filter((t) => BANNED.test(t) || t.includes('!'))).toEqual([]);
    expect([...steps].filter((t) => BANNED.test(t) || t.includes('!'))).toEqual([]);
    // Two short lines on Progress: the step is one sentence of at most 85 characters, and the numbers on tap never repeat it.
    expect([...steps].filter((t) => t.length > 85 || /\. \S/.test(t))).toEqual([]);
    expect(bodies.filter((i) => i.body.includes(i.step))).toEqual([]);
  });
});
