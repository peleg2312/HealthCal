/**
 * Rows of chips laid out ahead of drawing, so a wrapping row never leaves one chip alone on its last
 * line (the evidence scan's "left alone" rule): the water screen's drink choices and the serving
 * chips of AmountEditor. Pure, tested in chipLines.test.ts.
 */

/** A chip's width from its label, a little generous (13.5 px semibold, 12 px sides, 1 px edge), for laying out lines. */
export const chipWidth = (label: string, max = Infinity) => Math.min(max, 26 + label.length * 7.6);

/**
 * The chips as a plain wrap lays them out, unless that leaves one chip alone on its last line: then
 * the same number of lines, balanced ("Plain, Splash of milk, Splash and sugar" over "With sugar"
 * becomes two and two). Lines keep their order; the cut whose widest line is smallest wins. Widths are estimates, so a
 * line still wraps by itself if a font draws wider.
 */
export function balancedLines(widths: number[], room: number, gap = 8): number[][] {
  const n = widths.length;
  if (n === 0) return [];
  const span = (a: number, b: number) => widths.slice(a, b).reduce((s, w) => s + w, 0) + gap * (b - a - 1);
  const greedy: number[][] = [[]];
  for (let i = 0, used = 0; i < n; i++) {
    const w = widths[i] + (used > 0 ? gap : 0);
    if (used > 0 && used + w > room) {
      greedy.push([i]);
      used = widths[i];
    } else {
      greedy[greedy.length - 1].push(i);
      used += w;
    }
  }
  const lines = greedy.length;
  // A plain wrap is kept unless it leaves one chip alone on its last line.
  if (lines === 1 || greedy[lines - 1].length > 1) return greedy;
  // Every way to cut n chips into `lines` runs (n is at most ten): keep the one whose widest run is narrowest.
  let best: number[] | null = null;
  let bestMax = Infinity;
  const cut = (start: number, left: number, cuts: number[]) => {
    if (left === 1) {
      const all = [...cuts, n];
      let max = 0;
      for (let k = 0, a = 0; k < all.length; a = all[k], k++) max = Math.max(max, span(a, all[k]));
      if (max < bestMax) {
        bestMax = max;
        best = all;
      }
      return;
    }
    for (let c = start + 1; c <= n - left + 1; c++) cut(c, left - 1, [...cuts, c]);
  };
  cut(0, lines, []);
  const ends = best ?? [n];
  return ends.map((end, k) => Array.from({ length: end - (k ? ends[k - 1] : 0) }, (_, j) => (k ? ends[k - 1] : 0) + j));
}
