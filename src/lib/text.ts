/**
 * Line breaking for numbers. A line of numbers ("2,304 kcal · P 102 g · C 258 g · F 95 g",
 * "1.5 × 1/2 cup · 60 g", "59-79 kg", "1,293 / 493 g") may break only at its words and
 * separators, never between a number and its unit, a macro letter and its number, or the two
 * ends of a range. The kit's `Text` runs every string it draws through `keepTogether`, so screens
 * build their lines with plain spaces and hyphens.
 */

/** No-break space: the browser and the phones keep the two sides on one line. */
export const NBSP = '\u00A0';
/** Word joiner: no break at a hyphen or dash between two numbers. Draws nothing. */
export const WJ = '\u2060';

/** Short unit words that may follow a number in a separate, nested Text (" kcal" after a big number). */
const UNIT_WORD = /^ (?=(?:kcal|g|kg|lb|st|oz|fl\u00A0oz|fl oz|ml|L|l|km|mi|m|yd|ft|in|cm|min|h|s|%|bpm|×)(?![A-Za-z]))/;

export function keepTogether(text: string): string {
  if (!/\d/.test(text)) return text;
  return (
    text
      // A number and the word, unit or sign after it: "102 g", "4 servings", "36.5 h", "56 %", "1,293 / 493".
      .replace(/(\d) (?=[A-Za-z%°µ×/])/g, `$1${NBSP}`)
      // A compound measure: "1 h 20 min", "5 ft 5 in", "11 st 4 lb".
      .replace(/(\d\u00A0(?:h|ft|st|lb|kg|m|min)) (?=\d)/g, `$1${NBSP}`)
      // The app's counted unit "full days": "4 full days", "5 of 6 full days".
      .replace(/(\d\u00A0full) (?=days?\b)/g, `$1${NBSP}`)
      // A sign and the number after it: "× 1/2 cup", "/ 493 g".
      .replace(/([×/]) (?=\d)/g, `$1${NBSP}`)
      // A macro letter and its number: "P 102 g", "C 258 g", "F 95 g".
      .replace(/(^|[\s(·,])([PCF]) (?=\d)/g, `$1$2${NBSP}`)
      // A range: "59-79 kg", "129–174 lb"; and a number joined to its unit by a hyphen: "150-minute".
      .replace(/(\d)([-–])(?=\d)/g, `$1${WJ}$2${WJ}`)
      .replace(/(\d)-(?=[A-Za-z])/g, `$1${WJ}-${WJ}`)
  );
}

/**
 * A unit set in its own nested Text after a number (`<Text variant="unit"> kcal</Text>`): its leading
 * space becomes a no-break space, so the unit never starts a line on its own.
 */
export function keepUnitWithNumber(text: string): string {
  return UNIT_WORD.test(text) ? NBSP + text.slice(1) : text;
}
