/**
 * Web: the rules of the browser history entry an open sheet adds, pure so they are tested
 * (sheetHistory.test.ts). Sheet.tsx (`useBackCloses`) holds the state and the listeners.
 *
 * A sheet adds an entry for the same address a beat after it opens, so the browser's Back closes it.
 * A sheet closed any other way takes its entry off again with one history.back(): the app's own step,
 * whose popstate reaches every listener a few milliseconds later. When one tap closes sheet A and opens
 * sheet B (a sheet's row that opens a confirmation), that popstate arrives while B is open: B must not
 * take it for the person's Back, and B must not add its entry before A's is off, or A's step back would
 * take B's entry instead.
 */

/** A step back of the app's own whose popstate has not come within this long is forgotten. */
export const OWN_BACK_MS = 1000;

/** The app's own steps back (history.back() calls closing sheets made), by when each was made, until its popstate arrives. */
export interface OwnBacks {
  /** A closing sheet steps back now. */
  made(now: number): void;
  /** Whether a step back of the app's own is still on its way (a sheet waits with its entry until none is). */
  pending(now: number): boolean;
  /** A popstate came: whether it is the app's own step back. Each step is counted once. */
  arrived(now: number): boolean;
}

export function ownBacks(forgetAfter = OWN_BACK_MS): OwnBacks {
  const times: number[] = [];
  const forget = (now: number) => {
    while (times.length && now - times[0] > forgetAfter) times.shift();
  };
  return {
    made: (now) => {
      times.push(now);
    },
    pending: (now) => {
      forget(now);
      return times.length > 0;
    },
    arrived: (now) => {
      forget(now);
      return times.shift() !== undefined;
    },
  };
}

/**
 * Whether a popstate closes this sheet. Never the app's own step back (`own`), never before the sheet has
 * added its entry (`pushed`), once (`closing`: already asked to close by an earlier Back), and only when
 * the browser has left this sheet's entry and the entries of every sheet opened over it (`at`, the sheet
 * mark of the entry now current; a sheet opened later has a larger `token`).
 */
export function backClosesSheet(p: { own: boolean; pushed: boolean; closing: boolean; at: unknown; token: number }): boolean {
  if (p.own || !p.pushed || p.closing) return false;
  return !(typeof p.at === 'number' && p.at >= p.token);
}
