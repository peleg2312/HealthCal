/**
 * Plain words and numbers for the sync screen. Pure: no React, no storage, no
 * clock (today's date is passed in), so it is unit-tested.
 */
import { ACTIVITY_BY_ID } from '@/data/activities';
import { clockTime, dayLabel, distanceLabel, durationLabel, localDay } from '@/features/import/ui/format';
import { plausibleOffsetMin } from '@/features/import/time';
import { formatShortDate, toISODate } from '@/lib/dates';
import { kcalRange } from '@/lib/exercise';
import { formatNumber } from '@/lib/units';
import type { ISODate, UnitSystem } from '@/types';

import { workoutSpan } from '../convert';
import type { OriginSeen, ReviewItem } from '../plan';
import type { HealthSyncState } from '../state';
import type { HealthAccess } from '../types';

export interface ReviewView {
  /** The activity's name, or the health store's word for the type while the activity is unknown. */
  title: string;
  emoji: string | null;
  /** "Fri, Nov 13 · 07:00 · 45 min · 8.2 km" where the workout was recorded. */
  meta: string;
  /** "From Garmin Connect". */
  source: string;
  /** What would be added to the day ("+480", "~412"); null until the activity is known. */
  added: string | null;
  /** True when that figure is the app's estimate. */
  estimate: boolean;
  /** The line under it: "552 by watch", "est. 330–494", "No calories recorded". */
  detail: string;
  /** Everything above in one sentence, for screen readers. */
  spoken: string;
}

const nbsp = (s: string) => s.replace(/ /g, ' ');

export function reviewView(item: ReviewItem, todayDate: ISODate, units: UnitSystem, hour12: boolean): ReviewView {
  const w = item.workout;
  const span = workoutSpan(w);
  const offsetMin = typeof w.zoneOffsetSec === 'number' ? w.zoneOffsetSec / 60 : Number.NaN;
  const recorded = { startUtc: span?.startUtc ?? w.startTime, ...(plausibleOffsetMin(offsetMin) ? { utcOffsetMin: offsetMin } : null) };
  const parts = [dayLabel(localDay(recorded), todayDate), clockTime(recorded, hour12), durationLabel(span?.durationSec ?? 0)];
  const dist = distanceLabel(item.entry?.distanceKm ? item.entry.distanceKm * 1000 : w.distanceM, units);
  if (dist) parts.push(dist);
  const meta = parts.map(nbsp).join(' · ');

  const activity = item.entry ? ACTIVITY_BY_ID[item.entry.activityId] : undefined;
  // While the activity is unknown, the name the origin app gave the workout says most ('Evening session').
  const title = activity?.name ?? (w.title?.trim() || item.sportName);
  const source = `From ${item.from}`;

  let added: string | null = null;
  let estimate = false;
  let detail: string;
  let said: string;
  if (item.entry) {
    const net = Math.round(item.entry.kcalNet);
    if (item.entry.measured) {
      added = `+${formatNumber(net)}`;
      detail = `${formatNumber(Math.round(item.entry.kcalGross))} in total`;
      said = `${formatNumber(net)} kilocalories above resting, measured`;
    } else {
      const [lo, hi] = kcalRange(net);
      added = `~${formatNumber(net)}`;
      estimate = true;
      detail = `est. ${formatNumber(lo)}–${formatNumber(hi)}`;
      said = `about ${formatNumber(net)} kilocalories above resting, an estimate between ${formatNumber(lo)} and ${formatNumber(hi)}`;
    }
  } else {
    const active = w.activeKcal && w.activeKcal > 0 ? Math.round(w.activeKcal) : null;
    const total = w.totalKcal && w.totalKcal > 0 ? Math.round(w.totalKcal) : null;
    detail = active !== null ? `${formatNumber(active)} kcal active` : total !== null ? `${formatNumber(total)} kcal in total` : 'No calories recorded';
    said = detail.replace('kcal', 'kilocalories');
  }
  return { title, emoji: activity?.emoji ?? null, meta, source, added, estimate, detail, spoken: `${title}, ${meta.replace(/ /g, ' ')}, ${source}, ${said}` };
}

/** "3 workouts, latest Nov 13". */
export function originLine(o: OriginSeen): string {
  const day = toISODate(new Date(o.latest));
  return `${o.count} ${o.count === 1 ? 'workout' : 'workouts'}, latest ${formatShortDate(day)}`;
}

/** The line under the switch. `ago` is "5 min ago" for the last successful sync, or null. */
export function switchSubtitle(state: Pick<HealthSyncState, 'enabled' | 'lastSyncedAt' | 'lastError'>, busy: boolean, asking: boolean, ago: string | null): string {
  if (asking) return 'Waiting for Health Connect';
  if (!state.enabled) return 'Off';
  if (busy) return 'Syncing now';
  if (state.lastError) return 'On, but the last sync did not finish';
  return ago ? `On, last synced ${ago}` : 'On';
}

/** The row on Profile: what a glance should say. */
export function profileSubtitle(state: Pick<HealthSyncState, 'enabled' | 'lastSyncedAt' | 'lastError' | 'review'>, supported: boolean, ago: string | null): string {
  if (!supported) return 'In the Android app';
  if (!state.enabled) return 'Off. Add Garmin and other workouts by themselves';
  if (state.lastError) return 'Needs attention';
  if (state.review.length) return `On, ${state.review.length} ${state.review.length === 1 ? 'workout needs' : 'workouts need'} a look`;
  return ago ? `On, last synced ${ago}` : 'On';
}

/** What is missing when calories or distance may not be read; null when everything may. */
export function accessNote(access: HealthAccess | null): string | null {
  if (!access || !access.workouts) return null;
  const energy = access.activeEnergy || access.totalEnergy;
  if (!energy && !access.distance) return 'Calories and distance are not shared with HealthCal, so synced workouts use the app\'s own calorie estimate and have no distance.';
  if (!energy) return 'Calories are not shared with HealthCal, so synced workouts use the app\'s own calorie estimate.';
  if (!access.distance) return 'Distance is not shared with HealthCal, so synced workouts have none.';
  return null;
}
