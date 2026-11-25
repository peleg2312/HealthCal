/**
 * The pure half of `./rowMotion.tsx` (no React, no Reanimated, so it is tested in rowMotionRules.test.ts):
 * which rows of a log came back from its Restore rows, and the Restore rows to draw while they fold out.
 *
 * A log card (a diary meal, Water's log) lists its live rows and, under them, a Restore row for each row
 * removed on this visit. An Undo (the toast's) or a Restore (the row's) brings a removed row back: it leaves
 * the Restore rows and is live again in the same store change. The owner's ruling (loop 3, D1-05): the row
 * that comes back unfolds its height, the reverse of the fold that took it away, and its Restore row folds
 * out in step, so the rows and the cards below move together and nothing snaps.
 */

/** One render's lists: the ids of the live rows, and the Restore rows (the removed items) in their order. */
export interface LogLists<T extends { id: string }> {
  live: readonly string[];
  removed: readonly T[];
}

/**
 * The Restore rows whose item came back between two renders (an Undo or a Restore): an item among the
 * removed before, live now, and not live before (a row that was live all along is not coming back), with
 * its place among the Restore rows before, so it folds out where it was drawn. Nothing for another list
 * altogether (another day): none of its removed items is live in the new one.
 */
export function cameBack<T extends { id: string }>(before: LogLists<T>, now: LogLists<T>): { item: T; index: number }[] {
  const live = new Set(now.live);
  const wasLive = new Set(before.live);
  const stillRemoved = new Set(now.removed.map((r) => r.id));
  return before.removed.flatMap((item, index) => (live.has(item.id) && !wasLive.has(item.id) && !stillRemoved.has(item.id) ? [{ item, index }] : []));
}

/**
 * The Restore rows to draw: the removed items as they are, and each one that just came back (`returning`)
 * kept at its place, marked `leaving`, while it folds out. An item removed again before its fold ends is
 * drawn once, as a removed item.
 */
export function withReturning<T extends { id: string }>(removed: readonly T[], returning: readonly { item: T; index: number }[]): { item: T; leaving: boolean }[] {
  const out = removed.map((item) => ({ item, leaving: false }));
  const shown = new Set(removed.map((r) => r.id));
  for (const r of [...returning].sort((a, b) => a.index - b.index)) {
    if (shown.has(r.item.id)) continue;
    shown.add(r.item.id);
    out.splice(Math.min(r.index, out.length), 0, { item: r.item, leaving: true });
  }
  return out;
}
