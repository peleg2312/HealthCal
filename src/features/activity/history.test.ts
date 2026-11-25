import { describe, expect, it } from 'vitest';

import type { ActivityEntry } from '@/types';

import {
  figureFitsBeside,
  figureWordsHold,
  historyDaySpoken,
  historyDayWord,
  historyFigureBeside,
  historyFigureBesideMeasured,
  historyFigureWords,
  historyMetaLine,
  historyMetaLines,
  historyNamePieces,
  historyWeekLabel,
  historyWeeks,
  historyWeekTitle,
  weekStripLabel,
} from './history';

// Tuesday, Nov 24 2026: its week starts on Monday, Nov 23.
const TODAY = '2026-11-24';

const session = (id: string, date: string, durationMin: number, loggedAt = `${date}T10:00:00.000Z`): ActivityEntry =>
  ({ id, date, durationMin, loggedAt, activityId: 'volleyball', name: 'Volleyball', emoji: '🏐', category: 'sport', intensity: 'moderate', met: 4, kcalGross: 300, kcalNet: 250, updatedAt: loggedAt }) as unknown as ActivityEntry;

describe("Train's history by week", () => {
  it('names this week and last week, and every other week by its Monday', () => {
    expect(historyWeekTitle('2026-11-23', TODAY)).toBe('This week');
    expect(historyWeekTitle('2026-11-16', TODAY)).toBe('Last week');
    expect(historyWeekTitle('2026-11-09', TODAY)).toBe('Week of Nov 9');
    // A week of another year says its year.
    expect(historyWeekTitle('2025-12-29', '2026-01-20')).toBe('Week of Dec 29, 2025');
    // On a Monday, last week is the seven days before it.
    expect(historyWeekTitle('2026-11-16', '2026-11-23')).toBe('Last week');
  });

  it("gives each row its day: today and yesterday by name, else the weekday its card's title dates", () => {
    expect(historyDayWord(TODAY, TODAY)).toBe('Today');
    expect(historyDayWord('2026-11-23', TODAY)).toBe('Yesterday');
    expect(historyDayWord('2026-11-22', TODAY)).toBe('Sun');
    expect(historyDayWord('2026-11-16', TODAY)).toBe('Mon');
    expect(historyDaySpoken('2026-11-22', TODAY)).toBe('Sunday, Nov 22');
    // The same weekday a week earlier is named apart.
    expect(historyDaySpoken('2026-11-15', TODAY)).toBe('Sunday, Nov 15');
    expect(historyDaySpoken(TODAY, TODAY)).toBe('today');
    expect(historyDaySpoken('2026-11-23', TODAY)).toBe('yesterday');
  });

  it('groups the workouts into weeks, newest first, with the week total and the newest row on top', () => {
    const list = [
      session('a', '2026-11-16', 55),
      session('b', '2026-11-24', 75, '2026-11-24T08:00:00.000Z'),
      session('c', '2026-11-22', 45),
      session('d', '2026-11-24', 30, '2026-11-24T18:00:00.000Z'),
      session('e', '2026-11-23', 75),
      session('f', '2026-11-02', 40),
    ];
    const weeks = historyWeeks(list, TODAY);
    expect(weeks.map((w) => [w.start, w.title, w.minutes, w.entries.map((e) => e.id).join('')])).toEqual([
      ['2026-11-23', 'This week', 180, 'dbe'],
      ['2026-11-16', 'Last week', 100, 'ca'],
      ['2026-11-02', 'Week of Nov 2', 40, 'f'],
    ]);
    // Every workout is in exactly one week, and a week with none is left out.
    expect(weeks.reduce((n, w) => n + w.entries.length, 0)).toBe(list.length);
    expect(historyWeekLabel(weeks[0])).toBe('This week, 3 sessions, 3 hours');
    expect(historyWeekLabel(weeks[2])).toBe('Week of Nov 2, 1 session, 40 minutes');
    expect(historyWeeks([], TODAY)).toEqual([]);
  });
});

