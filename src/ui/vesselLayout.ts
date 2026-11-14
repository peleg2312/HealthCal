/**
 * Pure geometry for Vessel labels: labels sit beside the vessel at the height
 * they describe, but must never overlap or leave their zone. No React.
 */

/**
 * Places labels top-down in a zone [0, zone] so that none overlaps the one
 * before it (with `gap` between them) and all stay inside the zone, moving
 * each as little as possible from where it wants to be. Order is kept: the
 * first label is always the highest.
 *
 * @param desired top edge each label wants, in px from the zone top
 * @param heights height of each label
 * @returns the top edge each label gets
 */
export function placeLabels(desired: number[], heights: number[], zone: number, gap = 2): number[] {
  const n = desired.length;
  const tops = desired.map((d, i) => Math.max(0, Math.min(d, zone - heights[i])));
  // Push down to clear the label above.
  for (let i = 1; i < n; i++) tops[i] = Math.max(tops[i], tops[i - 1] + heights[i - 1] + gap);
  // Pull up from the bottom of the zone where that pushed a label out.
  for (let i = n - 1; i >= 0; i--) {
    const limit = i === n - 1 ? zone - heights[i] : tops[i + 1] - gap - heights[i];
    tops[i] = Math.min(tops[i], limit);
  }
  // A zone too small for every label: stack from the top rather than above it.
  if (n && tops[0] < 0) {
    tops[0] = 0;
    for (let i = 1; i < n; i++) tops[i] = Math.max(tops[i], tops[i - 1] + heights[i - 1] + gap);
  }
  return tops;
}

/** Fraction of a vessel filled by `value` of `max`, clamped to 0..1 (0 when max is not positive). */
export function fillRatio(value: number, max: number): number {
  if (!(max > 0) || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value / max));
}

/** Px from the vessel's top for a level of `value` in a vessel of inner height `inner`. */
export function levelY(value: number, max: number, inner: number): number {
  return (1 - fillRatio(value, max)) * inner;
}

/**
 * What a goal means. 'limit' is a budget (calories): past it is over, shown in
 * amber. 'reach' is a goal to get to (water, activity minutes, protein): at or
 * past it the goal is reached, the cup is brim-full, and amber is never used.
 */
export type GoalKind = 'limit' | 'reach';

/**
 * Where a level stands against its goal. 'limit': 'over' only when the value
 * passes max (equal is within budget). 'reach': 'reached' from max upward, so
 * 98% stays 'under' and 100% or 108% are 'reached'. No positive max: 'under'.
 */
export function goalState(value: number, max: number, kind: GoalKind = 'limit'): 'under' | 'reached' | 'over' {
  if (!(max > 0) || !Number.isFinite(value)) return 'under';
  if (kind === 'reach') return value >= max ? 'reached' : 'under';
  return value > max ? 'over' : 'under';
}

/**
 * How far the brim line of a reached goal lies past each side of its cup, in
 * px: about 7% of the width, at least 3 (a mini cup) and at most 6 (the hero).
 */
export function brimOverhang(width: number): number {
  if (!Number.isFinite(width) || width <= 0) return 3;
  return Math.max(3, Math.min(6, Math.round(width * 0.07)));
}

/**
 * Whether a reach goal already counted as reached before this render, so that
 * `reached && !reachedBefore(...)` is the one moment the goal is crossed.
 *
 * - The cup showed the same thing last time (same `key`): what it showed then.
 * - It is new, or now shows something else (a first mount, or a week strip that
 *   moved to another day, so `key` changed): what was last shown for this key
 *   in this session (`remembered`), and with no memory, what it shows now. So a
 *   cup that mounts full, or pages onto a day that met its goal, crosses
 *   nothing; a cup that comes back to find its goal met since it last showed
 *   that key does.
 *
 * @param last what this cup showed at its previous render, or null on mount
 * @param key the cup's `memoryKey` now
 * @param remembered whether this key was last shown reached (undefined: never shown, or no key)
 * @param reached whether the goal is reached now
 */
export function reachedBefore(last: { key: string | undefined; reached: boolean } | null, key: string | undefined, remembered: boolean | undefined, reached: boolean): boolean {
  if (last && last.key === key) return last.reached;
  return remembered ?? reached;
}
