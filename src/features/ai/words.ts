/**
 * The words of the estimate's wait (./AnalysingView.tsx), pure: three steps that are true and one
 * note. Only the first step is ever done (the phone knows the photo or the words are ready); the
 * second stays "now" until the answer arrives, and the third is where the screen goes next. Nothing
 * here claims a share done or a time left beyond "usually". Held to the banned list in ./words.test.ts.
 */
export const ANALYSING = {
  inputPhoto: 'Photo ready',
  inputText: 'Description ready',
  estimate: 'Estimating each food and its portion',
  estimateCareful: 'Checking each food more carefully',
  review: 'Nothing is added until you check it',
  note: 'Usually a few seconds.',
  noteCareful: 'The careful check can take up to half a minute.',
  noteSlow: 'Still working. Busy plates and the careful check take a little longer.',
} as const;

/** After this long the note says it is still working: 10 s, or 20 s for the careful check. */
export function slowAfterMs(precise: boolean): number {
  return precise ? 20_000 : 10_000;
}

/** The three steps, in order: the input (done), the estimate (now), the review (next). */
export function analysingSteps(photo: boolean, precise: boolean): { input: string; estimate: string; review: string } {
  return {
    input: photo ? ANALYSING.inputPhoto : ANALYSING.inputText,
    estimate: precise ? ANALYSING.estimateCareful : ANALYSING.estimate,
    review: ANALYSING.review,
  };
}

/** The line under the steps. */
export function analysingNote(precise: boolean, slow: boolean): string {
  if (slow) return ANALYSING.noteSlow;
  return precise ? ANALYSING.noteCareful : ANALYSING.note;
}

/** The steps as one sentence for a screen reader: what is done, what is happening, what comes next. */
export function analysingLabel(photo: boolean, precise: boolean): string {
  const s = analysingSteps(photo, precise);
  return `${s.input}. ${s.estimate}. ${s.review}.`;
}

/** The + sheet's hints for the two AI tiles: both say that the numbers are an AI estimate, and "Describe it" says what to do. */
export const AI_TILE_HINT = { photo: 'Photo, AI estimate', describe: 'Type it, AI estimate' } as const;

/** The longest description the describe field takes (its `maxLength`), so a prefill never holds more. */
export const DESCRIPTION_MAX = 500;

/**
 * Food search's AI tile (the row of four). With nothing typed it is the way to both inputs: "AI" under the
 * AI's camera, opening the photo screen on Photo, with Describe one tab away; its full name says both. Once
 * words are typed (results or none) it is "Describe" and carries them (`words`), so the person never types
 * them twice; nothing is sent until they tap Estimate there.
 */
export function searchAiTile(query: string): { label: string; a11y: string; glyph: 'photo' | 'describe'; params: Record<string, string> } {
  const words = query.trim().slice(0, DESCRIPTION_MAX);
  if (!words) return { label: 'AI', a11y: 'AI estimate from a photo or a description', glyph: 'photo', params: { mode: 'photo' } };
  return { label: 'Describe', a11y: `Describe ${words} for an AI estimate`, glyph: 'describe', params: { mode: 'text', words } };
}

/** The describe field's first value from the screen's `words` param (read once, when the screen opens): trimmed, at most `DESCRIPTION_MAX`. */
export function prefilledDescription(raw: unknown): string {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return typeof v === 'string' ? v.trim().slice(0, DESCRIPTION_MAX) : '';
}
