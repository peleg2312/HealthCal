/**
 * Train's history: every workout grouped by calendar week (Monday first, as the week card above it),
 * newest week first, one card per week with its workouts as rows. Pure: no React, storage or clock;
 * `today` comes from the screen's clock hook.
 */
import { spokenUnits } from '@/features/progress/chartWords';
import { addDays, formatDuration, formatShortDate, fromISODate, startOfWeek, weekdayShort } from '@/lib/dates';
import type { ActivityEntry, ISODate } from '@/types';

export interface HistoryWeek {
  /** The week's Monday. */
  start: ISODate;
  /** "This week", "Last week", "Week of Nov 9" (with the year when it is not this year's). */
  title: string;
  /** Total time of the week's workouts, in minutes (as the week card's "Total time"). */
  minutes: number;
  /** Newest first: by day, then by when they were logged. */
  entries: ActivityEntry[];
}

/** How many weeks the history shows before "Show earlier sessions". */
export const WEEKS_PER_PAGE = 4;

const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** A week's title: this week and last week by name, every other one by its Monday. */
export function historyWeekTitle(start: ISODate, today: ISODate): string {
  const thisWeek = startOfWeek(today);
  if (start === thisWeek) return 'This week';
  if (start === addDays(thisWeek, -7)) return 'Last week';
  const year = fromISODate(start).getFullYear();
  return `Week of ${formatShortDate(start)}${year !== fromISODate(today).getFullYear() ? `, ${year}` : ''}`;
}

/**
 * A row's day inside its week's card: "Today", "Yesterday", else the short weekday ("Sun"), which the
 * card's title makes a date. The first part of the row's line ("Sun · 45 min · Moderate").
 */
export function historyDayWord(date: ISODate, today: ISODate): string {
  if (date === today) return 'Today';
  if (date === addDays(today, -1)) return 'Yesterday';
  if (date === addDays(today, 1)) return 'Tomorrow';
  return weekdayShort(date);
}

/** The same day, spoken in the row's label: "today", "yesterday", "Sunday". */
export function historyDaySpoken(date: ISODate, today: ISODate): string {
  const word = historyDayWord(date, today);
  return word === 'Today' || word === 'Yesterday' || word === 'Tomorrow' ? word.toLowerCase() : WEEKDAYS_LONG[fromISODate(date).getDay()];
}

/**
 * A history row's trash can, named so no two cans share a name: the workout, its full date and its length
 * ("Delete Volleyball, Tuesday, Nov 17, 60 minutes"). Never the clock: the date is the workout's own.
 */
