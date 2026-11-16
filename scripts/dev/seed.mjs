// Builds a realistic persisted store for local development and screenshots.
// Output matches the zustand `persist` format under the key `healthcal-v1`.
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const daysAgo = (n) => {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d;
};
const at = (n, h, m = 0) => {
  const d = daysAgo(n);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};

const F = (id, name, emoji, kcal, protein, carbs, fat, fiber, servings) => ({
  id: `b_${id}`, name, emoji, source: 'builtin', verified: false, category: 'seed',
  per100g: { kcal, protein, carbs, fat, fiber }, servings: servings.map(([label, grams]) => ({ label, grams })),
});

const FOODS = {
  oats: F('oats_dry', 'Oats, rolled, dry', '🥣', 379, 13.2, 67.7, 6.5, 10.1, [['1/2 cup', 40]]),
  banana: F('banana', 'Banana', '🍌', 89, 1.1, 22.8, 0.3, 2.6, [['1 medium', 118]]),
  yogurt: F('greek_yogurt', 'Greek yogurt, plain, 2%', '🥛', 73, 9.9, 3.9, 1.9, 0, [['1 cup', 245], ['1 container', 170]]),
  eggs: F('egg', 'Egg, whole, cooked', '🥚', 155, 12.6, 1.1, 10.6, 0, [['1 large', 50]]),
  toast: F('bread_ww', 'Whole wheat bread', '🍞', 252, 12.4, 42.7, 3.5, 6, [['1 slice', 32]]),
  coffee: F('latte', 'Latte, whole milk', '☕', 54, 3, 4.6, 2.8, 0, [['1 cup', 240]]),
  chicken: F('chicken_breast', 'Chicken breast, grilled', '🍗', 165, 31, 0, 3.6, 0, [['1 breast', 172], ['100 g', 100]]),
  rice: F('rice_cooked', 'White rice, cooked', '🍚', 130, 2.7, 28.2, 0.3, 0.4, [['1 cup', 158]]),
  salad: F('israeli_salad', 'Israeli salad', '🥗', 55, 1, 5.5, 3.4, 1.5, [['1 cup', 150]]),
  hummus: F('hummus', 'Hummus', '🧆', 229, 7.4, 14.9, 16.1, 5.4, [['2 tbsp', 30]]),
  pita: F('pita', 'Pita bread', '🫓', 275, 9.1, 55.7, 1.2, 2.2, [['1 pita', 60]]),
  salmon: F('salmon', 'Salmon, baked', '🐟', 206, 22.1, 0, 12.4, 0, [['1 fillet', 150]]),
  potato: F('sweet_potato', 'Sweet potato, baked', '🍠', 90, 2, 20.7, 0.2, 3.3, [['1 medium', 130]]),
  pasta: F('pasta_cooked', 'Pasta, cooked', '🍝', 158, 5.8, 30.9, 0.9, 1.8, [['1 cup', 140]]),
  apple: F('apple', 'Apple', '🍎', 52, 0.3, 13.8, 0.2, 2.4, [['1 medium', 182]]),
  almonds: F('almonds', 'Almonds', '🌰', 579, 21.2, 21.6, 49.9, 12.5, [['1 oz', 28]]),
  shake: F('whey', 'Whey protein shake', '🥤', 380, 78, 8, 5, 0, [['1 scoop', 30]]),
  chocolate: F('dark_chocolate', 'Dark chocolate', '🍫', 546, 4.9, 61.2, 31.3, 7, [['2 squares', 20]]),
  beef: F('beef_bowl', 'Beef and vegetable stir fry', '🥘', 135, 11, 8, 6.5, 1.8, [['1 bowl', 350]]),
};

const MENUS = {
  breakfast: [[['oats', 1.5], ['banana', 1], ['coffee', 1]], [['eggs', 3], ['toast', 2], ['coffee', 1]], [['yogurt', 1], ['banana', 1], ['almonds', 1]]],
  lunch: [[['chicken', 1], ['rice', 1.5], ['salad', 1]], [['pita', 1.5], ['hummus', 3], ['salad', 1.5], ['chicken', 0.7]], [['beef', 1], ['rice', 1]]],
  dinner: [[['salmon', 1], ['potato', 1.5], ['salad', 1]], [['pasta', 2], ['chicken', 0.8], ['salad', 1]], [['beef', 1.2], ['rice', 1.2]]],
  snack: [[['apple', 1]], [['shake', 1], ['banana', 1]], [['chocolate', 1], ['almonds', 1]], [['yogurt', 0.7]]],
};

