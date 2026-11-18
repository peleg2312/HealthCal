import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/ui', () => ({ toast: () => {}, haptic: { success: () => {}, tap: () => {}, press: () => {}, select: () => {}, warn: () => {} } }));

import { logFood } from '@/features/food/log';
import { backupJson, foodCsv } from '@/features/settings/exportFormat';
import { today } from '@/lib/dates';
import { fold } from '@/lib/hebrew';
import { COLLECTIONS, useStore } from '@/store';
import type { Collection, SyncedRecord } from '@/types';

import { BUILTIN_FOODS } from './foods';
import { SEARCH_NAMES } from './searchNames';

const HEBREW_LETTER = /[\u05d0-\u05ea]/;
// Cantillation and vowel points (and the other combining marks of the Hebrew block), and the invisible
// direction and joining characters: none belongs in a stored search name.
const POINTS = /[\u0591-\u05bd\u05bf\u05c1\u05c2\u05c4\u05c5\u05c7]/;
const INVISIBLE = /[\u00a0\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/;

const entries = Object.entries(SEARCH_NAMES);
const BY_ID = new Map(BUILTIN_FOODS.map((f) => [f.id, f]));

/**
 * Names taken out of the table on purpose (spec 3.1 rule 7), so none comes back: an ordinary word, a
 * different food, or a spelling that would change what English searches find. On any food, or only on
 * the food named.
 */
const NOT_NAMES: { name: string; on?: string; why: string }[] = [
  { name: 'האם', why: 'ham; also the Hebrew question word' },
  { name: 'נפוליאון', why: 'also the mille-feuille cake' },
  { name: 'מרק קובה', why: 'the soup, not the dumpling' },
  { name: 'לאפה', why: 'a different, bigger bread' },
  { name: 'laffa', why: 'a different, bigger bread' },
  { name: 'רוגלך קינמון', why: 'the rugelach record does not say which filling' },
  { name: 'tahina', why: 'also the English spelling of the raw paste' },
  { name: 'pastrama', why: 'not turkey deli, and it moved English results' },
  { name: 'ארטיק', on: 'b_ice_pop', why: 'any ice cream bar on a stick; it belongs to vanilla ice cream' },
  { name: 'שוק עוף עם עור', on: 'b_chicken_thigh_skin_cooked', why: 'שוק is the drumstick' },
  { name: 'קפה שחור', on: 'b_espresso', why: 'brewed black coffee' },
  { name: 'קפה טורקי', on: 'b_espresso', why: 'brewed black coffee' },
  // Taken out after the readers' review (lead's decisions B2): an ordinary word, a category, or a name that
  // sent people to a different food.
  { name: 'חלבון', why: 'the ordinary word for protein: on no food (חלבון ביצה and אבקת חלבון say which)' },
  { name: 'וואי', why: 'the interjection "wow"' },
  { name: 'דייסה', why: 'oat or semolina porridge, with water or milk: on no food' },
  { name: 'מעדן חלב', why: 'every dairy pudding' },
  { name: 'משקה מוגז', why: 'any fizzy drink, diet ones included' },
  { name: "צ'ילי", why: 'the hot pepper or sweet chili sauce, not chili con carne' },
  { name: 'חלב ושמנת', why: 'no product or phrase people use' },
  { name: 'נקניק', why: 'every cold cut: each sibling carries its qualifier' },
  { name: 'גבינת שמנת', why: 'cream cheese of every fat level: each carries its percent' },
  { name: 'גרעינים לבנים', why: 'pumpkin seeds in the shell, which the list does not hold' },
  { name: 'בשר טחון 15%', why: 'the raw pack\'s label: the cooked row says מבושל' },
  { name: 'בשר טחון 10%', why: 'the raw pack\'s label: the cooked row says מבושל' },
  { name: 'אפונה יבשה', on: 'b_split_peas', why: 'dry, on a cooked row' },
  { name: 'ביצה טרייה', why: 'a fresh egg, not a raw one' },
  { name: 'תפוח אדמה טרי', why: 'fresh, not raw' },
  { name: 'חזה עוף טרי', why: 'fresh (not frozen), not raw' },
  { name: 'סלמון טרי', why: 'fresh, not raw' },
  { name: 'ארטיק', on: 'b_ice_cream_vanilla', why: 'an ice cream bar on a stick: b_ice_cream_bar' },
  { name: 'גרעינים', on: 'b_sunflower_seeds', why: 'the snack in the shell: b_sunflower_seeds_shell' },
  { name: 'גרעינים שחורים', on: 'b_sunflower_seeds', why: 'the snack in the shell: b_sunflower_seeds_shell' },
  { name: 'שמנת לבישול', on: 'b_half_and_half', why: 'cooking cream: b_cooking_cream' },
  { name: 'פיתה לבנה', on: 'b_pita_white', why: 'the ordinary 100 g pita: b_pita_bakery' },
  { name: 'הפוך', on: 'b_cappuccino', why: 'a latte-style drink: b_latte' },
  { name: 'נס קפה', on: 'b_coffee_milk', why: 'black instant coffee: b_coffee_black (with milk is נס קפה עם חלב)' },
  { name: 'artik', why: 'moved English results (arti showed ice cream above artichoke)' },
  { name: 'halla', why: 'moved English results (hall showed challah above halloumi)' },
];

/** The plain everyday word and the one food a person means by it with nothing else typed (spec 3.1 rule 2). */
const PLAIN: Record<string, string> = {
  חלב: 'b_milk_whole',
  פיתה: 'b_pita_bakery',
  טחינה: 'b_tahini_sauce',
  "קוטג'": 'b_cottage_cheese_5pct',
  לחם: 'b_bread_achid',
  שניצל: 'b_schnitzel_chicken',
  בורקס: 'b_bourekas_cheese',
  ביצה: 'b_egg_boiled',
  קפה: 'b_coffee_black',
  סלט: 'b_israeli_salad',
  בשר: 'b_beef_ground_85_cooked',
  ארטיק: 'b_ice_cream_bar',
  שלגון: 'b_ice_cream_bar',
  גבינה: 'b_white_cheese_5pct',
  מרק: 'b_chicken_soup',
  הודו: 'b_turkey_breast_cooked',
  חריף: 'b_schug',
  שוק: 'b_chicken_drumstick',
  סטייק: 'b_beef_sirloin_cooked',
  הפוך: 'b_latte',
  'נס קפה': 'b_coffee_black',
  גרעינים: 'b_sunflower_seeds_shell',
  'עוגת גבינה': 'b_cheesecake_baked',
  'פיתה מלאה': 'b_pita_wholewheat_bakery',
  'פיתה לבנה': 'b_pita_bakery',
  'שמנת לבישול': 'b_cooking_cream',
  פשטידה: 'b_pashtida',
  'כבד עוף': 'b_chicken_liver_fried',
  'קציצות דגים': 'b_fish_patties',
  'קציצות עוף': 'b_chicken_patties',
  'לחם קל': 'b_bread_light',
};

describe('SEARCH_NAMES', () => {
  it('1. covers exactly the bundled foods, each with at least one Hebrew name', () => {
    const ids = BUILTIN_FOODS.map((f) => f.id);
    expect(Object.keys(SEARCH_NAMES).filter((id) => !BY_ID.has(id))).toEqual([]);
    expect(ids.filter((id) => !(SEARCH_NAMES[id]?.he.length > 0))).toEqual([]);
  });

  it('keeps the order of src/data/foods.ts, one entry per food, so a reviewer reads them side by side', () => {
    expect(Object.keys(SEARCH_NAMES)).toEqual(BUILTIN_FOODS.map((f) => f.id));
  });

  it('2. every Hebrew name has a Hebrew letter and folds to at least one word; no name holds points or invisible characters', () => {
    const bad: string[] = [];
    for (const [id, n] of entries) {
      for (const he of n.he) {
        if (!HEBREW_LETTER.test(he)) bad.push(`${id}: "${he}" has no Hebrew letter`);
        if (!fold(he).split(' ').filter(Boolean).length) bad.push(`${id}: "${he}" folds to nothing`);
      }
      for (const name of [...n.he, ...(n.latin ?? [])]) {
        if (POINTS.test(name)) bad.push(`${id}: "${name}" holds vowel points`);
        if (INVISIBLE.test(name)) bad.push(`${id}: "${name}" holds an invisible character`);
        if (name !== name.trim() || /\s{2}/.test(name)) bad.push(`${id}: "${name}" has stray spaces`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('3. no two foods share a folded name, Hebrew or Latin', () => {
    const owner = new Map<string, string>();
    const bad: string[] = [];
    for (const [id, n] of entries) {
      for (const name of [...n.he, ...(n.latin ?? [])]) {
        const key = fold(name);
        const other = owner.get(key);
        if (other && other !== id) bad.push(`"${name}" on ${id} and ${other}`);
        owner.set(key, id);
      }
    }
    expect(bad).toEqual([]);
  });

  it('the plain everyday word belongs to the one food a person means by it', () => {
    const bad: string[] = [];
    for (const [word, id] of Object.entries(PLAIN)) {
      const on = entries.filter(([, n]) => n.he.some((he) => fold(he) === fold(word))).map(([fid]) => fid);
      if (on.length !== 1 || on[0] !== id) bad.push(`${word}: on ${on.join(', ') || 'no food'}, expected ${id}`);
    }
    expect(bad).toEqual([]);
  });

  it('4. a Latin spelling is lower case a-z, space and apostrophe, and is not already a word of the English name', () => {
    const bad: string[] = [];
    for (const [id, n] of entries) {
      const words = new Set(fold(BY_ID.get(id)?.name ?? '').split(' '));
      for (const la of n.latin ?? []) {
        if (!/^[a-z' ]+$/.test(la)) bad.push(`${id}: "${la}" is not lower case a-z`);
        const own = fold(la).split(' ');
        if (own.every((w) => words.has(w))) bad.push(`${id}: "${la}" is already in "${BY_ID.get(id)?.name}"`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('5. none of the names taken out on purpose has come back (NOT_NAMES)', () => {
    const bad: string[] = [];
    for (const { name, on, why } of NOT_NAMES) {
      for (const [id, n] of entries) {
        if (on && on !== id) continue;
        if ([...n.he, ...(n.latin ?? [])].some((x) => fold(x) === fold(name))) bad.push(`"${name}" on ${id} (${why})`);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe('6. no search name reaches a stored record', () => {
  beforeEach(() => {
    useStore.getState().resetAll();
  });

  it('logging bundled foods that have Hebrew names stores, remembers and exports only their English names', () => {
    const date = today();
    for (const id of ['b_cottage_cheese_5pct', 'b_hummus', 'b_tahini_sauce', 'b_schnitzel_chicken']) {
      const food = BY_ID.get(id)!;
      expect(SEARCH_NAMES[id].he.length).toBeGreaterThan(0);
      logFood({ food, serving: food.servings[0], quantity: 1, meal: 'lunch', date });
    }
    const s = useStore.getState();
    const logged = Object.values(s.foodEntries).filter((e) => !e.deleted);
    expect(logged).toHaveLength(4);
    expect(logged.map((e) => e.name).sort()).toEqual(
      ['b_cottage_cheese_5pct', 'b_hummus', 'b_tahini_sauce', 'b_schnitzel_chicken'].map((id) => BY_ID.get(id)!.name).sort(),
    );
    const backup = backupJson({
      profile: null,
      settings: s.settings,
      collections: Object.fromEntries(COLLECTIONS.map((c) => [c, s[c]])) as unknown as { [K in Collection]: Record<string, SyncedRecord> },
      favoriteFoodIds: [],
      recentFoods: s.recentFoods,
      recentActivityIds: [],
    });
    for (const [what, text] of [
      ['entries', JSON.stringify(logged)],
      ['recents', JSON.stringify(s.recentFoods)],
      ['backup', backup],
      ['csv', foodCsv(logged)],
    ] as const) {
      expect(HEBREW_LETTER.test(text), `${what} holds Hebrew`).toBe(false);
    }
    expect(s.recentFoods.length).toBeGreaterThan(0);
  });
});
