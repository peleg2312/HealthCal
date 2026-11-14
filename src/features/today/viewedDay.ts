/**
 * The day the screen in front is showing when it is not today: a past day
 * picked in Today's week strip, or the diary's date. The + sheet in the tab bar
 * logs to it, so filling in a forgotten day does not quietly add to today.
 */
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { create } from 'zustand';

import { today } from '@/lib/dates';
import type { ISODate } from '@/types';

export const useViewedDay = create<{ date: ISODate | null }>(() => ({ date: null }));

/** Report the day a tab screen shows while it is in front (null for today). */
export function useReportViewedDay(date: ISODate | null): void {
  useFocusEffect(
    useCallback(() => {
      useViewedDay.setState({ date });
      return () => useViewedDay.setState({ date: null });
    }, [date]),
  );
}

/** The date a quick log goes to, read at the moment of the tap. */
export function quickLogDate(): ISODate {
  return useViewedDay.getState().date ?? today();
}

/** Water, weight and activity are things that happened: never later than today. */
export function quickLogPastDate(): ISODate {
  const d = quickLogDate();
  const t = today();
  return d > t ? t : d;
}
