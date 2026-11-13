import { describe, expect, it } from 'vitest';

import { addDays } from './dates';
import { adaptiveTdee, isCompleteDay, linearSlope, TREND_ALPHA, weeklyRate, weightTrend, type TrendPoint, type WeightPoint } from './trend';

const D0 = '2026-01-01';
const series = (n: number, f: (i: number) => number, start = D0): WeightPoint[] =>
  Array.from({ length: n }, (_, i) => ({ date: addDays(start, i), kg: f(i) }));

describe('weightTrend', () => {
  it('empty input -> empty output; single point -> trend equals the weight', () => {
    expect(weightTrend([])).toEqual([]);
    expect(weightTrend([{ date: D0, kg: 80 }])).toEqual([{ date: D0, kg: 80, trend: 80, interpolated: false }]);
  });
  it('constant input gives a constant trend', () => {
    for (const t of weightTrend(series(30, () => 80))) expect(t.trend).toBeCloseTo(80, 12);
  });
  it('linear input: trend lags the data by (1-a)/a * slope = 9 * 0.1 = 0.9 kg at steady state', () => {
    // d_i = 0.9 (d_{i-1} + s)  => steady d = 9 s
    const out = weightTrend(series(120, (i) => 80 - 0.1 * i));
    const last = out[out.length - 1];
    expect(last.trend - last.kg).toBeCloseTo(0.9, 3);
    // and the trend slope equals the data slope at steady state
    const prev = out[out.length - 2];
    expect(last.trend - prev.trend).toBeCloseTo(-0.1, 3);
  });
  it('first trend equals first weight, then one step: 80, 82 -> 80 + 0.1*2 = 80.2', () => {
    const out = weightTrend([{ date: D0, kg: 80 }, { date: addDays(D0, 1), kg: 82 }]);
    expect(out[0].trend).toBe(80);
    expect(out[1].trend).toBeCloseTo(80.2, 12);
    expect(TREND_ALPHA).toBe(0.1);
  });
  it('noisy input (alternating +-1 kg) stays within +-0.0527 kg of the mean', () => {
    // steady-state amplitude: a = 0.9*b + 0.1, b = 0.9*a - 0.1  =>  a = 0.01/0.19 = 0.0526.
    // The start-up transient (0.9^60 of 1 kg) adds under 0.002 after 60 days.
    const out = weightTrend(series(80, (i) => 80 + (i % 2 ? 1 : -1)));
    for (const t of out.slice(60)) expect(Math.abs(t.trend - 80)).toBeLessThan(0.0545);
    // while the raw data swings the full 2 kg
    expect(Math.max(...out.map((t) => t.kg)) - Math.min(...out.map((t) => t.kg))).toBe(2);
  });
  it('interpolates gaps linearly before smoothing', () => {
    const out = weightTrend([{ date: D0, kg: 80 }, { date: addDays(D0, 4), kg: 84 }]);
    expect(out.map((t) => t.date)).toEqual([0, 1, 2, 3, 4].map((n) => addDays(D0, n)));
    expect(out.map((t) => t.kg)).toEqual([80, 81, 82, 83, 84]);
    expect(out.map((t) => t.interpolated)).toEqual([false, true, true, true, false]);
    // trend: 80 -> 80.1 -> 80.29 -> 80.561 -> 80.9049
    expect(out.map((t) => t.trend)).toEqual([80, 80.1, 80.29, 80.561, 80.9049].map((v) => expect.closeTo(v, 9)));
  });
  it('interpolation crosses month and year boundaries on the right dates', () => {
    const out = weightTrend([{ date: '2025-12-30', kg: 80 }, { date: '2026-01-02', kg: 80 }]);
    expect(out.map((t) => t.date)).toEqual(['2025-12-30', '2025-12-31', '2026-01-01', '2026-01-02']);
  });
  it('duplicate dates: one point per date, the later entry in the input wins', () => {
    const out = weightTrend([
      { date: D0, kg: 80 },
      { date: D0, kg: 82 },
      { date: addDays(D0, 1), kg: 82 },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0].kg).toBe(82);
    expect(out[1].trend).toBeCloseTo(82, 12);
  });
  it('unsorted input is sorted; non-positive weights are dropped', () => {
    const out = weightTrend([
      { date: '2026-01-03', kg: 79 },
      { date: '2026-01-01', kg: 80 },
      { date: '2026-01-02', kg: 0 },
      { date: '2026-01-04', kg: -3 },
    ]);
    expect(out.map((t) => [t.date, t.interpolated])).toEqual([
      ['2026-01-01', false],
      ['2026-01-02', true],
      ['2026-01-03', false],
    ]);
    expect(out[1].kg).toBeCloseTo(79.5, 12);
  });
});