describe("a history row's line", () => {
  const at360 = 218;
  const at320 = 178;
  it('is one line at 360 for the everyday rows', () => {
    for (const parts of [
      ['Today', '75 min', 'Moderate'],
      ['Yesterday', '75 min', 'Moderate'],
      ['Sun', '45 min', 'Moderate', '3.9 km'],
      ['Tue', '55 min', 'Hard'],
    ]) {
      const r = historyMetaLines(parts, at360);
      expect(r.lines).toBe(1);
      expect(r.text).not.toContain('\n');
    }
    expect(historyMetaLines(['Today', '75 min', 'Moderate'], at360).text).toBe('Today · 75 min · Moderate');
  });
  it('keeps three parts on one line at 320 too', () => {
    expect(historyMetaLines(['Yesterday', '75 min', 'Moderate'], at320).lines).toBe(1);
  });
  it('breaks a longer line in two balanced halves, never leaving one word alone', () => {
    expect(historyMetaLines(['Yesterday', '45 min', 'Moderate', '3.9 km'], at320).text).toBe('Yesterday · 45 min\nModerate · 3.9 km');
    expect(historyMetaLines(['Sun', '45 min', 'Moderate', '3.9 km'], at320).text).toBe('Sun · 45 min\nModerate · 3.9 km');
    expect(historyMetaLines(['Yesterday', '55 min', '4 exercises', '12 sets'], at360).text).toBe('Yesterday · 55 min\n4 exercises · 12 sets');
  });
  it('grows with the phone\'s text size', () => {
    expect(historyMetaLines(['Today', '75 min', 'Moderate'], at360, 1.3).lines).toBe(1);
    expect(historyMetaLines(['Yesterday', '75 min', 'Moderate'], at320, 1.3).lines).toBe(2);
  });
});

describe("a history row's figure", () => {
  const at360 = 218;
  const at320 = 178;
  it('sits beside the name at 360 on "Same day", the name taking two lines at most and no word cut', () => {
    for (const name of ['Volleyball', 'Running', 'Basketball', 'Swimming', 'Strength training', 'Yoga']) {
      expect(historyFigureBeside(name, '+290', 'added', at360)).toBe(true);
    }
  });
  it('takes a line of its own where the two do not fit: a long word, a long name, 320 px, larger text', () => {
    expect(historyFigureBeside('Stand-up paddleboarding', '+290', 'added', at360)).toBe(false);
    expect(historyFigureBeside('Cross-country skiing on a long trail', '+290', 'added', at360)).toBe(false);
    expect(historyFigureBeside('Volleyball', '+290', 'added', at320)).toBe(false);
    expect(historyFigureBeside('Volleyball', '+290', 'added', at360, 1.3)).toBe(false);
    // "Over 7 days" leaves no room beside a name, and "not added" too little for every row of a card alike:
    // a short name goes under too, so one card's rows never differ by the length of a name.
    expect(historyFigureBeside('Volleyball', '+290', 'added over 7 days', at360)).toBe(false);
    expect(historyFigureBeside('Running', '290', 'not added', at360)).toBe(false);
    expect(historyFigureBeside('Yoga', '+290', 'added', at320)).toBe(false);
    // A wider phone has the room.
    expect(historyFigureBeside('Volleyball', '290', 'not added', 393 - 40 - 102)).toBe(true);
  });
  it('holds its words together, breaking only before "over 7 days"', () => {
    expect(historyFigureWords('added')).toBe('\u00A0added');
    expect(historyFigureWords('not added')).toBe('\u00A0not\u00A0added');
    expect(historyFigureWords('added over 7 days')).toBe('\u00A0added over\u00A07\u00A0days');
  });
});

