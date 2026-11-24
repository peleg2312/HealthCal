/**
 * Honest arrows: when a change against the previous equal period earns an arrow, and how it is said.
 *
 * A change earns an arrow only when it is at least the measure's own size (`least`) AND at least its
 * share of the earlier value (`share`, about 5%). Anything smaller is drawn as a dash, "about the
 * same", so +37 kcal a day (2%) never wears the same mark as +300. One rule per measure:
 *
 * - kcal (calories a day, a budget): 100 kcal and 5%.
 * - protein (grams a day): 5 g and 5%.
 * - weight (the trend's average): 0.3 kg. No share: 5% of a body would hide every real change, and the
 *   trend is already smoothed, so what is left under 0.3 kg is the gut and water.
 * - waterMl (millilitres a day): 100 ml and 5%.
 * - share (a share of days, 0 to 1: days at the water goal, days on budget): 10 points. One day is 3 to
 *   14 points of a range, so a single day either way is never an arrow on 30 or 90 days.
 * - minutes (active minutes a week): 15 min and 5%.
 * - sleep (hours a night): 15 minutes and 5%.
 * - days (a count of days in a week, the recap's water): 1 day.
 *
 * Every tile also says the change in words for a screen reader, with its size ("Up 37 kcal a day from
 * the previous 30 days"), so the dash never hides what moved. Pure: no React, no storage.
 */
import type { Direction } from '@/lib/insights';
import { formatNumber, formatVolume, formatWeight } from '@/lib/units';
import type { UnitSystem } from '@/types';

export type ChangeKind = 'kcal' | 'protein' | 'weight' | 'waterMl' | 'share' | 'minutes' | 'sleep' | 'days';

/** The least change that earns an arrow: at least `least` (in the measure's own unit) and at least `share` of the earlier value. */
export const CHANGE_RULES: Record<ChangeKind, { least: number; share: number }> = {
  kcal: { least: 100, share: 0.05 },
  protein: { least: 5, share: 0.05 },
  weight: { least: 0.3, share: 0 },
  waterMl: { least: 100, share: 0.05 },
  share: { least: 0.1, share: 0 },
  minutes: { least: 15, share: 0.05 },
  sleep: { least: 0.25, share: 0.05 },
  days: { least: 1, share: 0 },
};

const usable = (n: number | null | undefined): n is number => n !== null && n !== undefined && Number.isFinite(n);

/** Which way a value moved, by the measure's rule: 'same' (a dash) for a change too small to call. Null when either value is missing. */
export function changeDirection(kind: ChangeKind, current: number | null | undefined, previous: number | null | undefined): Direction | null {
  if (!usable(current) || !usable(previous)) return null;
  const d = current - previous;
  const { least, share } = CHANGE_RULES[kind];
  // A hair of float noise never decides it (0.3 - 0.2 is 0.09999...).
  const size = Math.abs(d) + 1e-9;
  if (size < least || size < share * Math.abs(previous)) return 'same';
  return d > 0 ? 'up' : 'down';
}

/** The size of a change in words, with its unit: '37 kcal a day', '0.6 kg', '18 min a night' ('18 min' for a week's total). */
function sizeWords(kind: ChangeKind, n: number, units: UnitSystem, total: boolean): string {
  switch (kind) {
    case 'kcal':
      return `${formatNumber(Math.round(n))} kcal a day`;
    case 'protein':
      return `${Math.round(n)} g a day`;
    case 'weight':
      return formatWeight(n, units);
    case 'waterMl':
      return `${formatVolume(n, units)} a day`;
    case 'minutes':
      return total ? `${Math.round(n)} min` : `${Math.round(n)} min a week`;
    case 'sleep':
      return `${Math.round(n * 60)} min a night`;
    case 'days':
      return `${Math.round(n)} ${Math.round(n) === 1 ? 'day' : 'days'}`;
    case 'share':
      return `${Math.round(n * 100)}%`;
  }
}

/** Whether a change rounds to nothing in the words it is said in. */
function roundsToZero(kind: ChangeKind, n: number): boolean {
  if (kind === 'weight') return Math.round(n * 10) === 0;
  if (kind === 'sleep') return Math.round(n * 60) === 0;
  if (kind === 'share') return Math.round(n * 100) === 0;
  return Math.round(n) === 0;
}

/**
 * The change in words, for a tile's spoken label: "Up 37 kcal a day from the previous 30 days",
 * "Down 0.6 kg from the previous 30 days", "About the same as the previous 30 days: up 37 kcal a day"
 * (under the rule, so drawn as a dash). A share of days is said as the two shares: "Days at the goal
 * up from 20% to 31% of tracked days, against the previous 30 days". Null when either value is missing.
 */
export function changeWords(
  kind: ChangeKind,
  current: number | null | undefined,
  previous: number | null | undefined,
  opts: {
    /** 'the previous 30 days' is said from '30 days'. */
    period: string;
    units?: UnitSystem;
    /** What a share counts, e.g. 'Days at the water goal'. */
    subject?: string;
    /** The earlier period said in full instead ('the week before'). */
    than?: string;
    /** The values are one week's totals (the recap's minutes): no "a week" after the size. */
    total?: boolean;
  },
): string | null {
  const dir = changeDirection(kind, current, previous);
  if (!dir || !usable(current) || !usable(previous)) return null;
  const units = opts.units ?? 'metric';
  const d = current - previous;
  const than = opts.than ?? `the previous ${opts.period}`;
  if (kind === 'share') {
    const subject = opts.subject ?? 'Share of days';
    const now = Math.round(current * 100);
    const before = Math.round(previous * 100);
    if (dir === 'same') return now === before ? `${subject}: ${now}%, the same as ${than}` : `${subject}: ${now}%, about the same as ${than} (${before}%)`;
    return `${subject} ${dir} from ${before}% to ${now}%, against ${than}`;
  }
  const size = sizeWords(kind, Math.abs(d), units, !!opts.total);
  if (dir === 'same') {
    if (roundsToZero(kind, Math.abs(d))) return `The same as ${than}`;
    return `About the same as ${than}: ${d > 0 ? 'up' : 'down'} ${size}`;
  }
  return `${dir === 'up' ? 'Up' : 'Down'} ${size} from ${than}`;
}
