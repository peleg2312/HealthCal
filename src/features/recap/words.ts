/**
 * Every word the month and year recaps say, as pure functions (the screens only place them). Neutral and
 * true: a month is described by what was logged, never judged. The days on budget use the one headline every
 * screen uses (`budgetDaysVerdict`), the water goal is "reached", workouts' minutes are "active minutes", and
 * nothing here may say "missed", "failed", "should", "great" or the other words of the morning page's banned
 * list (`words.test.ts`).
 */
import { formatShortDate } from '@/lib/dates';
import { weekRangeLabel } from '@/lib/insights';
import { formatNumber, mlToFlOz, weightUnit, weightValue } from '@/lib/units';
import type { ISODate, UnitSystem } from '@/types';

import type { ActivityFacts, WaterFacts } from './facts';
import { inProgress, yearKeyOf, type Period, type PeriodTally } from './period';

export const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);

/** The last two words held together, so a wrapped line never ends on one word alone ("a" / "day."). */
export const lastTwo = (s: string): string => s.replace(/ (\S+)$/, '\u00A0$1');

/** 'November' (with its year when that is not this year: 'November 2025'), or '2026'. */
export function periodName(p: Period, today: ISODate): string {
  if (p.kind === 'year') return p.key;
  const month = MONTH_LONG[Number(p.key.slice(5)) - 1];
  return p.key.slice(0, 4) === yearKeyOf(today) ? month : `${month} ${p.key.slice(0, 4)}`;
}

/** The screen's title: 'Your November', 'Your 2026'. */
export function periodTitle(p: Period, today: ISODate): string {
  return `Your ${periodName(p, today)}`;
}

/** The share card's title, in the first person as the day and week cards are: 'My November', 'My 2026'. */
export function cardTitle(p: Period, today: ISODate): string {
  return `My ${periodName(p, today)}`;
}

/** The share card's overline: 'NOVEMBER 2026', '2026'. */
export function cardOverline(p: Period): string {
  return p.kind === 'year' ? p.key : `${MONTH_LONG[Number(p.key.slice(5)) - 1]} ${p.key.slice(0, 4)}`.toUpperCase();
}

/** The header's short line: the days the figures cover ('Oct 1 – 31', 'So far · Nov 1 – 25', 'Oct 21 – Dec 31'). */
export function periodSubtitle(p: Period, tally: PeriodTally, today: ISODate): string {
  const range = weekRangeLabel(tally.from ?? p.start, tally.to ?? (today < p.end ? today : p.end));
  return inProgress(p, today) ? `So far · ${range}` : range;
}

/** The hero figure: the days with food logged of the days counted. */
export function daysFigure(tally: PeriodTally, p: Period, today: ISODate): { value: string; unit: string; label: string } {
  return {
    value: formatNumber(tally.logged),
    // One piece ("of 329 days"): with large text it may go under the number, never split itself.
    unit: `of\u00A0${formatNumber(tally.elapsed)}\u00A0${plural(tally.elapsed, 'day')}`,
    label: inProgress(p, today) ? 'with food logged so far' : 'with food logged',
  };
}

/** A total of water as a person reads it: litres with one decimal under 100 L, whole litres past it, fluid ounces whole. */
export function totalVolume(ml: number, units: UnitSystem): { value: string; unit: string } {
  if (units === 'imperial') return { value: formatNumber(Math.round(mlToFlOz(ml))), unit: 'fl oz' };
  if (ml < 1000) return { value: formatNumber(Math.round(ml)), unit: 'ml' };
  const l = ml / 1000;
  return { value: l >= 100 ? formatNumber(Math.round(l)) : formatNumber(Math.round(l * 10) / 10, 1).replace(/\.0$/, ''), unit: 'L' };
}

export function activityCaption(a: ActivityFacts): string {
  if (!a.workouts) return 'No workouts logged';
  return `${formatNumber(a.workouts)} ${plural(a.workouts, 'workout')} on ${formatNumber(a.days)} ${plural(a.days, 'day')}`;
}

export function waterCaption(w: WaterFacts): string {
  if (w.daysTracked) return `Goal reached on ${formatNumber(w.daysReached)} of ${formatNumber(w.daysTracked)} ${plural(w.daysTracked, 'day')} with water logged`;
  return w.totalMl > 0 ? 'From drinks logged in the diary' : 'No water logged';
}

