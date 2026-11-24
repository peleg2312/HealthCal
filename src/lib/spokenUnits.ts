// Spoken units: a screen-reader label says a unit in full ("290 kilocalories", "1.5 litres",
// "45 minutes", "protein 47 grams"), never its abbreviation (strict review, WCAG 3.1.4 and the
// rubric's D6-39). Visible text keeps its short units; only accessible names go through this.
// Pure: no React, no storage.

const UNITS: [RegExp, string, string][] = [
  // [pattern after a number, singular, plural]
  [/^kcal\b/, 'kilocalorie', 'kilocalories'],
  [/^kg\b/, 'kilogram', 'kilograms'],
  [/^lbs?\b/, 'pound', 'pounds'],
  [/^fl\s?oz\b/, 'fluid ounce', 'fluid ounces'],
  [/^oz\b/, 'ounce', 'ounces'],
  [/^ml\b/, 'millilitre', 'millilitres'],
  [/^L\b/, 'litre', 'litres'],
  [/^cm\b/, 'centimetre', 'centimetres'],
  [/^km\b/, 'kilometre', 'kilometres'],
  [/^mi\b/, 'mile', 'miles'],
  [/^min\b/, 'minute', 'minutes'],
  [/^h\b/, 'hour', 'hours'],
  [/^g\b/, 'gram', 'grams'],
];

const MACROS: Record<string, string> = { P: 'protein', C: 'carbs', F: 'fat' };

/** The unit after a number, in full: "290 kcal" -> "290 kilocalories", "1 kcal" -> "1 kilocalorie". */
export function spokenUnits(label: string): string {
  // Macro letters before a number ("P 47 g") are said as their names first.
  let out = label.replace(/(^|[\s(·,])([PCF])(\s+)(?=[~≈]?\d)/g, (_m, pre: string, letter: string, sp: string) => `${pre}${MACROS[letter]}${sp}`);
  out = out.replace(/(\d[\d,]*(?:\.\d+)?)(\s?)([A-Za-z][A-Za-z ]{0,5})/g, (whole, num: string, sp: string, rest: string) => {
    for (const [re, one, many] of UNITS) {
      const m = rest.match(re);
      if (m) {
        const n = Number(num.replace(/,/g, ''));
        const word = n === 1 ? one : many;
        return `${num} ${word}${rest.slice(m[0].length)}`;
      }
    }
    return whole;
  });
  return out;
}
