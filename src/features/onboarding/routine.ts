/**
 * The optional "Your day" onboarding step: usual meal, wake and bed times, and
 * which reminders would help. Pure: no React, no storage.
 *
 * The examples are produced by the real reminder planner from a typical day on
 * the new plan, so the copy shown here is exactly what would arrive.
 */
import { inQuietHours, planReminders, type ReminderKind } from '@/features/settings/reminderPlanner';
import { formatClock, parseHHmm, toISODate } from '@/lib/dates';
import type { MacroTargets } from '@/lib/energy';
import type { DaySummary } from '@/store/selectors';
import type { FoodEntry, ReminderSettings, UnitSystem } from '@/types';

export type NudgeKind = 'water' | 'meals' | 'checkin' | 'weighIn';

export interface Routine {
  wake: string;
  bed: string;
  breakfast: string;
  lunch: string;
  dinner: string;
  nudges: Record<NudgeKind, boolean>;
}

/** Times the evening check-in and weigh-in use; the same defaults as the Reminders screen. */
export const CHECKIN_TIME = '20:30';
export const WEIGH_IN_TIME = '07:45';
export const WEIGH_IN_DAYS = [1, 4];
const WATER_EVERY_MIN = 120;

export function defaultRoutine(): Routine {
  return {
    wake: '07:00',
    bed: '22:30',
    breakfast: '08:30',
    lunch: '13:00',
    dinner: '19:30',
    nudges: { water: true, meals: true, checkin: true, weighIn: false },
  };
}

export type RoutineErrors = Partial<Record<'sleep' | 'meals', string>>;

const MEAL_LABEL = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' } as const;

export function validateRoutine(r: Routine, hour12 = false): RoutineErrors {
  const e: RoutineErrors = {};
  if (r.wake === r.bed) e.sleep = 'Wake-up and bedtime need to be different.';
  const b = parseHHmm(r.breakfast);
  const l = parseHHmm(r.lunch);
  const d = parseHHmm(r.dinner);
  if (!(b < l && l < d)) {
    e.meals = 'Put the meals in order: breakfast, then lunch, then dinner.';
  } else if (!e.sleep) {
    // Inside the sleep window a meal reminder would be held back by quiet hours.
    const asleep = (['breakfast', 'lunch', 'dinner'] as const).find((k) => inQuietHours(parseHHmm(r[k]), r.bed, r.wake));
    if (asleep) e.meals = `${MEAL_LABEL[asleep]} at ${formatClock(r[asleep], hour12)} falls while you are asleep. Move it, or your wake and bed times.`;
  }
  return e;
}

/** What onboarding writes to settings.reminders. Bed and wake become the quiet hours. */
export function remindersPatch(r: Routine, enabled: boolean): Partial<ReminderSettings> {
  return {
    enabled,
    quietStart: r.bed,
    quietEnd: r.wake,
    water: { enabled: r.nudges.water, everyMinutes: WATER_EVERY_MIN },
    meals: { enabled: r.nudges.meals, breakfast: r.breakfast, lunch: r.lunch, dinner: r.dinner },
    dailySummary: { enabled: r.nudges.checkin, time: CHECKIN_TIME },
    weighIn: { enabled: r.nudges.weighIn, time: WEIGH_IN_TIME, weekdays: WEIGH_IN_DAYS },
  };
}

export interface NudgeExample {
  /** "13:00" or "1:00 PM". */
  time: string;
  title: string;
  body: string;
}

export interface ExamplePlan {
  targetKcal: number;
  waterMl: number;
  macros: MacroTargets;
}

/**
 * One example per nudge, from a typical day on this plan: breakfast logged
 * (about a quarter of the target, a quarter of the protein) and water drunk
 * steadily through the waking hours.
 */
