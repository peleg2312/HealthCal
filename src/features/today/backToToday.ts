/**
 * When Today and the diary go back to today by themselves: after the app was away
 * (in the background, or on web the page hidden) for AWAY_MS or more, or when the
 * calendar day changed while it was away. A day picked an hour ago is not what
 * a person expects to log to when they pick the phone up again; the web app can
 * stay open for days. The hook is `useBackToToday` (./useBackToToday). No React,
 * unit-tested.
 */
import type { ISODate } from '@/types';

/** Away this long or longer, the screens show today again. */
export const AWAY_MS = 5 * 60_000;

/** When and on which calendar day the app left the front. */
export interface Away {
  at: number;
  day: ISODate;
}

/** Whether a screen showing another day goes back to today now that the app is in front again. */
export function backToTodayOnReturn(away: Away | null, now: number, today: ISODate): boolean {
  if (!away) return false;
  if (today !== away.day) return true;
  // A clock set back while away counts as no time away.
  return now - away.at >= AWAY_MS;
}