const SESSIONS = [
  { activityId: 'volleyball', name: 'Volleyball', emoji: '🏐', category: 'team', intensity: 'moderate', durationMin: 75, met: 4.0 },
  { activityId: 'running', name: 'Running', emoji: '🏃', category: 'cardio', intensity: 'moderate', durationMin: 38, met: 9.3, distanceKm: 6.1 },
  { activityId: 'strength_training', name: 'Strength training', emoji: '🏋️', category: 'strength', intensity: 'vigorous', durationMin: 55, met: 6.0 },
  { activityId: 'yoga', name: 'Yoga', emoji: '🧘', category: 'mind', intensity: 'light', durationMin: 40, met: 2.5 },
  { activityId: 'basketball', name: 'Basketball', emoji: '🏀', category: 'team', intensity: 'vigorous', durationMin: 50, met: 8.0 },
  { activityId: 'walking', name: 'Walking', emoji: '🚶', category: 'cardio', intensity: 'moderate', durationMin: 45, met: 3.8, distanceKm: 3.9 },
];

/**
 * The store screenshots only (`buildSeed({ store: true })`, used by scripts/dev/store-frames.cjs).
 * It runs after the ordinary demo data is built, so every other script gets exactly the data it
 * always had. It shows what a real week with the app looks like at its best moment of the day:
 *   - yesterday's session is a run imported from a Garmin watch, with the measured calories;
 *   - today's water has reached the goal, so the water cup is brim-full.
 */
function tidyForStore(state, { put, weightKg, baselineTdee }) {
  const today = iso(daysAgo(0));
  const yesterday = iso(daysAgo(1));
  for (const a of Object.values(state.activities)) if (a.date === yesterday) delete state.activities[a.id];
  const startedAt = at(1, 7, 12);
  const durationMin = 46;
  // A Garmin file's calories are the session's total (gross); net is that minus the resting share.
  const kcalGross = 596;
  put('activities', {
    date: yesterday, activityId: 'running', name: 'Running', emoji: '🏃', category: 'cardio', intensity: 'vigorous', durationMin, met: 9.8,
    distanceKm: 8.2, avgHeartRate: 151, kcalGross, kcalNet: Math.round(kcalGross - (baselineTdee / 1440) * durationMin),
    weightKg, baselineKcalPerDay: baselineTdee, source: 'garmin', externalId: `garmin:${startedAt}`, startedAt, measured: true, loggedAt: at(1, 8, 5),
  });
  // Today's water: the goal (about 3.3 L for this profile) met by the evening.
  for (const w of Object.values(state.water)) if (w.date === today) delete state.water[w.id];
  [500, 330, 500, 250, 500, 330, 500, 500].forEach((ml, g) => put('water', { date: today, ml, beverage: g === 1 ? 'coffee' : 'water', loggedAt: at(0, 7 + Math.floor(g * 1.5), (g % 2) * 30) }));
}

