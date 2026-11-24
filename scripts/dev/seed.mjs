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
// Own foods named in Hebrew, as a person in Israel writes them: one all Hebrew with a Hebrew serving
// label (and numbers inside the name), one that starts in Latin letters. Their names and labels must
// start at the left of every line they are drawn in, and keep the numbers beside them in order.
const HEBREW = [
  ["קוטג' 5% עם זיתים ושמן זית", '🧀', 112, 9.6, 2.4, 7.2, 0.6, '1 גביע', 250],
  ['Pita פיתה מקמח מלא', '🫓', 262, 9.8, 52, 2.1, 6.8, '1 pita', 100],
];
const hebrewFood = ([name, emoji, kcal, protein, carbs, fat, fiber, label, grams], i) => ({
  id: `stress_custom_he_${i}`, name, emoji, source: 'custom', verified: false, category: 'seed',
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
 * 12 items (13 with the Hebrew-named own food), two own foods and a saved meal named in Hebrew, a day at 11,480 kcal and one at 0, 1,240 active minutes in the last seven days,
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

  // Two own foods named in Hebrew. The first is in today's lunch (its thirteenth item) and in lunch
  // on ten earlier days, so it is the second usual lunch food (the + sheet and "What fits" at lunch
  // time show it); with the bundled Israeli salad it makes a saved meal named in Hebrew (the third
  // saved meal, index 2).
  const hebrew = HEBREW.map(hebrewFood);
  for (const f of hebrew) state.customFoods[f.id] = { ...f, updatedAt: new Date().toISOString(), deleted: false };
  for (const n of [0, 1, 4, 5, 6, 7, 8, 9, 10, 11, 12]) logItem(n, 'lunch', itemOf(hebrew[0]), 13, n === 0 ? 40 : 45);
  put('savedMeals', { name: 'ארוחת בוקר ישראלית', items: [itemOf(hebrew[0]), itemOf(FOODS.salad)] });

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
//   spread       1 adds exercise "Over 7 days" (profile.eatBackExercise true, exerciseSpread 'week',
//                no rule history, so every day of the demo follows it): each day's workouts reach
//                that day and the six after it. Absent or 0 leaves the demo on "Same day".
// For the morning page's states (scripts/dev/states/morning.cjs, which view the seed's today from
// tomorrow morning, so "tomorrow" below is the page's today):
//   lastNight    hours of sleep in a record dated tomorrow (the page's last night); the seed itself
//                never writes tomorrow.
//   weighInGap   days: removes every weigh-in after (tomorrow - weighInGap) and puts one on that day,
//                so the newest weigh-in is exactly that many days before the page's today.
//   onboardedToday  true sets profile.onboardedAt to the seed's today at 09:00 (the page's day 2).
//   name         sets profile.name ('' for none).
// For drinks with calories (src/features/drinks), written with the app's own planDrink:
//   drinks       1: today 08:05, 250 ml semi-skimmed milk to breakfast (entry ...d001, water ...d101);
//                2: also 13:10, 330 ml soft drink to lunch (...d002 / ...d102). Applied after water.
//   diaryDrink   1: today 08:05, 250 ml semi-skimmed milk logged in the diary only (breakfast, entry ...d003,
//                no water record, no `via`): the water screen's "already in breakfast" notice and "Water only".
// For drinks logged in the diary that also count in Water (src/features/drinks/diary.ts), written with the app's
// own diaryDrink and diaryWaterRecord (the water's id derived from the entry's, `fromEntryId`):
//   diaryWater   1: today 13:10, a 500 ml can of energy drink logged in lunch (entry ...d004) and its water;
//                2: also today 08:10, a latte (1 cup, 240 g) logged in breakfast (entry ...d005) and its water: at
//                09:00 the water screen's Coffee > Latte says it is already in Water and offers no "Water only".
// For a remembered portion whose food has changed since (lead's decision D1 of the Israeli foods review):
//   oldBourekas  1: on each of the five days before today, at 16:30, one snack entry of cheese bourekas logged
//                before the Israeli foods were added (commit 3fa7914: "1 piece" 80 g, 335 kcal per 100 g), in the
//                shape a restart gives it (today's bundled food attached, the old label, grams and nutrients;
//                src/store/persistence.ts). Today's bundled food names "1 piece" at another weight, so the + sheet,
//                food search and What fits must show and log 80 g at today's values (entries ...b001 to ...b005;
//                the usual snack, since the demo's snacks vary: look at it with the clock at 16:30).
// For copies at today's values (lead's decision L1 of the Israeli foods review):
//   oldBourekas  2: the above, and yesterday's lunch is five foods logged at 12:40, three of them bundled foods logged before the
//                Israeli foods were added (commit 3fa7914), in the shape a restart gives them (today's bundled food
//                attached, the old label, grams and nutrients): cheese bourekas "1 piece" 80 g (268 kcal), halloumi
//                2 x "1 slice" 30 g (192.6 kcal), chicken schnitzel "1 piece" 130 g (331.5 kcal); then an own food
//                (My granola, 1 bowl 60 g, 270 kcal, the live own food since edited to 500 kcal per 100 g) and an
//                online product (Hummus spread, 2 tbsp 30 g, 75 kcal). Today's lunch is left empty, so "Repeat
//                yesterday's lunch" is offered at lunch time (entries ...c001 to ...c005; look with the clock at 12:30).
//                Also the newest saved meal, "Lunch plate" (...c101), saved then: the old bourekas and halloumi lines
//                with their old food copies and the own food (lead's decision L2).
// For favourite meals and saved estimates (src/features/food/favorites.ts; applied in this order):
//   favoriteMeal   1: stars the saved meal listed last (the oldest; equal stamps keep the order they were written in)
//                  with `favoriteAt` now: the demo's "Usual breakfast"; with stress, the Hebrew-named meal
//                  (ארוחת בוקר ישראלית), so the order visibly changes on Saved meals.
//   savedEstimate  1: a saved meal from an AI estimate, "Chicken and rice bowl" (...e101: three AI lines with
//                  `kcalRange` and `confidence`, no food, source 'ai'), the newest saved meal, so its figures read "~";
//                  2: the same, starred a second after `favoriteMeal`'s star, so it is the + sheet's first tile.
// For Train's training overview (src/lib/trainingLoad.ts; every workout is hand-logged, on fixed days before the seed's
// today, so a picture does not change with the date). Each rewrites the last 28 days (today and the 27 before) of the
// demo's workouts; 'new' removes the older ones too. The past three 7-day blocks are the same "usual" week each time:
// volleyball 75 min (the weekday of today), a run 38 min moderate (2 days later back), strength 55 min Hard (4 back),
// a walk 45 min (5 back) = 268 guideline minutes, so the recent average is 268. Then the last 7 days:
//   load 'steady'   the usual week again (volleyball today at 07:00 as in the demo): 268, "About your usual".
//   load 'lighter'  volleyball today and a 30 min walk 3 days ago: 105, r 0.39, "Lighter than your recent weeks".
//   load 'more'     the usual week, a run 38 min yesterday and a walk 60 min 3 days ago: 366, r 1.37, "More than
//                   your recent weeks" (with the easy-day step, as it is above 150).
//   load 'jump'     the usual week, a run 60 min yesterday, basketball 50 min Hard 3 days ago, a walk 60 min 6 days
//                   ago: 488, r 1.82, no day with half of it, "A big step up".
//   load 'hike'     the usual week and a 300 min hike (moderate) 3 days ago, a day with nothing else: 568, r 2.12, the
//                   hike day 53%: "One big day", "300 of them on <that weekday>".
//   load 'daily'    volleyball today and HIIT 30 min Hard on each of the 7 days: 495, 7 Hard days in a row: "A full
//                   week, few easy days".
//   load 'new'      nothing before 9 days ago: volleyball today, a run 3 days ago, a walk 6 days ago, strength 9 days
//                   ago: no state (the first workout is under 21 days old), so Train keeps "Hard minutes count double".
// Applied before exercise and weekMinutes, which change today and this week on top of it.
// Only what is named changes; everything else stays the demo's. Applied in that order: eatBack, spread, exercise and
// the week first (they move the budget and the water goal), then food, water, drinks and the fast.

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
  // expo-crypto is native: the drink rules reach it through @/lib/id (buildEntry's nowISO); Node has randomUUID.
  // Food search is never called here, but buildEntry reaches it (ai/estimate -> ai/localMatch) and it loads
  // the online product search, which needs React Native: an empty stand-in keeps the chain pure.
  const stubs = { react: {}, './clock': {}, './index': {}, 'expo-crypto': { randomUUID }, '@/services/foodSearch': {} };
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
  appCache = { ...lib('lib/dates.ts'), ...lib('lib/exercise.ts'), ...lib('store/selectors.ts'), drinks: lib('features/drinks/rules.ts'), choices: lib('features/drinks/choices.ts'), diary: lib('features/drinks/diary.ts') };
  return appCache;
}

/** Today's bundled food with this id, from src/data/foods.ts (the object the app attaches to an entry on load). */
function bundledFood(id) {
  const require = createRequire(import.meta.url);
  const ts = require('typescript');
  const file = fileURLToPath(new URL('data/foods.ts', APP));
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  new Function('require', 'module', 'exports', code)(() => ({}), module, module.exports);
  const food = module.exports.BUILTIN_FOODS.find((f) => f.id === id);
  if (!food) throw new Error(`seed values: no bundled food ${id}`);
  return JSON.parse(JSON.stringify(food));
}

const VALUE_KEYS = ['eaten', 'protein', 'exercise', 'water', 'weekMinutes', 'fasting', 'eatBack', 'spread', 'lastNight', 'weighInGap', 'onboardedToday', 'name', 'drinks', 'diaryDrink', 'diaryWater', 'oldBourekas', 'load', 'favoriteMeal', 'savedEstimate'];
/** Knobs that are not numbers: their type is checked on its own. */
const VALUE_TYPES = { onboardedToday: 'boolean', name: 'string', load: 'string' };
/** The training overview's weeks (values.load, above). */
const LOAD_KINDS = ['steady', 'lighter', 'more', 'jump', 'hike', 'daily', 'new'];

/** Sets the day's amounts (see above). `put` writes a record the way buildSeed does. */
function applyValues(state, values, { put, weightKg, baselineTdee }) {
  const unknown = Object.keys(values).filter((k) => !VALUE_KEYS.includes(k));
  if (unknown.length) throw new Error(`seed values: unknown ${unknown.join(', ')} (known: ${VALUE_KEYS.join(', ')})`);
  for (const [k, v] of Object.entries(values)) {
    if (VALUE_TYPES[k]) {
      if (typeof v !== VALUE_TYPES[k]) throw new Error(`seed values: ${k} must be a ${VALUE_TYPES[k]}`);
      if (k === 'load' && !LOAD_KINDS.includes(v)) throw new Error(`seed values: load must be one of ${LOAD_KINDS.join(', ')}`);
    } else if (typeof v !== 'number' || !(v >= 0)) throw new Error(`seed values: ${k} must be a number of 0 or more`);
  }
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
  if (values.spread > 0) {
    state.profile.eatBackExercise = true;
    state.profile.exerciseSpread = 'week';
  }
  if (values.load !== undefined) {
    const kind = values.load;
    const fresh = kind === 'new';
    const since = iso(daysAgo(27));
    drop('activities', (a) => !fresh && a.date < since);
    const KINDS = {
      volleyball: SESSIONS[0],
      running: SESSIONS[1],
      strength: SESSIONS[2],
      basketball: SESSIONS[4],
      walking: walk,
      hiit: { activityId: 'hiit', name: 'HIIT', emoji: '⚡', category: 'strength', intensity: 'vigorous', met: 11 },
      hiking: { activityId: 'hiking', name: 'Hiking', emoji: '🥾', category: 'outdoor', intensity: 'moderate', met: 5.3 },
    };
    // A hand-logged session of `durationMin` at the template's MET, priced as the app prices it.
    const lift = (n, key, durationMin, hour = 18) => {
      const { distanceKm, durationMin: _d, ...s } = KINDS[key];
      const gross = (s.met * 3.5 * kg * durationMin) / 200;
      put('activities', { date: iso(daysAgo(n)), ...s, durationMin, ...(distanceKm ? { distanceKm: Math.round((distanceKm / _d) * durationMin * 10) / 10 } : null), kcalGross: gross, kcalNet: Math.max(0, gross - restPerMin * durationMin), weightKg: kg, baselineKcalPerDay: baselineTdee, loggedAt: at(n, hour) });
    };
    const usualWeek = (w) => { lift(7 * w, 'volleyball', 75, w ? 18 : 7); lift(7 * w + 2, 'running', 38); lift(7 * w + 4, 'strength', 55); lift(7 * w + 5, 'walking', 45); };
    if (fresh) {
      lift(0, 'volleyball', 75, 7); lift(3, 'running', 38); lift(6, 'walking', 45); lift(9, 'strength', 55);
    } else {
      for (const w of [1, 2, 3]) usualWeek(w);
      if (kind === 'lighter') { lift(0, 'volleyball', 75, 7); lift(3, 'walking', 30); }
      else if (kind === 'daily') { lift(0, 'volleyball', 75, 7); for (let n = 0; n < 7; n++) lift(n, 'hiit', 30, 17); }
      else {
        usualWeek(0);
        if (kind === 'more') { lift(1, 'running', 38); lift(3, 'walking', 60); }
        if (kind === 'jump') { lift(1, 'running', 60); lift(3, 'basketball', 50); lift(6, 'walking', 60); }
        if (kind === 'hike') lift(3, 'hiking', 300, 9);
      }
    }
  }
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
  if (values.drinks > 0) {
    const { planDrink, selectChoice } = m.drinks;
    const { choiceById } = m.choices;
    const units = state.profile.units || 'metric';
    const list = [
      { n: 1, kind: 'milk', choice: 'milk_semi', ml: 250, h: 8, min: 5 },
      { n: 2, kind: 'other', choice: 'soft_regular', ml: 330, h: 13, min: 10 },
    ].slice(0, Math.min(2, Math.round(values.drinks)));
    for (const d of list) {
      const now = new Date(at(0, d.h, d.min));
      const plan = planDrink({ kind: d.kind, drink: selectChoice(choiceById(d.choice)), ml: d.ml, date: day, now, today: day, units });
      const entryId = `00000000-0000-4000-8000-00000000d00${d.n}`;
      put('foodEntries', { ...plan.entry, id: entryId });
      put('water', { ...plan.water, id: `00000000-0000-4000-8000-00000000d10${d.n}`, foodEntryId: entryId });
    }
  }
  if (values.diaryDrink > 0) {
    const { planDrink, selectChoice } = m.drinks;
    const { choiceById } = m.choices;
    const plan = planDrink({ kind: 'milk', drink: selectChoice(choiceById('milk_semi')), ml: 250, date: day, now: new Date(at(0, 8, 5)), today: day, units: state.profile.units || 'metric' });
    const { via: _via, ...entry } = plan.entry;
    put('foodEntries', { ...entry, id: '00000000-0000-4000-8000-00000000d003' });
  }
  if (values.diaryWater > 0) {
    const { diaryDrink, diaryWaterRecord } = m.diary;
    const list = [
      { n: 4, id: 'b_energy_drink', label: '1 can (500 ml)', meal: 'lunch', h: 13, min: 10 },
      { n: 5, id: 'b_latte', label: '1 cup (8 fl oz)', meal: 'breakfast', h: 8, min: 10 },
    ].slice(0, Math.min(2, Math.round(values.diaryWater)));
    for (const d of list) {
      const food = bundledFood(d.id);
      const grams = food.servings.find((sv) => sv.label === d.label).grams;
      const nutrients = Object.fromEntries(Object.entries(food.per100g).map(([k, v]) => [k, (v * grams) / 100]));
      const entry = {
        id: `00000000-0000-4000-8000-00000000d00${d.n}`, date: day, meal: d.meal, name: food.name, emoji: food.emoji, foodId: food.id,
        source: 'builtin', verified: food.verified, servingLabel: d.label, quantity: 1, grams, nutrients, food, loggedAt: at(0, d.h, d.min),
      };
      put('foodEntries', entry);
      const drink = diaryDrink(entry, state.profile);
      if (!drink) throw new Error(`seed values: ${d.id} is not a diary drink`);
      put('water', diaryWaterRecord(entry, drink));
    }
  }
  if (values.oldBourekas > 0) {
    // Logged from the row of src/data/foods.ts at 3fa7914 ("1 piece" 80 g, 335 kcal per 100 g), in the shape the
    // device holds after a restart: src/store/persistence.ts saves a bundled food's entry without its copy of the
    // food and attaches today's bundled food on load, so the entry's label, grams and nutrients are the old ones
    // while its `food` is today's. (Writing the old copy here would hide what a person sees after a restart.)
    const per100g = { kcal: 335, protein: 9, carbs: 28, fat: 21, fiber: 1, sugar: 1.5, satFat: 9, sodium: 600 };
    const food = bundledFood('b_bourekas_cheese');
    const nutrients = Object.fromEntries(Object.entries(per100g).map(([k, v]) => [k, (v * 80) / 100]));
    for (let n = 1; n <= 5; n++) {
      put('foodEntries', {
        id: `00000000-0000-4000-8000-00000000b00${n}`, date: iso(daysAgo(n)), meal: 'snack', name: food.name, emoji: food.emoji, foodId: food.id,
        source: 'builtin', verified: false, servingLabel: '1 piece', quantity: 1, grams: 80, nutrients, food, loggedAt: at(n, 16, 30),
      });
    }
  }
  if (values.oldBourekas >= 2) {
    const yesterday = iso(daysAgo(1));
    drop('foodEntries', (e) => !((e.date === yesterday || e.date === day) && e.meal === 'lunch'));
    // The rows of src/data/foods.ts at 3fa7914: kcal, protein, carbs, fat, fiber, sugar, satFat, sodium per 100 g.
    const OLD_ROWS = {
      b_bourekas_cheese: { per: [335, 9.0, 28.0, 21.0, 1.0, 1.5, 9.0, 600], label: '1 piece', grams: 80, quantity: 1 },
      b_halloumi: { per: [321, 21.0, 2.2, 25.0, 0, 1.5, 16.0, 1200], label: '1 slice', grams: 30, quantity: 2 },
      b_schnitzel_chicken: { per: [255, 20.0, 12.0, 14.0, 0.8, 0.8, 2.5, 450], label: '1 piece', grams: 130, quantity: 1 },
    };
    const KEYS = ['kcal', 'protein', 'carbs', 'fat', 'fiber', 'sugar', 'satFat', 'sodium'];
    const scaled = (per100g, grams) => Object.fromEntries(Object.entries(per100g).map(([k, v]) => [k, (v * grams) / 100]));
    let n = 0;
    const entry = (food, label, grams, quantity, nutrients, extra = {}) => {
      n++;
      put('foodEntries', {
        id: `00000000-0000-4000-8000-00000000c00${n}`, date: yesterday, meal: 'lunch', name: food.name, emoji: food.emoji, foodId: food.id,
        source: food.source, verified: !!food.verified, servingLabel: label, quantity, grams: grams * quantity, nutrients, food, loggedAt: at(1, 12, 40 + n), ...extra,
      });
    };
    for (const [id, o] of Object.entries(OLD_ROWS)) {
      const per100g = Object.fromEntries(KEYS.map((k, i) => [k, o.per[i]]));
      entry(bundledFood(id), o.label, o.grams, o.quantity, scaled(per100g, o.grams * o.quantity));
    }
    const ownThen = { id: 'seed_own_granola', name: 'My granola', emoji: '🥣', source: 'custom', verified: false, per100g: { kcal: 450, protein: 10, carbs: 60, fat: 18, fiber: 7 }, servings: [{ label: '1 bowl', grams: 60 }] };
    state.customFoods[ownThen.id] = { ...ownThen, per100g: { ...ownThen.per100g, kcal: 500 }, updatedAt: at(1, 20), deleted: false };
    entry(ownThen, '1 bowl', 60, 1, scaled(ownThen.per100g, 60));
    const online = { id: 'off_7290000000001', name: 'Hummus spread', brand: 'Store brand', emoji: '🥫', source: 'openfoodfacts', verified: false, per100g: { kcal: 250, protein: 7, carbs: 12, fat: 19, fiber: 5 }, servings: [{ label: '1 tbsp', grams: 15 }] };
    entry(online, '1 tbsp', 15, 2, scaled(online.per100g, 30), { brand: online.brand });
    // A saved meal from then (a synced record keeps each line's food copy as it was): the old bourekas and halloumi
    // lines and the own food; the newest saved meal, so it is the + sheet's tile and the first card on Saved meals.
    const line = (food, label, grams, quantity, per100g) => ({ name: food.name, emoji: food.emoji, servingLabel: label, quantity, grams: grams * quantity, nutrients: scaled(per100g, grams * quantity), food: { ...food, per100g }, source: food.source, verified: !!food.verified });
    const oldPer = (id) => Object.fromEntries(KEYS.map((k, i) => [k, OLD_ROWS[id].per[i]]));
    put('savedMeals', {
      id: '00000000-0000-4000-8000-00000000c101', name: 'Lunch plate', updatedAt: new Date().toISOString(), servings: 1,
      items: [line(bundledFood('b_bourekas_cheese'), '1 piece', 80, 1, oldPer('b_bourekas_cheese')), line(bundledFood('b_halloumi'), '1 slice', 30, 2, oldPer('b_halloumi')), line(ownThen, '1 bowl', 60, 1, ownThen.per100g)],
    });
  }
  if (values.favoriteMeal > 0) {
    const listed = live('savedMeals').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const oldest = listed[listed.length - 1];
    if (!oldest) throw new Error('seed values: favoriteMeal needs a saved meal');
    oldest.favoriteAt = new Date().toISOString();
  }
  if (values.savedEstimate > 0) {
    const later = (ms) => new Date(Date.now() + ms).toISOString();
    const ai = (name, emoji, servingLabel, grams, kcal, range, protein, carbs, fat, confidence) => ({
      name, emoji, servingLabel, quantity: 1, grams, nutrients: { kcal, protein, carbs, fat }, source: 'ai', verified: false, kcalRange: range, confidence,
    });
    put('savedMeals', {
      id: '00000000-0000-4000-8000-00000000e101', name: 'Chicken and rice bowl', updatedAt: later(1000),
      items: [
        ai('Grilled chicken', '🍗', '1 portion', 160, 264, [220, 320], 46, 0, 8, 0.7),
        ai('White rice', '🍚', '1 cup', 160, 208, [170, 250], 4, 45, 0.5, 0.65),
        ai('Salad with olive oil', '🥗', '1 bowl', 150, 120, [80, 170], 2, 6, 10, 0.5),
      ],
      ...(values.savedEstimate >= 2 ? { favoriteAt: later(2000) } : null),
    });
  }
  if (values.lastNight !== undefined) {
    const night = iso(daysAgo(-1));
    drop('sleep', (r) => r.date !== night);
    if (values.lastNight > 0) put('sleep', { date: night, hours: Math.round(values.lastNight * 100) / 100 });
  }
  if (values.weighInGap !== undefined) {
    const last = iso(daysAgo(Math.round(values.weighInGap) - 1));
    const kept = live('weights').filter((w) => w.date <= last).sort((a, b) => b.date.localeCompare(a.date));
    const kgThen = kept[0]?.kg ?? state.profile.weightKg;
    drop('weights', (w) => w.date < last);
    put('weights', { date: last, kg: kgThen });
    state.profile.weightKg = kgThen;
  }
  if (values.onboardedToday) state.profile.onboardedAt = at(0, 9);
  if (values.name !== undefined) state.profile.name = values.name;
  if (values.fasting !== undefined) {
    drop('fasting', () => false);
    if (values.fasting > 0) {
      const hours = state.settings.fastingTargetHours || 16;
      put('fasting', { start: new Date(Date.now() - values.fasting * hours * 3600000).toISOString(), targetHours: hours });
    }
  }
}

/**
 * The themes a seed can be asked for. The four preferences go into `settings.theme`; a newer look
 * ('butter', 'honey', 'java') is written as the app writes it (src/theme/resolve.ts,
 * `themeChoicePatch`): `settings.look` with its fallback in `settings.theme`, so an older build
 * shown the same seed draws Light or Dark.
 */
export const SEED_THEMES = ['system', 'light', 'dark', 'blossom', 'butter', 'honey', 'java'];
const LOOK_FALLBACK = { butter: 'light', honey: 'light', java: 'dark' };

/** The `settings` fields for a theme name: `{ theme }`, or `{ theme: fallback, look }` for a newer look. */
export function themeSettings(theme) {
  if (!SEED_THEMES.includes(theme)) throw new Error(`Unknown theme "${theme}". Use one of: ${SEED_THEMES.join(', ')}.`);
  return LOOK_FALLBACK[theme] ? { theme: LOOK_FALLBACK[theme], look: theme } : { theme };
}

/** True for a theme with a dark page (the browser's colour scheme in the scripts follows it). */
export function seedThemeIsDark(theme) {
  return theme === 'dark' || theme === 'java';
}

/**
 * @param {{ days?: number, empty?: boolean, theme?: 'system'|'light'|'dark'|'blossom'|'butter'|'honey'|'java', onboarded?: boolean, units?: 'metric'|'imperial', store?: boolean, stress?: boolean,
 *   values?: { eaten?: number, protein?: number, exercise?: number, water?: number, weekMinutes?: number, fasting?: number, eatBack?: number, spread?: number, load?: 'steady' | 'lighter' | 'more' | 'jump' | 'hike' | 'daily' | 'new', lastNight?: number, weighInGap?: number, onboardedToday?: boolean, name?: string, drinks?: number, diaryDrink?: number, diaryWater?: number, oldBourekas?: number, favoriteMeal?: number, savedEstimate?: number } }} opts
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
      ...themeSettings(theme), haptics: true, celebrations: true, waterPresets: units === 'imperial' ? [237, 355, 473, 710] : [150, 250, 330, 500], fastingTargetHours: 16,
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
