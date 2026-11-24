/**
 * A food's name as it is drawn (display only). The bundled list keeps the reference databases' habit of
 * writing the state of a food in capitals ("Oats, rolled, DRY (uncooked)", "Chicken breast, skinless,
 * RAW", "Chicken thigh, skinless, COOKED (roasted)"); on screen those words read as shouting, so a
 * bundled food's all-capital words are drawn in lower case. A real acronym stays (`KEEP_CAPS`: "about 5%
 * ABV"), and a name from anywhere else (an online product with its brand's capitals, your own food, an AI
 * estimate, a quick add) comes back exactly as written.
 *
 * Never store, search, export, back up or compare the result: the stored name, the search, the export and
 * the backup keep the name as it is. Use it wherever a food's or an entry's name is drawn or read aloud.
 */
import type { FoodSource } from '@/types';

/** All-capital words in a bundled name that are real acronyms, kept as written. */
export const KEEP_CAPS: ReadonlySet<string> = new Set(['ABV', 'BBQ', 'BLT', 'IPA', 'UHT', 'USDA']);

/** The sources whose names come from the bundled reference list. */
const BUNDLED: ReadonlySet<FoodSource> = new Set<FoodSource>(['builtin', 'usda']);

/** "Oats, rolled, dry (uncooked)" for the bundled "Oats, rolled, DRY (uncooked)"; any other name as written. */
export function displayFoodName(food: { name: string; source: FoodSource }): string {
  if (!BUNDLED.has(food.source)) return food.name;
  return food.name.replace(/\b[A-Z]{2,}\b/g, (word) => (KEEP_CAPS.has(word) ? word : word.toLowerCase()));
}
