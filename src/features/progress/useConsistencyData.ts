import { useMemo } from 'react';

import { diffDays } from '@/lib/dates';
import { useStore } from '@/store';
import { useToday } from '@/store/clock';
import { useConsistency, useDays, useLive } from '@/store/selectors';
import type { ISODate, Settings } from '@/types';

import { cleanTargets, longestStreak, type CalendarDayInput, type RhythmKind, type RhythmTargets } from './consistency';

/** Longest history the calendar and rhythm look at. */
const MAX_HISTORY = 400;

/**
 * Weekly rhythm targets live in settings so they sync with the rest.
 * TODO(lead): add `rhythmTargets?: { food: number; train: number; weigh: number }`
 * to Settings in src/types; until then the field is carried through untyped
 * (settings are stored and synced as one JSON object, so it round-trips).
 */
type WithRhythm = Settings & { rhythmTargets?: Partial<RhythmTargets> };

export function useRhythmTargets(): RhythmTargets {
  const settings = useStore((s) => s.settings);
  return useMemo(() => cleanTargets((settings as WithRhythm).rhythmTargets), [settings]);
}

export function setRhythmTarget(kind: RhythmKind, days: number) {
  const s = useStore.getState();
  const current = cleanTargets((s.settings as WithRhythm).rhythmTargets);
  s.setSettings({ rhythmTargets: { ...current, [kind]: days } } as Partial<Settings>);
}

/** Everything the Consistency screen shows. */
export function useConsistencyData() {
  const t = useToday();
  const food = useLive('foodEntries');
  const activities = useLive('activities');
  const weights = useLive('weights');
  const water = useLive('water');
  const consistency = useConsistency(t);
  const targets = useRhythmTargets();

  const firstDate = useMemo<ISODate | null>(() => {
    let min: ISODate | null = null;
    for (const list of [food, activities, weights, water] as { date: ISODate }[][]) {
      for (const r of list) if (r.date <= t && (!min || r.date < min)) min = r.date;
    }
    return min;
  }, [food, activities, weights, water, t]);
  const historyDays = firstDate ? Math.min(MAX_HISTORY, Math.max(1, diffDays(firstDate, t) + 1)) : 1;
  const days = useDays(historyDays, t);

  return useMemo(() => {
    const sets: Record<RhythmKind, Set<ISODate>> = {
      food: new Set(food.map((e) => e.date)),
      train: new Set(activities.map((a) => a.date)),
      weigh: new Set(weights.map((w) => w.date)),
    };
    const byDate = new Map<ISODate, CalendarDayInput>();
    for (const d of days) {
      byDate.set(d.date, {
        date: d.date,
        logged: d.entries.length > 0,
        kcal: d.eaten.kcal,
        budget: d.budget,
        waterMet: d.waterEntries.length > 0 && d.waterMl >= d.waterGoalMl,
        trained: d.activities.length > 0,
      });
    }
    const longest = longestStreak([...sets.food].filter((d) => d <= t));
    return { today: t, firstDate, consistency, longest, sets, byDate, targets };
  }, [food, activities, weights, days, t, firstDate, consistency, targets]);
}
