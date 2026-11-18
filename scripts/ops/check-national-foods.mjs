// Checks every bundled food that names an Israeli national nutrition database record (`ilCode`) against
// the downloaded national tables, and with --fndds the foods added from USDA FNDDS against that release.
// Run by hand (the source files are not in the repository; docs/food-data.md says how to get them):
//
//   node --experimental-strip-types scripts/ops/check-national-foods.mjs \
//     --foods=<mitzrachim.csv or .json> --units=<yehidot_mida_lemitzrachim.csv or .json> \
//     [--fndds=<survey_food_csv folder>] [--foods-ts=<a copy of src/data/foods.ts>] [--names-ts=<a copy of searchNames.ts>]
//
// --foods-ts and --names-ts run the check against a copy (to prove a planted fault is caught); by default the
// repository's own files are read. One line per failure, then the name pairs and the counts; exit 1 on any
// failure. Rules: docs/food-data.md.
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { HEBREW_STOPWORDS, collapseDoubles, fold } from '../../src/lib/hebrew.ts';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split(/=(.*)/s).slice(0, 2)));
if (!args.foods || !args.units) {
  console.error(
    'usage: --foods=<mitzrachim.csv|json> --units=<yehidot_mida_lemitzrachim.csv|json> [--fndds=<folder>] [--foods-ts=<path>] [--names-ts=<path>]',
  );
  process.exit(2);
}
const here = new URL('.', import.meta.url);
const foodsTs = args['foods-ts'] ? pathToFileURL(resolve(args['foods-ts'])).href : new URL('../../src/data/foods.ts', here).href;
const namesTs = args['names-ts'] ? pathToFileURL(resolve(args['names-ts'])).href : new URL('../../src/data/searchNames.ts', here).href;
const { BUILTIN_FOODS, NATIONAL_LABELS, NATIONAL_RECIPES } = await import(foodsTs);
const { SEARCH_NAMES } = await import(namesTs);

// ------------------------------------------------------------------ reading the tables
function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows;
  const h = head.map((x) => x.replace(/^﻿/, '').trim());
  return body.map((r) => Object.fromEntries(h.map((k, i) => [k, r[i] ?? ''])));
}
/** A CKAN datastore dump ({ records: [...] }) or a CSV with a header row. */
function readTable(path) {
  const text = readFileSync(path, 'utf8');
  if (path.endsWith('.json')) {
    const j = JSON.parse(text);
    return j.records ?? j.result?.records ?? j;
  }
  return parseCsv(text);
}
/** A number, or undefined when the record leaves the value empty. */
const num = (v) => (v === null || v === undefined || String(v).trim() === '' ? undefined : Number(v));

const foodsByCode = new Map(readTable(args.foods).map((r) => [num(r.Code), r]));
const unitsByCode = new Map();
for (const r of readTable(args.units)) {
  const code = num(r.mmitzrach);
  if (!unitsByCode.has(code)) unitsByCode.set(code, []);
  unitsByCode.get(code).push({ unit: num(r.mida), grams: num(r.mishkal) });
}

// ------------------------------------------------------------------ rules
let failures = 0;
const fail = (id, msg) => { failures++; console.log(`FAIL ${id}: ${msg}`); };

/** Records whose Hebrew and English names disagree about the flavour: stored without one (2445: cinnamon or chocolate). */
const NAME_DISAGREES = new Set([2445]);
const FLAVOUR = /\b(cinnamon|chocolate|cocoa|vanilla|plain)\b/i;
/**
 * A value the record holds that is not stored, with the reason: a sugar the record's own carbohydrate
 * contradicts is left out (unknown), never guessed.
 */
const NOT_STORED = {
  8835: { sugar: 'the record gives sugar 0 beside 10.2 g carbohydrate that can only be sugar; left out as unknown' },
  84: { sugar: 'the record gives sugar 0.1 beside 4.2 g of milk carbohydrate that can only be lactose; left out as unknown' },
  285: { sugar: 'the record gives sugar 0.1 beside 3.3 g of milk carbohydrate that can only be lactose; left out as unknown' },
};