// ------------------------------------------------------------------ stress
// Long content at the far end of what real people enter (`buildSeed({ stress: true })`, shot.mjs
// --stress, a state's data: 'stress'). Not absurd: every value is something a real diary holds.
const LONG_BRAND = 'Hollowbrook Mountain Organic Creamery';
const LONG = [
  // name (50 to 60 characters), emoji, kcal / protein / carbs / fat / fibre per 100 g, serving, grams
  ['Grilled chicken breast with lemon, garlic and rosemary', '🍗', 168, 30, 1, 4.2, 0, '1 breast', 172],
  ['Roasted sweet potato wedges with smoked paprika and thyme', '🍠', 128, 1.8, 21, 4.1, 3.2, '1 bowl', 180],
  ['Mixed leaf salad with cherry tomatoes, cucumber and feta', '🥗', 96, 3.6, 4.1, 7.4, 1.4, '1 bowl', 160],
  ['Wholegrain basmati and wild rice with toasted almonds', '🍚', 162, 4.2, 28, 3.6, 2.1, '1 cup', 170],
  ['Steamed broccoli, green beans and sugar snap peas, buttered', '🥦', 61, 2.6, 6.4, 2.9, 2.8, '1 cup', 120],
  ['Hummus with roasted red pepper and a drizzle of olive oil', '🧆', 244, 7, 13.5, 18, 5, '3 tbsp', 45],
  ['Toasted sourdough with salted butter and chopped chives', '🍞', 318, 8.4, 44, 12, 2.4, '1 slice', 55],
  ['Greek-style strained yogurt with honey and toasted walnuts', '🥛', 148, 7.9, 12.6, 7.8, 0.4, '1 pot', 170, LONG_BRAND],
  ['Sparkling elderflower and cucumber lemonade, no added sugar', '🥤', 4, 0, 0.9, 0, 0, '1 bottle', 330],
  ['Dark chocolate with sea salt and caramelised almonds', '🍫', 562, 7.2, 45, 38, 9, '4 squares', 40],
  ['Fresh fruit salad with mango, kiwi, pineapple and mint', '🍍', 58, 0.8, 13.4, 0.3, 1.9, '1 bowl', 200],
  ['Oat and raisin cookie, bakery style, large, from the cafe', '🍪', 436, 5.6, 64, 17, 3.1, '1 cookie', 90],
];
const longFood = ([name, emoji, kcal, protein, carbs, fat, fiber, label, grams, brand], i) => ({
  id: brand ? `stress_custom_${i}` : `b_stress_${i}`, name, emoji, ...(brand ? { brand } : null), source: brand ? 'custom' : 'builtin', verified: !brand, category: 'seed',
  per100g: { kcal, protein, carbs, fat, fiber }, servings: [{ label, grams }],
});
const itemOf = (food, qty = 1) => {
  const grams = food.servings[0].grams * qty;
  const f = grams / 100;
  return {
    name: food.name, ...(food.brand ? { brand: food.brand } : null), emoji: food.emoji, servingLabel: food.servings[0].label, quantity: qty, grams, food, source: food.source, verified: food.verified,
    nutrients: { kcal: food.per100g.kcal * f, protein: food.per100g.protein * f, carbs: food.per100g.carbs * f, fat: food.per100g.fat * f, fiber: food.per100g.fiber * f },
  };
};

/**
 * Turns the five demo weeks into the long end of real use: a 22-character first name, food and
 * saved-meal names of 50 to 60 characters (a long-named food is usual at every meal), a long brand, a two-sentence activity note, a meal of
 * 12 items, a day at 11,480 kcal and one at 0, 1,240 active minutes in the last seven days,
 * 12.5 L of water today, 142.6 kg body weight and a 412-day logging streak.
 */