describe("a history row with text grown, from its words as drawn", () => {
  // The owner's phone, 381 px wide: the row's column is 381 - 40 - 102 = 239 px.
  const at381 = 239;
  const at360 = 218;
  // Widths as a phone draws them at 115% (whole pixels): "~290 kcal added", "Volleyball" (the reference word too).
  const volleyball = { figure: 122, name: 86, pieces: [86], minName: 86 };
  it('cuts a name where a line may break: at its spaces and after its hyphens', () => {
    expect(historyNamePieces('Strength training')).toEqual([
      { text: 'Strength', afterSpace: false },
      { text: 'training', afterSpace: true },
    ]);
    expect(historyNamePieces('Stand-up paddleboarding').map((p) => [p.text, p.afterSpace])).toEqual([
      ['Stand-', false],
      ['up', false],
      ['paddleboarding', true],
    ]);
  });
  it('draws the designed decision until every width is measured', () => {
    expect(historyFigureBesideMeasured('Volleyball', at381, null)).toBeNull();
    expect(historyFigureBesideMeasured('Volleyball', at381, { ...volleyball, minName: 0 })).toBeNull();
    // A name measured with other pieces (renamed meanwhile) is not taken.
    expect(historyFigureBesideMeasured('Strength training', at381, volleyball)).toBeNull();
    expect(historyFigureBesideMeasured('Volleyball', 0, volleyball)).toBeNull();
  });
  it('keeps the figure beside the name wherever the two, as drawn, fit (381 px at 115%)', () => {
    expect(historyFigureBesideMeasured('Volleyball', at381, volleyball)).toBe(true);
    // The estimate put it under: its characters times the text size are wider than the words drawn.
    expect(historyFigureBeside('Volleyball', '~290', 'added', at381, 1.15)).toBe(false);
    // A name of two words may take two lines beside it.
    expect(historyFigureBesideMeasured('Strength training', at381, { figure: 122, name: 145, pieces: [72, 68], minName: 86 })).toBe(true);
  });
  it('puts it under where they do not fit: a narrower phone, a wider figure, a word wider than its room, three lines', () => {
    // 360 px: 218 - 12 - 123 leaves 83, under "Volleyball" as drawn.
    expect(historyFigureBesideMeasured('Volleyball', at360, volleyball)).toBe(false);
    // "290 kcal not added" leaves too little beside it for any name, so every row of the card goes under alike.
    expect(historyFigureBesideMeasured('Yoga', at381, { figure: 160, name: 38, pieces: [38], minName: 86 })).toBe(false);
    // A word wider than its room is never broken inside.
    expect(historyFigureBesideMeasured('Stand-up paddleboarding', at381, { figure: 122, name: 200, pieces: [52, 20, 124], minName: 86 })).toBe(false);
    // Three lines beside it: under.
    expect(historyFigureBesideMeasured('Cross-country skiing on a long trail', at381, { figure: 122, name: 290, pieces: [50, 62, 52, 20, 10, 36, 40], minName: 86 })).toBe(false);
  });
  it('shares one rule with the estimate', () => {
    expect(figureFitsBeside(90, 88, [{ width: 80, gap: 4 }])).toBe(true);
    expect(figureFitsBeside(87, 88, [{ width: 40, gap: 4 }])).toBe(false);
    expect(figureFitsBeside(90, 88, [{ width: 91, gap: 0 }])).toBe(false);
    expect(figureFitsBeside(90, 88, [{ width: 50, gap: 0 }, { width: 50, gap: 5 }, { width: 50, gap: 5 }])).toBe(false);
  });
  it('holds the figure\'s words together while each held run fits the row, else lets them wrap at their spaces', () => {
    expect(figureWordsHold([], at381)).toBe(true);
    expect(figureWordsHold([138], at381)).toBe(true);
    // "~290 kcal added" / "over 7 days" at 320 px and 130%: each run fits 178.
    expect(figureWordsHold([139, 80], 178)).toBe(true);
    expect(figureWordsHold([178, 80], 178)).toBe(false);
  });
  it('keeps the line on one line wherever it fits as drawn, and balances two lines from the drawn parts', () => {
    const parts = ['Mon', '45 min', 'Moderate', '3.9 km'];
    expect(historyMetaLine(parts)).toBe('Mon\u00A0· 45\u00A0min\u00A0· Moderate\u00A0· 3.9\u00A0km');
    // 30 + 48 + 62 + 45 and three separators of 12: 221 fits 239.
    const drawn = { parts: [30, 48, 62, 45], line: 221 };
    expect(historyMetaLines(parts, at381, 1.3, drawn).lines).toBe(1);
    expect(historyMetaLines(parts, 220, 1.3, drawn).text).toBe('Mon\u00A0· 45\u00A0min\nModerate\u00A0· 3.9\u00A0km');
    // The estimate made "Yesterday · 75 min · Moderate" two lines at 320 and 130%; drawn 170 px wide, it fits 178.
    expect(historyMetaLines(['Yesterday', '75 min', 'Moderate'], 178, 1.3).lines).toBe(2);
    expect(historyMetaLines(['Yesterday', '75 min', 'Moderate'], 178, 1.3, { parts: [62, 44, 50], line: 170 }).lines).toBe(1);
    // Parts not all measured: the estimate.
    expect(historyMetaLines(['Yesterday', '75 min', 'Moderate'], 178, 1.3, { parts: [62, 0, 50], line: 170 }).lines).toBe(2);
  });
});

describe("the week card's strip, read as one image", () => {
  // Monday Nov 23 to Sunday Nov 29, 2026.
  const dates = ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29'];
  const byDate = Object.fromEntries(dates.map((d) => [d, { minutes: 0 }]));
  byDate['2026-11-23'] = { minutes: 75 };
  byDate['2026-11-24'] = { minutes: 1 };
  it('names what it shows, then every day with its value and units in full', () => {
    expect(weekStripLabel(dates, byDate, '2026-11-25')).toBe(
      'Minutes each day, this week: Monday, 75 minutes; Tuesday, 1 minute; Wednesday, today, none; Thursday, still to come; Friday, still to come; Saturday, still to come; Sunday, still to come',
    );
  });
  it('names a past week by its Monday, with no day still to come', () => {
    const label = weekStripLabel(dates, byDate, '2026-12-10');
    expect(label.startsWith('Minutes each day, week of Nov 23: Monday, 75 minutes;')).toBe(true);
    expect(label).not.toMatch(/to come|today/);
    expect(label.split(';')).toHaveLength(7);
  });
});
