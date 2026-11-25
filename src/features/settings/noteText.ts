/**
 * How a note under a control is set. A note of two or more sentences is reading text: the body size
 * (15 px) in textSecondary, never the caption size, which is for a one-line caption under a figure or a
 * field (the owner's ruling, loop 3). A sentence ends at ".", "?" or "!" (after a closing quote or
 * bracket, if any) followed by a space and the next sentence's first letter or digit, so a decimal
 * ("0.4 kg") or a stop at the very end does not count.
 */
const SENTENCE_BREAK = /[.?!]["'”’)]?\s+["'“‘(]?[A-Z0-9]/;

/** True for a note of two or more sentences. */
export function isReadingNote(text: string): boolean {
  return SENTENCE_BREAK.test(text.trim());
}

/** The Text variant a note is set in: 'body' for two or more sentences, else 'caption'. */
export function noteVariant(text: string): 'body' | 'caption' {
  return isReadingNote(text) ? 'body' : 'caption';
}
