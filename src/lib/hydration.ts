/**
 * Daily fluid goal.
 *
 * Reference intakes (EFSA 2010: 2.5 L men / 2.0 L women total water; US
 * National Academies 2004: 3.7 L / 2.7 L) cover water from food as well, which
 * supplies roughly 20-30% of the total. The goal here is for drinks only, so
 * it is scaled by body weight and bounded by those references.
 */
import type { ActivityEntry, Beverage, Intensity, Sex, WaterEntry } from '@/types';

const ML_PER_KG = 33;

/** Extra fluid per hour of exercise, a conservative share of typical sweat loss. */
const SWEAT_ML_PER_HOUR: Record<Intensity, number> = {
  light: 350,
  moderate: 550,
  vigorous: 800,
};

export function baseWaterGoalMl(weightKg: number, sex: Sex): number {
  const min = sex === 'male' ? 2000 : 1600;
  const max = sex === 'male' ? 3700 : 3000;
  const raw = Math.min(max, Math.max(min, weightKg * ML_PER_KG));
  return Math.round(raw / 50) * 50;
}

export function exerciseWaterMl(sessions: Pick<ActivityEntry, 'durationMin' | 'intensity'>[]): number {
  const extra = sessions.reduce((sum, s) => sum + (s.durationMin / 60) * SWEAT_ML_PER_HOUR[s.intensity], 0);
  return Math.round(Math.min(extra, 2000) / 50) * 50;
}

/**
 * How much of a drink counts toward hydration. Caffeinated drinks still
 * hydrate at moderate intakes; alcohol is not offered as a beverage at all.
 */
export const HYDRATION_FACTOR: Record<Beverage, number> = {
  water: 1,
  tea: 1,
  coffee: 0.9,
  juice: 0.95,
  milk: 0.9,
  sports: 1,
  other: 0.9,
};

export const BEVERAGE_LABELS: Record<Beverage, { label: string; emoji: string }> = {
  water: { label: 'Water', emoji: '💧' },
  tea: { label: 'Tea', emoji: '🍵' },
  coffee: { label: 'Coffee', emoji: '☕' },
  juice: { label: 'Juice', emoji: '🧃' },
  milk: { label: 'Milk', emoji: '🥛' },
  sports: { label: 'Sports drink', emoji: '🥤' },
  other: { label: 'Other', emoji: '🫗' },
};

export function effectiveMl(ml: number, beverage: Beverage): number {
  return ml * HYDRATION_FACTOR[beverage];
}

/** Number of glasses left, for reminder copy. */
export function glassesLeft(remainingMl: number, glassMl = 250): number {
  return Math.max(0, Math.ceil(remainingMl / glassMl));
}

/**
 * Whether a water record was logged as water (on the Water screen, Today's button, the + sheet, a
 * reminder), not added by a drink logged in the diary (`fromEntryId`, src/features/drinks/diary.ts).
 * Such diary water counts in every total but never makes a day "water tracked": ask this (or
 * `hasWaterTracked`) wherever the app decides whether to talk about water; never `waterEntries.length`.
 * Re-exported from @/features/drinks/via.
 */
export function isTrackedWater(w: Pick<WaterEntry, 'fromEntryId'>): boolean {
  return !w.fromEntryId;
}

/** Whether a day's water records make it a day with water tracked: at least one not from the diary. Totals still count them all. */
export function hasWaterTracked(water: readonly Pick<WaterEntry, 'fromEntryId'>[]): boolean {
  return water.some(isTrackedWater);
}
