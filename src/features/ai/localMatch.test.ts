/**
 * The photo review's suggestions (`matchFoods`) after Hebrew search (decision C17): text without a Hebrew
 * letter is scored exactly as before (proved against a copy of the scorer from git 3fa7914 on today's foods),
 * text with a Hebrew letter goes to the food search. `__fixtures__/ai-items.tsv` records the English review's
 * 50 item names before this job and now.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { BUILTIN_FOODS } from '@/data/foods';
import { searchLocal } from '@/services/foodSearch';
import type { Food } from '@/types';

import { matchFoods, parseAmount } from './localMatch';

// ---- the scorer of git 3fa7914, word for word (only its amount reader is shared, unchanged since)
const oldWords = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1);
const GENERIC = new Set(['raw', 'cooked', 'fresh', 'with', 'and', 'of', 'the', 'plain', 'whole', 'homemade', 'small', 'large', 'medium']);
const COOKED_WORDS = new Set(['cooked', 'grilled', 'roasted', 'baked', 'fried', 'boiled', 'steamed', 'sauteed', 'stewed', 'braised', 'toasted', 'poached', 'scrambled', 'barbecued', 'seared']);
const RAW_WORDS = new Set(['raw', 'dry', 'dried', 'uncooked']);
function oldStateFit(queryWords: string[], nameWords: string[]): number {
  const wantsCooked = queryWords.some((w) => COOKED_WORDS.has(w));
  const wantsRaw = queryWords.some((w) => RAW_WORDS.has(w));
  if (wantsCooked === wantsRaw) return 0;
  const isCooked = nameWords.some((w) => COOKED_WORDS.has(w));
  const isRaw = nameWords.some((w) => RAW_WORDS.has(w));
  if (isCooked === isRaw) return 0;
  return wantsCooked === isCooked ? 1 : -1;
}
function oldMatchFoods(query: string, foods: Food[], limit = 3): Food[] {
  const all = oldWords(parseAmount(query).rest);
  const q = all.filter((w) => !GENERIC.has(w));
  if (q.length === 0) return [];
  const scored: { food: Food; score: number }[] = [];
  for (const food of foods) {
    const name = oldWords(food.name);
    let score = 0;
    for (const w of q) {
      const stem = w.replace(/e?s$/, '');
      if (name.includes(w)) score += 3;
      else if (name.some((n) => n.replace(/e?s$/, '') === stem)) score += 2.5;
      else if (name.some((n) => n.startsWith(stem) && stem.length >= 3)) score += 1;
    }
    if (score === 0) continue;
    if (name[0] && q.some((w) => name[0].startsWith(w.replace(/e?s$/, '')))) score += 1;
    score -= name.length * 0.05;
    const fit = oldStateFit(all, name);
    if (fit < 0) continue;
    score += fit;
    scored.push({ food, score });
  }
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.food);
}
// ----

const FIX = path.join(__dirname, '__fixtures__');
const ITEMS_FILE = path.join(FIX, 'ai-items.tsv');
const RECORD = process.env.HEALTHCAL_RECORD_AI === '1';
const itemsRaw = readFileSync(ITEMS_FILE, 'utf8').split('\n');
const items = itemsRaw
  .filter((l) => l.trim() && !l.startsWith('#'))
  .map((l) => {
    const [q, before, now] = l.split('\t');
    return { q, before, now };
  });
const english = readFileSync(path.join(__dirname, '../../services/__fixtures__/english-queries.txt'), 'utf8')
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#'));
const ids = (fs: Food[]) => fs.map((f) => f.id).join(',') || '-';
const own = (id: string, name: string): Food => ({ id, name, per100g: { kcal: 100, protein: 5, carbs: 10, fat: 3 }, servings: [], source: 'custom', verified: false });

describe('matchFoods after Hebrew search', () => {
  it('reads the 50 item names', () => {
    expect(items.length).toBe(50);
  });

  it('scores text without a Hebrew letter exactly as the code before this job did, on the same foods', () => {
    const pools: Food[][] = [BUILTIN_FOODS, [own('c_mixed', 'Pita פיתה מקמח מלא'), own('c_he', 'סלט של אמא'), ...BUILTIN_FOODS]];
    const differ: string[] = [];
    for (const pool of pools) {
      for (const q of [...items.map((i) => i.q), ...english, '2 eggs', '1/2 avocado', '150 g rice', 'shnitzel', 'tehina', 'chiken']) {
        if (ids(matchFoods(q, pool)) !== ids(oldMatchFoods(q, pool))) differ.push(q);
      }
    }
    expect(differ).toEqual([]);
  });

  it('sends text with a Hebrew letter to the food search', () => {
    for (const q of ['חומוס', 'שניצל עוף', 'והחומוס', '2 ביצים', 'אורז מבושל']) {
      const rest = parseAmount(q).rest;
      expect(ids(matchFoods(q, BUILTIN_FOODS))).toBe(ids(searchLocal(rest, { foods: BUILTIN_FOODS }, 3).map((h) => h.food)));
    }
  });

  it('gives the recorded suggestions for the 50 item names', () => {
    const now = items.map((i) => ({ ...i, got: ids(matchFoods(i.q, BUILTIN_FOODS)) }));
    if (RECORD) {
      const byQ = new Map(now.map((r) => [r.q, r]));
      writeFileSync(
        ITEMS_FILE,
        itemsRaw
          .map((l) => {
            if (!l.trim() || l.startsWith('#')) return l;
            const r = byQ.get(l.split('\t')[0])!;
            return [r.q, r.before, r.got].join('\t');
          })
          .join('\n'),
      );
      return;
    }
    expect(now.filter((r) => r.got !== r.now).map((r) => `${r.q}: recorded ${r.now}, now ${r.got}`)).toEqual([]);
  });
});
