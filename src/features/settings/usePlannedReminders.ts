import { useEffect, useMemo, useState } from 'react';

import { useStore } from '@/store';
import type { ReminderSettings } from '@/types';

import { planFromStore } from './planFromStore';
import type { PlannedReminder } from './reminderPlanner';

/** The reminders the scheduler would set right now, kept fresh each minute. */
export function usePlannedReminders(overrides?: Partial<ReminderSettings>): { plan: PlannedReminder[]; now: Date } {
  const settings = useStore((s) => s.settings);
  const profile = useStore((s) => s.profile);
  const food = useStore((s) => s.foodEntries);
  const water = useStore((s) => s.water);
  const activities = useStore((s) => s.activities);
  const weights = useStore((s) => s.weights);
  const fasting = useStore((s) => s.fasting);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  const key = JSON.stringify(overrides ?? {});
  const plan = useMemo(
    () => planFromStore(useStore.getState(), now, JSON.parse(key) as Partial<ReminderSettings>),
    // The slices are listed so the plan follows every change that affects it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [settings, profile, food, water, activities, weights, fasting, now, key],
  );
  return { plan, now };
}