/**
 * The English label each national unit may carry (spec 2.5; docs/food-data.md "Servings"), given its grams.
 * Labels come from the unit's own name: a size word (small, large, mini, thin, thick) only where the unit's
 * name has one, or where the label states its own grams or millilitres in brackets ("1 piece (76 g)",
 * "1 serving (133 g)"). 100 and 103 take the food's own noun ("1 pita", "1 latke").
 */
function labelFits(unit, grams, label, ctx) {
  const g = label.match(/^(.*) \((\d+(?:\.\d+)?) (g|ml)\)$/);
  // A label that states its own weight (or a drink's volume) is honest whatever size word it holds.
  if (g && g[3] === 'g' && Math.abs(Number(g[2]) - grams) <= 0.5 && unit >= 100 && unit <= 105) return /^1 [a-z][a-z ]*$/.test(g[1]);
  const noun = /^1 (?!small |large |mini |thin |thick |level |heaped )[a-z][a-z ]*$/;
  switch (unit) {
    case 100: case 103: return noun.test(label);
    case 101: return /^1 mini [a-z ]+$/.test(label);
    case 102: return /^1 small [a-z ]+$/.test(label);
    case 104: return /^1 large [a-z ]+$/.test(label);
    // A cup (כוס). A drink names its volume, "1 cup (240 ml)"; Turkish coffee's 75 ml cup is "1 small cup (75 ml)".
    case 200:
      if (ctx.drink) return Boolean(g) && g[3] === 'ml' && Math.abs(Number(g[2]) - grams) <= 0.5 && /^1 (small )?cup$/.test(g[1]);
      return label === '1 cup';
    case 207: return label === '1 cup grated';
    case 300: return grams <= 25 ? /^1 tbsp( [a-z]+)?$/.test(label) : label === '1 serving spoon';
    case 301: return label === '1 level tbsp';
    case 302: return grams <= 25 ? label === '1 heaped tbsp' : label === '1 heaped serving spoon';
    case 400: return label === '1 tsp';
    case 500: case 502: return label === '1 slice';
    case 501: return label === '1 thin slice';
    case 503: return label === '1 thick slice';
    case 600: return label === '1 tub' || label === '1 pot';
    case 601: return label === '1 mini tub';
    case 602: return label === '1 small tub';
    case 800: return /^1 serving( \(\d+ ml\))?$/.test(label);
    // A soup's portions are bowls, on purpose ("1 bowl", "1 small bowl"): docs/food-data.md says so.
    case 801: return label === '1 small serving' || (ctx.soup && label === '1 small bowl');
    case 802: return label === '1 serving' || (ctx.soup && label === '1 bowl');
    case 803: return label === '1 large serving';
    // A bag (שקית). Where the record also has a large package (912), its bag is the small size: Bamba's
    // 25 g bag is "1 small bag" beside its 80 g "1 large bag".
    case 903: return label === '1 bag' || (ctx.units.some((u) => u.unit === 912) && label === '1 small bag');
    case 904: return label === '1 carton';
    case 905: return label === '1 single pack';
    case 906: return label === '1 box' || label === '1 tub';
    case 911: return label === '1 small bag';
    case 912: return label === '1 large bag';
    case 1006: return label === '1 small bowl';
    case 1208: return label === '1 finger';
    default: return false; // a unit without an English label in 2.5 is not used
  }
}

// The water screen's reading of a serving label (src/features/drinks/rules.ts labelMl), for the drink rule.
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
function spoonAndDrink(food) {
  for (const s of food.servings) {
    if (/\btbsp\b/.test(s.label) && (s.grams < 4 || s.grams > 25)) fail(food.id, `"${s.label}" is ${s.grams} g; a tbsp is 4 to 25 g`);
    if (/\btsp\b/.test(s.label) && (s.grams < 1 || s.grams > 10)) fail(food.id, `"${s.label}" is ${s.grams} g; a tsp is 1 to 10 g`);
  }
  if (food.category === 'drinks') {
    const s = food.servings.find((x) => labelMl(x.label));
    if (!s) fail(food.id, 'a drink names no volume in its servings');
    else {
      const d = s.grams / labelMl(s.label);
      if (d < 0.9 || d > 1.15) fail(food.id, `"${s.label}" is ${d.toFixed(2)} g per ml; 0.90 to 1.15 expected`);
    }
  }
}

