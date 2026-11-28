/**
 * What this phone sends for "Together this week" and logging buddies (social_signals_publish in
 * supabase/migrations/20261202000000_friends_together.sql): the day, this week's and last week's active minutes
 * (guidelineMinutes, as Train counts them) and the days with food logged (foodLoggedDates, the date form of
 * hasFoodLogged) in the 35 days up to today. Each part only while the server wants it (`want`, from the overview's
 * `signals`): minutes for a minutes circle, days for a days circle or a buddy. Never a food, a calorie, a weight,
 * a workout's name or a time of day. Pure; the server keeps only what it asked for.
 */
import { addDays, startOfWeek } from '@/lib/dates';
import { guidelineMinutes } from '@/lib/exercise';
import { foodLoggedDates } from '@/store/selectors';
import type { ActivityEntry, FoodEntry, ISODate } from '@/types';

/** Days with food logged are sent for this many days, today included (the server keeps no more). */
export const LOGGED_DAYS = 35;

/** The figures on the wire, exactly as sent. */
export interface FriendSignals {
  today: ISODate;
  minutes?: number;
  last_minutes?: number;
  logged?: ISODate[];
}

export function buildFriendSignals(input: {
  activities: readonly ActivityEntry[];
  foodEntries: readonly FoodEntry[];
  today: ISODate;
  want: { minutes: boolean; logged: boolean };
}): FriendSignals {
  const { today, want } = input;
  const out: FriendSignals = { today };
  if (want.minutes) {
    const week = startOfWeek(today);
    const lastWeek = addDays(week, -7);
    const live = input.activities.filter((a) => !a.deleted && a.date <= today);
    out.minutes = Math.round(guidelineMinutes(live.filter((a) => a.date >= week)));
    out.last_minutes = Math.round(guidelineMinutes(live.filter((a) => a.date >= lastWeek && a.date < week)));
  }
  if (want.logged) {
    const since = addDays(today, -(LOGGED_DAYS - 1));
    out.logged = [...foodLoggedDates(input.foodEntries)].filter((d) => d >= since && d <= today).sort();
  }
  return out;
}

/** A stable text form, to tell whether the figures changed since they were last sent. */
export function signalsSignature(s: FriendSignals): string {
  return JSON.stringify([s.today, s.minutes ?? null, s.last_minutes ?? null, s.logged ?? null]);
}
