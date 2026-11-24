/**
 * The training overview (spec section 2): the training reader's eight worked weeks, every band
 * edge, the one strength list, short history, the counts and every sentence the module can return.
 * Today is fixed (Monday 2026-11-23): the module never reads the clock, so nothing here does either.
 *
 * Notation in the comments: a = guideline minutes of the last 7 days (today and the 6 before),
 * sum = guideline minutes of the 21 days before that, c = sum / 3, r = a / c. A session "n days ago"
 * is in the last 7 when n <= 6 and in the history when 7 <= n <= 27.
 */
import { describe, expect, it } from 'vitest';

import { addDays } from '@/lib/dates';
import type { Intensity } from '@/types';

import {
  CHART_CAPTION,
  HONEST_COMPARE,
  HONEST_COUNTING,
  HONEST_PHONE,
  HONEST_WHO,
  HOW_COUNTED,
  LIGHTER_NOTE,
  LOAD_TITLES,
  NEEDS_HISTORY,
  OVERVIEW_ABOUT,
  POSITIONS,
  POSITION_WORDS,
  STEP_EASY,
  STEP_SETTLE,
  STRENGTH_IDS,
  overviewAnswer,
  positionLabel,
  strengthWho,
  trainingOverview,
  type LoadSession,
} from './trainingLoad';

const T = '2026-11-23'; // a Monday

let n = 0;
function s(daysAgo: number, activityId: string, durationMin: number, intensity: Intensity, met: number, extra: Partial<LoadSession> = {}): LoadSession {
  n += 1;
  return { id: `a${n}`, date: addDays(T, -daysAgo), activityId, durationMin, intensity, met, ...extra };
}
/** A moderate walk: MET 3.8, never Hard, counts its minutes once. */
const walk = (daysAgo: number, min: number) => s(daysAgo, 'walking', min, 'moderate', 3.8);
/** A hard run: MET 11.8 logged Hard, counts double. */
const hardRun = (daysAgo: number, min: number) => s(daysAgo, 'running', min, 'vigorous', 11.8);
/** History worth `sum` guideline minutes: one walk 21 days ago (so the first session is exactly 21 days old). */
const history = (sum: number) => [walk(21, sum)];
/** `a` guideline minutes spread over three walks (today, 2 and 4 days ago), so no day holds half. */
function spread(a: number) {
  const third = Math.floor(a / 3);
  return [walk(0, a - 2 * third), walk(2, third), walk(4, third)];
}

