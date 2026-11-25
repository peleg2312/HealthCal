/**
 * The mark beside an insight on Progress, one meaning each. A positive finding wears a sprout (never a
 * check: a check means only a day on budget); a finding about a value above its limit (calories above the
 * budget, a weekly pace past its safe maximum) wears the lightbulb in the amber ink, because amber marks a
 * value above its limit and nothing else; every other finding to act on (below a goal, a gap in logging,
 * eating well under the budget) wears the lightbulb in a neutral ink, and a neutral finding the info mark.
 * Pure: no React, no theme.
 */
import type { Insight } from '@/lib/insights';

export type InsightMark = 'sprout' | 'above' | 'act' | 'info';

/** The insights that say a value is above its limit: the only ones drawn in amber. */
export const ABOVE_LIMIT_INSIGHTS: readonly string[] = ['calories-above', 'pace-too-fast'];

export function insightMark(insight: Pick<Insight, 'id' | 'tone'>): InsightMark {
  if (insight.tone === 'positive') return 'sprout';
  if (insight.tone === 'attention') return ABOVE_LIMIT_INSIGHTS.includes(insight.id) ? 'above' : 'act';
  return 'info';
}