// ------------------------------------------------------------------ the food's names against its record
/**
 * National foods none of whose Hebrew search names shares a word with the record's Hebrew name, each with
 * the reason it is still the right record. Any other such food fails: a name on the wrong record.
 */
const NAME_EXCEPTIONS = {
  // None today: every national food has a Hebrew name that shares a word with its record's Hebrew name.
};
/** Folded words of a name, doubled vav and yod collapsed, stop words and one-letter words dropped. */
const words = (s) =>
  fold(s)
    .split(' ')
    .filter((w) => w.length > 1 && !HEBREW_STOPWORDS.has(w) && /[א-ת]/.test(w))
    .map(collapseDoubles);
const namePairs = [];

// ------------------------------------------------------------------ national foods
const national = BUILTIN_FOODS.filter((f) => f.ilCode !== undefined);
const recipeCodes = new Set();
const labelCodes = new Set();
for (const food of national) {
  const { id, ilCode: code, per100g: n } = food;
  const r = foodsByCode.get(code);
  if (!r) { fail(id, `no national record ${code}`); continue; }
  const makor = num(r.makor);
  if (makor !== 3 && makor !== 4) fail(id, `record ${code} has makor ${r.makor}; only 3 (label) and 4 (Ministry recipe) are used`);
  if (String(r.shmmitzrach ?? '').startsWith('FFQ-') || String(r.english_name ?? '').startsWith('FFQ-')) fail(id, `record ${code} is an FFQ row`);
  if (NAME_DISAGREES.has(code) && FLAVOUR.test(food.name)) fail(id, `record ${code}'s names disagree about the flavour; store it without one`);
  if (makor === 4) recipeCodes.add(code);
  if (makor === 3) labelCodes.add(code);
  if (food.fdcId !== undefined) fail(id, 'names both a USDA and a national record');
  if (food.verified !== true) fail(id, 'a national record is verified');

  // Values (spec 2.1 rules 2 and 3).
  const P = num(r.protein), F = num(r.total_fat), avail = num(r.carbohydrates), fib = num(r.total_dietary_fiber);
  const kcal = num(r.food_energy), sug = num(r.total_sugars), sat = num(r.saturated_fat), na = num(r.sodium);
  let carbs;
  if (fib === undefined) {
    // No fibre in the record: usable only when its energy shows none is counted (4P + 4C + 9F within 3%).
    const calc = 4 * P + 4 * avail + 9 * F;
    if (Math.abs(calc - kcal) > 0.03 * kcal) fail(id, `record ${code} has no fibre and its energy ${kcal} is not 4P+4C+9F (${calc.toFixed(0)})`);
    carbs = avail;
  } else carbs = avail + fib;
  // What the record gives, before rounding; the stored value must be within 0.05 g, 0.5 kcal or 0.5 mg of it.
  const want = {
    kcal,
    protein: P,
    carbs,
    fat: F,
    fiber: fib,
    sugar: sug === undefined ? undefined : Math.min(sug, carbs),
    satFat: sat,
    sodium: na,
  };
  for (const [k, v] of Object.entries(want)) {
    const why = NOT_STORED[code]?.[k];
    if (why) {
      if (n[k] !== undefined) fail(id, `${k} must be left out (${why})`);
      continue;
    }
    const got = n[k];
    if (v === undefined || got === undefined) {
      if (v !== got) fail(id, `${k}: stored ${got}, record ${v === undefined ? 'empty' : v}`);
      continue;
    }
    const tol = k === 'kcal' || k === 'sodium' ? 0.5 : 0.05;
    if (Math.abs(got - v) > tol + 1e-9) fail(id, `${k}: stored ${got}, record gives ${v}`);
  }
  // The national energy rule (2.1.5): available carbohydrate at 4 kcal/g, fibre at 2.
  const fibre = n.fiber ?? 0;
  const calc = 4 * n.protein + 4 * (n.carbs - fibre) + 2 * fibre + 9 * n.fat + 7 * (num(r.alcohol) ?? 0);
  const diff = Math.abs(n.kcal - calc);
  if (diff > 15 && diff > 0.12 * Math.max(n.kcal, calc)) fail(id, `kcal ${n.kcal} vs ${calc.toFixed(0)} by the national energy rule`);

  // Servings (2.1.6): each one a unit of this food in the unit table, with its 2.5 label.
  const units = unitsByCode.get(code) ?? [];
  const ctx = { units, drink: food.category === 'drinks', soup: /\bsoup\b/i.test(food.name) };
  if (!food.servings.length || food.servings.length > 4) fail(id, `${food.servings.length} servings; 1 to 4 expected`);
  for (const s of food.servings) {
    const same = units.filter((u) => u.grams !== undefined && Math.abs(u.grams - s.grams) <= 0.1 + 1e-9);
    if (!same.length) { fail(id, `"${s.label}" ${s.grams} g is no unit of record ${code}`); continue; }
    if (!same.some((u) => labelFits(u.unit, u.grams, s.label, ctx))) {
      fail(id, `"${s.label}" ${s.grams} g matches unit ${same.map((u) => u.unit).join('/')} of record ${code}, whose label differs`);
    }
  }
  spoonAndDrink(food);

  // The food's Hebrew search names against the record's Hebrew name: at least one shares a word.
  const he = SEARCH_NAMES[id]?.he ?? [];
  const rec = new Set(words(String(r.shmmitzrach ?? '')));
  const shared = he.find((name) => words(name).some((w) => rec.has(w)));
  namePairs.push(`${shared ? 'ok  ' : 'NONE'} ${id} ${code}: ${r.shmmitzrach} | ${he.join(' / ')}`);
  if (!shared && !(id in NAME_EXCEPTIONS)) fail(id, `no Hebrew search name shares a word with record ${code} "${r.shmmitzrach}" (${he.join(', ') || 'no names'})`);
  if (shared && id in NAME_EXCEPTIONS) fail(id, 'is in NAME_EXCEPTIONS but a name now shares a word with its record: take it out');
}
const sorted = (xs) => [...xs].sort((a, b) => a - b).join(',');
if (sorted(NATIONAL_RECIPES) !== sorted(recipeCodes)) fail('NATIONAL_RECIPES', `holds ${sorted(NATIONAL_RECIPES)}\n  the makor 4 records are ${sorted(recipeCodes)}`);
if (sorted(NATIONAL_LABELS) !== sorted(labelCodes)) fail('NATIONAL_LABELS', `holds ${sorted(NATIONAL_LABELS)}\n  the makor 3 records are ${sorted(labelCodes)}`);
for (const code of NATIONAL_LABELS) if (!national.some((f) => f.ilCode === code)) fail('NATIONAL_LABELS', `${code} is no bundled food's record`);
for (const code of NATIONAL_RECIPES) if (!national.some((f) => f.ilCode === code)) fail('NATIONAL_RECIPES', `${code} is no bundled food's record`);
for (const id of Object.keys(NAME_EXCEPTIONS)) if (!national.some((f) => f.id === id)) fail('NAME_EXCEPTIONS', `${id} is no national food`);

