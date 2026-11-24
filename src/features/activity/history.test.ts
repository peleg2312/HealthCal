import { describe, expect, it } from 'vitest';

import type { ActivityEntry } from '@/types';

import { historyDaySpoken, historyDayWord, historyFigureBeside, historyFigureWords, historyMetaLines, historyWeekLabel, historyWeeks, historyWeekTitle, weekStripLabel } from './history';

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