describe("the training reader's eight worked weeks", () => {
  it('1. a beginner in the first week: 3 walks of 30 min, no history, so no state', () => {
    // a = 90; the first session is 4 days old (< 21), so there is no comparison.
    const o = trainingOverview([walk(0, 30), walk(2, 30), walk(4, 30)], T);
    expect(o.enoughHistory).toBe(false);
    expect(o.state).toBeNull();
    expect(o.position).toBeNull();
    expect(o.title).toBeNull();
    expect(o.minutes).toBe(90);
    expect(o.lead).toBe(NEEDS_HISTORY);
    expect(o.lines).toEqual(['90 guideline minutes in the last 7 days.']);
    expect(o.countsLine).toBe('4 days without a session. No strength sessions.');
    expect(o.honest).toEqual([HONEST_PHONE, HONEST_WHO, HONEST_COUNTING]);
    expect(o.cardLabel).toBeNull();
  });

  it('2. a week off after three weeks of run 40, lift 50 (Hard), run 40, walk 60: lighter', () => {
    // Each past week: 40 + 100 + 40 + 60 = 240, so sum = 720, c = 240. a = 0, r = 0 < 0.8.
    const past = [1, 2, 3].flatMap((w) => [
      s(7 * w + 1, 'running', 40, 'moderate', 9.3),
      s(7 * w + 3, 'strength_training', 50, 'vigorous', 6),
      s(7 * w + 4, 'running', 40, 'moderate', 9.3),
      walk(7 * w + 6, 60),
    ]);
    const o = trainingOverview(past, T);
    expect(o.recentAverage).toBe(240);
    expect(o.state).toBe('lighter');
    expect(o.position).toBe('lighter');
    expect(o.title).toBe('Lighter than your recent weeks');
    expect(o.lines).toEqual(['0 guideline minutes in the last 7 days, against your recent average of 240.', LIGHTER_NOTE]);
    expect(o.countsLine).toBe('7 days without a session. No strength sessions.');
    expect(o.cardLabel).toBe('Last 7 days: Lighter than your recent weeks. 0 guideline minutes in the last 7 days, against your recent average of 240.');
  });

  it('3. one long hike on top of two usual runs: one big day, not a step up', () => {
    // Past weeks: 2 x 50 min runs logged moderate (count once) = 100, sum = 300, c = 100.
    // Last 7: the two runs (100) and a 300 min hike on Wednesday Nov 18 (moderate, 5.3 MET: 300).
    // a = 400 > 150, r = 4 >= 1.5, and the hike day holds 300 / 400 = 75% >= 50%: one big day.
    const runs = [0, 1, 2, 3].flatMap((w) => [s(7 * w + 1, 'running', 50, 'moderate', 9.3), s(7 * w + 4, 'running', 50, 'moderate', 9.3)]);
    const o = trainingOverview([...runs, s(5, 'hiking', 300, 'moderate', 5.3)], T);
    expect(o.minutes).toBe(400);
    expect(o.ratio).toBe(4);
    expect(o.state).toBe('oneBigDay');
    expect(o.position).toBe('more');
    expect(o.title).toBe('One big day');
    expect(o.lines).toEqual(['400 guideline minutes in the last 7 days, about 4 times your recent average of 100.', '300 of them on Wednesday.', STEP_SETTLE]);
    expect(o.counts.bigDay).toBe('2026-11-18');
  });

  it('4. strength only, 3 x 60 min Hard for four weeks: about your usual, mostly strength', () => {
    // 3 x 60 x 2 = 360 each week; sum = 1080, c = 360, a = 360, r = 1. Hard on days 0, 2, 4: no 4 in a row.
    const lifts = [0, 1, 2, 3].flatMap((w) => [0, 2, 4].map((d) => s(7 * w + d, 'strength_training', 60, 'vigorous', 6)));
    const o = trainingOverview(lifts, T);
    expect(o.state).toBe('usual');
    expect(o.position).toBe('usual');
    expect(o.mostlyStrength).toBe(true);
    expect(o.counts.strengthDays).toBe(3);
    expect(o.lines).toEqual(['360 guideline minutes in the last 7 days, close to your recent average of 360.']);
    expect(o.countsLine).toBe('4 days without a session. Strength on 3 days.');
    // The WHO band sentence is replaced: lifting is not aerobic minutes.
    expect(o.honest).toEqual([HONEST_PHONE, HONEST_COMPARE, 'Strength on 3 days. WHO counts strength days apart from the 150 to 300 aerobic minutes.', HONEST_COUNTING]);
    expect(o.honest).not.toContain(HONEST_WHO);
  });

  it('5. a partial logger, 2 x 30 min runs a week: about your usual (c exactly 60 is enough)', () => {
    // 60 a week; sum = 180, c = 60 (the edge), a = 60, r = 1. The football that was not logged cannot count.
    const runs = [0, 1, 2, 3].flatMap((w) => [s(7 * w + 1, 'running', 30, 'moderate', 9.3), s(7 * w + 4, 'running', 30, 'moderate', 9.3)]);
    const o = trainingOverview(runs, T);
    expect(o.enoughHistory).toBe(true);
    expect(o.recentAverage).toBe(60);
    expect(o.state).toBe('usual');
    expect(o.honest[0]).toBe(HONEST_PHONE);
  });

  it('6. five hard days a week, then HIIT 60 min every day: a full week, few easy days', () => {
    // Past weeks: HIIT 45 Hard x 4 (90 each) + a hard run 45 (90) = 450; sum = 1350, c = 450.
    // Last 7: HIIT 60 Hard every day = 7 x 120 = 840, r = 1.87, 7 Hard days in a row.
    // Not strength: HIIT is in the strength category of the catalogue but not on the list.
    const past = [1, 2, 3].flatMap((w) => [...[0, 1, 2, 3].map((d) => s(7 * w + d, 'hiit', 45, 'vigorous', 11)), s(7 * w + 5, 'running', 45, 'vigorous', 11.8)]);
    const week = [0, 1, 2, 3, 4, 5, 6].map((d) => s(d, 'hiit', 60, 'vigorous', 11));
    const o = trainingOverview([...past, ...week], T);
    expect(o.minutes).toBe(840);
    expect(o.state).toBe('fullWeek');
    expect(o.position).toBe('more');
    expect(o.title).toBe('A full week, few easy days');
    expect(o.lines).toEqual(['840 guideline minutes in the last 7 days, about 1.9 times your recent average of 450.', 'Hard sessions on each of the last 7 days.', STEP_EASY]);
    expect(o.countsLine).toBe('A session on each of the last 7 days. No strength sessions.');
    expect(o.counts.strengthDays).toBe(0);
    expect(o.counts.hardDays).toBe(7);
    expect(o.counts.hardInARow).toBe(7);
  });

  it('7. a gradual build, 3 runs a week of 30, 33, 36 then 40 min: about your usual', () => {
    // sum = 3 x (30 + 33 + 36) = 297, c = 99, a = 120, r = 1.21.
    const mins = [40, 36, 33, 30];
    const runs = [0, 1, 2, 3].flatMap((w) => [0, 2, 4].map((d) => s(7 * w + d, 'running', mins[w], 'moderate', 9.3)));
    const o = trainingOverview(runs, T);
    expect(o.recentAverage).toBe(99);
    expect(o.state).toBe('usual');
    expect(o.lines[0]).toBe('120 guideline minutes in the last 7 days, close to your recent average of 99.');
  });

  it("8. the demo person's mix: 270 against 628 over three weeks, r = 1.29, just under the edge", () => {
    // Last 7: volleyball 75 (moderate 4.0: 75), basketball 50 Hard (8.0: 100), walk 95 = 270.
    // Past: 75 + 125 = 200; 100 + 114 = 214; 100 + 114 = 214; sum = 628, c = 209.3, r = 1.2898.
    const o = trainingOverview(
      [
        s(0, 'volleyball', 75, 'moderate', 4),
        s(2, 'basketball', 50, 'vigorous', 8),
        walk(5, 95),
        s(8, 'basketball', 50, 'vigorous', 8),
        walk(10, 114),
        s(15, 'basketball', 50, 'vigorous', 8),
        walk(17, 114),
        s(22, 'volleyball', 75, 'moderate', 4),
        walk(25, 125),
      ],
      T,
    );
    expect(o.minutes).toBe(270);
    expect(o.state).toBe('usual');
    expect(o.lines[0]).toBe('270 guideline minutes in the last 7 days, close to your recent average of 209.');
  });
});

