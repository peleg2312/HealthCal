/**
 * What Today's weight cell shows for the day in view. Today: the smoothed
 * trend, called "Weight trend" (it is not the last scale reading, which Profile
 * shows). A past day: that day's weigh-in, "Weighed", when there is one, else
 * the trend as it stood that day. Pure, unit-tested.
 */
import type { TrendPoint } from '@/lib/trend';
import type { ISODate } from '@/types';

export interface WeightCellValue {
  label: 'Weight trend' | 'Weighed';
  kg: number;
}

export function weightCell(
  entries: readonly { date: ISODate; kg: number }[],
  trend: readonly TrendPoint[],
  date: ISODate,
  isToday: boolean,
): WeightCellValue | null {
  if (!isToday) {
    const weighIn = entries.find((e) => e.date === date);
    if (weighIn) return { label: 'Weighed', kg: weighIn.kg };
    let point: TrendPoint | undefined;
    for (const t of trend) if (t.date <= date && (!point || t.date > point.date)) point = t;
    return point ? { label: 'Weight trend', kg: point.trend } : null;
  }
  const last = trend.length ? trend[trend.length - 1] : undefined;
  return last ? { label: 'Weight trend', kg: last.trend } : null;
}
