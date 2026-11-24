/**
 * The training overview: the last 7 days of workouts against the person's own recent weeks, in
 * plain words (the specification's section 2). Pure: no React, no storage, and no clock (today
 * comes in), so a tab that stays mounted never shows a stale week and a test is exact.
 *
 * The rule:
 * - `a` = guideline minutes (`guidelineMinutes`, the one rule Train, Progress and the recap use) of
 *   the last 7 days: today and the 6 before. `c` = the guideline minutes of the 21 days before
 *   those, divided by 3: kept apart from the 7, so the week is not compared with itself.
 *   `r = a / c`, a description, not a risk score: the bands are borrowed from team sport (Gabbett
 *   2016) and the ratio predicts no injury (Impellizzeri et al. 2021).
 * - Enough history: the first session on the phone is 21 days old or more, and `c` is 60 or more.
 *   Without it there is no state: Train's card keeps its line as it was.
 * - States, each with one of three positions (lighter, usual, more):
 *   r under 0.8 "Lighter than your recent weeks"; 0.8 to 1.3 "About your usual"; above 1.3 "More
 *   than your recent weeks"; 1.5 or more with `a` above 150 "A big step up", or "One big day" when
 *   one day holds half or more of `a`. Hard sessions on 4 or more days in a row, or on 6 or more of
 *   the 7, is "A full week, few easy days", which wins over every state but "One big day".
 * - A Hard session is one logged as Hard (`intensity: 'vigorous'`); an easy day is a day without
 *   one; a rest day is a day without any session.
 * - Strength: ONE list (`STRENGTH_IDS`, plus any session that holds exercises). HIIT, circuits and
 *   CrossFit are not on it, although the catalogue files them under strength. It gives the strength
 *   days and "mostly strength" (strength guideline minutes are half of `a` or more), which replaces
 *   the WHO band sentence: WHO counts strength days apart from the aerobic minutes.
 * - At or under 150 guideline minutes there is never a next step toward less: WHO counts more as
 *   better there.
 * The comparisons are made on whole numbers (15a < 4 sum is r < 0.8), so a band edge is exact.
 */
import { addDays, diffDays, fromISODate } from '@/lib/dates';
import { sessionGuidelineMinutes } from '@/lib/exercise';
import { formatNumber } from '@/lib/units';
import type { ActivityEntry, ISODate } from '@/types';

/** What the overview reads from a workout. Live `activities` records fit as they are. */
export type LoadSession = Pick<ActivityEntry, 'date' | 'activityId' | 'intensity' | 'durationMin' | 'met'> & {
  id?: string;
  exercises?: readonly unknown[];
  deleted?: boolean;
};

export type LoadStateKey = 'lighter' | 'usual' | 'more' | 'stepUp' | 'oneBigDay' | 'fullWeek';
export type LoadPosition = 'lighter' | 'usual' | 'more';

/** The one strength list (WHO's muscle-strengthening activity), with any session that holds exercises. */
export const STRENGTH_IDS: readonly string[] = ['strength_training', 'calisthenics', 'bodyweight_training', 'kettlebell'];

export const LIGHTER_BELOW = 0.8;
export const USUAL_UP_TO = 1.3;
export const STEP_UP_FROM = 1.5;
/** A step up and a next step toward an easy day only above this many guideline minutes. */
export const STEP_UP_ABOVE_MINUTES = 150;
export const BIG_DAY_SHARE = 0.5;
export const HARD_DAYS_IN_A_ROW = 4;
export const HARD_DAYS_OF_SEVEN = 6;
export const HISTORY_DAYS = 21;
export const MIN_RECENT_AVERAGE = 60;

export const LOAD_TITLES: Record<LoadStateKey, string> = {
  lighter: 'Lighter than your recent weeks',
  usual: 'About your usual',
  more: 'More than your recent weeks',
  stepUp: 'A big step up',
  oneBigDay: 'One big day',
  fullWeek: 'A full week, few easy days',
};

export const POSITION_OF: Record<LoadStateKey, LoadPosition> = {
  lighter: 'lighter',
  usual: 'usual',
  more: 'more',
  stepUp: 'more',
  oneBigDay: 'more',
  fullWeek: 'more',
};

