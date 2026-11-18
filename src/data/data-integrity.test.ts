import { describe, expect, it } from 'vitest';

import {
  ACTIVITIES,
  ACTIVITY_BY_ID,
  ACTIVITY_CATEGORIES,
  MET_SOURCES,
  POPULAR_ACTIVITY_IDS,
  searchActivities,
} from './activities';
import { BUILTIN_FOODS, NATIONAL_LABELS, NATIONAL_RECIPES } from './foods';

// The water screen's reading of a serving label (src/features/drinks/rules.ts labelMl), copied so this file
// stays free of app imports.
function labelMl(label: string): number | null {
  const ml = label.match(/(\d+(?:\.\d+)?)\s*ml\b/i);
  if (ml) return Number(ml[1]);
  const l = label.match(/(\d+(?:\.\d+)?)\s*(?:l|litres?|liters?)\b/i);
  if (l) return Number(l[1]) * 1000;
  const oz = label.match(/(\d+(?:\.\d+)?)\s*fl\.?\s*oz\b/i);
  if (oz) return Number(oz[1]) * 29.5735;
  const cup = label.match(/(?:(\d+(?:\.\d+)?)(?:\/(\d+))?\s+)?cups?\b/i);
  if (cup) return (cup[1] ? Number(cup[1]) / (cup[2] ? Number(cup[2]) : 1) : 1) * 236.588;
  return null;
}

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
  it('a food is verified exactly when it names one record: a USDA fdcId or a national ilCode, never both', () => {
    const isId = (v: number | undefined) => Number.isInteger(v) && (v ?? 0) > 0;
    const bad = BUILTIN_FOODS.filter((f) => {
      const fdc = isId(f.fdcId), il = isId(f.ilCode);
      return (f.fdcId !== undefined && !fdc) || (f.ilCode !== undefined && !il) || (fdc && il) || f.verified !== (fdc || il);
    });
    expect(bad.map((f) => f.id)).toEqual([]);
    const fdc = BUILTIN_FOODS.filter((f) => f.fdcId !== undefined).map((f) => f.fdcId);
    expect(fdc.filter((id, i) => fdc.indexOf(id) !== i)).toEqual([]);
    const il = BUILTIN_FOODS.filter((f) => f.ilCode !== undefined).map((f) => f.ilCode);
    expect(il.filter((id, i) => il.indexOf(id) !== i)).toEqual([]);
  });
  it('NATIONAL_RECIPES and NATIONAL_LABELS name bundled national records, and never the same one', () => {
    const codes = new Set(BUILTIN_FOODS.map((f) => f.ilCode).filter((c) => c !== undefined));
    expect([...NATIONAL_RECIPES].filter((c) => !codes.has(c))).toEqual([]);
    expect([...NATIONAL_LABELS].filter((c) => !codes.has(c))).toEqual([]);
    expect([...NATIONAL_LABELS].filter((c) => NATIONAL_RECIPES.has(c))).toEqual([]);
    expect(NATIONAL_RECIPES.size).toBe(48);
    expect(NATIONAL_LABELS.size).toBe(10);
  });
  it('a national food\'s spoons are measuring spoons: "tbsp" 4 to 25 g, "tsp" 1 to 10 g', () => {
    const bad: string[] = [];
    for (const f of BUILTIN_FOODS) {
      if (f.ilCode === undefined) continue;
      for (const s of f.servings) {
        if (/\btbsp\b/.test(s.label) && (s.grams < 4 || s.grams > 25)) bad.push(`${f.id} "${s.label}" ${s.grams} g`);
        if (/\btsp\b/.test(s.label) && (s.grams < 1 || s.grams > 10)) bad.push(`${f.id} "${s.label}" ${s.grams} g`);
      }
    }
    expect(bad).toEqual([]);
  });
  it('every drink\'s first volume serving weighs 0.90 to 1.15 g per ml, and every national drink names its volume', () => {
    const bad: string[] = [];
    for (const f of BUILTIN_FOODS) {
      if (f.category !== 'drinks') continue;
      const s = f.servings.find((x) => labelMl(x.label));
      if (!s) {
        if (f.ilCode !== undefined) bad.push(`${f.id} names no volume`);
        continue;
      }
      const d = s.grams / labelMl(s.label)!;
      if (d < 0.9 || d > 1.15) bad.push(`${f.id} "${s.label}" ${d.toFixed(2)} g/ml`);
    }
    expect(bad).toEqual([]);
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
  it('kcal agrees with Atwater 4/4/9 (+7 kcal/g alcohol) within max(15 kcal, 12%) apart from listed exceptions; national foods count fibre at 2 kcal/g', () => {
    const bad: string[] = [];
    for (const f of BUILTIN_FOODS) {
      if (ATWATER_EXCEPTIONS.has(f.id)) continue;
      const n = f.per100g;
      // A national record's energy was computed from available carbohydrate (4 kcal/g) and fibre (2 kcal/g).
      const fibre = f.ilCode !== undefined ? (n.fiber ?? 0) : 0;
      const calc = 4 * n.protein + 4 * (n.carbs - fibre) + 2 * fibre + 9 * n.fat + 7 * (ALCOHOL_G_PER_100[f.id] ?? 0);
      const diff = Math.abs(n.kcal - calc);
      if (diff > 15 && diff > 0.12 * Math.max(n.kcal, calc)) bad.push(`${f.id}: kcal ${n.kcal} vs ${calc.toFixed(0)}`);
    }
    expect(bad).toEqual([]);
  });
});

