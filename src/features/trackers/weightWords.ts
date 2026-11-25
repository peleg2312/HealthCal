/**
 * The weight chart's words (src/app/weight.tsx): the line under the range chips, what a held point reads, and
 * the context a rising week gets. Pure, from the trend and the day shown (never the clock), so they are tested.
 */
import { changeDirection } from '@/features/progress/change';
import { addDays, diffDays, formatShortDate, weekdayShort } from '@/lib/dates';
import type { TrendPoint } from '@/lib/trend';
import type { ISODate, UnitSystem } from '@/types';

import { WEIGHT_RANGES, weightText, type WeightRange, type WeightRangeSummary } from './helpers';

/** "last 3 months", or "since Oct 21" when the range reaches back to the first weigh-in. */
export function rangeSpanWords(summary: Pick<WeightRangeSummary, 'from' | 'sinceFirst'>, range: WeightRange): string {
  // The date's month and day stay on one line ("since Oct" / "21" never).
  if (summary.sinceFirst) return `since ${formatShortDate(summary.from).replace(' ', '\u00A0')}`;
  return WEIGHT_RANGES.find((r) => r.value === range)?.span ?? '';
}

/**
 * The range's two figures under the chips, each with its caption: the weigh-ins' average ("79.3" kg,
 * "Average, last 3 months") and their lowest to highest ("78.3–80.6" kg, "Lowest to highest"; said with the count),
 * so how far a day's reading swings is seen beside the average. Every weight with one decimal (`weightText`).
 */
export function rangeFigures(
  summary: WeightRangeSummary,
  range: WeightRange,
  units: UnitSystem,
): { unit: string; average: string; averageLabel: string; spread: string | null; spreadLabel: string; spreadSpoken: string | null } | null {
  if (summary.averageKg === null || summary.lowKg === null || summary.highKg === null) return null;
  const n = summary.weighIns;
  const figure = (kg: number) => weightText(kg, units).split(' ')[0];
  const unit = weightText(0, units).split(' ')[1];
  // The count is said, not drawn: the caption keeps to one line at 360 px.
  const spreadLabel = 'Lowest to highest';
  return {
    unit,
    average: figure(summary.averageKg),
    averageLabel: `Average, ${rangeSpanWords(summary, range)}`,
    spread: n > 1 ? `${figure(summary.lowKg)}–${figure(summary.highKg)}` : null,
    spreadLabel,
    spreadSpoken: n > 1 ? `${figure(summary.lowKg)} to ${figure(summary.highKg)} ${unit}, ${spreadLabel.toLowerCase()} of ${n} weigh-ins` : null,
  };
}

/** The held day in a figure's short caption: "today", "yesterday", "Nov 17", "Nov 17, 2025". */
export function heldShortDay(date: ISODate, end: ISODate): string {
  if (date === end) return 'today';
  if (date === addDays(end, -1)) return 'yesterday';
  return `${formatShortDate(date)}${date.slice(0, 4) === end.slice(0, 4) ? '' : `, ${date.slice(0, 4)}`}`;
}

/** A day as the held point names it: "Today", "Yesterday", "Tue, Nov 17", with the year when it is not `end`'s. */
export function heldDayWords(date: ISODate, end: ISODate): string {
  if (date === end) return 'Today';
  if (date === addDays(end, -1)) return 'Yesterday';
  const year = date.slice(0, 4) === end.slice(0, 4) ? '' : `, ${date.slice(0, 4)}`;
  return `${weekdayShort(date)}, ${formatShortDate(date)}${year}`;
}

/**
 * A point held on the chart (a finger, or the arrow keys on the web): the day, its trend and the scale that day
 * (null on a day with no weigh-in, whose trend is drawn between two). `spoken` is what the keys say.
 */
export function heldReadout(p: Pick<TrendPoint, 'date' | 'kg' | 'trend' | 'interpolated'>, end: ISODate, units: UnitSystem): { day: string; trend: string; scale: string | null; spoken: string } {
  const day = heldDayWords(p.date, end);
  const trend = weightText(p.trend, units);
  const scale = p.interpolated ? null : weightText(p.kg, units);
  return { day, trend, scale, spoken: `${day}: ${scale ? `weigh-in ${scale}` : 'no weigh-in'}, trend ${trend}` };
}

/**
 * A rising week gets context and a next step, never a verdict: when the trend rose by a change worth calling
 * (`changeDirection`'s weight rule, 0.3 kg) over the 7 days to the last weigh-in, that weigh-in is at most a
 * week before `end`, and no goal above the trend makes rising the aim. Neutral words, never amber.
 */
export function risingWeekNote(trend: readonly TrendPoint[], end: ISODate, units: UnitSystem, goalKg?: number): { line: string; step: string } | null {
  const real = trend.filter((p) => !p.interpolated && p.date <= end);
  if (real.length < 2) return null;
  const last = real[real.length - 1];
  if (diffDays(last.date, end) > 7) return null;
  const weekAgo = trend.find((p) => p.date === addDays(last.date, -7));
  if (!weekAgo) return null;
  const up = last.trend - weekAgo.trend;
  if (changeDirection('weight', last.trend, weekAgo.trend) !== 'up') return null;
  if (goalKg && goalKg > last.trend) return null;
  return {
    line: `The trend is up ${weightText(up, units)} this week. Water, salt and carbs move the scale from day to day, so one week is a small part of the trend.`,
    step: 'Next: weigh in each morning before breakfast, so the trend stays accurate.',
  };
}