export const POSITIONS: readonly LoadPosition[] = ['lighter', 'usual', 'more'];
export const POSITION_WORDS: Record<LoadPosition, string> = { lighter: 'Lighter', usual: 'Usual', more: 'More' };
/** How the three-position marks (the card's small cups, the sheet's scale) are read aloud: "Usual, of lighter, usual and more". */
export function positionLabel(position: LoadPosition): string {
  return `${POSITION_WORDS[position]}, of lighter, usual and more`;
}
/** What Train's line opens, said after the line itself (the line is one button). */
export const OVERVIEW_ABOUT = 'About your last 7 days of training';

export const NEEDS_HISTORY = 'Your usual needs 3 weeks of workouts.';
export const LIGHTER_NOTE = 'A lighter week is part of training too.';
export const STEP_SETTLE = 'An easy day or a rest day lets the work settle.';
export const STEP_EASY = 'Easy days are part of training.';

export const HONEST_PHONE =
  'From the workouts on this phone. Training you did not log, or that was not synced, is not counted, so a week can look lighter than it was.';
export const HONEST_COMPARE = 'This compares your minutes with your own recent weeks. It is a description, not a measure of injury risk.';
export const HONEST_WHO = "WHO's guideline for adults is 150 to 300 minutes a week; more than 300 can bring extra benefit.";
export const HONEST_COUNTING = 'Hard minutes (6 MET or more) count double; light sessions (under 3 MET) are not counted.';
/** Under the sheet's chart of the five 7-day blocks. */
export const CHART_CAPTION = 'Each bar is 7 days, weeks back. The band is 150 to 300.';
/** The heading over the honest sentences, which close the sheet under its one action. */
export const HOW_COUNTED = 'How this is counted';
export function strengthWho(days: number): string {
  return `Strength on ${plural(days, 'day')}. WHO counts strength days apart from the 150 to 300 aerobic minutes.`;
}

export interface LoadBlock {
  from: ISODate;
  to: ISODate;
  /** Guideline minutes in these 7 days. */
  minutes: number;
  /** The bar's label: '4 wk' (weeks back) ... '1 wk', 'Last 7'. */
  label: string;
  /** 'Nov 17 to Nov 23 · 15 min'. */
  detail: string;
}

export interface LoadCounts {
  /** Sessions in the last 7 days. */
  sessions: number;
  /** Days of the last 7 with no session. */
  restDays: number;
  /** Days of the last 7 with no Hard session (rest days included). */
  easyDays: number;
  /** Days of the last 7 with a Hard session. */
  hardDays: number;
  /** The longest run of consecutive Hard days in the last 7. */
  hardInARow: number;
  /** Distinct days of the last 7 with a session from the strength list. */
  strengthDays: number;
  /** Guideline minutes of those strength sessions. */
  strengthMinutes: number;
  /** The day with the most guideline minutes (the latest on a tie), null with none. */
  bigDay: ISODate | null;
  bigDayMinutes: number;
  /** bigDayMinutes / a, 0 with no minutes. */
  bigDayShare: number;
}

