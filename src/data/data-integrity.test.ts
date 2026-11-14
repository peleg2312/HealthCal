import { describe, expect, it } from 'vitest';

import {
  ACTIVITIES,
  ACTIVITY_BY_ID,
  ACTIVITY_CATEGORIES,
  MET_SOURCES,
  POPULAR_ACTIVITY_IDS,
  searchActivities,
} from './activities';
import { BUILTIN_FOODS } from './foods';

// Mirrors scripts/check-foods.mjs and scripts/check-activities.mjs so the checks run with the suite.

const ALCOHOL_G_PER_100: Record<string, number> = { b_beer: 3.9, b_beer_light: 3.2, b_wine_red: 10.6, b_wine_white: 10.3, b_spirits: 33.0 };
// Reasoned exceptions to the Atwater check (USDA food-specific energy factors); same list as the script.
const ATWATER_EXCEPTIONS = new Set(['b_lemon', 'b_corn_cooked', 'b_tomato_paste', 'b_balsamic_vinegar']);

describe('BUILTIN_FOODS', () => {
  it('has a substantial list', () => {
    expect(BUILTIN_FOODS.length).toBeGreaterThanOrEqual(300);
  });
  it('ids are unique and non-empty', () => {
    const ids = BUILTIN_FOODS.map((f) => f.id);
    expect(ids.every((i) => typeof i === 'string' && i.length > 0)).toBe(true);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(dupes).toEqual([]);
  });
  it('names are present', () => {
    expect(BUILTIN_FOODS.filter((f) => !f.name?.trim()).map((f) => f.id)).toEqual([]);
  });
  it('every food is builtin-sourced with a boolean verified flag', () => {
    expect(BUILTIN_FOODS.filter((f) => f.source !== 'builtin' || typeof f.verified !== 'boolean').map((f) => f.id)).toEqual([]);
  });
  it('a food is verified exactly when it names the USDA record it was checked against', () => {
    const hasFdc = (f: (typeof BUILTIN_FOODS)[number]) => Number.isInteger(f.fdcId) && (f.fdcId ?? 0) > 0;
    expect(BUILTIN_FOODS.filter((f) => f.verified !== hasFdc(f) || (!f.verified && f.fdcId !== undefined)).map((f) => f.id)).toEqual([]);
    const fdc = BUILTIN_FOODS.filter(hasFdc).map((f) => f.fdcId);
    expect(fdc.filter((id, i) => fdc.indexOf(id) !== i)).toEqual([]);
  });
  it('every food has at least one serving, all with positive finite grams', () => {
    const bad = BUILTIN_FOODS.filter((f) => f.servings.length < 1 || f.servings.some((s) => !(s.grams > 0) || !Number.isFinite(s.grams) || !s.label));
    expect(bad.map((f) => f.id)).toEqual([]);
  });
  it('servings do not repeat the implicit 100 g one', () => {
    expect(BUILTIN_FOODS.filter((f) => f.servings.some((s) => /^100 ?g$/i.test(s.label))).map((f) => f.id)).toEqual([]);
  });
  it('per-100 g values are finite and non-negative; kcal is plausible (0..905)', () => {
    const bad: string[] = [];
    for (const f of BUILTIN_FOODS) {
      for (const [k, v] of Object.entries(f.per100g)) if (!(typeof v === 'number' && Number.isFinite(v) && v >= 0)) bad.push(`${f.id}.${k}=${v}`);
      if (f.per100g.kcal > 905) bad.push(`${f.id}.kcal=${f.per100g.kcal}`);
    }
    expect(bad).toEqual([]);
  });
  it('macros never weigh more than 100 g per 100 g', () => {
    const bad = BUILTIN_FOODS.filter((f) => f.per100g.protein + f.per100g.carbs + f.per100g.fat > 100.01);
    expect(bad.map((f) => f.id)).toEqual([]);
  });
  it('sub-nutrients are consistent: sugar and fibre within carbs, saturated fat within fat', () => {
    const bad: string[] = [];
    for (const { id, per100g: n } of BUILTIN_FOODS) {
      if (n.sugar !== undefined && n.sugar > n.carbs + 0.01) bad.push(`${id} sugar>carbs`);
      if (n.fiber !== undefined && n.fiber > n.carbs + 0.01) bad.push(`${id} fiber>carbs`);
      if (n.satFat !== undefined && n.satFat > n.fat + 0.01) bad.push(`${id} satFat>fat`);
    }
    expect(bad).toEqual([]);
  });
  it('sodium is in milligrams: no food above 40,000 mg per 100 g (pure salt is 39,300)', () => {
    expect(BUILTIN_FOODS.filter((f) => (f.per100g.sodium ?? 0) > 40_000).map((f) => f.id)).toEqual([]);
  });
  it('kcal agrees with Atwater 4/4/9 (+7 kcal/g alcohol) within max(15 kcal, 12%) apart from listed exceptions', () => {
    const bad: string[] = [];
    for (const f of BUILTIN_FOODS) {
      if (ATWATER_EXCEPTIONS.has(f.id)) continue;
      const n = f.per100g;
      const calc = 4 * n.protein + 4 * n.carbs + 9 * n.fat + 7 * (ALCOHOL_G_PER_100[f.id] ?? 0);
      const diff = Math.abs(n.kcal - calc);
      if (diff > 15 && diff > 0.12 * Math.max(n.kcal, calc)) bad.push(`${f.id}: kcal ${n.kcal} vs ${calc.toFixed(0)}`);
    }
    expect(bad).toEqual([]);
  });
});