describe('weeklyRate', () => {
  const tp = (n: number, f: (i: number) => number): TrendPoint[] =>
    series(n, f).map((p) => ({ ...p, trend: p.kg, interpolated: false }));
  it('-0.1 kg/day trend -> -0.7 kg/week over the default 14 days', () => {
    expect(weeklyRate(tp(29, (i) => 80 - 0.1 * i))).toBeCloseTo(-0.7, 9);
  });
  it('honours a custom window: last 7 days of a +0.05/day trend = +0.35', () => {
    expect(weeklyRate(tp(40, (i) => 70 + 0.05 * i), 7)).toBeCloseTo(0.35, 9);
  });
  it('uses all data when it is shorter than the window', () => {
    expect(weeklyRate(tp(10, (i) => 80 - 0.1 * i))).toBeCloseTo(-0.7, 9);
  });
  it('null with fewer than 2 points or a span under 7 days', () => {
    expect(weeklyRate([])).toBeNull();
    expect(weeklyRate(tp(1, () => 80))).toBeNull();
    expect(weeklyRate(tp(7, () => 80))).toBeNull(); // span 6
    expect(weeklyRate(tp(8, () => 80))).toBe(0); // span 7
  });
});

describe('adaptiveTdee', () => {
  const END = '2026-04-30';
  const WINDOW_START = addDays(END, -27);
  /** 120 days of weigh-ins ending at END, falling exactly 0.5 kg/week (steady state by day 92). */
  const falling = (): WeightPoint[] => series(120, (i) => 90 - (0.5 / 7) * i, addDays(END, -119));
  const intake = (kcal: number, days = 28, endDate = END): Record<string, number> => {
    const m: Record<string, number> = {};
    for (let i = 0; i < days; i++) m[addDays(endDate, -i)] = kcal;
    return m;
  };

  it('28 days at 2000 kcal while trend falls 0.5 kg/week -> TDEE = 2000 + 0.5*7700/7 = 2550', () => {
    const r = adaptiveTdee({ formulaTdee: 2500, weights: falling(), intakeByDate: intake(2000), end: END });
    expect(r.observed).toBe(2550);
    expect(r.loggedDays).toBe(28);
    expect(r.weighIns).toBe(28);
    expect(r.windowDays).toBe(28);
    expect(r.needs).toBeNull();
    // full data: coverage 1, weigh coverage 1 -> confidence 0.25 + 0.6 = 0.85
    expect(r.confidence).toBeCloseTo(0.85, 9);
    // blend: 2500*0.15 + 2550*0.85 = 375 + 2167.5 = 2542.5
    expect(r.tdee).toBeGreaterThanOrEqual(2542);
    expect(r.tdee).toBeLessThanOrEqual(2543);
  });
  it('gaining 0.25 kg/week on 3000 kcal -> 3000 - 275 = 2725', () => {
    const w = series(120, (i) => 70 + (0.25 / 7) * i, addDays(END, -119));
    const r = adaptiveTdee({ formulaTdee: 2700, weights: w, intakeByDate: intake(3000), end: END });
    expect(r.observed).toBe(2725);
  });
  it('stable weight: observed equals average intake', () => {
    const w = series(60, () => 75, addDays(END, -59));
    const r = adaptiveTdee({ formulaTdee: 2300, weights: w, intakeByDate: intake(2200), end: END });
    expect(r.observed).toBe(2200);
  });
  it('confidence blend with partial logging: 14 logged days, 28 weigh-ins', () => {
    // coverage = 14 / (28*0.85) = 0.588235; weigh coverage 1 -> 0.25 + 0.6*0.588235 = 0.602941
    const r = adaptiveTdee({ formulaTdee: 2500, weights: falling(), intakeByDate: intake(2000, 14), end: END });
    expect(r.loggedDays).toBe(14);
    expect(r.confidence).toBeCloseTo(0.25 + 0.6 * (14 / 23.8), 9);
    expect(r.tdee).toBe(Math.round(2500 * (1 - r.confidence) + 2550 * r.confidence));
  });
  it('confidence blend with few weigh-ins: 7 weigh-ins (every 4th day) -> weigh coverage 7/12', () => {
    const w = falling().filter((_, i, a) => (a.length - 1 - i) % 4 === 0 || i < 92);
    // keep the long steady-state history, but only 7 real weigh-ins inside the window
    const inWin = w.filter((p) => p.date >= WINDOW_START).length;
    expect(inWin).toBe(7);
    const r = adaptiveTdee({ formulaTdee: 2500, weights: w, intakeByDate: intake(2000), end: END });
    expect(r.weighIns).toBe(7);
    expect(r.confidence).toBeCloseTo(0.25 + 0.6 * 1 * (7 / 12), 9);
  });
  it('confidence never exceeds 0.85', () => {
    const r = adaptiveTdee({ formulaTdee: 2500, weights: falling(), intakeByDate: intake(2000), end: END, windowDays: 28 });
    expect(r.confidence).toBeLessThanOrEqual(0.85);
  });

  describe('not enough data', () => {
    it('too few logged days -> formula TDEE, observed null, confidence 0, needs text', () => {
      const r = adaptiveTdee({ formulaTdee: 2500, weights: falling(), intakeByDate: intake(2000, 5), end: END });
      expect(r.observed).toBeNull();
      expect(r.confidence).toBe(0);
      expect(r.tdee).toBe(2500);
      expect(r.needs).toBe('5 more fully logged days');
    });
    it('too few weigh-ins and logged days -> both reported', () => {
      const w = series(2, () => 80, addDays(END, -1));
      const r = adaptiveTdee({ formulaTdee: 2500, weights: w, intakeByDate: intake(2000, 5), end: END });
      expect(r.needs).toBe('5 more fully logged days and 3 more weigh-ins');
    });
    it('enough weigh-ins but only 9 logged days -> asks for exactly 1 more', () => {
      const r = adaptiveTdee({ formulaTdee: 2500, weights: falling(), intakeByDate: intake(2000, 9), end: END });
      expect(r.needs).toBe('1 more fully logged days');
    });
    it('10 logged days is enough (boundary)', () => {
      const r = adaptiveTdee({ formulaTdee: 2500, weights: falling(), intakeByDate: intake(2000, 10), end: END });
      expect(r.observed).not.toBeNull();
    });
    it('no weights at all', () => {
      const r = adaptiveTdee({ formulaTdee: 2500, weights: [], intakeByDate: intake(2000), end: END });
      expect(r.observed).toBeNull();
      expect(r.weighIns).toBe(0);
      expect(r.needs).toBe('5 more weigh-ins');
    });
    it('5 weigh-ins crammed into 5 days: span under 14 -> "weigh-ins spread over two weeks"', () => {
      const w = series(5, (i) => 80 - i * 0.1, addDays(END, -4));
      const r = adaptiveTdee({ formulaTdee: 2500, weights: w, intakeByDate: intake(2000), end: END });
      expect(r.weighIns).toBe(5);
      expect(r.observed).toBeNull();
      expect(r.needs).toBe('weigh-ins spread over two weeks');
    });
    it('weigh-ins outside the window do not count', () => {
      const w = series(20, () => 80, addDays(END, -80)); // all >28 days before END
      const r = adaptiveTdee({ formulaTdee: 2500, weights: w, intakeByDate: intake(2000), end: END });
      expect(r.weighIns).toBe(0);
    });
  });

  describe('partial days', () => {
    it('a day counts as complete from 800 kcal or half the expenditure estimate, whichever is higher', () => {
      // Small person: formula 1500, half is 750, so the 800 floor decides.
      const small = intake(1400, 14);
      small[addDays(END, -14)] = 799;
      small[addDays(END, -15)] = 800;
      expect(adaptiveTdee({ formulaTdee: 1500, weights: falling(), intakeByDate: small, end: END }).loggedDays).toBe(15);
      // Larger person: formula 2500, half is 1250, so a 1,249 kcal day is treated as unfinished.
      const large = intake(2000, 14);
      large[addDays(END, -14)] = 1249;
      large[addDays(END, -15)] = 1250;
      expect(adaptiveTdee({ formulaTdee: 2500, weights: falling(), intakeByDate: large, end: END }).loggedDays).toBe(15);
    });
    it('isCompleteDay is the shared rule', () => {
      expect(isCompleteDay(799, 1000)).toBe(false);
      expect(isCompleteDay(800, 1000)).toBe(true);
      expect(isCompleteDay(1100, 2400)).toBe(false);
      expect(isCompleteDay(1200, 2400)).toBe(true);
    });
    it('half-logged days do not drag the average down', () => {
      const m = intake(2000);
      for (let i = 0; i < 28; i += 2) m[addDays(END, -i)] = 400; // 14 partial days
      const r = adaptiveTdee({ formulaTdee: 2500, weights: falling(), intakeByDate: m, end: END });
      expect(r.loggedDays).toBe(14);
      expect(r.observed).toBe(2550);
    });
    it('intake outside the window is ignored', () => {
      const m = intake(2000);
      m[addDays(END, -28)] = 5000;
      m[addDays(END, 1)] = 5000;
      const r = adaptiveTdee({ formulaTdee: 2500, weights: falling(), intakeByDate: m, end: END });
      expect(r.loggedDays).toBe(28);
      expect(r.observed).toBe(2550);
    });
  });

  describe('clamp', () => {
    it('upper clamp at 1.45 x formula: eating 6000 at stable weight with formula 2500 -> 3625', () => {
      const w = series(60, () => 75, addDays(END, -59));
      const r = adaptiveTdee({ formulaTdee: 2500, weights: w, intakeByDate: intake(6000), end: END });
      expect(r.observed).toBe(3625);
    });
    it('lower clamp at 0.65 x formula: eating 900 at stable weight with formula 1600 -> 1040', () => {
      // 900 kcal days are complete here (half of 1600 is 800), and 900 is below 0.65 x 1600.
      const w = series(60, () => 75, addDays(END, -59));
      const r = adaptiveTdee({ formulaTdee: 1600, weights: w, intakeByDate: intake(900), end: END });
      expect(r.observed).toBe(1040);
    });
    it('blended tdee stays between formula and clamped observed', () => {
      const w = series(60, () => 75, addDays(END, -59));
      const r = adaptiveTdee({ formulaTdee: 2500, weights: w, intakeByDate: intake(6000), end: END });
      expect(r.tdee).toBeGreaterThan(2500);
      expect(r.tdee).toBeLessThanOrEqual(3625);
    });
  });

  it('respects a custom windowDays (21): 21 logged days, still 2550 when steady', () => {
    const r = adaptiveTdee({ formulaTdee: 2500, weights: falling(), intakeByDate: intake(2000), end: END, windowDays: 21 });
    expect(r.windowDays).toBe(21);
    expect(r.loggedDays).toBe(21);
    expect(r.observed).toBe(2550);
  });
  it('a 14-day window works: the span requirement shrinks to what the window can hold', () => {
    const r = adaptiveTdee({ formulaTdee: 2500, weights: falling(), intakeByDate: intake(2000), end: END, windowDays: 14 });
    expect(r.observed).toBe(2550);
    expect(r.needs).toBeNull();
  });

  // The rate of change is a least-squares line through the weigh-ins, so a user whose history
  // starts at the window start gets the same answer as one with months of data. (A difference of
  // smoothed trend values would read about 190 kcal low here, because the trend starts with no lag.)
  it('a user whose history starts at the window start still gets 2550 (no cold-start bias)', () => {
    const w = series(28, (i) => 90 - (0.5 / 7) * i, WINDOW_START);
    const r = adaptiveTdee({ formulaTdee: 2500, weights: w, intakeByDate: intake(2000), end: END });
    expect(r.observed).toBe(2550);
  });

  it('daily scale noise of +-0.6 kg moves the estimate by well under 100 kcal', () => {
    // Deterministic zig-zag noise with zero mean on top of a steady 0.5 kg/week fall.
    const noise = [0.6, -0.4, 0.1, -0.6, 0.5, -0.2, 0.0, 0.4, -0.5, 0.3, -0.1, -0.3, 0.6, -0.4];
    const w = series(28, (i) => 90 - (0.5 / 7) * i + noise[i % noise.length], WINDOW_START);
    const r = adaptiveTdee({ formulaTdee: 2500, weights: w, intakeByDate: intake(2000), end: END });
    expect(Math.abs((r.observed ?? 0) - 2550)).toBeLessThan(100);
  });

  it('sparse weigh-ins (every third day) still recover the true value on clean data', () => {
    const w = series(28, (i) => 90 - (0.5 / 7) * i, WINDOW_START).filter((_, i) => i % 3 === 0);
    const r = adaptiveTdee({ formulaTdee: 2500, weights: w, intakeByDate: intake(2000), end: END });
    expect(r.weighIns).toBe(10);
    expect(r.observed).toBe(2550);
  });
});

