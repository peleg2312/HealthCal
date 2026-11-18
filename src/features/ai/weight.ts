/**
 * The meal's weighed total, for the person who put the plate on a scale ("Weighed it? Total grams",
 * on the photo screen). Pure, no React.
 *
 * It travels as the photo's text in exactly the words that were measured (README, "How close it
 * gets"): `About N g of food in total.`, N rounded to the nearest 10 g, which the function sends to
 * the model as `Details from the user: About N g of food in total.`. Measured with the true weight
 * on 60 weighed dishes: about 8 points less error on meals of 150 kcal or more, reading high rather
 * than low. A person's own weight (a little off, or with the plate in it) was not measured, hence
 * the label asks for the food only.
 *
 * Sent as text, not as a field of its own, so an app that has this and a function that does not
 * (or the other way round) still send and receive the same request.
 */

/** The smallest and largest total the field accepts, in grams. */
export const WEIGHT_MIN_G = 10;
export const WEIGHT_MAX_G = 5000;

/** Why a typed total cannot be used, or null when it can (an empty field is fine: it is optional). */
export function weightProblem(grams: number | null): string | null {
  if (grams === null) return null;
  if (!Number.isFinite(grams) || grams < WEIGHT_MIN_G || grams > WEIGHT_MAX_G) return 'Enter 10 to 5,000 g, or leave it empty';
  return null;
}

/**
 * The total as sent: rounded to the nearest 10 g, a 5 to the even ten (85 g is 80, 95 g is 100), which
 * is how the measured texts were rounded. Null when there is none to send.
 */
export function sentWeight(grams: number | null): number | null {
  if (grams === null || weightProblem(grams)) return null;
  const tens = grams / 10;
  const down = Math.floor(tens);
  const rest = tens - down;
  const rounded = rest > 0.5 ? down + 1 : rest < 0.5 ? down : down % 2 === 0 ? down : down + 1;
  return Math.max(WEIGHT_MIN_G, rounded * 10);
}

/** The measured sentence for a total that can be sent. */
export function weightSentence(grams: number): string {
  return `About ${grams} g of food in total.`;
}

/**
 * The text that goes with a photo: the weight sentence first, then the person's own note. With no
 * note it is the measured sentence alone, byte for byte; with no weight it is the note as before.
 */
export function photoText(note: string, grams: number | null): string | undefined {
  const n = note.trim();
  const g = sentWeight(grams);
  if (g === null) return n || undefined;
  return n ? `${weightSentence(g)} ${n}` : weightSentence(g);
}

/** Grams in one ounce (avoirdupois), for the imperial form of the field. */
export const GRAMS_PER_OZ = 28.349523125;
/** The imperial field's limits, in ounces: about 10 g to 5,000 g. */
export const OZ_MIN = 0.4;
export const OZ_MAX = 176;

/** What the field's text says: the total in grams (unrounded), why it cannot be used, and how to show it back. */
export interface WeightEntry {
  grams: number | null;
  problem: string | null;
  /** The total as the person typed it, for the review ("418 g", "1,500 g", "16 oz (about 450 g)"); null when there is none to use. */
  shown: string | null;
}

const NONE: WeightEntry = { grams: null, problem: null, shown: null };
const groupInt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/**
 * Reads the field's own text. Metric takes whole grams, with or without a thousands separator
 * ("1500", "1,500", "1.500", "1 500"), and a trailing "g"; a decimal ("1.5", "41.5") is refused
 * rather than guessed, since it could be kilograms or a slip, and a guess that reads low is the worse
 * one. Imperial takes ounces, with a decimal, and converts to grams, so the request still carries the
 * measured "About N g" sentence. Text that is not a number is an error, never a silent "nothing sent".
 */
export function readWeight(text: string, units: 'metric' | 'imperial'): WeightEntry {
  const t = text.trim().replace(/[  ]/g, ' ');
  if (t === '') return NONE;
  if (units === 'imperial') {
    const body = t.replace(/\s*(oz|ounces?)\.?$/i, '');
    if (!/^(\d+([.,]\d+)?|[.,]\d+)$/.test(body)) return { grams: null, problem: 'Enter a number of ounces', shown: null };
    const oz = Number(body.replace(',', '.'));
    if (!(oz >= OZ_MIN && oz <= OZ_MAX)) return { grams: null, problem: `Enter ${OZ_MIN} to ${OZ_MAX} oz, or leave it empty`, shown: null };
    const grams = oz * GRAMS_PER_OZ;
    const sent = sentWeight(grams);
    const ozText = String(Math.round(oz * 10) / 10);
    return { grams, problem: null, shown: sent === null ? `${ozText} oz` : `${ozText} oz (about ${groupInt(sent)} g)` };
  }
  const body = t.replace(/\s*(g|grams?)\.?$/i, '');
  let digits: string;
  if (/^\d+$/.test(body)) digits = body;
  else if (/^\d{1,3}([,. ]\d{3})+$/.test(body)) digits = body.replace(/[,. ]/g, '');
  else if (/^\d*[.,]\d*$/.test(body) && /\d/.test(body)) return { grams: null, problem: 'Enter whole grams, e.g. 450', shown: null };
  else return { grams: null, problem: 'Enter a number of grams', shown: null };
  const grams = Number(digits);
  const problem = weightProblem(grams);
  if (problem) return { grams: null, problem, shown: null };
  return { grams, problem: null, shown: `${groupInt(grams)} g` };
}
