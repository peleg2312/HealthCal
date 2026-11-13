// Builds a realistic persisted store for local development and screenshots.
// Output matches the zustand `persist` format under the key `healthcal-v1`.
import { randomUUID } from 'node:crypto';

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

/** @param {{ days?: number, empty?: boolean, theme?: 'system'|'light'|'dark', onboarded?: boolean }} opts */
export function buildSeed(opts = {}) {
  const { days = 35, empty = false, theme = 'dark', onboarded = true } = opts;
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
          activityLevel: 'light', goal: 'lose', targetWeightKg: 74, weeklyRateKg: 0.4, units: 'metric',
          eatBackExercise: true, useAdaptiveTdee: true, onboardedAt: at(days, 9), updatedAt: stamp,
        }
      : null,
    settings: {
      theme, haptics: true, celebrations: true, waterPresets: [150, 250, 330, 500], fastingTargetHours: 16,
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
    const skip = n > 0 && rand() < 0.08; // a few unlogged days, like real life
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
  return { state, version: 1 };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  process.stdout.write(JSON.stringify(buildSeed()));
}