export function deleteSessionLabel(entry: { name: string; date: ISODate; durationMin: number }): string {
  const minutes = Math.round(entry.durationMin);
  return `Delete ${entry.name}, ${WEEKDAYS_LONG[fromISODate(entry.date).getDay()]}, ${formatShortDate(entry.date)}, ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
}

/** Every workout in week groups, newest week first; empty weeks are left out. */
export function historyWeeks(activities: readonly ActivityEntry[], today: ISODate): HistoryWeek[] {
  const sorted = [...activities].sort((a, b) => b.date.localeCompare(a.date) || b.loggedAt.localeCompare(a.loggedAt));
  const weeks: HistoryWeek[] = [];
  for (const e of sorted) {
    const start = startOfWeek(e.date);
    const last = weeks[weeks.length - 1];
    if (last && last.start === start) {
      last.entries.push(e);
      last.minutes += e.durationMin;
    } else weeks.push({ start, title: historyWeekTitle(start, today), minutes: e.durationMin, entries: [e] });
  }
  return weeks;
}

/** The week card's spoken head: "This week, 3 sessions, 2 h 30 min". */
export function historyWeekLabel(week: HistoryWeek): string {
  const n = week.entries.length;
  // Units spoken in full ("2 hours 30 minutes"), as every spoken name says them (`spokenUnits`).
  return spokenUnits(`${week.title}, ${n} ${n === 1 ? 'session' : 'sessions'}, ${formatDuration(week.minutes)}`);
}

/**
 * A row's line under its name ("Today · 75 min · Moderate · 3.9 km"), laid out for the room it has: one line
 * when it fits, else two lines broken between its parts, balanced, so a part never sits alone on a line when
 * a split with two words on each line exists ("Sun · 45 min" / "Moderate · 3.9 km", never "…Moderate ·" /
 * "3.9 km"). A part never breaks inside (no-break spaces: "75 min", "3.9 km" stay whole). The width is an
 * estimate at the caption size (12.5 px Hanken Grotesk: under 6 px a character on these words; 6 errs on the
 * side of two lines), times the phone's text size; past two lines the text wraps by itself.
 */
export const META_CHAR_PX = 6;

const keep = (part: string) => part.replace(/ /g, ' ');
const words = (part: string) => part.split(/\s+/).filter(Boolean).length;

export function historyMetaLines(parts: readonly string[], roomPx: number, scale = 1): { text: string; lines: 1 | 2 } {
  const width = (ps: readonly string[]) => ps.join(' · ').length * META_CHAR_PX * scale;
  const line = (ps: readonly string[]) => ps.map(keep).join(' · ');
  if (parts.length < 2 || width(parts) <= roomPx) return { text: line(parts), lines: 1 };
  let best: { k: number; wide: number; full: boolean } | null = null;
  for (let k = 1; k < parts.length; k++) {
    const a = parts.slice(0, k);
    const b = parts.slice(k);
    const wide = Math.max(width(a), width(b));
    // Two words or more on each line: no word left alone.
    const full = a.reduce((n, p) => n + words(p), 0) >= 2 && b.reduce((n, p) => n + words(p), 0) >= 2;
    if (!best || (full && !best.full) || (full === best.full && wide < best.wide)) best = { k, wide, full };
  }
  const k = best!.k;
  return { text: `${line(parts.slice(0, k))}\n${line(parts.slice(k))}`, lines: 2 };
}

/**
 * Where a history row's figure goes ("+290 kcal added", the words from `budgetAddsShort`): beside the name, where
 * the diary sets a food's calories, when both fit there (the name may take two lines, breaking at its spaces and
 * hyphens, never inside a word); else on a line of its own under the name. Widths are estimates, as for the line
 * under it, times the phone's text size: the 15 px semibold name (7 to 8.5 px a character measured), the 17 px
 * Bricolage figure (about 10 a character) and the 13 px words after it (about 6).
 */
export const NAME_CHAR_PX = 8.5;
export const FIGURE_CHAR_PX = 10.5;
export const FIGURE_WORDS_CHAR_PX = 6.3;
/** The gap between the name and the figure beside it. */
export const FIGURE_GAP = 12;
/**
 * The least room a figure leaves beside it for a name (about "Volleyball" at the phone's text size). Under it the
 * figure goes under the name on every row alike ("290 kcal not added" at 360, everything at 320), so the rows of
 * one card differ only for a name with a very long word.
 */
export const MIN_NAME_ROOM = 88;

export function historyFigureBeside(name: string, figure: string, words: string, roomPx: number, scale = 1): boolean {
  const figureWide = (figure.length * FIGURE_CHAR_PX + ` kcal ${words}`.length * FIGURE_WORDS_CHAR_PX) * scale;
  const nameRoom = roomPx - FIGURE_GAP - figureWide;
  if (nameRoom < MIN_NAME_ROOM * scale) return false;
  // The name's words wrapped greedily into lines that wide (a hyphen is a place to break, as on a phone).
  let lines = 1;
  let used = 0;
  for (const word of name.replace(/-/g, '- ').split(/\s+/).filter(Boolean)) {
    const wide = word.length * NAME_CHAR_PX * scale;
    if (wide > nameRoom) return false;
    const next = used ? used + NAME_CHAR_PX * scale + wide : wide;
    if (next <= nameRoom) used = next;
    else {
      lines += 1;
      used = wide;
    }
  }
  return lines <= 2;
}

/**
 * The figure's words as drawn after "kcal", held to it and to each other with no-break spaces but one, before
 * "over 7 days": under the name the figure is one line at 360 and, where it is not, breaks only there
 * ("+290 kcal added" / "over 7 days"), so no word is left alone.
 */
export function historyFigureWords(words: string): string {
  return ` ${words.replace(/ /g, ' ').replace(' over', ' over')}`;
}