export interface TrainingOverview {
  today: ISODate;
  /** The first day of the last 7 (today - 6). */
  from: ISODate;
  /** `a`: guideline minutes of the last 7 days. */
  minutes: number;
  /** `c`, rounded to a whole minute; null with no history at all. */
  recentAverage: number | null;
  /** `r = a / c` to two decimals; null when `c` is 0. */
  ratio: number | null;
  enoughHistory: boolean;
  /** Null without enough history: then the card keeps its old line. */
  state: LoadStateKey | null;
  position: LoadPosition | null;
  title: string | null;
  /** NEEDS_HISTORY without enough history, else null. */
  lead: string | null;
  /** The numbers, then at most one fact and at most one next step. */
  lines: string[];
  counts: LoadCounts;
  /** '2 days without a session. Strength on 1 day.' */
  countsLine: string;
  /** The honest sentences, in the sheet's order. */
  honest: string[];
  mostlyStrength: boolean;
  /** Five blocks of 7 days, oldest first; the last is the last 7 days. */
  blocks: LoadBlock[];
  /** The card's accessibility label, starting "Last 7 days"; null without a state. */
  cardLabel: string | null;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function plural(n: number, word: string): string {
  return `${formatNumber(n)} ${word}${n === 1 ? '' : 's'}`;
}

function shortDate(d: ISODate): string {
  const x = fromISODate(d);
  return `${MONTHS[x.getMonth()]} ${x.getDate()}`;
}

/** "today", "yesterday" or "on Wednesday". */
function onDay(d: ISODate, today: ISODate): string {
  if (d === today) return 'today';
  if (d === addDays(today, -1)) return 'yesterday';
  return `on ${WEEKDAYS[fromISODate(d).getDay()]}`;
}

/** "1.4", "4", "12": one decimal under 10, never a trailing ".0". */
function times(r: number): string {
  const v = r >= 10 ? Math.round(r) : Math.round(r * 10) / 10;
  return formatNumber(v, Number.isInteger(v) ? 0 : 1);
}

const isStrength = (s: LoadSession) => STRENGTH_IDS.includes(s.activityId) || (s.exercises?.length ?? 0) > 0;
const isHard = (s: LoadSession) => s.intensity === 'vigorous';
const gm = (s: LoadSession) => sessionGuidelineMinutes(s.met, s.durationMin, s.intensity);

/**
 * The overview of the last 7 days ending `today`, from every workout the phone holds (pass the live
 * records; deleted ones and ones dated after today are left out here too).
 */
export function trainingOverview(activities: readonly LoadSession[], today: ISODate): TrainingOverview {
  const live = activities.filter((s) => !s.deleted && s.date <= today);
  const from = addDays(today, -6);
  const last7 = live.filter((s) => s.date >= from);
  const recentFrom = addDays(today, -27);
  const sum = live.filter((s) => s.date >= recentFrom && s.date < from).reduce((t, s) => t + gm(s), 0);
  const a = last7.reduce((t, s) => t + gm(s), 0);
  const first = live.reduce<ISODate | null>((m, s) => (m === null || s.date < m ? s.date : m), null);

  // Per day of the last 7, oldest first.
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  const perDay = days.map((d) => {
    const ss = last7.filter((s) => s.date === d);
    return { date: d, sessions: ss.length, minutes: ss.reduce((t, s) => t + gm(s), 0), hard: ss.some(isHard), strength: ss.some(isStrength) };
  });
  let run = 0;
  let hardInARow = 0;
  for (const d of perDay) {
    run = d.hard ? run + 1 : 0;
    hardInARow = Math.max(hardInARow, run);
  }
  const big = perDay.reduce<(typeof perDay)[number] | null>((m, d) => (d.minutes > 0 && (m === null || d.minutes >= m.minutes) ? d : m), null);
  const strengthMinutes = last7.filter(isStrength).reduce((t, s) => t + gm(s), 0);
  const counts: LoadCounts = {
    sessions: last7.length,
    restDays: perDay.filter((d) => d.sessions === 0).length,
    easyDays: perDay.filter((d) => !d.hard).length,
    hardDays: perDay.filter((d) => d.hard).length,
    hardInARow,
    strengthDays: perDay.filter((d) => d.strength).length,
    strengthMinutes,
    bigDay: big?.date ?? null,
    bigDayMinutes: big?.minutes ?? 0,
    bigDayShare: a > 0 && big ? big.minutes / a : 0,
  };
  const mostlyStrength = a > 0 && 2 * strengthMinutes >= a;

  const enoughHistory = first !== null && diffDays(first, today) >= HISTORY_DAYS && sum >= 3 * MIN_RECENT_AVERAGE;
  // The bands on whole numbers: r = 3a / sum.
  const lighterBand = 15 * a < 4 * sum; // r < 0.8
  const aboveUsual = 30 * a > 13 * sum; // r > 1.3
  const stepUpBand = 2 * a >= sum && a > STEP_UP_ABOVE_MINUTES; // r >= 1.5 and a above 150
  const fullWeek = hardInARow >= HARD_DAYS_IN_A_ROW || counts.hardDays >= HARD_DAYS_OF_SEVEN;
  const oneBig = stepUpBand && a > 0 && 2 * counts.bigDayMinutes >= a;

  let state: LoadStateKey | null = null;
  if (enoughHistory) {
    if (oneBig) state = 'oneBigDay';
    // Not on a week that is lighter than usual: four short Hard sessions in a row are not "a full week".
    else if (fullWeek && !lighterBand) state = 'fullWeek';
    else if (stepUpBand) state = 'stepUp';
    else if (aboveUsual) state = 'more';
    else if (!lighterBand) state = 'usual';
    else state = 'lighter';
  }

  const c = sum / 3;
  const recentAverage = first === null ? null : Math.round(c);
  const ratio = sum > 0 ? Math.round(((3 * a) / sum) * 100) / 100 : null;
  const aWords = `${plural(Math.round(a), 'guideline minute')} in the last 7 days`;

  const lines: string[] = [];
  if (!state) lines.push(`${aWords}.`);
  else {
    const C = formatNumber(Math.round(c));
    if (lighterBand) lines.push(`${aWords}, against your recent average of ${C}.`);
    else if (!aboveUsual) lines.push(`${aWords}, close to your recent average of ${C}.`);
    else lines.push(`${aWords}, about ${times((3 * a) / sum)} times your recent average of ${C}.`);
    if (state === 'fullWeek') {
      if (counts.hardDays === 7) lines.push('Hard sessions on each of the last 7 days.');
      else if (counts.hardDays >= HARD_DAYS_OF_SEVEN) lines.push(`Hard sessions on ${counts.hardDays} of the last 7 days.`);
      else lines.push(`Hard sessions on ${hardInARow} days in a row.`);
      lines.push(STEP_EASY);
    } else if (state === 'oneBigDay' && counts.bigDay) {
      lines.push(`${formatNumber(Math.round(counts.bigDayMinutes))} of them ${onDay(counts.bigDay, today)}.`);
      lines.push(STEP_SETTLE);
    } else if (state === 'lighter') lines.push(LIGHTER_NOTE);
    else if ((state === 'more' || state === 'stepUp') && a > STEP_UP_ABOVE_MINUTES) lines.push(STEP_SETTLE);
  }

  const rest =
    counts.restDays === 0 ? 'A session on each of the last 7 days.' : `${plural(counts.restDays, 'day')} without a session.`;
  const strength = counts.strengthDays === 0 ? 'No strength sessions.' : `Strength on ${plural(counts.strengthDays, 'day')}.`;
  const countsLine = `${rest} ${strength}`;

  const honest = [HONEST_PHONE, ...(state ? [HONEST_COMPARE] : []), mostlyStrength ? strengthWho(counts.strengthDays) : HONEST_WHO, HONEST_COUNTING];

  const blocks: LoadBlock[] = [4, 3, 2, 1, 0].map((w) => {
    const to = addDays(today, -7 * w);
    const bFrom = addDays(to, -6);
    const minutes = Math.round(live.filter((s) => s.date >= bFrom && s.date <= to).reduce((t, s) => t + gm(s), 0));
    return { from: bFrom, to, minutes, label: w === 0 ? 'Last 7' : `${w} wk`, detail: `${shortDate(bFrom)} to ${shortDate(to)} · ${formatNumber(minutes)} min` };
  });

  const title = state ? LOAD_TITLES[state] : null;
  return {
    today,
    from,
    minutes: Math.round(a),
    recentAverage,
    ratio,
    enoughHistory,
    state,
    position: state ? POSITION_OF[state] : null,
    title,
    lead: state ? null : NEEDS_HISTORY,
    lines,
    counts,
    countsLine,
    honest,
    mostlyStrength,
    blocks,
    cardLabel: title ? `Last 7 days: ${title}. ${lines[0]}` : null,
  };
}

/**
 * The same overview as one paragraph of text, for an answer given on the phone (the chat's "How is
 * my training week?" button): the title, the lines, the counts and where the numbers come from.
 */
export function overviewAnswer(o: TrainingOverview): string {
  const head = o.title ? `Last 7 days: ${o.title}.` : (o.lead ?? '');
  return [head, ...o.lines, o.countsLine, HONEST_PHONE].filter(Boolean).join(' ');
}