describe('band edges', () => {
  // sum = 300, so c = 100 and r = a / 100.
  it('r under 0.8 is lighter, 0.8 is usual', () => {
    expect(trainingOverview([...history(300), ...spread(79)], T).state).toBe('lighter');
    expect(trainingOverview([...history(300), ...spread(80)], T).state).toBe('usual');
  });
  it('1.3 is still usual, above it is more', () => {
    expect(trainingOverview([...history(300), ...spread(130)], T).state).toBe('usual');
    const more = trainingOverview([...history(300), ...spread(131)], T);
    expect(more.state).toBe('more');
    expect(more.position).toBe('more');
    expect(more.title).toBe('More than your recent weeks');
  });
  it('1.5 with a at 150 stays "more"; above 150 it is a step up', () => {
    // r = 1.5 exactly and a = 150 (not above 150).
    const at150 = trainingOverview([...history(300), ...spread(150)], T);
    expect(at150.state).toBe('more');
    // At or under 150 there is no next step: WHO counts more as better there.
    expect(at150.lines).toEqual(['150 guideline minutes in the last 7 days, about 1.5 times your recent average of 100.']);
    // sum = 302, a = 151: r = 1.5 exactly and a above 150.
    const step = trainingOverview([...history(302), ...spread(151)], T);
    expect(step.state).toBe('stepUp');
    expect(step.title).toBe('A big step up');
    expect(step.lines).toEqual(['151 guideline minutes in the last 7 days, about 1.5 times your recent average of 101.', STEP_SETTLE]);
    // sum = 303, a = 151: r = 1.495, under 1.5.
    expect(trainingOverview([...history(303), ...spread(151)], T).state).toBe('more');
  });
  it('one day with half the week is one big day; just under half is a step up', () => {
    // a = 200, r = 2.
    expect(trainingOverview([...history(300), walk(1, 100), walk(3, 50), walk(5, 50)], T).state).toBe('oneBigDay');
    expect(trainingOverview([...history(300), walk(1, 99), walk(3, 51), walk(5, 50)], T).state).toBe('stepUp');
    // The big day named as people say it.
    expect(trainingOverview([...history(300), walk(1, 100), walk(3, 50), walk(5, 50)], T).lines[1]).toBe('100 of them yesterday.');
    expect(trainingOverview([...history(300), walk(0, 100), walk(3, 50), walk(5, 50)], T).lines[1]).toBe('100 of them today.');
    // Half the week on one day without the step up is not one big day.
    expect(trainingOverview([...history(300), walk(1, 60), walk(3, 60)], T).state).toBe('usual');
  });
  it('Hard on 4 days in a row is a full week; 3 in a row is not', () => {
    // 4 hard runs of 20 min = 160; sum 480, c = 160, r = 1.
    const four = trainingOverview([...history(480), ...[1, 2, 3, 4].map((d) => hardRun(d, 20))], T);
    expect(four.state).toBe('fullWeek');
    expect(four.lines).toEqual(['160 guideline minutes in the last 7 days, close to your recent average of 160.', 'Hard sessions on 4 days in a row.', STEP_EASY]);
    // 3 hard runs in a row = 120; sum 360, c = 120, r = 1.
    expect(trainingOverview([...history(360), ...[1, 2, 3].map((d) => hardRun(d, 20))], T).state).toBe('usual');
  });
  it('four short Hard sessions in a row on a week lighter than usual stay "lighter", not a full week', () => {
    // 4 hard runs of 5 min = 40; sum 300, c = 100, r = 0.4: the mark must not say "more" beside "40 against 100".
    const o = trainingOverview([...history(300), ...[0, 1, 2, 3].map((d) => hardRun(d, 5))], T);
    expect(o.state).toBe('lighter');
    expect(o.position).toBe('lighter');
    // At the edge of the usual range (r = 0.8) the full week applies again: 4 x 10 x 2 = 80 against 100.
    expect(trainingOverview([...history(300), ...[0, 1, 2, 3].map((d) => hardRun(d, 10))], T).state).toBe('fullWeek');
  });
  it('Hard on 6 of the 7 days is a full week even with no 4 in a row; 5 is not', () => {
    // Days 0,1,2 and 4,5,6: two runs of 3. 6 x 40 = 240; sum 720.
    const six = trainingOverview([...history(720), ...[0, 1, 2, 4, 5, 6].map((d) => hardRun(d, 20))], T);
    expect(six.counts.hardInARow).toBe(3);
    expect(six.state).toBe('fullWeek');
    expect(six.lines[1]).toBe('Hard sessions on 6 of the last 7 days.');
    expect(trainingOverview([...history(600), ...[0, 1, 2, 4, 5].map((d) => hardRun(d, 20))], T).state).toBe('usual');
  });
  it('a full week wins over usual, more and a step up, but not over a lighter week or one big day', () => {
    // Lighter stays lighter: 4 short hard runs (4 x 10 x 2 = 80) against c = 200, r = 0.4.
    expect(trainingOverview([...history(600), ...[0, 1, 2, 3].map((d) => hardRun(d, 10))], T).state).toBe('lighter');
    // Step up: 4 x 60 = 240 hard against c = 100.
    expect(trainingOverview([...history(300), ...[0, 1, 2, 3].map((d) => hardRun(d, 30))], T).state).toBe('fullWeek');
    // One big day: 4 hard days in a row and a 300 min hike holding more than half.
    const big = trainingOverview([...history(300), ...[0, 1, 2, 3].map((d) => hardRun(d, 10)), walk(5, 300)], T);
    expect(big.state).toBe('oneBigDay');
  });
  it('needs 21 days since the first session and c of 60 or more', () => {
    // First session 21 days ago: enough. 20 days ago: not, whatever the minutes.
    expect(trainingOverview([walk(21, 300), ...spread(100)], T).enoughHistory).toBe(true);
    expect(trainingOverview([walk(20, 300), ...spread(100)], T).enoughHistory).toBe(false);
    // sum 180 (c = 60) is enough; 179 is not.
    expect(trainingOverview([walk(21, 180), ...spread(60)], T).enoughHistory).toBe(true);
    const short = trainingOverview([walk(21, 179), ...spread(60)], T);
    expect(short.enoughHistory).toBe(false);
    expect(short.state).toBeNull();
    // A session older than 28 days still dates the history, but its minutes are outside c.
    const old = trainingOverview([walk(40, 30), walk(12, 200), ...spread(60)], T);
    expect(old.enoughHistory).toBe(true);
    expect(old.recentAverage).toBe(67);
  });
});