function stressUp(state, { put, baselineTdee }) {
  const day = (n) => iso(daysAgo(n));
  const dropDay = (collection, date, meal) => {
    for (const r of Object.values(state[collection])) if (r.date === date && (!meal || r.meal === meal)) delete state[collection][r.id];
  };
  state.profile.name = 'Bartholomew-Christophe';
  // Body weight: the same curve, moved so the newest weigh-in is 142.6 kg.
  const weights = Object.values(state.weights).sort((a, b) => b.date.localeCompare(a.date));
  const shift = 142.6 - weights[0].kg;
  for (const w of weights) w.kg = Math.round((w.kg + shift) * 10) / 10;
  state.profile.weightKg = 142.6;
  state.profile.targetWeightKg = 118;
  state.profile.bodyFatPct = 34;

  const foods = LONG.map(longFood);
  const custom = foods.filter((f) => f.source === 'custom');
  for (const f of custom) state.customFoods[f.id] = { ...f, updatedAt: new Date().toISOString(), deleted: false };
  const logItem = (n, meal, it, hour, minute = 0) => put('foodEntries', { date: day(n), meal, ...it, foodId: it.food?.id, loggedAt: at(n, hour, minute) });

  // Today's lunch: twelve items, every one with a long name, one from a long-named brand.
  dropDay('foodEntries', day(0), 'lunch');
  foods.forEach((f, i) => logItem(0, 'lunch', itemOf(f), 13, i));
  // Two days ago: a feast of 11,480 kcal. Three days ago: logged, and 0 kcal.
  dropDay('foodEntries', day(2));
  const feast = [
    ['Full cooked breakfast with sausages, bacon, eggs and beans', 'breakfast', 1450, 9],
    ['Wedding reception buffet: lamb, roast potatoes and gravy', 'lunch', 2380, 13],
    ['Three-tier chocolate wedding cake with buttercream icing', 'snack', 3120, 16],
    ['Late-night pepperoni pizza, large, shared with nobody else', 'dinner', 1890, 22],
    ['Craft beer, India pale ale, six pints over the evening', 'dinner', 1640, 21],
    ['Salted caramel ice cream, a whole tub straight from the freezer', 'snack', 1000, 23],
  ];
  for (const [name, meal, kcal, hour] of feast) {
    put('foodEntries', { date: day(2), meal, name, emoji: '⚡', source: 'quick', verified: false, servingLabel: '1 serving', quantity: 1, grams: 0, nutrients: { kcal, protein: Math.round((kcal * 0.15) / 4), carbs: Math.round((kcal * 0.45) / 4), fat: Math.round((kcal * 0.4) / 9) }, loggedAt: at(2, hour) });
  }
  dropDay('foodEntries', day(3));
  logItem(3, 'breakfast', { ...itemOf(foods[8]), nutrients: { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 } }, 9);

  // Long names are usual at every meal (the + sheet and food search show the usual foods for the meal
  // of the hour the page is opened, so a capture at any time of day meets them): one long-named food
  // in each meal on most of the last three weeks, more often than any demo food.
  const USUAL = { breakfast: [foods[6], 8], lunch: [foods[0], 12], dinner: [foods[1], 19], snack: [foods[9], 16] };
  for (let n = 1; n <= 21; n++) {
    if (n === 2 || n === 3) continue;
    for (const [meal, [food, hour]] of Object.entries(USUAL)) logItem(n, meal, itemOf(food), hour, 30);
  }

  // A logging streak of 412 days: one breakfast on each day before the five weeks.
  const oats = FOODS.oats;
  for (let n = 36; n < 412; n++) logItem(n, 'breakfast', itemOf(oats, 1.5), 8);

  // The last seven days: 1,240 active minutes, one session with a two-sentence note.
  for (let n = 0; n < 7; n++) dropDay('activities', day(n));
  const plan = [[['running', 95], ['strength_training', 145]], [['walking', 150]], [['basketball', 90], ['yoga', 95]], [['volleyball', 200]], [['running', 70], ['walking', 95]], [['yoga', 120]], [['strength_training', 80], ['walking', 100]]];
  plan.forEach((sessions, n) => sessions.forEach(([id, durationMin], k) => {
    const s = SESSIONS.find((x) => x.activityId === id);
    const kcalGross = (s.met * 3.5 * 142.6 * durationMin) / 200;
    put('activities', {
      date: day(n), ...s, durationMin, ...(s.distanceKm ? { distanceKm: Math.round((s.distanceKm / s.durationMin) * durationMin * 10) / 10 } : null),
      kcalGross, kcalNet: Math.max(0, kcalGross - (baselineTdee / 1440) * durationMin), weightKg: 142.6, baselineKcalPerDay: baselineTdee,
      ...(n === 0 && k === 0 ? { notes: 'Easy recovery run along the river with the Thursday club. Legs felt heavy for the first two kilometres, then loosened up nicely.' } : null),
      loggedAt: at(n, 7 + k * 10),
    });
  }));

  // Today's water: 12.5 L in 25 glasses.
  dropDay('water', day(0));
  for (let g = 0; g < 25; g++) put('water', { date: day(0), ml: 500, beverage: g % 5 === 1 ? 'tea' : 'water', loggedAt: at(0, 6 + Math.floor(g / 2), (g % 2) * 30) });

  // A saved meal with a long name and the twelve items.
  put('savedMeals', { name: "Sunday brunch with the whole family at grandma's house", items: foods.map((f) => itemOf(f)) });
  state.recentFoods = [...foods.slice(0, 8), ...state.recentFoods].slice(0, 12);
  state.favoriteFoodIds = [foods[0].id, custom[0].id, ...state.favoriteFoodIds];
}

