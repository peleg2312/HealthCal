/**
 * Glue between the store and the pure planner. Used by the scheduler and by
 * the "Coming up today" preview, so both always show the same reminders.
 */
import { addDays, toISODate } from '@/lib/dates';
import type { Store } from '@/store';
import { computeDayFromStore, live } from '@/store/selectors';
import type { ISODate, ReminderSettings } from '@/types';

import { planReminders, type PlannedReminder, type PlannerDay } from './reminderPlanner';

function plannerDay(s: Store, date: ISODate): PlannerDay | null {
  const summary = computeDayFromStore(s, date);
  if (!summary) return null;
  const weighed = live(s.weights).some((w) => w.date === date);
  return { summary, weighed };
}

export function planFromStore(s: Store, now: Date = new Date(), overrides?: Partial<ReminderSettings>): PlannedReminder[] {
  if (!s.profile) return [];
  const todayKey = toISODate(now);
  return planReminders(
    {
      reminders: { ...s.settings.reminders, ...overrides },
      units: s.profile.units,
      today: plannerDay(s, todayKey),
      tomorrow: plannerDay(s, addDays(todayKey, 1)),
      weightKg: s.profile.weightKg,
    },
    now,
  );
}
