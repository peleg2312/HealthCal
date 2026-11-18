// Checks every bundled food that names an Israeli national nutrition database record (`ilCode`) against
// the downloaded national tables, and with --fndds the foods added from USDA FNDDS against that release.
// Run by hand (the source files are not in the repository; docs/food-data.md says how to get them):
//
//   node --experimental-strip-types scripts/ops/check-national-foods.mjs \
//     --foods=<mitzrachim.csv or .json> --units=<yehidot_mida_lemitzrachim.csv or .json> [--fndds=<survey_food_csv folder>]
//
// One line per failure, then the counts; exit 1 on any failure. Rules: docs/food-data.md.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { BUILTIN_FOODS, NATIONAL_LABELS, NATIONAL_RECIPES } from '../../src/data/foods.ts';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split(/=(.*)/s).slice(0, 2)));
if (!args.foods || !args.units) {
  console.error('usage: --foods=<mitzrachim.csv|json> --units=<yehidot_mida_lemitzrachim.csv|json> [--fndds=<folder>]');
  process.exit(2);
}

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
 * A value the record holds that is not stored, with the reason. The only one: limonana's record gives sugar 0
 * beside 10.2 g of carbohydrate that can only be sugar, so its sugar is left out (unknown), never guessed.
 */
const NOT_STORED = { 8835: { sugar: 'the record gives sugar 0 beside 10.2 g carbohydrate; left out as unknown' } };

/**
 * The English label each national unit may carry (spec 2.5), given its grams. 100 and 103 take the food's own
 * noun ("1 pita", "1 latke"); the others are fixed words.
 */
function labelFits(unit, grams, label) {
  const noun = /^1 (?!small |large |mini |thin |thick |level |heaped )[a-z][a-z ]*$/;
  switch (unit) {
    case 100: case 103: return noun.test(label);
    case 101: return /^1 mini [a-z ]+$/.test(label);
    case 102: return /^1 small [a-z ]+$/.test(label);
    case 104: return /^1 large [a-z ]+$/.test(label);
    case 200: return label === '1 cup' || /^1 (small )?cup \(\d+ ml\)$/.test(label);
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
    case 801: return label === '1 small serving' || label === '1 small bowl';
    case 802: return label === '1 serving' || label === '1 bowl';
    case 803: return label === '1 large serving';
    case 903: return label === '1 bag' || label === '1 small bag';
    case 904: return label === '1 carton';
    case 905: return label === '1 single pack';
    case 906: return label === '1 box' || label === '1 tub';
    case 911: return label === '1 small bag';
    case 912: return label === '1 large bag' || label === '1 bag';
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

// ------------------------------------------------------------------ national foods
const national = BUILTIN_FOODS.filter((f) => f.ilCode !== undefined);
const recipeCodes = new Set();
for (const food of national) {
  const { id, ilCode: code, per100g: n } = food;
  const r = foodsByCode.get(code);
  if (!r) { fail(id, `no national record ${code}`); continue; }
  const makor = num(r.makor);
  if (makor !== 3 && makor !== 4) fail(id, `record ${code} has makor ${r.makor}; only 3 (label) and 4 (Ministry recipe) are used`);
  if (String(r.shmmitzrach ?? '').startsWith('FFQ-') || String(r.english_name ?? '').startsWith('FFQ-')) fail(id, `record ${code} is an FFQ row`);
  if (NAME_DISAGREES.has(code) && FLAVOUR.test(food.name)) fail(id, `record ${code}'s names disagree about the flavour; store it without one`);
  if (makor === 4) recipeCodes.add(code);
  if (NATIONAL_LABELS.has(code) && makor !== 3) fail(id, `NATIONAL_LABELS holds ${code}, whose makor is ${r.makor}`);
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
  if (!food.servings.length || food.servings.length > 4) fail(id, `${food.servings.length} servings; 1 to 4 expected`);
  for (const s of food.servings) {
    const same = units.filter((u) => u.grams !== undefined && Math.abs(u.grams - s.grams) <= 0.1 + 1e-9);
    if (!same.length) { fail(id, `"${s.label}" ${s.grams} g is no unit of record ${code}`); continue; }
    if (!same.some((u) => labelFits(u.unit, u.grams, s.label))) {
      fail(id, `"${s.label}" ${s.grams} g matches unit ${same.map((u) => u.unit).join('/')} of record ${code}, whose label differs`);
    }
  }
  spoonAndDrink(food);
}
const recipesStored = [...NATIONAL_RECIPES].sort((a, b) => a - b).join(',');
const recipesFound = [...recipeCodes].sort((a, b) => a - b).join(',');
if (recipesStored !== recipesFound) fail('NATIONAL_RECIPES', `holds ${recipesStored}\n  the makor 4 records are ${recipesFound}`);
for (const code of NATIONAL_LABELS) if (!national.some((f) => f.ilCode === code)) fail('NATIONAL_LABELS', `${code} is no bundled food's record`);
for (const code of NATIONAL_RECIPES) if (!national.some((f) => f.ilCode === code)) fail('NATIONAL_RECIPES', `${code} is no bundled food's record`);

// ------------------------------------------------------------------ USDA FNDDS additions (optional)
// The foods added from FNDDS 2021-2023 with this work; the rest were checked when they were added (header of foods.ts).
const FNDDS_ADDED = ['b_persimmon', 'b_guava', 'b_kohlrabi', 'b_chicken_roasted', 'b_chicken_drumstick', 'b_herring_pickled', 'b_rusks'];
let fnddsChecked = 0;
if (args.fndds) {
  const dir = args.fndds;
  const need = ['food.csv', 'food_nutrient.csv'].map((f) => join(dir, f));
  if (!need.every(existsSync)) {
    fail('fndds', `${dir} lacks food.csv and food_nutrient.csv`);
  } else {
    const want = new Map(FNDDS_ADDED.map((id) => [BUILTIN_FOODS.find((f) => f.id === id)?.fdcId, id]));
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
    for (const [fdc, id] of want) {
      const food = BUILTIN_FOODS.find((f) => f.id === id);
      const v = got.get(fdc);
      if (!v) { fail(id, `no FNDDS record ${fdc}`); continue; }
      fnddsChecked++;
      for (const [k, raw] of Object.entries(v)) {
        const expect = k === 'sugar' ? Math.min(raw, v.carbs ?? raw) : raw;
        const stored = food.per100g[k];
        if (stored === undefined || Math.abs(stored - expect) > (k === 'kcal' || k === 'sodium' ? 0.5 : 0.05) + 1e-9) fail(id, `${k}: stored ${stored}, FNDDS ${raw}`);
      }
    }
  }
}

console.log(
  `${national.length} national foods checked (${recipeCodes.size} Ministry recipes, ${NATIONAL_LABELS.size} product labels)` +
    (args.fndds ? `, ${fnddsChecked} of ${FNDDS_ADDED.length} FNDDS additions checked` : ', FNDDS additions not checked (no --fndds)') +
    `; ${failures} failures`,
);
process.exit(failures ? 1 : 0);