/** The weight trend's figure and its line: where the smoothed trend ended, and where it started in the span. */
export function weightWords(startKg: number, endKg: number, startDate: ISODate, endDate: ISODate, units: UnitSystem): { value: string; unit: string; caption: string } {
  const v = (kg: number) => weightValue(kg, units).toFixed(1);
  return {
    value: v(endKg),
    unit: weightUnit(units),
    caption: `Trend on ${formatShortDate(endDate)}, from ${v(startKg)} ${weightUnit(units)} on ${formatShortDate(startDate)}`,
  };
}

/** The calm last line: what the period is now, said as a fact. */
export function closingLine(p: Period, tally: PeriodTally, today: ISODate): string {
  return lastTwo(closingWords(p, tally, today));
}

function closingWords(p: Period, tally: PeriodTally, today: ISODate): string {
  const name = periodName(p, today);
  if (inProgress(p, today)) return `${name} is still going. Each day you log fills its cup.`;
  if (!tally.logged) return 'Days you log fill their cups here.';
  if (tally.logged === tally.elapsed && tally.elapsed > 1) return `Every day of ${name} is in your diary, one cup a day.`;
  return `${name} is kept in your diary, one cup a day.`;
}

/** The empty state, when nothing at all was logged in the period. */
export function emptyWords(p: Period, today: ISODate): { title: string; message: string } {
  const name = periodName(p, today);
  return {
    title: lastTwo(inProgress(p, today) ? `Nothing logged in ${name} yet` : `Nothing logged in ${name}`),
    message: `Each day you log fills a cup here: the ${p.kind} in cups, your active minutes, your water and the food you log most.`,
  };
}

/** The cups as one picture to a screen reader: what they count, then each month of a year. */
export function gridLabel(p: Period, tally: PeriodTally, today: ISODate, months: { month: string; logged: number; elapsed: number }[] = []): string {
  const name = periodName(p, today);
  const parts = [`${name} in cups, one a day: food logged on ${tally.logged} of ${tally.elapsed} ${plural(tally.elapsed, 'day')}${inProgress(p, today) ? ' so far' : ''}.`];
  const { full, on, above } = tally.counts;
  if (full) parts.push(`${full} fully logged ${plural(full, 'day')}: ${on} on budget, ${above} above.`);
  if (tally.partial) parts.push(`${tally.partial} partly logged.`);
  if (p.kind === 'year' && months.length) parts.push([...months].reverse().map((m) => `${MONTH_LONG[Number(m.month.slice(5)) - 1]}, ${m.logged} of ${m.elapsed}`).join('; ') + '.');
  return parts.join(' ');
}

/** One month in a list of months: 'October 2026' over '26 of 31 days logged'. */
export function monthRowWords(month: string, logged: number, elapsed: number, today: ISODate): { title: string; caption: string } {
  const isNow = month === today.slice(0, 7);
  return {
    title: `${MONTH_LONG[Number(month.slice(5)) - 1]} ${month.slice(0, 4)}`,
    caption: `${formatNumber(logged)} of ${formatNumber(elapsed)} ${plural(elapsed, 'day')} logged${isNow ? ' so far' : ''}`,
  };
}

/** A year in a list: '2026' over '214 days logged so far'. */
export function yearRowWords(year: string, logged: number, today: ISODate): { title: string; caption: string } {
  return { title: year, caption: `${formatNumber(logged)} ${plural(logged, 'day')} logged${year === yearKeyOf(today) ? ' so far' : ''}` };
}

/** The one-time line on Progress when a month or a year has ended: 'Your October in cups'. */
export function offerLine(p: Period, today: ISODate): string {
  return `Your ${periodName(p, today)} in cups`;
}

export const OFFER_HIDDEN = 'Hidden. It stays under Month and year.';

/** How to read the cups, in the help sheet. A year's cups are too small for checks: its months' pages show them. */
export function helpParagraphs(kind: Period['kind']): string[] {
  return [
    'Each cup is one day, filled to how much of that day’s own budget you ate, so a full cup is a day right on its budget. An empty cup is a day with no food logged; the days before your first log have no cup.',
    kind === 'month'
      ? 'A check marks a fully logged day on budget: 90 to 100% of its own budget. Amber at the top marks a day above its budget, and such a day has no check. A lighter fill is a day partly logged, and a hatched cup is today, still in progress.'
      : 'Amber at the top marks a day above its budget. A lighter fill is a day partly logged, and a hatched cup is today, still in progress. Each month’s own page marks its days on budget with a check.',
    'Budgets change with workouts and with your plan, which is why each day is measured against its own.',
  ];
}
