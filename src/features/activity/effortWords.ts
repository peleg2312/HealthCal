/**
 * How hard an activity is, in plain words, for lists (the activity picker): "light", "moderate",
 * "hard", or a span such as "light to moderate". "MET" itself is said only where a number's
 * source is explained (the log's "Where this number comes from", About, the training sheet's
 * "How this is counted"). The thresholds are the guideline's: under 3 MET light, 6 or more hard.
 */
import { MODERATE_MET, VIGOROUS_MET } from '@/lib/exercise';

export type Effort = 'light' | 'moderate' | 'hard';

export function effortOf(met: number): Effort {
  return met >= VIGOROUS_MET ? 'hard' : met >= MODERATE_MET ? 'moderate' : 'light';
}

/** "moderate to hard" for an activity from its easy to its hard effort; one word when both ends agree. */
export function effortSpan(lowMet: number, highMet: number): string {
  const a = effortOf(Math.min(lowMet, highMet));
  const b = effortOf(Math.max(lowMet, highMet));
  return a === b ? a : `${a} to ${b}`;
}
