/**
 * "Your week is ready": whether last week's recap is waiting to be opened.
 * Shared by the Today screen (which announces it) and the recap screen
 * (which marks it seen), so both agree on what "ready" means.
 */
import { useMemo } from 'react';

import { addDays, diffDays, startOfWeek } from '@/lib/dates';
import { useStore } from '@/store';
import { useToday } from '@/store/clock';
import { useLive } from '@/store/selectors';
import type { ISODate } from '@/types';

/** A week needs at least this many logged days before a recap says anything useful. */
export const MIN_LOGGED_DAYS_FOR_RECAP = 3;

export interface RecapReady {
  /** Monday of the last completed week. */
  week: ISODate;
  /** That week has enough data and its recap has not been opened yet. */
  ready: boolean;
  /** Announce it on Today: only early in the new week (Monday to Wednesday), so it never lingers. */
  announce: boolean;
  markSeen: () => void;
}

/** Pure form, for tests: `loggedDates` are the days with at least one food entry. */
export function recapStatus(today: ISODate, loggedDates: Set<ISODate>, seenWeek: ISODate | undefined): { week: ISODate; ready: boolean; announce: boolean } {
  const thisWeek = startOfWeek(today);
  const week = addDays(thisWeek, -7);
  let logged = 0;
  for (let i = 0; i < 7; i++) if (loggedDates.has(addDays(week, i))) logged += 1;
  const ready = logged >= MIN_LOGGED_DAYS_FOR_RECAP && seenWeek !== week;
  return { week, ready, announce: ready && diffDays(thisWeek, today) <= 2 };
}

export function useRecapReady(): RecapReady {
  const today = useToday();
  const food = useLive('foodEntries');
  const seenWeek = useStore((s) => s.settings.recapSeenWeek);
  return useMemo(() => {
    const status = recapStatus(today, new Set(food.map((e) => e.date)), seenWeek);
    return { ...status, markSeen: () => useStore.getState().setSettings({ recapSeenWeek: status.week }) };
  }, [today, food, seenWeek]);
}