describe('adaptiveTdee and logged exercise', () => {
  const END = '2026-04-30';
  const START = addDays(END, -27);
  const flat = (): WeightPoint[] => series(28, () => 80, START);
  const map = (kcal: number): Record<string, number> => Object.fromEntries(Array.from({ length: 28 }, (_, i) => [addDays(START, i), kcal]));

  it('subtracts the average logged workout burn, so adding workouts back later does not count them twice', () => {
    // Holding weight on 2,800 kcal while logging 400 kcal of exercise every day:
    // total burn is 2,800, of which 2,400 is outside workouts.
    const r = adaptiveTdee({ formulaTdee: 2400, weights: flat(), intakeByDate: map(2800), exerciseByDate: map(400), end: END });
    expect(r.observedTotal).toBe(2800);
    expect(r.avgExercise).toBe(400);
    expect(r.observed).toBe(2400);
  });

  it('averages workouts over the whole window, not only the days they happened', () => {
    // 500 kcal sessions on 4 days of each week: 16 sessions in 28 days = 285.7 kcal a day.
    const exercise: Record<string, number> = {};
    for (let i = 0; i < 28; i++) if (i % 7 < 4) exercise[addDays(START, i)] = 500;
    const r = adaptiveTdee({ formulaTdee: 2400, weights: flat(), intakeByDate: map(2700), exerciseByDate: exercise, end: END });
    expect(r.avgExercise).toBe(286);
    expect(r.observed).toBe(2414);
  });

  it('is unchanged when no exercise is logged', () => {
    const r = adaptiveTdee({ formulaTdee: 2400, weights: flat(), intakeByDate: map(2300), end: END });
    expect(r.observed).toBe(2300);
    expect(r.observedTotal).toBe(2300);
    expect(r.avgExercise).toBe(0);
  });
});