describe('ACTIVITIES', () => {
  const INTENSITIES = ['light', 'moderate', 'vigorous'] as const;
  it('ids are unique and the lookup map is complete', () => {
    const ids = ACTIVITIES.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(Object.keys(ACTIVITY_BY_ID).length).toBe(ids.length);
    for (const a of ACTIVITIES) expect(ACTIVITY_BY_ID[a.id]).toBe(a);
  });
  it('ids are snake_case and every activity has a name, emoji and known category', () => {
    const cats = new Set(ACTIVITY_CATEGORIES.map((c) => c.id));
    expect(cats.size).toBe(ACTIVITY_CATEGORIES.length);
    const bad = ACTIVITIES.filter((a) => !/^[a-z0-9]+(_[a-z0-9]+)*$/.test(a.id) || !a.name || !a.emoji || !cats.has(a.category));
    expect(bad.map((a) => a.id)).toEqual([]);
  });
  it('MET values are numbers within 1.0..23 and ordered light <= moderate <= vigorous', () => {
    const bad: string[] = [];
    for (const a of ACTIVITIES) {
      for (const i of INTENSITIES) {
        const v = a.met[i];
        if (typeof v !== 'number' || !Number.isFinite(v) || v < 1.0 || v > 23) bad.push(`${a.id}.${i}=${v}`);
      }
      if (!(a.met.light <= a.met.moderate && a.met.moderate <= a.met.vigorous)) bad.push(`${a.id} unordered ${a.met.light}/${a.met.moderate}/${a.met.vigorous}`);
    }
    expect(bad).toEqual([]);
  });
  it('every intensity has a short hint', () => {
    const bad: string[] = [];
    for (const a of ACTIVITIES) for (const i of INTENSITIES) {
      const h = a.intensityHint?.[i];
      if (!h || h.length > 30) bad.push(`${a.id}.${i}`);
    }
    expect(bad).toEqual([]);
  });
  it('equal MET values across intensities are explained in MET_SOURCES', () => {
    const bad = ACTIVITIES.filter((a) => {
      const m = a.met;
      const reused = m.light === m.moderate || m.moderate === m.vigorous;
      return reused && !/single Compendium value|reuse|share|No dedicated row|Substitution/i.test(MET_SOURCES[a.id] ?? '');
    });
    expect(bad.map((a) => a.id)).toEqual([]);
  });
  it('MET_SOURCES covers exactly the activities', () => {
    expect(Object.keys(MET_SOURCES).sort()).toEqual(ACTIVITIES.map((a) => a.id).sort());
  });
  it('every POPULAR id exists, with no repeats', () => {
    expect(POPULAR_ACTIVITY_IDS.filter((id) => !ACTIVITY_BY_ID[id])).toEqual([]);
    expect(new Set(POPULAR_ACTIVITY_IDS).size).toBe(POPULAR_ACTIVITY_IDS.length);
  });
  it('searchActivities: empty query returns all sorted; prefix first; keywords; nonsense empty', () => {
    const all = searchActivities('');
    expect(all).toHaveLength(ACTIVITIES.length);
    for (let i = 1; i < all.length; i++) expect(all[i - 1].name.localeCompare(all[i].name)).toBeLessThanOrEqual(0);
    const sw = searchActivities('SWIM');
    expect(sw.length).toBeGreaterThan(0);
    expect(sw[0].name.toLowerCase().startsWith('swim')).toBe(true);
    expect(searchActivities('zzzzqq')).toEqual([]);
  });
});