export function nudgeExamples(r: Routine, plan: ExamplePlan, units: UnitSystem, hour12 = false, base: Date = new Date()): Record<NudgeKind, NudgeExample | null> {
  const day = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 0, 1);
  const date = toISODate(day);
  const wake = parseHHmm(r.wake);
  const bed = parseHHmm(r.bed);
  const awake = Math.max(60, (bed > wake ? bed : bed + 1440) - wake);

  const settings: ReminderSettings = {
    enabled: true,
    quietStart: r.bed,
    quietEnd: r.wake,
    water: { enabled: true, everyMinutes: WATER_EVERY_MIN },
    meals: { enabled: true, breakfast: r.breakfast, lunch: r.lunch, dinner: r.dinner },
    dailySummary: { enabled: true, time: CHECKIN_TIME },
    // Every weekday, so the example always exists whatever day it is.
    weighIn: { enabled: true, time: WEIGH_IN_TIME, weekdays: [0, 1, 2, 3, 4, 5, 6] },
    movement: { enabled: false, time: '17:30' },
  };

  // Each reminder is built from the state of the day at its own time.
  const at = (minutes: number): DaySummary => {
    const awakeShare = Math.min(1, Math.max(0, (minutes - wake) / awake));
    const waterMl = Math.round((plan.waterMl * awakeShare * 0.85) / 50) * 50;
    const breakfastDone = minutes > parseHHmm(r.breakfast);
    const lunchDone = minutes > parseHHmm(r.lunch) + 30;
    const share = (breakfastDone ? 0.25 : 0) + (lunchDone ? 0.35 : 0);
    const eatenKcal = Math.round((plan.targetKcal * share) / 10) * 10;
    const fake = [{}] as FoodEntry[];
    return {
      date,
      entries: [],
      byMeal: { breakfast: breakfastDone ? fake : [], lunch: lunchDone ? fake : [], dinner: [], snack: [] },
      eaten: { kcal: eatenKcal, protein: Math.round(plan.macros.proteinG * share), carbs: 0, fat: 0, fiber: 0 },
      activities: [],
      exerciseNet: 0,
      exerciseGross: 0,
      activeMinutes: 0,
      target: plan.targetKcal,
      budget: plan.targetKcal,
      exerciseRule: 'day',
      exerciseAdded: 0,
      exerciseCarry: 0,
      remaining: plan.targetKcal - eatenKcal,
      macros: plan.macros,
      waterEntries: [],
      waterMl,
      waterGoalMl: plan.waterMl,
      waterRemainingMl: Math.max(0, plan.waterMl - waterMl),
    };
  };

  // Water: the slot nearest early afternoon, the moment people most often fall behind.
  const waterSlots: number[] = [];
  for (let t = wake + WATER_EVERY_MIN; t < wake + awake && t < 1440; t += WATER_EVERY_MIN) {
    if (!inQuietHours(t, r.bed, r.wake)) waterSlots.push(t);
  }
  const waterAt = waterSlots.length ? waterSlots.reduce((best, t) => (Math.abs(t - 14 * 60) < Math.abs(best - 14 * 60) ? t : best)) : null;

  const pick = (kind: ReminderKind, minutes: number | null): NudgeExample | null => {
    if (minutes === null) return null;
    const only: ReminderSettings = {
      ...settings,
      water: { ...settings.water, enabled: kind === 'water' },
      meals: { ...settings.meals, enabled: kind === 'meal' },
      dailySummary: { ...settings.dailySummary, enabled: kind === 'checkin' },
      weighIn: { ...settings.weighIn, enabled: kind === 'weighin' },
    };
    const planned = planReminders({ reminders: only, units, today: { summary: at(minutes), weighed: false } }, day);
    const hit = planned.find((p) => p.kind === kind && p.at.getHours() * 60 + p.at.getMinutes() === minutes);
    if (!hit) return null;
    return { time: formatClock(`${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`, hour12), title: hit.title, body: hit.body };
  };

  return {
    water: pick('water', waterAt),
    meals: pick('meal', parseHHmm(r.lunch)),
    checkin: pick('checkin', parseHHmm(CHECKIN_TIME)),
    weighIn: pick('weighin', parseHHmm(WEIGH_IN_TIME)),
  };
}