// ------------------------------------------------------------------ values
// `buildSeed({ values })` sets the day's amounts on top of the demo (or stress) data, so a screen
// can be looked at with its cups and bars at the values that stress their layout (a label at the
// cup's level, a tick, the brim line). Every amount is ordinary records, as if logged by hand:
//
//   eaten        today's food as a share of today's calorie budget (0 = nothing eaten, 1 = exactly
//                at budget, 1.3 = 30% over). The budget is the app's own: computeDay from
//                src/store/selectors.ts, run here on the seeded records (target + exercise added back).
//   protein      today's protein as a share of its target (default: the same share as `eaten`).
//                Two demo foods are mixed so kcal and protein both land; a share no real mix can
//                reach (much protein from almost no food) is clamped to the nearest one that can.
//   exercise     today's exercise in net kcal (what the budget gains): 0 removes today's sessions,
//                290 is one volleyball session, 900 a long run.
//   water        today's drinks as a share of today's water goal (the app's goal, exercise included).
//   weekMinutes  minutes toward the weekly activity guideline this week (Monday to today), the
//                number Train's week cup shows; today's sessions count, walks on the earlier days
//                of the week make up the rest (on a Monday the rest is a walk today).
//   fasting      an open fast as a share of the fasting target (0.5 = 8 h into a 16 h fast,
//                1.3 = past the target); 0 means no fast running.
//   eatBack      1 adds exercise to the budget (the demo's setting), 0 leaves it out (Goals, "Add
//                exercise to my budget" off): Today then says what was burned and not added.
// Only what is named changes; everything else stays the demo's. Applied in that order: eatBack, exercise and
// the week first (they move the budget and the water goal), then food, water and the fast.

const APP = new URL('../../src/', import.meta.url);
let appCache = null;
/**
 * The app's own pure maths (src/store/selectors.ts and the src/lib files it imports), compiled
 * with TypeScript's transpiler and loaded here, so the budget, the protein target and the water
 * goal are exactly the ones the screens will show. React and the store are not loaded: selectors.ts
 * only needs them for its hooks.
 */
