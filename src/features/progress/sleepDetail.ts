/**
 * The detail line under Progress's sleep row. The quality average covers only the
 * nights that have a rating (a night synced from a health store may have none), so
 * when some nights are unrated the line says how many the average is over.
 */
import { plural, SLEEP_MAX_HOURS, SLEEP_TARGET_HOURS, type PeriodSummary } from '@/lib/insights';

export function sleepDetail(s: NonNullable<PeriodSummary['sleep']>): string {
  const quality =
    s.avgQuality === null ? '' : ` · quality ${s.avgQuality.toFixed(1)} of 5${s.rated < s.nights ? ` over ${s.rated} rated` : ''}`;
  return `${plural(s.nights, 'night')} logged${quality} · aim for ${SLEEP_TARGET_HOURS} to ${SLEEP_MAX_HOURS} h`;
}