// The six tea and coffee drinks of the water screen are computed from reference rows (header of foods.ts):
// a 250 ml cup is 220 g brew + 30 ml 2% milk (30.9 g) [+ 4.2 g sugar]; sugar only is 250 g brew + 4.2 g sugar.
describe('computed tea and coffee drinks', () => {
  const by = new Map(BUILTIN_FOODS.map((f) => [f.id, f]));
  const KEYS = ['kcal', 'protein', 'carbs', 'fat', 'sugar', 'satFat', 'sodium'] as const;
  const recipes: Record<string, [string, number][]> = {
    b_coffee_milk: [['b_coffee_black', 220], ['b_milk_2pct', 30.9]],
    b_coffee_milk_sugar: [['b_coffee_black', 220], ['b_milk_2pct', 30.9], ['b_sugar_white', 4.2]],
    b_coffee_sugar: [['b_coffee_black', 250], ['b_sugar_white', 4.2]],
    b_tea_milk: [['b_tea_brewed', 220], ['b_milk_2pct', 30.9]],
    b_tea_milk_sugar: [['b_tea_brewed', 220], ['b_milk_2pct', 30.9], ['b_sugar_white', 4.2]],
    b_tea_sugar: [['b_tea_brewed', 250], ['b_sugar_white', 4.2]],
  };
  it.each(Object.entries(recipes))('%s recomputes from its rows (0.1 kcal, 0.05 g, sodium to the mg) and its cup weighs the recipe', (id, parts) => {
    const food = by.get(id)!;
    expect(food.verified).toBe(false);
    const grams = parts.reduce((s, [, g]) => s + g, 0);
    for (const k of KEYS) {
      const total = parts.reduce((s, [pid, g]) => s + ((by.get(pid)!.per100g[k] ?? 0) * g) / 100, 0);
      const per100 = (total * 100) / grams;
      const tol = k === 'kcal' ? 0.1 : k === 'sodium' ? 0.5 : 0.05;
      expect(Math.abs((food.per100g[k] ?? 0) - per100), `${id} ${k}: ${food.per100g[k]} vs ${per100.toFixed(3)}`).toBeLessThanOrEqual(tol);
    }
    expect(food.servings[0]).toEqual({ label: '1 cup (250 ml)', grams: Math.round(grams) });
  });
  it('the low-calorie sports drink names its FNDDS record once', () => {
    expect(by.get('b_sports_drink_low')?.fdcId).toBe(2710774);
    expect(BUILTIN_FOODS.filter((f) => f.fdcId === 2710774)).toHaveLength(1);
  });
  it('counts: 448 foods, 329 with a USDA record, 99 with a national record, 20 estimates', () => {
    expect(BUILTIN_FOODS.length).toBe(448);
    expect(BUILTIN_FOODS.filter((f) => f.fdcId !== undefined)).toHaveLength(329);
    expect(BUILTIN_FOODS.filter((f) => f.ilCode !== undefined)).toHaveLength(99);
    expect(BUILTIN_FOODS.filter((f) => !f.verified)).toHaveLength(20);
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