// ------------------------------------------------------------------ USDA FNDDS additions (optional)
/**
 * The foods added from FNDDS 2021-2023 with this work (the rest were checked when they were added; header of
 * foods.ts), each with where its servings come from: FNDDS's own portions (food_portion.csv), or the units
 * of the national record of the same food that the header names.
 */
const FNDDS_ADDED = {
  b_persimmon: { units: 3292 },
  b_guava: { units: 3253 },
  b_kohlrabi: { units: 3801 },
  b_chicken_roasted: 'portions',
  b_chicken_drumstick: 'portions',
  b_rusks: 'portions',
};
let fnddsChecked = 0;
if (args.fndds) {
  const dir = args.fndds;
  const need = ['food.csv', 'food_nutrient.csv', 'food_portion.csv'].map((f) => join(dir, f));
  if (!need.every(existsSync)) {
    fail('fndds', `${dir} lacks food.csv, food_nutrient.csv and food_portion.csv`);
  } else {
    const want = new Map(Object.keys(FNDDS_ADDED).map((id) => [BUILTIN_FOODS.find((f) => f.id === id)?.fdcId, id]));
    // The survey release's food_nutrient.csv names nutrients by their number: 208 energy, 203 protein,
    // 205 carbohydrate (by difference), 204 fat, 291 fibre, 269 total sugars, 606 saturated fat, 307 sodium.
    const NUTR = { 208: 'kcal', 203: 'protein', 205: 'carbs', 204: 'fat', 291: 'fiber', 269: 'sugar', 606: 'satFat', 307: 'sodium' };
    const got = new Map();
    for (const row of parseCsv(readFileSync(need[1], 'utf8'))) {
      const fdc = num(row.fdc_id);
      if (!want.has(fdc) || !(num(row.nutrient_id) in NUTR)) continue;
      if (!got.has(fdc)) got.set(fdc, {});
      got.get(fdc)[NUTR[num(row.nutrient_id)]] = num(row.amount);
    }
    const portions = new Map();
    for (const row of parseCsv(readFileSync(need[2], 'utf8'))) {
      const fdc = num(row.fdc_id);
      if (!want.has(fdc)) continue;
      if (!portions.has(fdc)) portions.set(fdc, []);
      portions.get(fdc).push({ what: row.portion_description, grams: num(row.gram_weight) });
    }
    for (const [fdc, id] of want) {
      const food = BUILTIN_FOODS.find((f) => f.id === id);
      const v = got.get(fdc);
      if (!food || !v) { fail(id, `no FNDDS record ${fdc}`); continue; }
      fnddsChecked++;
      for (const [k, raw] of Object.entries(v)) {
        const expect = k === 'sugar' ? Math.min(raw, v.carbs ?? raw) : raw;
        const stored = food.per100g[k];
        if (stored === undefined || Math.abs(stored - expect) > (k === 'kcal' || k === 'sodium' ? 0.5 : 0.05) + 1e-9) fail(id, `${k}: stored ${stored}, FNDDS ${raw}`);
      }
      // Servings: each one an FNDDS portion of the record, or a unit of the named national record, at its grams.
      const from = FNDDS_ADDED[id];
      const allowed = from === 'portions' ? (portions.get(fdc) ?? []) : (unitsByCode.get(from.units) ?? []).map((u) => ({ what: `unit ${u.unit}`, grams: u.grams }));
      for (const s of food.servings) {
        if (!allowed.some((p) => p.grams !== undefined && Math.abs(p.grams - s.grams) <= 0.1 + 1e-9)) {
          fail(id, `"${s.label}" ${s.grams} g is no ${from === 'portions' ? `FNDDS portion of ${fdc}` : `unit of national record ${from.units}`}`);
        }
      }
    }
  }
}

console.log('\nHebrew search names against the record (ok: a name shares a word with the record\'s Hebrew name):');
for (const line of namePairs) console.log(`  ${line}`);
console.log(
  `${national.length} national foods checked (${recipeCodes.size} Ministry recipes, ${labelCodes.size} product labels)` +
    (args.fndds ? `, ${fnddsChecked} of ${Object.keys(FNDDS_ADDED).length} FNDDS additions checked with their servings` : ', FNDDS additions not checked (no --fndds)') +
    `; ${failures} failures`,
);
process.exit(failures ? 1 : 0);