function appMaths() {
  if (appCache) return appCache;
  const require = createRequire(import.meta.url);
  const ts = require('typescript');
  const stubs = { react: {}, './clock': {}, './index': {} };
  const cache = new Map();
  const load = (file) => {
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} };
    cache.set(file, module);
    const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
    const req = (spec) => {
      if (spec in stubs) return stubs[spec];
      const base = spec.startsWith('@/') ? fileURLToPath(new URL(spec.slice(2), APP)) : spec.startsWith('.') ? path.resolve(path.dirname(file), spec) : null;
      if (!base) return require(spec);
      const found = [`${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')].find((f) => existsSync(f));
      if (!found) throw new Error(`seed values: cannot find ${spec} from ${file}`);
      return load(found);
    };
    new Function('require', 'module', 'exports', code)(req, module, module.exports);
    return module.exports;
  };
  const lib = (f) => load(fileURLToPath(new URL(f, APP)));
  appCache = { ...lib('lib/dates.ts'), ...lib('lib/exercise.ts'), ...lib('store/selectors.ts') };
  return appCache;
}

const VALUE_KEYS = ['eaten', 'protein', 'exercise', 'water', 'weekMinutes', 'fasting', 'eatBack'];

/** Sets the day's amounts (see above). `put` writes a record the way buildSeed does. */
function applyValues(state, values, { put, weightKg, baselineTdee }) {
  const unknown = Object.keys(values).filter((k) => !VALUE_KEYS.includes(k));
  if (unknown.length) throw new Error(`seed values: unknown ${unknown.join(', ')} (known: ${VALUE_KEYS.join(', ')})`);
  for (const [k, v] of Object.entries(values)) if (typeof v !== 'number' || !(v >= 0)) throw new Error(`seed values: ${k} must be a number of 0 or more`);
  const m = appMaths();
  const day = iso(daysAgo(0));
  const live = (c) => Object.values(state[c] || {}).filter((r) => !r.deleted);
  const drop = (c, keep) => { for (const r of Object.values(state[c])) if (!keep(r)) delete state[c][r.id]; };
  const kg = state.profile.weightKg || weightKg;
  const restPerMin = baselineTdee / 1440;
  // A session with exactly `net` kcal above resting (what the budget gains), at this activity's MET.
  const session = (n, s, net, hour) => {
    const perMin = (s.met * 3.5 * kg) / 200 - restPerMin;
    const durationMin = Math.max(1, Math.round(net / perMin));
    const gross = net + restPerMin * durationMin;
    return put('activities', { date: iso(daysAgo(n)), ...s, durationMin, ...(s.distanceKm ? { distanceKm: Math.round((s.distanceKm / s.durationMin) * durationMin * 10) / 10 } : null), kcalGross: gross, kcalNet: net, weightKg: kg, baselineKcalPerDay: baselineTdee, loggedAt: at(n, hour) });
  };
  const walk = SESSIONS.find((s) => s.activityId === 'walking');
  const walkFor = (n, durationMin, hour) => {
    const gross = (walk.met * 3.5 * kg * durationMin) / 200;
    put('activities', { date: iso(daysAgo(n)), ...walk, durationMin, distanceKm: Math.round((walk.distanceKm / walk.durationMin) * durationMin * 10) / 10, kcalGross: gross, kcalNet: Math.max(0, gross - restPerMin * durationMin), weightKg: kg, baselineKcalPerDay: baselineTdee, loggedAt: at(n, hour) });
  };

  if (values.eatBack !== undefined) state.profile.eatBackExercise = values.eatBack > 0;
  if (values.exercise !== undefined) {
    drop('activities', (a) => a.date !== day);
    const kcal = Math.round(values.exercise);
    // Up to 400 kcal is one volleyball session; more adds a run in the morning.
    if (kcal > 400) { session(0, SESSIONS.find((s) => s.activityId === 'running'), kcal - 290, 7); session(0, SESSIONS[0], 290, 18); }
    else if (kcal > 0) session(0, SESSIONS[0], kcal, 7);
  }
  if (values.weekMinutes !== undefined) {
    const monday = m.startOfWeek(day);
    const before = Math.abs(m.diffDays(day, monday));
    drop('activities', (a) => a.date < monday || a.date >= day);
    let left = Math.max(0, Math.round(values.weekMinutes) - m.guidelineMinutes(live('activities').filter((a) => a.date === day)));
    // Walks of at most 90 minutes, from yesterday back to Monday; what is left over goes on the last day reached.
    for (let n = 1; n <= before && left > 0; n++) {
      const mins = n === before ? left : Math.min(90, left);
      walkFor(n, mins, 18);
      left -= mins;
    }
    if (left > 0) walkFor(0, left, 19);
  }

  const profile = state.profile;
  const food = () => live('foodEntries');
  const summary = () => {
    const model = m.computeEnergyModel(profile, food(), live('weights'), day, live('activities'));
    return m.computeDay(day, profile, model, food(), live('activities'), live('water'), live('days'));
  };
  if (values.eaten !== undefined || values.protein !== undefined) {
    const d = summary();
    const kcal = values.eaten !== undefined ? values.eaten * d.budget : d.eaten.kcal;
    const protein = (values.protein !== undefined ? values.protein : kcal / d.budget) * d.macros.proteinG;
    drop('foodEntries', (e) => e.date !== day);
    if (kcal > 0) {
      // Two foods, mixed so that both the calories and the protein land: a lean one and a plain one.
      const per = (f) => f.per100g.protein / f.per100g.kcal;
      const ratio = Math.min(per(FOODS.shake), Math.max(per(FOODS.apple), protein / kcal));
      const lean = ratio > per(FOODS.chicken) ? FOODS.shake : FOODS.chicken;
      const plain = ratio < per(FOODS.oats) ? FOODS.apple : FOODS.oats;
      const leanKcal = Math.max(0, Math.min(kcal, (kcal * (ratio - per(plain))) / (per(lean) - per(plain))));
      const add = (meal, f, k, hour) => {
        if (k < 0.5) return;
        const grams = (k / f.per100g.kcal) * 100;
        const g = grams / 100;
        put('foodEntries', {
          date: day, meal, name: f.name, emoji: f.emoji, foodId: f.id, source: 'builtin', verified: false, servingLabel: f.servings[0].label,
          quantity: Math.round((grams / f.servings[0].grams) * 100) / 100, grams: Math.round(grams * 10) / 10,
          nutrients: { kcal: f.per100g.kcal * g, protein: f.per100g.protein * g, carbs: f.per100g.carbs * g, fat: f.per100g.fat * g, fiber: f.per100g.fiber * g },
          food: f, loggedAt: at(0, hour, 10),
        });
      };
      const plainKcal = kcal - leanKcal;
      add('breakfast', plain, plainKcal * 0.7, 8);
      add('lunch', lean, leanKcal, 13);
      add('snack', plain, plainKcal * 0.3, 16);
    }
  }
  if (values.water !== undefined) {
    const goal = summary().waterGoalMl;
    drop('water', (w) => w.date !== day);
    let left = Math.round(values.water * goal);
    for (let g = 0; left > 0; g++) {
      const ml = Math.min(250, left);
      put('water', { date: day, ml, beverage: 'water', loggedAt: new Date(new Date(at(0, 7)).getTime() + g * 50 * 60000).toISOString() });
      left -= ml;
    }
  }
  if (values.fasting !== undefined) {
    drop('fasting', () => false);
    if (values.fasting > 0) {
      const hours = state.settings.fastingTargetHours || 16;
      put('fasting', { start: new Date(Date.now() - values.fasting * hours * 3600000).toISOString(), targetHours: hours });
    }
  }
}

/**
 * @param {{ days?: number, empty?: boolean, theme?: 'system'|'light'|'dark'|'blossom', onboarded?: boolean, units?: 'metric'|'imperial', store?: boolean, stress?: boolean,
 *   values?: { eaten?: number, protein?: number, exercise?: number, water?: number, weekMinutes?: number, fasting?: number } }} opts
 */
export function buildSeed(opts = {}) {
  const { days = 35, empty = false, theme = 'dark', onboarded = true, units = 'metric', store = false, stress = false, values = null } = opts;
  const rand = rng(20261113);
  const stamp = new Date().toISOString();
  const rec = (r) => ({ id: randomUUID(), updatedAt: stamp, deleted: false, ...r });
  const weightKg = 78.4;
  const baselineTdee = 2330;

  const state = {
    ownerId: null,
    profile: onboarded
      ? {
          name: 'Alex', sex: 'male', birthDate: '1994-05-12', heightCm: 178, weightKg, bodyFatPct: 18,
          activityLevel: 'light', goal: 'lose', targetWeightKg: 74, weeklyRateKg: 0.4, units,
          eatBackExercise: true, useAdaptiveTdee: true, onboardedAt: at(days, 9), updatedAt: stamp,
        }
      : null,
    settings: {
      theme, haptics: true, celebrations: true, waterPresets: units === 'imperial' ? [237, 355, 473, 710] : [150, 250, 330, 500], fastingTargetHours: 16,
      reminders: {
        enabled: false, quietStart: '22:00', quietEnd: '07:30',
        water: { enabled: true, everyMinutes: 120 },
        meals: { enabled: true, breakfast: '08:30', lunch: '13:00', dinner: '19:30' },
        dailySummary: { enabled: true, time: '20:30' },
        weighIn: { enabled: false, time: '07:45', weekdays: [1, 4] },
        movement: { enabled: false, time: '17:30' },
      },
      updatedAt: stamp,
    },
    foodEntries: {}, customFoods: {}, savedMeals: {}, activities: {}, water: {}, weights: {}, sleep: {}, fasting: {},
    recentFoods: [], favoriteFoodIds: [], recentActivityIds: [],
    dirty: { foodEntries: {}, customFoods: {}, savedMeals: {}, activities: {}, water: {}, weights: {}, sleep: {}, fasting: {} },
    profileDirty: false, settingsDirty: false, lastPulledAt: null, lastSyncedAt: null,
  };
  if (empty || !onboarded) return { state, version: 1 };

  const put = (collection, r) => {
    const full = rec(r);
    state[collection][full.id] = full;
    return full;
  };
  const addFood = (n, meal, key, qty, hour) => {
    const food = FOODS[key];
    const serving = food.servings[0];
    const grams = serving.grams * qty;
    const f = grams / 100;
    put('foodEntries', {
      date: iso(daysAgo(n)), meal, name: food.name, emoji: food.emoji, foodId: food.id, source: 'builtin', verified: false,
      servingLabel: serving.label, quantity: qty, grams,
      nutrients: { kcal: food.per100g.kcal * f, protein: food.per100g.protein * f, carbs: food.per100g.carbs * f, fat: food.per100g.fat * f, fiber: food.per100g.fiber * f },
      food, loggedAt: at(n, hour, Math.floor(rand() * 50)),
    });
  };

  for (let n = days; n >= 0; n--) {
    // A few unlogged days, like real life (none with stress data, whose streak runs unbroken).
    const skip = n > 0 && rand() < 0.08 && !stress;
    if (!skip) {
      const pick = (list) => list[Math.floor(rand() * list.length)];
      for (const [k, q] of pick(MENUS.breakfast)) addFood(n, 'breakfast', k, q, 8);
      for (const [k, q] of pick(MENUS.lunch)) addFood(n, 'lunch', k, q, 13);
      if (n > 0) {
        for (const [k, q] of pick(MENUS.dinner)) addFood(n, 'dinner', k, q, 19);
        for (const [k, q] of pick(MENUS.snack)) addFood(n, 'snack', k, q, 16);
      } else {
        addFood(0, 'snack', 'apple', 1, 10);
      }
    }
    // Weight drifts down about 0.35 kg a week with daily noise; weigh-ins most mornings.
    if (rand() < 0.8 || n === 0 || n === days) {
      const kg = weightKg + (n / 7) * 0.35 + (rand() - 0.5) * 1.1;
      put('weights', { date: iso(daysAgo(n)), kg: Math.round(kg * 10) / 10, ...(n % 7 === 0 ? { bodyFatPct: Math.round((18 + n / 35) * 10) / 10 } : {}) });
    }
    if (rand() < 0.55 && n > 0) {
      const s = SESSIONS[Math.floor(rand() * SESSIONS.length)];
      const gross = (s.met * 3.5 * weightKg * s.durationMin) / 200;
      put('activities', { date: iso(daysAgo(n)), ...s, kcalGross: gross, kcalNet: Math.max(0, gross - (baselineTdee / 1440) * s.durationMin), loggedAt: at(n, 18) });
    }
    const glasses = n === 0 ? 3 : 5 + Math.floor(rand() * 5);
    for (let g = 0; g < glasses; g++) {
      put('water', { date: iso(daysAgo(n)), ml: [250, 330, 500][Math.floor(rand() * 3)], beverage: g === 1 ? 'coffee' : 'water', loggedAt: at(n, 8 + g * 2) });
    }
    if (n > 0 || true) put('sleep', { date: iso(daysAgo(n)), hours: Math.round((6.2 + rand() * 2.2) * 4) / 4, quality: 2 + Math.floor(rand() * 4) });
  }
  // One session earlier today so the dashboard shows exercise.
  {
    const s = SESSIONS[0];
    const gross = (s.met * 3.5 * weightKg * s.durationMin) / 200;
    put('activities', { date: iso(daysAgo(0)), ...s, kcalGross: gross, kcalNet: Math.max(0, gross - (baselineTdee / 1440) * s.durationMin), loggedAt: at(0, 7) });
  }
  // Keep the profile in step with the newest weigh-in, as the app itself does.
  const latest = Object.values(state.weights).sort((a, b) => b.date.localeCompare(a.date))[0];
  if (latest) state.profile.weightKg = latest.kg;
  if (store) tidyForStore(state, { put, weightKg, baselineTdee });
  state.recentFoods = Object.values(FOODS).slice(0, 12);
  state.favoriteFoodIds = [FOODS.oats.id, FOODS.chicken.id];
  state.recentActivityIds = ['volleyball', 'running', 'strength_training', 'yoga'];
  put('savedMeals', {
    name: 'Usual breakfast',
    items: [['oats', 1.5], ['banana', 1]].map(([k, q]) => {
      const food = FOODS[k];
      const grams = food.servings[0].grams * q;
      const f = grams / 100;
      return { name: food.name, emoji: food.emoji, servingLabel: food.servings[0].label, quantity: q, grams, food, source: 'builtin', verified: false,
        nutrients: { kcal: food.per100g.kcal * f, protein: food.per100g.protein * f, carbs: food.per100g.carbs * f, fat: food.per100g.fat * f, fiber: food.per100g.fiber * f } };
    }),
  });
  if (stress) stressUp(state, { put, baselineTdee });
  if (values) applyValues(state, values, { put, weightKg, baselineTdee });
  return { state, version: 1 };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  process.stdout.write(JSON.stringify(buildSeed()));
}
