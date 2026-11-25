/**
 * Text alternatives for the charts on Water, Sleep, Weight, Consistency, Progress and Train: one name per
 * chart that a screen reader reads as one image. Each starts with a summary (what the chart shows, over
 * which days, the reference line) and then gives every value in order, with its unit spoken in full
 * ("2.1 litres", "2,050 kilocalories"), so the chart says what a sighted person reads off it. A line with
 * many points names evenly spaced values and where the full list is. Pure: no React, no clock.
 */
import { formatShortDate, fromISODate } from '@/lib/dates';
import type { TrendPoint } from '@/lib/trend';
import { weightRangePoints, weightText, type WeightRange } from '@/features/trackers/helpers';
import { formatNumber, formatVolume } from '@/lib/units';
import type { ISODate, UnitSystem } from '@/types';

const DAY_NAMES: Record<string, string> = { Sun: 'Sunday', Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday' };
const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Units and short day names spoken in full: "1.2 L" -> "1.2 litres", "350 kcal" -> "350 kilocalories", "Mon" -> "Monday". */
export function spokenUnits(text: string): string {
  return text
    .replace(/\b(Sun|Mon|Tue|Wed|Thu|Fri|Sat)\b(?!day)/g, (d) => DAY_NAMES[d])
    .replace(/(\d)\s?fl oz\b/g, '$1 fluid ounces')
    .replace(/\bkcal\b/g, 'kilocalories')
    .replace(/(\d)\s?L\b/g, '$1 litres')
    .replace(/(\d)\s?ml\b/g, '$1 millilitres')
    .replace(/(\d)\s?kg\b/g, '$1 kilograms')
    .replace(/(\d)\s?lb\b/g, '$1 pounds')
    .replace(/(\d)\s?km\b/g, '$1 kilometres')
    .replace(/(\d)\s?mi\b/g, '$1 miles')
    .replace(/\b1 h\b/g, '1 hour')
    .replace(/(\d)\s?h\b/g, '$1 hours')
    .replace(/\b1 min\b/g, '1 minute')
    .replace(/(\d)\s?min\b/g, '$1 minutes')
    .replace(/(\d)\s?g\b/g, '$1 grams');
}

/** One chart's name: the summary, then each point ("Monday 2.1 litres"), in the order drawn. */
export function chartLabel(summary: string, points: readonly string[]): string {
  const head = spokenUnits(summary).replace(/[.\s]+$/, '');
  return points.length ? `${head}. ${points.map(spokenUnits).join(', ')}.` : `${head}.`;
}

/** "today", "Wednesday" or "Nov 3": how a chart's point is named, from its date (never the clock). */
export function pointDay(date: ISODate, today: ISODate, byWeekday: boolean): string {
  if (date === today) return 'today';
  return byWeekday ? WEEKDAYS_LONG[fromISODate(date).getDay()] : formatShortDate(date);
}

/** Water's last 7 days: "Water by day, last 7 days, goal 3.3 litres, reached on 3 of 7 days. Wednesday 2.1 litres, …". */
export function waterChartLabel(days: readonly { date: ISODate; ml: number; goalMl: number }[], today: ISODate, units: UnitSystem): string {
  const goal = days[days.length - 1]?.goalMl ?? 0;
  const reached = days.filter((d) => d.goalMl > 0 && d.ml >= d.goalMl).length;
  const span = days.length ? `${formatShortDate(days[0].date)} to ${days[days.length - 1].date === today ? 'today' : formatShortDate(days[days.length - 1].date)}` : '';
  const summary = `Water by day, ${span}, goal ${formatVolume(goal, units)}, reached on ${reached} of ${days.length} days`;
  return chartLabel(summary, days.map((d) => `${pointDay(d.date, today, true)} ${d.ml > 0 ? formatVolume(d.ml, units) : 'none'}`));
}

/** "7 h 15 min" from hours, for a spoken sleep value. */
function hoursWords(hours: number): string {
  const mins = Math.round(hours * 60);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Sleep by night: "Sleep by night, last 7 nights, 7 to 9 hours shaded. Monday 7 hours 15 minutes, Tuesday not logged, …". */
export function sleepChartLabel(series: readonly { date: ISODate; hours: number }[], today: ISODate): string {
  const byWeekday = series.length <= 7;
  const logged = series.filter((d) => d.hours > 0).length;
  const summary = `Sleep by night, last ${series.length} nights, ${logged} logged, the 7 to 9 hour range shaded`;
  return chartLabel(summary, series.map((d) => `${pointDay(d.date, today, byWeekday)} ${d.hours > 0 ? hoursWords(d.hours) : 'not logged'}`));
}

/** Up to `max` evenly spaced items, always the first and the last. */
export function evenly<T>(items: readonly T[], max: number): T[] {
  if (items.length <= max) return [...items];
  const out: T[] = [];
  for (let i = 0; i < max; i++) out.push(items[Math.round((i * (items.length - 1)) / (max - 1))]);
  return out.filter((x, i) => out.indexOf(x) === i);
}

/**
 * The weight chart, from the same window `weightChartData` draws: the trend from its first to its last day,
 * the goal, the weigh-ins' low and high, then the trend at up to 12 evenly spaced days, and where every
 * weigh-in is listed (History, under the chart).
 */
export function weightChartLabel(trend: readonly TrendPoint[], range: WeightRange, end: ISODate, units: UnitSystem, goalKg?: number): string {
  if (trend.length === 0) return 'Weight chart, no weigh-ins yet.';
  const pts = weightRangePoints(trend, range, end);
  if (pts.length === 0) return 'Weight chart, no weigh-ins in this range.';
  const a = pts[0];
  const z = pts[pts.length - 1];
  const weighIns = pts.filter((p) => !p.interpolated);
  const kgs = weighIns.map((p) => p.kg);
  // Every weight with its one decimal, as the screen draws them ("79.0 kilograms", "goal 74.0 kilograms").
  const lowHigh = kgs.length ? `, ${weighIns.length} weigh-ins from ${weightText(Math.min(...kgs), units)} to ${weightText(Math.max(...kgs), units)}` : '';
  const goal = goalKg ? `, goal ${weightText(goalKg, units)}` : '';
  const summary = `Weight trend from ${formatShortDate(a.date)} to ${z.date === end ? 'today' : formatShortDate(z.date)}: ${weightText(a.trend, units)} to ${weightText(z.trend, units)}${goal}${lowHigh}. Trend by date, every weigh-in is listed under History`;
  return chartLabel(summary, evenly(pts, 12).map((p) => `${p.date === end ? 'today' : formatShortDate(p.date)} ${weightText(p.trend, units)}`));
}

/**
 * A bar chart whose bars carry their own words (`BarDatum.detail`, "Nov 3 · 1,980 of 2,190 kcal"): the
 * summary, then each bar's detail in order.
 */
export function barsLabel(summary: string, details: readonly (string | undefined)[]): string {
  return chartLabel(summary, details.filter((d): d is string => !!d).map((d) => d.replace(/ · /g, ': ')));
}

/** A whole number with its unit, for a bar's spoken value ("1,980 kcal"). */
export function amount(n: number, unit: string): string {
  return `${formatNumber(Math.round(n))} ${unit}`;
}
