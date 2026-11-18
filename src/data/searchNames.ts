/**
 * Extra names a bundled food can be found by: what people call it in Hebrew, and the Latin spellings
 * they type for Middle Eastern dishes (and a few brand words used for a generic food: "pepsi", "coke").
 * Search only: never copied into a Food, an entry, recents, favourites, saved meals, the export or
 * anything synced. The stored name stays the food's English name.
 */
export interface SearchNames {
  /** Hebrew names, the everyday word first. Written as people type them (geresh as ', no vowel points). */
  he: readonly string[];
  /** Latin spellings that are not already words of the English name ("tehina", "shnitzel"). */
  latin?: readonly string[];
}

export const SEARCH_NAMES: Readonly<Record<string, SearchNames>> = {
  b_hummus: { he: ['חומוס', 'חומוס מסחרי', 'ממרח חומוס', 'סלט חומוס'], latin: ['humus', 'chumus', 'houmous'] },
  b_tahini: { he: ['טחינה גולמית', 'טחינה משומשום מלא'], latin: ["t'hina gulmit"] },
  b_banana: { he: ['בננה', 'בננות'] },
  b_milk_whole: { he: ['חלב', 'חלב 3%'] },
  b_halva: { he: ['חלבה'], latin: ['halawa', 'halvah'] },
  b_schnitzel_chicken: { he: ['שניצל', 'שניצל עוף', 'שניצל חזה עוף', 'שניצלונים'], latin: ['shnitzel', 'snitzel'] },
};
