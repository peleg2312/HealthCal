// Consistency checks for src/data/foods.ts. Run: node --experimental-strip-types scripts/check-foods.mjs [--foods-ts=<path>]
//
// Consistency only: ids and records are unique, values are plausible and agree with each other (energy against
// the macros, sugar and fibre within carbohydrate, spoons and drinks), and the counts match the header. It does
// not compare a value with its source record: scripts/ops/check-national-foods.mjs does that for the national
// foods and the FNDDS additions (docs/food-data.md). --foods-ts runs it against a copy of foods.ts.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const arg = process.argv.slice(2).find((a) => a.startsWith('--foods-ts='));
const { BUILTIN_FOODS } = await import(
  arg ? pathToFileURL(resolve(arg.slice('--foods-ts='.length))).href : new URL('../src/data/foods.ts', import.meta.url).href
);

// Grams of ethanol per 100 g, for alcoholic drinks (7 kcal/g).
const ALCOHOL = { b_beer: 3.9, b_beer_light: 3.2, b_wine_red: 10.6, b_wine_white: 10.3, b_spirits: 33.0 };
// Explicit, reasoned exceptions to the Atwater check.
const ATWATER_EXCEPTIONS = {
  b_lemon: 'high fibre (2.8 g) and organic acids; USDA energy uses food-specific factors',
  b_corn_cooked: 'USDA energy uses food-specific Atwater factors (fibre 2.4 g); 96 kcal is the SR value',
  b_tomato_paste: 'high fibre (4.1 g) concentrate; USDA food-specific factors',
  b_balsamic_vinegar: 'organic acids / fermentation sugars not captured by macro columns',
};

// The water screen's reading of a serving label (src/features/drinks/rules.ts labelMl).
function labelMl(label) {
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

let bad = 0;
const fail = (id, msg) => { bad++; console.log(`FAIL ${id}: ${msg}`); };
const ids = new Set();
const fdcIds = new Map();
const ilCodes = new Map();
const isId = (v) => Number.isInteger(v) && v > 0;
for (const food of BUILTIN_FOODS) {
  const { id, per100g: n } = food;
  if (ids.has(id)) fail(id, 'duplicate id');
  ids.add(id);
  if (food.source !== 'builtin') fail(id, 'source');
  if (typeof food.verified !== 'boolean') fail(id, 'verified');
  // verified means "names the one record its values come from": a USDA FoodData Central record (fdcId)
  // or an Israeli national nutrition database record (ilCode), never both.
  const hasFdc = isId(food.fdcId);
  const hasIl = isId(food.ilCode);
  if (food.fdcId !== undefined && !hasFdc) fail(id, `bad fdcId ${food.fdcId}`);
  if (food.ilCode !== undefined && !hasIl) fail(id, `bad ilCode ${food.ilCode}`);
  if (hasFdc && hasIl) fail(id, 'names both an fdcId and an ilCode');
  if (food.verified !== (hasFdc || hasIl)) fail(id, food.verified ? 'verified without a record' : 'a record on an unverified food');
  if (hasFdc) {
    if (fdcIds.has(food.fdcId)) fail(id, `fdcId ${food.fdcId} also used by ${fdcIds.get(food.fdcId)}`);
    fdcIds.set(food.fdcId, id);
  }
  if (hasIl) {
    if (ilCodes.has(food.ilCode)) fail(id, `ilCode ${food.ilCode} also used by ${ilCodes.get(food.ilCode)}`);
    ilCodes.set(food.ilCode, id);
  }
  if (!food.servings.length || food.servings.length > 4) fail(id, `servings count ${food.servings.length}`);
  for (const s of food.servings) {
    if (!(s.grams > 0)) fail(id, `serving ${s.label} grams`);
    if (/^100 ?g$/i.test(s.label)) fail(id, '100 g serving must not be included');
  }
  // A national food's spoons are measuring spoons: "tbsp" 4 to 25 g, "tsp" 1 to 10 g (heavier ones are "serving spoons").
  if (hasIl) {
    for (const s of food.servings) {
      if (/\btbsp\b/.test(s.label) && (s.grams < 4 || s.grams > 25)) fail(id, `"${s.label}" ${s.grams} g; a tbsp is 4 to 25 g`);
      if (/\btsp\b/.test(s.label) && (s.grams < 1 || s.grams > 10)) fail(id, `"${s.label}" ${s.grams} g; a tsp is 1 to 10 g`);
    }
  }
  // Every drink's first volume serving gives the water screen 0.90 to 1.15 g per ml. A national drink must name
  // its volume; an older one without a volume serving (espresso's shots) is taken as 1 g per ml by the screen.
  if (food.category === 'drinks') {
    const s = food.servings.find((x) => labelMl(x.label));
    if (!s) {
      if (hasIl) fail(id, 'a national drink with no volume in its servings');
    }
    else {
      const d = s.grams / labelMl(s.label);
      if (d < 0.9 || d > 1.15) fail(id, `"${s.label}" is ${d.toFixed(2)} g per ml`);
    }
  }
  for (const [k, v] of Object.entries(n)) if (!(v >= 0) || !Number.isFinite(v)) fail(id, `bad ${k}=${v}`);
  if (n.protein + n.carbs + n.fat > 100.01) fail(id, `macros sum ${n.protein + n.carbs + n.fat} > 100`);
  if (n.sugar !== undefined && n.sugar > n.carbs + 0.01) fail(id, 'sugar > carbs');
  if (n.satFat !== undefined && n.satFat > n.fat + 0.01) fail(id, `satFat ${n.satFat} > fat ${n.fat}`);
  if (n.fiber !== undefined && n.fiber > n.carbs + 0.01) fail(id, 'fiber > carbs');
  if (id in ATWATER_EXCEPTIONS) continue;
  // A national record's energy was computed from available carbohydrate (4 kcal/g) and fibre (2 kcal/g).
  const fibre = hasIl ? (n.fiber ?? 0) : 0;
  const calc = 4 * n.protein + 4 * (n.carbs - fibre) + 2 * fibre + 9 * n.fat + 7 * (ALCOHOL[id] ?? 0);
  const diff = Math.abs(n.kcal - calc);
  if (diff > 15 && diff > 0.12 * Math.max(n.kcal, calc)) fail(id, `kcal ${n.kcal} vs ${hasIl ? 'national' : 'Atwater'} ${calc.toFixed(0)} (${((diff / n.kcal) * 100).toFixed(0)}%)`);
}
// The counts in the header of src/data/foods.ts.
const COUNTS = { total: 464, fdc: 328, il: 116, neither: 20 };
const got = { total: BUILTIN_FOODS.length, fdc: fdcIds.size, il: ilCodes.size, neither: BUILTIN_FOODS.length - fdcIds.size - ilCodes.size };
for (const k of Object.keys(COUNTS)) if (got[k] !== COUNTS[k]) fail('counts', `${k}: ${got[k]}, the header says ${COUNTS[k]}`);
console.log(`${BUILTIN_FOODS.length} foods (${fdcIds.size} USDA, ${ilCodes.size} national, ${got.neither} estimates), ${bad} failures`);
process.exit(bad ? 1 : 0);