describe('weeklyRate has no start-up lag and expires', () => {
  const real = (n: number, f: (i: number) => number, start = '2026-03-01'): TrendPoint[] => weightTrend(series(n, f, start));
  it('reports the true pace from the first weeks: 0.5 kg a week after 8, 14 and 28 days', () => {
    for (const n of [8, 14, 28]) expect(weeklyRate(real(n, (i) => 90 - (0.5 / 7) * i))).toBeCloseTo(-0.5, 9);
  });
  it('ignores interpolated days and needs a week of real weigh-ins', () => {
    const sparse = weightTrend([{ date: '2026-03-01', kg: 80 }, { date: '2026-03-05', kg: 79.8 }]);
    expect(weeklyRate(sparse)).toBeNull();
    const ok = weightTrend([{ date: '2026-03-01', kg: 80 }, { date: '2026-03-08', kg: 79.5 }]);
    expect(weeklyRate(ok)).toBeCloseTo(-0.5, 9);
  });
  it('is null when the newest weigh-in is more than ten days old, so an old pace is not shown as current', () => {
    const t = real(20, (i) => 90 - 0.1 * i); // last weigh-in 2026-03-20
    expect(weeklyRate(t, 21, '2026-03-30')).toBeCloseTo(-0.7, 9);
    expect(weeklyRate(t, 21, '2026-03-31')).toBeNull();
  });
});

describe('linearSlope', () => {
  it('null for fewer than two distinct dates', () => {
    expect(linearSlope([])).toBeNull();
    expect(linearSlope([{ date: '2026-01-01', kg: 80 }])).toBeNull();
    expect(linearSlope([{ date: '2026-01-01', kg: 80 }, { date: '2026-01-01', kg: 81 }])).toBeNull();
  });
  it('exact on a straight line, including unevenly spaced dates', () => {
    const pts = [0, 1, 4, 9, 20].map((d) => ({ date: addDays('2026-01-01', d), kg: 80 - 0.07 * d }));
    expect(linearSlope(pts)).toBeCloseTo(-0.07, 12);
  });
  it('hand-computed: (0,80) (1,82) (2,81) -> slope 0.5 kg/day', () => {
    // mean x = 1, mean y = 81; num = (-1)(-1) + 0 + (1)(0) = 1; den = 2 -> 0.5
    const pts = [80, 82, 81].map((kg, d) => ({ date: addDays('2026-01-01', d), kg }));
    expect(linearSlope(pts)).toBeCloseTo(0.5, 12);
  });
});
