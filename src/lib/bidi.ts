/**
 * Right-to-left text (Hebrew, Arabic) inside the app's left-to-right lines.
 *
 * The app is English and left to right, but a food, a brand, a serving label, a saved meal or a
 * workout can be named by a person or a package in Hebrew or Arabic. Drawn as it is, such a name
 * pulls a line to the right edge (the web sets `dir="auto"` on every Text, Android picks the
 * paragraph's direction from its first strong letter) and the Unicode bidirectional rules join the
 * numbers next to it to its run ("קוטג' 5% · 120 kcal" reads "120 · %5 'קוטג kcal").
 *
 * Display only: never store, compare or sync the result of these functions, and never put it in an
 * accessibility label (screen readers get the raw name). For text without a Hebrew or Arabic letter
 * they return their input, so English lines are unchanged.
 */

/** Hebrew, Arabic and their presentation forms. */
const RTL = /[֐-׿؀-ۿ܀-ࣿיִ-﷿ﹰ-﻿]/;
/** Left-to-right mark: a strong left-to-right character that draws nothing. */
export const LRM = '‎';
/** First strong isolate and pop directional isolate: the text between them is one unit for the bidi rules. */
export const FSI = '⁨';
export const PDI = '⁩';

/** Does the text hold a Hebrew or Arabic letter? */
export function hasRtl(text: string): boolean {
  return RTL.test(text);
}

/**
 * Text written by a person or a product (a name, a brand, a serving label) placed inside one of the
 * app's left-to-right lines: unchanged unless it holds a Hebrew or Arabic letter; then it is isolated,
 * so it reads right to left inside, cannot reorder the numbers and words around it, and a line that
 * starts with it still starts at the left. The left-to-right mark in front is needed because an
 * isolate alone does not set the paragraph's direction (a browser's `dir="auto"` looks inside it).
 */
export function isolateRtl(text: string): string {
  return text && RTL.test(text) ? `${LRM}${FSI}${text}${PDI}` : text;
}

/** A letter of a left-to-right script: Latin, Greek, Cyrillic and the other cased scripts, CJK, Hangul, Kana. */
function isStrongLtr(ch: string): boolean {
  if (ch === LRM) return true;
  if (ch.toLowerCase() !== ch.toUpperCase()) return true;
  return /[぀-鿿가-힯豈-﫿]/.test(ch);
}

/**
 * Is the first strong letter of the text Hebrew or Arabic? Digits, spaces, punctuation, emoji and the
 * isolate marks are not strong letters and are skipped; a left-to-right mark counts as left to right,
 * so a string already passed through `isolateRtl` answers false.
 */
export function startsRtl(text: string): boolean {
  for (const ch of text) {
    if (RTL.test(ch)) return true;
    if (isStrongLtr(ch)) return false;
  }
  return false;
}

/**
 * The kit's safety net (`Text`, @/ui): a Text whose only content is one string that starts with a
 * Hebrew or Arabic letter gets a left-to-right mark in front, so a whole-name line ("פיתה") stays at
 * the left edge like every other line. Nothing else changes: an English string, a string that starts
 * with a Latin letter, and a string already isolated are returned as they are.
 */
export function leftToRightStart(text: string): string {
  return startsRtl(text) ? LRM + text : text;
}

/** The text without the marks these functions add (for a comparison or a test that reads drawn text). */
export function withoutMarks(text: string): string {
  return text.replace(/[‎⁨⁩]/g, '');
}