describe('the strength list and the counts', () => {
  it('holds strength training, calisthenics, bodyweight training, kettlebell and any session with exercises', () => {
    expect([...STRENGTH_IDS].sort()).toEqual(['bodyweight_training', 'calisthenics', 'kettlebell', 'strength_training']);
    const o = trainingOverview(
      [
        s(0, 'calisthenics', 30, 'moderate', 3.8),
        s(1, 'bodyweight_training', 30, 'moderate', 3),
        s(2, 'kettlebell', 30, 'moderate', 9.8),
        s(3, 'other', 30, 'moderate', 4, { exercises: [{ name: 'Row', sets: [{ reps: 8, weightKg: 40 }] }] }),
        s(4, 'hiit', 30, 'vigorous', 11),
        s(5, 'circuit_training', 30, 'moderate', 5),
        s(6, 'crossfit', 30, 'moderate', 7.5),
      ],
      T,
    );
    expect(o.counts.strengthDays).toBe(4);
    expect(o.counts.restDays).toBe(0);
  });
  it('two strength sessions on one day are one strength day', () => {
    const o = trainingOverview([s(1, 'strength_training', 30, 'moderate', 5), s(1, 'kettlebell', 10, 'moderate', 9.8), walk(3, 30)], T);
    expect(o.counts.strengthDays).toBe(1);
    expect(o.countsLine).toBe('5 days without a session. Strength on 1 day.');
  });
  it('mostly strength when strength minutes are half of a or more', () => {
    // Strength 60 (moderate 5 MET) and walks 60: exactly half.
    expect(trainingOverview([s(1, 'strength_training', 60, 'moderate', 5), walk(3, 60)], T).mostlyStrength).toBe(true);
    expect(trainingOverview([s(1, 'strength_training', 59, 'moderate', 5), walk(3, 61)], T).mostlyStrength).toBe(false);
    expect(trainingOverview([], T).mostlyStrength).toBe(false);
  });
  it('one rest day and singular words', () => {
    const o = trainingOverview([walk(0, 1), ...[1, 2, 3, 4, 5].map((d) => walk(d, 20))], T);
    expect(o.lines[0]).toBe('101 guideline minutes in the last 7 days.');
    expect(o.countsLine).toBe('1 day without a session. No strength sessions.');
    expect(trainingOverview([walk(3, 1)], T).lines[0]).toBe('1 guideline minute in the last 7 days.');
  });
  it('a light session is a session (not a rest day) but adds no minutes', () => {
    const o = trainingOverview([s(1, 'yoga', 40, 'light', 2.3)], T);
    expect(o.minutes).toBe(0);
    expect(o.counts.restDays).toBe(6);
  });
  it('ignores future and deleted sessions', () => {
    const o = trainingOverview([walk(-1, 300), { ...walk(2, 300), deleted: true }, walk(3, 30)], T);
    expect(o.minutes).toBe(30);
    expect(o.counts.restDays).toBe(6);
  });
});

