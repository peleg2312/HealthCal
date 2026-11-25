import { describe, expect, it } from 'vitest';

import { periodHeadline } from '@/features/share/periodContent';

import { monthPeriod, yearPeriod, type Period, type PeriodTally } from './period';
import {
  activityCaption,
  cardOverline,
  closingLine,
  daysFigure,
  emptyWords,
  gridLabel,
  helpParagraphs,
  monthRowWords,
  OFFER_HIDDEN,
  offerLine,
  periodSubtitle,
  periodTitle,
  totalVolume,
  waterCaption,
  weightWords,
  yearRowWords,
} from './words';

/** The morning page's list and the insights' "missed", with the words a recap must never say about a month. */
const BANNED =
  /\b(bad|badly|worse|worst|fail|fails|failed|failing|failure|cheat|cheated|should|guilty|lazy|great|greatest|amazing|well done|keep it up|too much|missed|missed your|over budget|near budget|make up|only|unfortunately|oops|sorry|streak broken|target)\b/i;

const tally = (logged: number, elapsed: number, full = 0, on = 0, above = 0, partial = 0): PeriodTally => ({
  from: '2026-10-01',
  to: '2026-10-31',
  elapsed,
  logged,
  counts: { full, on, above },
  partial,
});

describe('recap words', () => {
  const today = '2026-11-25';
  const periods: Period[] = [monthPeriod('2026-10'), monthPeriod('2026-11'), monthPeriod('2025-12'), yearPeriod('2026'), yearPeriod('2025')];
  const tallies = [tally(0, 31), tally(1, 1), tally(5, 31, 2, 1, 1, 3), tally(31, 31, 31, 31, 0), tally(214, 329, 180, 120, 40, 20)];

  it('never says a word from the banned list, nor an exclamation mark', () => {
    const said = new Set<string>([OFFER_HIDDEN]);
    for (const p of periods) {
      said.add(periodTitle(p, today));
      said.add(cardOverline(p));
      said.add(offerLine(p, today));
      const e = emptyWords(p, today);
      said.add(e.title).add(e.message);
      helpParagraphs(p.kind).forEach((h) => said.add(h));
      for (const t of tallies) {
        said.add(periodSubtitle(p, t, today));
        said.add(closingLine(p, t, today));
        said.add(gridLabel(p, t, today, [{ month: '2026-10', logged: 5, elapsed: 31 }]));
        said.add(periodHeadline(p, t, today));
        const f = daysFigure(t, p, today);
        said.add(`${f.value} ${f.unit} ${f.label}`);
      }
    }
    for (const a of [{ activeMinutes: 0, workouts: 0, days: 0 }, { activeMinutes: 30, workouts: 1, days: 1 }, { activeMinutes: 900, workouts: 12, days: 10 }]) said.add(activityCaption(a));
    for (const w of [{ totalMl: 0, daysTracked: 0, daysReached: 0 }, { totalMl: 500, daysTracked: 0, daysReached: 0 }, { totalMl: 60000, daysTracked: 20, daysReached: 1 }]) said.add(waterCaption(w));
    said.add(weightWords(80, 78.4, '2026-10-01', '2026-10-31', 'metric').caption);
    said.add(monthRowWords('2026-11', 20, 25, today).caption);
    said.add(yearRowWords('2026', 1, today).caption);
    const bad = [...said].filter((s) => BANNED.test(s) || s.includes('!'));
    expect(bad).toEqual([]);
  });

  it('names the period, with its year only when it is not this year', () => {
    expect(periodTitle(monthPeriod('2026-10'), '2026-11-25')).toBe('Your October');
    expect(periodTitle(monthPeriod('2025-12'), '2026-01-03')).toBe('Your December 2025');
    expect(periodTitle(yearPeriod('2026'), '2026-11-25')).toBe('Your 2026');
    expect(cardOverline(monthPeriod('2026-10'))).toBe('OCTOBER 2026');
  });

  it('says what the figures cover in the short line, "So far" while the period holds today', () => {
    expect(periodSubtitle(monthPeriod('2026-10'), tally(5, 31), '2026-11-25')).toBe('Oct 1 – 31');
    expect(periodSubtitle(monthPeriod('2026-11'), { ...tally(5, 25), from: '2026-11-01', to: '2026-11-25' }, '2026-11-25')).toBe('So far · Nov 1 – 25');
    expect(periodSubtitle(yearPeriod('2026'), { ...tally(5, 66), from: '2026-09-21', to: '2026-11-25' }, '2026-11-25')).toBe('So far · Sep 21 – Nov 25');
  });

  it('counts days in the singular and plural, and the hero figure with its unit', () => {
    expect(daysFigure(tally(1, 1), monthPeriod('2026-10'), '2026-11-25')).toEqual({ value: '1', unit: 'of 1 day', label: 'with food logged' });
    expect(daysFigure(tally(26, 31), monthPeriod('2026-11'), '2026-11-25').label).toBe('with food logged so far');
    expect(activityCaption({ activeMinutes: 30, workouts: 1, days: 1 })).toBe('1 workout on 1 day');
  });

  it('says the water goal is reached, never met or missed', () => {
    expect(waterCaption({ totalMl: 9000, daysTracked: 4, daysReached: 3 })).toBe('Goal reached on 3 of 4 days with water logged');
    expect(waterCaption({ totalMl: 500, daysTracked: 0, daysReached: 0 })).toBe('From drinks logged in the diary');
  });

  it('writes a total of water as a person reads it', () => {
    expect(totalVolume(850, 'metric')).toEqual({ value: '850', unit: 'ml' });
    expect(totalVolume(48_640, 'metric')).toEqual({ value: '48.6', unit: 'L' });
    expect(totalVolume(48_000, 'metric')).toEqual({ value: '48', unit: 'L' });
    expect(totalVolume(1_234_567, 'metric')).toEqual({ value: '1,235', unit: 'L' });
    expect(totalVolume(29_573.5, 'imperial')).toEqual({ value: '1,000', unit: 'fl oz' });
  });

  it('gives every weight one decimal, a trend from where it started', () => {
    expect(weightWords(80, 78.44, '2026-10-01', '2026-10-31', 'metric')).toEqual({ value: '78.4', unit: 'kg', caption: 'Trend on Oct 31, from 80.0 kg on Oct 1' });
  });

  it('closes calmly with a fact', () => {
    expect(closingLine(monthPeriod('2026-11'), tally(20, 25), '2026-11-25')).toBe('November is still going. Each day you log fills its cup.');
    expect(closingLine(monthPeriod('2026-10'), tally(31, 31), '2026-11-25')).toBe('Every day of October is in your diary, one cup a day.');
    expect(closingLine(monthPeriod('2026-10'), tally(5, 31), '2026-11-25')).toBe('October is kept in your diary, one cup a day.');
  });
});
