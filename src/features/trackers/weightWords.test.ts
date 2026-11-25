import { describe, expect, it } from 'vitest';

import { addDays } from '@/lib/dates';
import { weightTrend } from '@/lib/trend';

import { weightRangeSummary } from './helpers';
import { heldDayWords, heldReadout, heldShortDay, rangeFigures, rangeSpanWords, risingWeekNote } from './weightWords';

const END = '2026-11-25';
/** A weigh-in every day for `days` days up to END, from `start` kg changing by `perDay`. */
const daily = (days: number, start: number, perDay: number) =>
  Array.from({ length: days }, (_, i) => ({ date: addDays(END, i - days + 1), kg: start + perDay * i }));

describe('range words', () => {
  const trend = weightTrend(daily(200, 82, -0.01));
  it('says the range, or "since" the first weigh-in when the range reaches back to it', () => {
    const s3 = weightRangeSummary(trend, '3m', END)!;
    expect(rangeSpanWords(s3, '3m')).toBe('last 3 months');
    const all = weightRangeSummary(trend, 'all', END)!;
    expect(rangeSpanWords(all, 'all')).toBe('since May\u00A010');
    const y = weightRangeSummary(trend, '1y', END)!;
    expect(rangeSpanWords(y, '1y')).toBe('since May\u00A010');
  });

  it('gives the average and lowest to highest with one decimal, in the person\'s units', () => {
    const t = weightTrend([
      { date: '2026-11-20', kg: 80 },
      { date: '2026-11-22', kg: 79 },
      { date: '2026-11-25', kg: 78.5 },
    ]);
    const f = rangeFigures(weightRangeSummary(t, '1m', END)!, '1m', 'metric')!;
    expect(f).toMatchObject({ unit: 'kg', average: '79.2', averageLabel: 'Average, since Nov\u00A020', spread: '78.5–80.0', spreadLabel: 'Lowest to highest' });
    expect(f.spreadSpoken).toBe('78.5 to 80.0 kg, lowest to highest of 3 weigh-ins');
    const lb = rangeFigures(weightRangeSummary(t, '1m', END)!, '1m', 'imperial')!;
    expect(lb.unit).toBe('lb');
    expect(lb.average).toBe('174.5');
  });

  it('has no spread with one weigh-in', () => {
    const t = weightTrend([{ date: '2026-11-25', kg: 80 }]);
    const f = rangeFigures(weightRangeSummary(t, '3m', END)!, '3m', 'metric')!;
    expect(f.spread).toBeNull();
    expect(f.average).toBe('80.0');
  });
});

describe('a held point', () => {
  it('names the day from the day shown, with the year only for another year', () => {
    expect(heldDayWords(END, END)).toBe('Today');
    expect(heldDayWords('2026-11-24', END)).toBe('Yesterday');
    expect(heldDayWords('2026-11-17', END)).toBe('Tue, Nov 17');
    expect(heldDayWords('2025-12-02', END)).toBe('Tue, Dec 2, 2025');
    expect(heldShortDay('2026-11-17', END)).toBe('Nov 17');
    expect(heldShortDay('2025-12-02', END)).toBe('Dec 2, 2025');
    expect(heldShortDay(END, END)).toBe('today');
  });

  it("reads that day's weigh-in and trend, and says when the day has no weigh-in", () => {
    const r = heldReadout({ date: '2026-11-17', kg: 78.8, trend: 79.06, interpolated: false }, END, 'metric');
    expect(r).toMatchObject({ day: 'Tue, Nov 17', trend: '79.1 kg', scale: '78.8 kg' });
    expect(r.spoken).toBe('Tue, Nov 17: weigh-in 78.8 kg, trend 79.1 kg');
    const gap = heldReadout({ date: '2026-11-18', kg: 78.9, trend: 79.0, interpolated: true }, END, 'metric');
    expect(gap.scale).toBeNull();
    expect(gap.spoken).toBe('Wed, Nov 18: no weigh-in, trend 79.0 kg');
  });
});

describe('risingWeekNote', () => {
  // Flat for a month, then a week up 0.3 kg a day: the trend rises well past 0.3 kg in 7 days.
  const rising = weightTrend([...daily(37, 79, 0).slice(0, 30), ...daily(7, 79.3, 0.3)]);
  it('gives context and a next step for a rising week, never a verdict', () => {
    const n = risingWeekNote(rising, END, 'metric', 74)!;
    expect(n.line).toMatch(/^The trend is up \d\.\d kg this week\./);
    expect(n.step).toMatch(/^Next: /);
    for (const word of ['bad', 'fail', 'missed', 'should', 'cheat', 'great', 'too much', 'gained', 'warning']) {
      expect(`${n.line} ${n.step}`.toLowerCase()).not.toContain(word);
    }
  });

  it('says nothing for a flat or falling week, an old weigh-in, or when gaining is the goal', () => {
    expect(risingWeekNote(weightTrend(daily(40, 80, -0.05)), END, 'metric', 74)).toBeNull();
    expect(risingWeekNote(weightTrend(daily(40, 80, 0)), END, 'metric')).toBeNull();
    expect(risingWeekNote(rising, addDays(END, 8), 'metric', 74)).toBeNull();
    expect(risingWeekNote(rising, END, 'metric', 90)).toBeNull();
    expect(risingWeekNote(rising, END, 'metric')).not.toBeNull();
  });
});
