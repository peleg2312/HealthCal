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
