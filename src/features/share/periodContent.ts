/**
 * What a month's or a year's share card carries, for the period and the person's choices. Pure: no React,
 * no storage, no clock. The same privacy rules as the day and week cards (./content.ts), tested here:
 *
 * - Weight is never on a card: no input carries it (the recap screen shows the weight trend; the card does not).
 * - The cups show how full each day was, a share of its own budget. Calorie figures appear only with `choices.kcal`.
 * - Water and active minutes are on by default; food names only with `choices.foods`.
 * - The headline says the fact in words and the stats carry the numbers, so the card never prints a figure twice.
 */
import type { ActivityFacts, WaterFacts } from '@/features/recap/facts';
import { inProgress as periodInProgress, type CupRow, type Period, type PeriodTally } from '@/features/recap/period';
import { cardOverline, cardTitle, periodName, totalVolume } from '@/features/recap/words';
import { weekRangeLabel } from '@/lib/insights';
import { formatNumber } from '@/lib/units';
import type { ISODate, UnitSystem } from '@/types';

import type { ShareChoices, ShareStat } from './content';

export interface SharePeriodInput {
  period: Period;
  today: ISODate;
  units: UnitSystem;
  rows: CupRow[];
  tally: PeriodTally;
  /** Average intake over the fully logged days (null without any). Shown only with `choices.kcal`. */
  avgKcal: number | null;
  activity: ActivityFacts;
  water: WaterFacts;
  /** The foods logged most, as drawn (`displayFoodName`), most first. Shown only with `choices.foods`. */
  foods: string[];
}

export interface PeriodCardContent {
  kind: 'month' | 'year';
  overline: string;
  title: string;
  /** The period still holds today. */
  inProgress: boolean;
  headline: string;
  rows: CupRow[];
  stats: ShareStat[];
  foods: string | null;
  /** Everything the card says, in words, for the image's accessibility label and the share text. */
  summary: string;
}

const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);

/** The card's headline: days with food logged, said in words (the stats under the cups carry other figures). */
export function periodHeadline(p: Period, tally: PeriodTally, today: ISODate): string {
  const soFar = periodInProgress(p, today);
  if (!tally.logged) return soFar ? 'Nothing logged yet.' : `No food logged in ${periodName(p, today)}.`;
  if (tally.logged === tally.elapsed && tally.elapsed >= 2) return soFar ? 'Food logged every day so far.' : `Food logged every day of ${periodName(p, today)}.`;
  return `Food logged on ${formatNumber(tally.logged)} of ${formatNumber(tally.elapsed)} ${plural(tally.elapsed, 'day')}${soFar ? ' so far' : ''}.`;
}

/** Up to three names, each cut to a readable length. */
function foodLine(names: string[]): string | null {
  const shown = names
    .map((n) => n.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 3)
    .map((n) => (n.length > 26 ? `${n.slice(0, 25).trimEnd()}…` : n));
  return shown.length ? shown.join(', ') : null;
}

export function periodCardContent(input: SharePeriodInput, choices: ShareChoices): PeriodCardContent {
  const { period: p, today, tally } = input;
  const soFar = periodInProgress(p, today);
  const { full, on } = tally.counts;
  // With no fully logged day there is nothing to measure, so no "0 of 0".
  const stats: ShareStat[] = full ? [{ key: 'budget', value: `${on}`, unit: `of ${full}`, label: `full ${plural(full, 'day')} on budget` }] : [];
  if (choices.kcal && input.avgKcal !== null) stats.push({ key: 'kcal', value: formatNumber(Math.round(input.avgKcal)), unit: 'kcal', label: 'a day on full days' });
  if (choices.water && input.water.totalMl > 0) {
    const v = totalVolume(input.water.totalMl, input.units);
    const w = input.water;
    stats.push({
      key: 'water',
      value: v.value,
      unit: v.unit,
      label: w.daysTracked ? `water, goal reached on ${w.daysReached} of ${w.daysTracked} ${plural(w.daysTracked, 'day')}` : 'water',
      progress: w.daysTracked ? w.daysReached / w.daysTracked : undefined,
    });
  }
  if (choices.activity && input.activity.activeMinutes > 0) {
    stats.push({ key: 'activity', value: formatNumber(input.activity.activeMinutes), unit: 'min', label: soFar ? 'active so far' : 'active' });
  }
  const foods = choices.foods ? foodLine(input.foods) : null;
  const headline = periodHeadline(p, tally, today);
  const title = cardTitle(p, today);
  const range = weekRangeLabel(tally.from ?? p.start, tally.to ?? p.end);
  const summary = [
    `${title}${soFar ? ' so far' : ''}, ${range}.`,
    headline,
    ...stats.map((s) => `${s.value} ${s.unit} ${s.label}.`.replace(/\s+/g, ' ')),
    foods ? `Logged most: ${foods}.` : '',
  ]
    .filter(Boolean)
    .join(' ');
  return { kind: p.kind, overline: cardOverline(p), title, inProgress: soFar, headline, rows: input.rows, stats, foods, summary };
}
