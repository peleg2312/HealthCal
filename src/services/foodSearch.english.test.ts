/**
 * English search before and after Hebrew search (specification 8.2). `__fixtures__/english-ranking.txt`
 * holds, for each of the 304 English queries, the top 5 from before the change, the top 5 now and the
 * top 3 of rankOnline. Rules:
 * - the first result is the one from before, except "coke" and "pepsi" (now regular cola, through its
 *   brand words);
 * - no food that was in a top 5 drops out of the query's 40 results;
 * - every food that moved into a top 5 is new in this job or one of the six corrected rows (a verified
 *   record now), apart from the colas for coke and pepsi (`__fixtures__/foods-before.txt` lists the
 *   foods from before);
 * - "salad" keeps Caesar salad first and Greek salad in its top 5;
 * - the top 5 now is the recorded one (a changed line is read and recorded on purpose).
 * `__fixtures__/english-more.tsv` adds the English reviewer's 213 queries and every Latin search name of
 * five letters or fewer: the first result as recorded, and wherever it differs from before this job, a
 * reason that the test checks (a new food, a Latin search name of the food, or a corrected row).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { BUILTIN_FOODS } from '@/data/foods';
import { SEARCH_NAMES } from '@/data/searchNames';
import type { Food } from '@/types';

import { rankOnline, searchLocal } from './foodSearch';

const FILE = path.join(__dirname, '__fixtures__', 'english-ranking.txt');
const RECORD = process.env.HEALTHCAL_RECORD_ENGLISH === '1';

const food = (id: string, name: string, brand?: string, source: Food['source'] = 'custom'): Food => ({
  id,
  name,
  brand,
  per100g: { kcal: 100, protein: 5, carbs: 10, fat: 3 },
  servings: [],
  source,
  verified: false,
});
/** Branded own foods, so brand matching is covered (the scout's harness, unchanged). */
const CUSTOM: Food[] = [
  food('my_granola', 'Crunchy granola', 'Quaker'),
  food('my_cereal', 'Honey nut cereal', 'Cheerios'),
  food('my_spread', 'Hazelnut spread', 'Nutella'),
  food('my_cookie', 'Sandwich cookies', 'Oreo'),
  food('my_ketchup', 'Tomato ketchup', 'Heinz'),
  food('my_cola', 'Coca-Cola Zero', 'Coca-Cola'),
  food('my_yogurt', 'Strawberry yogurt 1.5%', 'Danone'),
  food('my_cheese', 'Cream cheese light', 'Philadelphia'),
  food('my_pasta', 'Spaghetti n.5', 'Barilla'),
  food('my_cottage', 'Cottage cheese 5%', 'Tnuva'),
  food('my_shake', "Mum's chicken soup"),
  food('my_bars', 'Protein bar, peanut', 'Quest'),
];
const ONLINE: Food[] = [
  food('off_1', 'Hummus Tehina', 'Sabra', 'openfoodfacts'),
  food('off_2', 'Bamba peanut snack', 'Osem', 'openfoodfacts'),
  food('off_3', 'Chocolate milk', 'Tnuva', 'openfoodfacts'),
  food('off_4', 'Cottage cheese 5%', 'Tnuva', 'openfoodfacts'),
  food('off_5', 'Pitas', 'Angel', 'openfoodfacts'),
  food('off_6', 'Greek yogurt 0%', 'Danone', 'openfoodfacts'),
  food('off_7', 'Corn flakes', "Kellogg's", 'openfoodfacts'),
  food('off_8', 'Coca-Cola', 'Coca-Cola', 'openfoodfacts'),
  food('off_9', 'Potato chips classic', "Lay's", 'openfoodfacts'),
  food('off_10', 'Nacho cheese tortilla chips', 'Doritos', 'openfoodfacts'),
];

