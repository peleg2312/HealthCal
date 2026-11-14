// Sanity checks for src/data/foods.ts. Run: node --experimental-strip-types scripts/check-foods.mjs
import { BUILTIN_FOODS } from '../src/data/foods.ts';

// Grams of ethanol per 100 g, for alcoholic drinks (7 kcal/g).
const ALCOHOL = { b_beer: 3.9, b_beer_light: 3.2, b_wine_red: 10.6, b_wine_white: 10.3, b_spirits: 33.0 };
// Explicit, reasoned exceptions to the Atwater check.
const ATWATER_EXCEPTIONS = {
  b_lemon: 'high fibre (2.8 g) and organic acids; USDA energy uses food-specific factors',
  b_corn_cooked: 'USDA energy uses food-specific Atwater factors (fibre 2.4 g); 96 kcal is the SR value',
  b_tomato_paste: 'high fibre (4.1 g) concentrate; USDA food-specific factors',
  b_balsamic_vinegar: 'organic acids / fermentation sugars not captured by macro columns',
};

let bad = 0;
const fail = (id, msg) => { bad++; console.log(`FAIL ${id}: ${msg}`); };
const ids = new Set();
const fdcIds = new Map();
for (const food of BUILTIN_FOODS) {
  const { id, per100g: n } = food;
  if (ids.has(id)) fail(id, 'duplicate id');
  ids.add(id);
  if (food.source !== 'builtin') fail(id, 'source');
  if (typeof food.verified !== 'boolean') fail(id, 'verified');
  // verified means "checked against a USDA FoodData Central record", so the two go together.
  const hasFdc = Number.isInteger(food.fdcId) && food.fdcId > 0;
  if (food.verified && !hasFdc) fail(id, 'verified without an fdcId');
  if (!food.verified && food.fdcId !== undefined) fail(id, 'fdcId on an unverified food');
  if (hasFdc) {
    if (fdcIds.has(food.fdcId) && fdcIds.get(food.fdcId) !== id) fail(id, `fdcId ${food.fdcId} also used by ${fdcIds.get(food.fdcId)}`);
    fdcIds.set(food.fdcId, id);
  }
  if (!food.servings.length || food.servings.length > 4) fail(id, `servings count ${food.servings.length}`);
  for (const s of food.servings) {
    if (!(s.grams > 0)) fail(id, `serving ${s.label} grams`);
    if (/^100 ?g$/i.test(s.label)) fail(id, '100 g serving must not be included');
  }
  for (const [k, v] of Object.entries(n)) if (!(v >= 0) || !Number.isFinite(v)) fail(id, `bad ${k}=${v}`);
  if (n.protein + n.carbs + n.fat > 100.01) fail(id, `macros sum ${n.protein + n.carbs + n.fat} > 100`);
  if (n.sugar !== undefined && n.sugar > n.carbs + 0.01) fail(id, 'sugar > carbs');
  if (n.satFat !== undefined && n.satFat > n.fat + 0.01) fail(id, `satFat ${n.satFat} > fat ${n.fat}`);
  if (n.fiber !== undefined && n.fiber > n.carbs + 0.01) fail(id, 'fiber > carbs');
  if (id in ATWATER_EXCEPTIONS) continue;
  const calc = 4 * n.protein + 4 * n.carbs + 9 * n.fat + 7 * (ALCOHOL[id] ?? 0);
  const diff = Math.abs(n.kcal - calc);
  if (diff > 15 && diff > 0.12 * Math.max(n.kcal, calc)) fail(id, `kcal ${n.kcal} vs Atwater ${calc.toFixed(0)} (${((diff / n.kcal) * 100).toFixed(0)}%)`);
}
console.log(`${BUILTIN_FOODS.length} foods, ${bad} failures`);
process.exit(bad ? 1 : 0);
