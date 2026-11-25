/**
 * Which of the check-in's four tiles the win of the week restates, so the screen says each figure
 * once: the win card states it ("305 active minutes in 4 sessions, past the weekly 150."), and the
 * tile it restates keeps its label, "In the win above" and its change against the week before.
 *
 * The win is one sentence from `recapWinFocus` (`@/lib/insights`); its templates that restate a
 * tile are matched here and proved against that function in `recapWin.test.ts`, so a reworded
 * template fails the test rather than quietly showing a figure twice. Pure: no React.
 */
import type { RecapTile } from '@/lib/insights';

const WIN_TILE: { id: RecapTile['id']; test: RegExp }[] = [
  // "305 active minutes in 4 sessions, past the weekly 150."
  { id: 'activity', test: /^\d[\d,]* active minutes in \d+ sessions?, past the weekly / },
  // "Protein averaged 150 g against your 152 g goal."
  { id: 'protein', test: /^Protein averaged / },
  // "You reached your water goal on 5 of 7 days."
  { id: 'water', test: /^You reached your water goal on \d+ of \d+ days?\./ },
];

/** The tile whose figures the win already says, or null (a win about calories, weight or logging). */
export function winTile(win: string): RecapTile['id'] | null {
  return WIN_TILE.find((w) => w.test.test(win))?.id ?? null;
}