/** The six existing rows whose values were corrected from a verified record (they may move up). */
const CORRECTED = new Set(['b_labneh', 'b_halloumi', 'b_shakshuka', 'b_israeli_salad', 'b_schnitzel_chicken', 'b_bourekas_cheese']);
const BEFORE_IDS = new Set(
  readFileSync(path.join(__dirname, '__fixtures__', 'foods-before.txt'), 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#')),
);
/** Regular and diet cola, which coke and pepsi now find through their brand words. */
const COLAS = new Set(['b_cola', 'b_cola_diet']);
const isNew = (id: string) => !BEFORE_IDS.has(id) && !id.startsWith('my_');

const raw = readFileSync(FILE, 'utf8').split('\n');
const header = raw.filter((l) => l.startsWith('#'));
const rows = raw
  .filter((l) => l.trim() && !l.startsWith('#'))
  .map((l) => {
    const [q, before, now, online] = l.split('\t');
    return { q, before, now, online };
  });

const top = (q: string, n: number) => searchLocal(q, { customFoods: CUSTOM }, n).map((h) => h.food.id);
const ids = (s: string) => (s === '-' ? [] : s.split(','));
const TABLE_COMPLETE = BUILTIN_FOODS.every((f) => Object.prototype.hasOwnProperty.call(SEARCH_NAMES, f.id));
/** The only queries whose first result may change (decision D6). */
const FIRST_MAY_CHANGE = new Set(['coke', 'pepsi']);

describe('English search keeps its ranking', () => {
  it('reads all 304 queries', () => {
    expect(rows.length).toBe(304);
  });

  it('keeps every first result, apart from coke and pepsi', () => {
    const changed = rows.filter((r) => !FIRST_MAY_CHANGE.has(r.q) && (top(r.q, 1)[0] ?? '-') !== (ids(r.before)[0] ?? '-'));
    expect(changed.map((r) => `${r.q}: ${ids(r.before)[0]} -> ${top(r.q, 1)[0]}`)).toEqual([]);
  });

  it('never loses a food that was in a top 5 from the 40 results', () => {
    const lost: string[] = [];
    for (const r of rows) {
      const all = new Set(top(r.q, 40));
      for (const id of ids(r.before)) if (!all.has(id)) lost.push(`${r.q}: ${id}`);
    }
    expect(lost).toEqual([]);
  });

  it('lets only new foods and the corrected rows move into a top 5 (the colas for coke and pepsi)', () => {
    const wrong: string[] = [];
    for (const r of rows) {
      const before = new Set(ids(r.before));
      for (const id of top(r.q, 5)) {
        if (before.has(id) || isNew(id) || CORRECTED.has(id) || (FIRST_MAY_CHANGE.has(r.q) && COLAS.has(id))) continue;
        wrong.push(`${r.q}: ${id}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it('keeps the online order', () => {
    const changed = rows.filter((r) => `| ${rankOnline(r.q, ONLINE).slice(0, 3).map((f) => f.id).join(',')}` !== r.online);
    expect(changed.map((r) => r.q)).toEqual([]);
  });

  it('salad: Caesar salad first, Greek salad still in the top 5, no regional dish first', () => {
    const t = top('salad', 5);
    expect(t[0]).toBe('b_caesar_salad');
    expect(t).toContain('b_greek_salad');
  });

  it.skipIf(!TABLE_COMPLETE)('gives the recorded top 5 for every query (needs the full name table)', () => {
    const now = rows.map((r) => ({ ...r, got: top(r.q, 5).join(',') || '-' }));
    if (RECORD) {
      writeFileSync(FILE, [...header, ...now.map((r) => `${r.q}\t${r.before}\t${r.got}\t${r.online}`)].join('\n') + '\n');
      return;
    }
    expect(now.filter((r) => r.got !== r.now).map((r) => `${r.q}: recorded ${r.now}, now ${r.got}`)).toEqual([]);
  });

  it.skipIf(!TABLE_COMPLETE)('coke and pepsi find regular cola first', () => {
    expect(top('coke', 1)[0]).toBe('b_cola');
    expect(top('pepsi', 1)[0]).toBe('b_cola');
  });
});

const MORE_FILE = path.join(__dirname, '__fixtures__', 'english-more.tsv');
const moreRaw = readFileSync(MORE_FILE, 'utf8').split('\n');
const more = moreRaw
  .filter((l) => l.trim() && !l.startsWith('#'))
  .map((l) => {
    const [q, before, now, reason = ''] = l.split('\t');
    return { q, before, now, reason };
  });

describe('English search beyond the 304 queries (english-more.tsv)', () => {
  it('reads the 213 queries of the English review and the short Latin search names', () => {
    expect(more.length).toBeGreaterThanOrEqual(213);
    expect(new Set(more.map((r) => r.q)).size).toBe(more.length);
  });

  it('every Latin search name of five letters or fewer is a query line here or in english-ranking.txt', () => {
    const asked = new Set([...more.map((r) => r.q), ...rows.map((r) => r.q)]);
    const short = Object.values(SEARCH_NAMES).flatMap((n) => n.latin ?? []).filter((l) => l.length <= 5);
    expect(short.filter((l) => !asked.has(l))).toEqual([]);
  });

  it.skipIf(!TABLE_COMPLETE)('gives the recorded first result for every query', () => {
    const now = more.map((r) => ({ ...r, got: top(r.q, 1)[0] ?? '-' }));
    if (RECORD) {
      const byQ = new Map(now.map((r) => [r.q, r]));
      const out = moreRaw.map((l) => {
        if (!l.trim() || l.startsWith('#')) return l;
        const r = byQ.get(l.split('\t')[0])!;
        return [r.q, r.before, r.got, r.reason].join('\t').replace(/\t+$/, '');
      });
      writeFileSync(MORE_FILE, out.join('\n'));
      return;
    }
    expect(now.filter((r) => r.got !== r.now).map((r) => `${r.q}: recorded ${r.now}, now ${r.got}`)).toEqual([]);
  });

  it('gives a checked reason wherever the first result differs from before this job, and none elsewhere', () => {
    const wrong: string[] = [];
    for (const r of more) {
      if (r.before === r.now) {
        if (r.reason) wrong.push(`${r.q}: a reason on an unchanged line`);
        continue;
      }
      const latin = SEARCH_NAMES[r.now]?.latin ?? [];
      const ok = r.reason.startsWith('new:')
        ? isNew(r.now)
        : r.reason.startsWith('latin:')
          ? latin.some((n) => n === r.q || n.startsWith(r.q))
          : r.reason.startsWith('corrected:') && CORRECTED.has(r.now);
      if (!ok) wrong.push(`${r.q}: ${r.before} -> ${r.now} (${r.reason || 'no reason'})`);
    }
    expect(wrong).toEqual([]);
  });
});