describe('the five blocks for the chart', () => {
  it('are the last four 7-day blocks and this one, oldest first', () => {
    const o = trainingOverview([walk(0, 10), walk(6, 5), walk(7, 20), walk(14, 30), walk(21, 40), walk(28, 50), walk(35, 99)], T);
    expect(o.blocks.map((b) => b.minutes)).toEqual([50, 40, 30, 20, 15]);
    expect(o.blocks.map((b) => [b.from, b.to])).toEqual([
      ['2026-10-20', '2026-10-26'],
      ['2026-10-27', '2026-11-02'],
      ['2026-11-03', '2026-11-09'],
      ['2026-11-10', '2026-11-16'],
      ['2026-11-17', '2026-11-23'],
    ]);
    expect(o.blocks.map((b) => b.label)).toEqual(['4 wk', '3 wk', '2 wk', '1 wk', 'Last 7']);
    expect(o.blocks[4].detail).toBe('Nov 17 to Nov 23 · 15 min');
  });
});

describe('the answer as text (for the chat\'s phone button)', () => {
  it('with a state', () => {
    const o = trainingOverview([...history(300), ...spread(131)], T);
    expect(overviewAnswer(o)).toBe(
      'Last 7 days: More than your recent weeks. 131 guideline minutes in the last 7 days, about 1.3 times your recent average of 100. 4 days without a session. No strength sessions. ' +
        HONEST_PHONE,
    );
  });
  it('without enough history', () => {
    const o = trainingOverview([walk(2, 30)], T);
    expect(overviewAnswer(o)).toBe(`${NEEDS_HISTORY} 30 guideline minutes in the last 7 days. 6 days without a session. No strength sessions. ${HONEST_PHONE}`);
  });
});

