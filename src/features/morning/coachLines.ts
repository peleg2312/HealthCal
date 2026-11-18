/**
 * Line breaking for the coach's three voices on the morning page. Pure and unit-tested
 * (coachLines.test.ts).
 */

/** The longest closing word that is joined to the word before it. */
const SHORT_WORD = 12;

/**
 * Joins a closing word of 12 characters or less to the word before it with a no-break space, so no
 * line of the coach ends on a lone "go." or "today.". A longer closing word, or a one-word string,
 * is left as it is.
 */
export function keepLastWord(s: string): string {
  const i = s.lastIndexOf(' ');
  if (i <= 0) return s;
  return s.length - i - 1 <= SHORT_WORD ? `${s.slice(0, i)} ${s.slice(i + 1)}` : s;
}
