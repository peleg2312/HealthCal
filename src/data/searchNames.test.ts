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

const HEBREW_LETTER = /[א-ת]/;
// Cantillation and vowel points (and the other combining marks of the Hebrew block), and the invisible
// direction and joining characters: none belongs in a stored search name.
const POINTS = /[֑-ׇֽֿׁׂׅׄ]/;
const INVISIBLE = /[ ​-‏‪-‮⁠-⁩﻿]/;

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
  בשר: 'b_beef_ground_80_raw',
  ארטיק: 'b_ice_cream_vanilla',
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
