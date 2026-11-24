/**
 * The lines of the "On this page" list of a legal page, laid out ahead of drawing: two or three
 * chips to a line, in the sections' order. Pure, tested in jumpLines.test.ts.
 *
 * A plain wrap (and `balancedLines` of the food chips, which only mends a lone last chip) leaves a chip alone on a line
 * wherever the next one does not fit beside it, and the list reads as a ragged cloud. This picks, of
 * every way to cut the chips into lines of one to three that fit the room, the one with the fewest
 * lone chips, then the fewest lines, then the most even line widths (the fuller line first when two
 * ways are as even). A chip is alone only where it cannot share a line with either neighbour (a long
 * heading on a 320 px phone).
 */

/** A jump chip's width from its label: 12 px sides and a 1 px edge, and 6.8 px a letter for 13.5 px semibold (the labels measure about 6.5). */
export const jumpWidth = (label: string, max = Infinity): number => Math.min(max, 26 + label.length * 6.8);

/** The most chips on one line: more than three reads as a row of tags, not a list. */
const MOST = 3;

interface Best {
  lone: number;
  lines: number;
  ragged: number;
  take: number;
}

/** The chips' indexes, line by line. `widths` are estimates, so a line still wraps by itself if a font draws wider. */
export function jumpLines(widths: number[], room: number, gap = 8): number[][] {
  const n = widths.length;
  if (n === 0) return [];
  const span = (a: number, b: number) => widths.slice(a, b).reduce((s, w) => s + w, 0) + gap * (b - a - 1);
  // best[i]: the best way to lay out chips i..n-1.
  const best: (Best | null)[] = Array.from({ length: n + 1 }, () => null);
  best[n] = { lone: 0, lines: 0, ragged: 0, take: 0 };
  for (let i = n - 1; i >= 0; i--) {
    for (let take = 1; take <= MOST && i + take <= n; take++) {
      const used = span(i, i + take);
      // One chip always has its line, however wide (it shortens with an ellipsis there).
      if (take > 1 && used > room) break;
      const rest = best[i + take];
      if (!rest) continue;
      const slack = Math.max(0, room - used);
      const here: Best = { lone: rest.lone + (take === 1 ? 1 : 0), lines: rest.lines + 1, ragged: rest.ragged + slack * slack, take };
      const now = best[i];
      if (!now || here.lone < now.lone || (here.lone === now.lone && (here.lines < now.lines || (here.lines === now.lines && here.ragged <= now.ragged)))) best[i] = here;
    }
  }
  // A chip alone on a line is always allowed, so every start has a layout.
  const lines: number[][] = [];
  for (let i = 0; i < n; ) {
    const take = best[i]?.take ?? 1;
    lines.push(Array.from({ length: take }, (_, j) => i + j));
    i += take;
  }
  return lines;
}