describe('words', () => {
  // The morning page's banned list (src/features/morning/words.test.ts), and this feature's own.
  const BANNED =
    /\b(bad|fail|failed|failure|cheat|cheated|should|guilty|lazy|great|amazing|well done|keep it up|too much|missed your|goal missed|over budget|make up|only|unfortunately|oops|sorry)\b/i;
  const OWN = /\b(too much|too little|too low|danger|dangerous|should|overtraining|injur(y|ies))\b/i;

  function strings(): Set<string> {
    const out = new Set<string>([
      ...Object.values(LOAD_TITLES),
      ...Object.values(POSITION_WORDS),
      NEEDS_HISTORY,
      CHART_CAPTION,
      HOW_COUNTED,
      OVERVIEW_ABOUT,
      ...POSITIONS.map(positionLabel),
      HONEST_PHONE,
      HONEST_COMPARE,
      HONEST_WHO,
      HONEST_COUNTING,
      STEP_EASY,
      STEP_SETTLE,
      LIGHTER_NOTE,
      strengthWho(1),
      strengthWho(3),
    ]);
    const sums = [0, 179, 180, 300, 302, 600, 1350];
    const lasts = [[], spread(1), spread(80), spread(131), spread(151), [walk(1, 100), walk(3, 50), walk(5, 50)], [0, 1, 2, 3, 4, 5, 6].map((d) => hardRun(d, 30)), [0, 1, 2, 4, 5, 6].map((d) => hardRun(d, 20)), [1, 2, 3, 4].map((d) => hardRun(d, 20)), [s(1, 'strength_training', 60, 'vigorous', 6)], [s(0, 'kettlebell', 30, 'moderate', 9.8), s(6, 'calisthenics', 30, 'moderate', 3.8)]];
    for (const sum of sums)
      for (const last of lasts)
        for (const first of [21, 10]) {
          const o = trainingOverview([...(sum ? [walk(first, sum)] : []), ...last], T);
          for (const x of [o.title, o.lead, ...o.lines, o.countsLine, ...o.honest, o.cardLabel, overviewAnswer(o), ...o.blocks.flatMap((b) => [b.label, b.detail])]) if (x) out.add(x);
        }
    return out;
  }

  it('never use a banned word or an exclamation mark', () => {
    const all = strings();
    expect(all.size).toBeGreaterThan(40);
    expect([...all].filter((x) => BANNED.test(x) || (OWN.test(x) && !x.includes(HONEST_COMPARE)) || x.includes('!'))).toEqual([]);
  });
  it('the sheet\'s heading, the line\'s hint and the marks\' spoken labels', () => {
    expect(HOW_COUNTED).toBe('How this is counted');
    expect(OVERVIEW_ABOUT).toBe('About your last 7 days of training');
    expect(POSITIONS.map(positionLabel)).toEqual(['Lighter, of lighter, usual and more', 'Usual, of lighter, usual and more', 'More, of lighter, usual and more']);
  });
  it('say "risk" in one sentence only, the one that says this is not a measure of it', () => {
    const risky = [...strings()].filter((x) => /\brisk\b/i.test(x));
    expect(risky.every((x) => x.includes(HONEST_COMPARE))).toBe(true);
    expect(HONEST_COMPARE).toBe('This compares your minutes with your own recent weeks. It is a description, not a measure of injury risk.');
  });
});
