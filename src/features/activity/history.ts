/**
 * Train's history: every workout grouped by calendar week (Monday first, as the week card above it),
 * newest week first, one card per week with its workouts as rows. Pure: no React, storage or clock;
 * `today` comes from the screen's clock hook.
 */
import { MEASURE_SLACK } from '@/features/drinks/grownFit';
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

/**
 * The same day, spoken in the row's label: "today", "yesterday", else the weekday with its date ("Sunday, Nov 15"),
 * so two rows of the same workout on the same weekday of different weeks never share a name (as `deleteSessionLabel`).
 */
export function historyDaySpoken(date: ISODate, today: ISODate): string {
  const word = historyDayWord(date, today);
  return word === 'Today' || word === 'Yesterday' || word === 'Tomorrow' ? word.toLowerCase() : `${WEEKDAYS_LONG[fromISODate(date).getDay()]}, ${formatShortDate(date)}`;
}

/**
 * A history row's trash can, named so no two cans share a name: the workout, its full date and its length
 * ("Delete Volleyball, Tuesday, Nov 17, 60 minutes"). Never the clock: the date is the workout's own.
 */
export function deleteSessionLabel(entry: { name: string; date: ISODate; durationMin: number }): string {
  const minutes = Math.round(entry.durationMin);
  return `Delete ${entry.name}, ${WEEKDAYS_LONG[fromISODate(entry.date).getDay()]}, ${formatShortDate(entry.date)}, ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
}

/**
 * Train's week strip as one image for a screen reader, as the kit charts are: what it shows, then the seven
 * values, each day by name ("Minutes each day, this week: Monday, 75 minutes; Tuesday, today, 75 minutes;
 * Wednesday, still to come; ..."). A day with nothing logged says "none"; a day after today "still to come".
 * Units in full. `today` comes from the screen's clock hook.
 */
export function weekStripLabel(dates: readonly ISODate[], byDate: Readonly<Record<string, { minutes: number }>>, today: ISODate): string {
  const days = dates.map((d) => {
    const name = WEEKDAYS_LONG[fromISODate(d).getDay()];
    const day = d === today ? `${name}, today` : name;
    if (d > today) return `${day}, still to come`;
    const m = Math.round(byDate[d]?.minutes ?? 0);
    return `${day}, ${m === 0 ? 'none' : `${m} ${m === 1 ? 'minute' : 'minutes'}`}`;
  });
  const which = dates.includes(today) ? 'this week' : `week of ${formatShortDate(dates[0])}`;
  return `Minutes each day, ${which}: ${days.join('; ')}`;
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
 * "3.9 km"). A part never breaks inside (no-break spaces: "75 min", "3.9 km" stay whole). At the designed size
 * the width is an estimate at the caption size (12.5 px Hanken Grotesk: under 6 px a character on these words; 6
 * errs on the side of two lines), times the phone's text size; with text grown (through `VERY_LARGE_TEXT`) the row
 * passes `measured`, its parts and its whole line as drawn on the device (`MeasureEach`), so the line is one line
 * wherever it fits. Past two lines the text wraps by itself.
 */
export const META_CHAR_PX = 6;

const keep = (part: string) => part.replace(/ /g, '\u00A0');
const words = (part: string) => part.split(/\s+/).filter(Boolean).length;

/** The parts' words as drawn on one line, with their separators (what a row measures as its whole line). */
export function historyMetaLine(parts: readonly string[]): string {
  // A no-break space before each dot, so a line never starts with one.
  return parts.map(keep).join('\u00A0· ');
}

/** Widths as drawn: each part (no-break spaces kept) and the whole line, the separators' room is what is left. */
export interface MetaMeasure {
  parts: readonly number[];
  line: number;
}

export function historyMetaLines(parts: readonly string[], roomPx: number, scale = 1, measured?: MetaMeasure | null): { text: string; lines: 1 | 2 } {
  const ok = !!measured && measured.parts.length === parts.length && measured.parts.every((w) => w > 0) && measured.line > 0;
  // One separator's room as drawn: the whole line less its parts, shared between its separators.
  const sep = ok && parts.length > 1 ? Math.max(0, (measured!.line - measured!.parts.reduce((a, w) => a + w, 0)) / (parts.length - 1)) : 0;
  // The width of parts [from, to) on one line: as drawn (a measured width counts `MEASURE_SLACK` more, as whole
  // pixels may be under the drawn width), else the estimate.
  const width = (from: number, to: number) =>
    ok ? measured!.parts.slice(from, to).reduce((a, w) => a + w, 0) + sep * (to - from - 1) + MEASURE_SLACK : parts.slice(from, to).join(' · ').length * META_CHAR_PX * scale;
  const line = (ps: readonly string[]) => historyMetaLine(ps);
  const whole = ok ? measured!.line + MEASURE_SLACK : width(0, parts.length);
  if (parts.length < 2 || whole <= roomPx) return { text: line(parts), lines: 1 };
  let best: { k: number; wide: number; full: boolean } | null = null;
  for (let k = 1; k < parts.length; k++) {
    const a = parts.slice(0, k);
    const b = parts.slice(k);
    const wide = Math.max(width(0, k), width(k, parts.length));
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
 * after its hyphens, never inside a word); else on a line of its own under the name. One rule, `figureFitsBeside`,
 * on widths from one of two sources: at the designed size (and with very large text) estimates, times the phone's
 * text size (`historyFigureBeside`: the 15 px semibold name, 7 to 8.5 px a character measured, the 17 px
 * Bricolage figure, about 10 a character, and the 13 px words after it, about 6); with text grown through
 * `VERY_LARGE_TEXT` (the phone's 1.15 and 1.3, the app's 115% and 130%) the widths as drawn on the device
 * (`historyFigureBesideMeasured`, measured by the row with `MeasureEach`), so the figure stays beside the name
 * wherever the two really fit, and goes under only where they do not.
 */
export const NAME_CHAR_PX = 8.5;
export const FIGURE_CHAR_PX = 10.5;
export const FIGURE_WORDS_CHAR_PX = 6.3;
/** The gap between the name and the figure beside it. */
export const FIGURE_GAP = 12;
/**
 * The least room a figure leaves beside it for a name (about "Volleyball" at the phone's text size; measured, the
 * word `MIN_NAME_WORD` as drawn). Under it the figure goes under the name on every row alike ("290 kcal not added"
 * at 360, everything at 320), so the rows of one card differ only for a name with a very long word.
 */
export const MIN_NAME_ROOM = 88;
export const MIN_NAME_WORD = 'Volleyball';

/**
 * A name's pieces where a line may break: at its spaces and after its hyphens ("Stand-up paddleboarding" is
 * "Stand-", "up" and "paddleboarding"); `afterSpace` is false for a piece that follows a hyphen.
 */
export function historyNamePieces(name: string): { text: string; afterSpace: boolean }[] {
  const out: { text: string; afterSpace: boolean }[] = [];
  for (const word of name.split(/\s+/).filter(Boolean)) {
    word
      .split('-')
      .map((text, i, all) => (i < all.length - 1 ? `${text}-` : text))
      .filter(Boolean)
      .forEach((text, i) => out.push({ text, afterSpace: i === 0 && out.length > 0 }));
  }
  return out;
}

/**
 * The one rule: the figure beside the name when the room it leaves (`nameRoom`) is at least `minName` and the
 * name's pieces, wrapped greedily into lines that wide (each after its `gap`, the room before it on the same line),
 * take two lines at most, no piece wider than the room (a word is never broken inside).
 */
export function figureFitsBeside(nameRoom: number, minName: number, pieces: readonly { width: number; gap: number }[]): boolean {
  if (nameRoom < minName) return false;
  let lines = 1;
  let used = 0;
  for (const p of pieces) {
    if (p.width > nameRoom) return false;
    const next = used ? used + p.gap + p.width : p.width;
    if (next <= nameRoom) used = next;
    else {
      lines += 1;
      used = p.width;
    }
  }
  return lines <= 2;
}

/** `figureFitsBeside` on estimated widths, times the phone's text size (the designed size, and very large text). */
export function historyFigureBeside(name: string, figure: string, words: string, roomPx: number, scale = 1): boolean {
  const figureWide = (figure.length * FIGURE_CHAR_PX + ` kcal ${words}`.length * FIGURE_WORDS_CHAR_PX) * scale;
  // Every piece after the first is a space's room (a character) from the one before it.
  const pieces = name
    .replace(/-/g, '- ')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => ({ width: word.length * NAME_CHAR_PX * scale, gap: NAME_CHAR_PX * scale }));
  return figureFitsBeside(roomPx - FIGURE_GAP - figureWide, MIN_NAME_ROOM * scale, pieces);
}

/**
 * Widths as drawn on the device (whole pixels): the figure on one line with its words, the name on one line, each
 * of its pieces (`historyNamePieces`) and the word `MIN_NAME_WORD`, all in the row's own type.
 */
export interface FigureMeasure {
  figure: number;
  name: number;
  pieces: readonly number[];
  minName: number;
}

/**
 * `figureFitsBeside` on widths as drawn (text grown, through `VERY_LARGE_TEXT`). A space's room is the name's whole
 * line less its pieces, shared between its spaces; every measured width counts `MEASURE_SLACK` more (whole pixels
 * may be under the drawn width), so the two are taken to fit only where they really do. Null until every width is
 * measured (the row draws its designed decision meanwhile).
 */
export function historyFigureBesideMeasured(name: string, roomPx: number, m: FigureMeasure | null | undefined): boolean | null {
  const pieces = historyNamePieces(name);
  if (!m || !(m.figure > 0 && m.name > 0 && m.minName > 0 && roomPx > 0) || m.pieces.length !== pieces.length || m.pieces.some((w) => !(w > 0))) return null;
  const spaces = pieces.filter((p) => p.afterSpace).length;
  const space = spaces ? Math.max(0, (m.name - m.pieces.reduce((a, w) => a + w, 0)) / spaces) : 0;
  return figureFitsBeside(
    roomPx - FIGURE_GAP - (m.figure + MEASURE_SLACK),
    m.minName,
    pieces.map((p, i) => ({ width: m.pieces[i] + MEASURE_SLACK, gap: p.afterSpace ? space : 0 })),
  );
}

/**
 * Whether the figure's words may be held together as `historyFigureWords` holds them (breaking only before "over
 * 7 days") where it has `roomPx` on a line of its own: while each of its held runs, as drawn, fits the room. Else
 * (a narrow phone with grown text) the words wrap at their spaces rather than run past the row. `runs` are the
 * held runs as drawn: the whole figure, or the figure to its first word and "over 7 days". True until measured.
 */
export function figureWordsHold(runs: readonly number[], roomPx: number): boolean {
  if (!(roomPx > 0) || !runs.length || runs.some((w) => !(w > 0))) return true;
  return runs.every((w) => w + MEASURE_SLACK <= roomPx);
}

/**
 * The figure's words as drawn after "kcal", held to it and to each other with no-break spaces but one, before
 * "over 7 days": under the name the figure is one line at 360 and, where it is not, breaks only there
 * ("+290 kcal added" / "over 7 days"), so no word is left alone.
 */
export function historyFigureWords(words: string): string {
  return ` ${words.replace(/ /g, ' ').replace(' over', ' over')}`;
}
