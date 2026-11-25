/**
 * The month's and year's figures that are not cups: the foods logged most, and water and activity added up
 * over the counted span. Pure: the hook passes in the store's records and the days it computed.
 */
import { hasWaterTracked, isWaterDrinkEntry } from '@/features/drinks/via';
import { guidelineMinutes } from '@/lib/exercise';
import type { FoodEntry, FoodSource, ISODate } from '@/types';

export interface FoodCount {
  /** The food's id, else its name in lower case: one food however its portions differ. */
  key: string;
  /** The name as last logged (draw it through `displayFoodName`). */
  name: string;
  source: FoodSource;
  emoji?: string;
  /** Days it was logged on. */
  days: number;
}

/** A food counts towards "logged most" from this many days: one day says nothing about a month. */
export const TOP_FOOD_MIN_DAYS = 2;

type EntryLike = Pick<FoodEntry, 'date' | 'name' | 'source' | 'emoji' | 'foodId' | 'via' | 'loggedAt'> & { deleted?: boolean };

/**
 * The foods logged on the most days between `from` and `to`, most first (then the most entries, then by
 * name). Drinks logged on Water and quick adds are left out (a quick add is a number, not a food), and a
 * food logged on fewer than `TOP_FOOD_MIN_DAYS` days is not listed.
 */
export function topFoods(entries: readonly EntryLike[], from: ISODate, to: ISODate, max = 3): FoodCount[] {
  const byKey = new Map<string, { name: string; source: FoodSource; emoji?: string; dates: Set<ISODate>; n: number; last: string }>();
  for (const e of entries) {
    if (e.deleted || isWaterDrinkEntry(e) || e.source === 'quick' || e.date < from || e.date > to) continue;
    const name = e.name.replace(/\s+/g, ' ').trim();
    if (!name) continue;
    const key = e.foodId || name.toLowerCase();
    const at = `${e.date} ${e.loggedAt ?? ''}`;
    const row = byKey.get(key);
    if (!row) {
      byKey.set(key, { name, source: e.source, emoji: e.emoji, dates: new Set([e.date]), n: 1, last: at });
      continue;
    }
    row.dates.add(e.date);
    row.n += 1;
    if (at > row.last) Object.assign(row, { name, source: e.source, emoji: e.emoji ?? row.emoji, last: at });
  }
  return [...byKey.entries()]
    .map(([key, r]) => ({ key, name: r.name, source: r.source, emoji: r.emoji, days: r.dates.size, n: r.n }))
    .filter((f) => f.days >= TOP_FOOD_MIN_DAYS)
    .sort((a, b) => b.days - a.days || b.n - a.n || a.name.localeCompare(b.name))
    .slice(0, max)
    .map(({ n: _n, ...f }) => f);
}

/** What water and activity figures need from a day (a `DaySummary` has all of it). */
export interface FactDay {
  date: ISODate;
  waterMl: number;
  waterGoalMl: number;
  waterEntries: readonly { fromEntryId?: string }[];
  activities: Parameters<typeof guidelineMinutes>[0];
}

export interface WaterFacts {
  /** Every drink counted, diary drinks included (as every total counts them). */
  totalMl: number;
  /** Closed days with water logged as water (`hasWaterTracked`): the days the goal is judged on. */
  daysTracked: number;
  /** Of them, the days the goal was reached. */
  daysReached: number;
}

/** Water over the span: the total of every day, the goal judged only on closed days with water logged as water. */
export function waterFacts(days: readonly FactDay[], today: ISODate): WaterFacts {
  let totalMl = 0;
  let daysTracked = 0;
  let daysReached = 0;
  for (const d of days) {
    totalMl += Math.max(0, d.waterMl);
    if (d.date >= today || !hasWaterTracked(d.waterEntries)) continue;
    daysTracked += 1;
    if (d.waterGoalMl > 0 && d.waterMl >= d.waterGoalMl) daysReached += 1;
  }
  return { totalMl, daysTracked, daysReached };
}

export interface ActivityFacts {
  /** Toward the weekly guideline (`guidelineMinutes`): the app's "active minutes". */
  activeMinutes: number;
  workouts: number;
  /** Days with at least one workout. */
  days: number;
}

export function activityFacts(days: readonly FactDay[]): ActivityFacts {
  let activeMinutes = 0;
  let workouts = 0;
  let active = 0;
  for (const d of days) {
    activeMinutes += guidelineMinutes(d.activities);
    workouts += d.activities.length;
    if (d.activities.length) active += 1;
  }
  return { activeMinutes: Math.round(activeMinutes), workouts, days: active };
}
