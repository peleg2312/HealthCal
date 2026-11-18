/**
 * Bundled offline food database. Nutrients are per 100 g (100 ml for liquids).
 *
 * Checked in November 2026 against the downloaded USDA FoodData Central CSV/JSON
 * releases: SR Legacy (sr_legacy_food_csv_2018-04), FNDDS survey foods
 * (survey_food_csv_2024-10-31, used for prepared dishes) and Foundation Foods
 * (foundation_food_json_2026-10-29, consulted but no record was chosen from it,
 * because the matching SR Legacy record carries the full nutrient set).
 *
 * 322 of 348 foods name the record they were checked against (`fdcId`) and are
 * `verified: true`. For those, kcal, protein, carbs (by difference), fat,
 * fibre, total sugars, saturated fat and sodium were compared per 100 g and set
 * to the USDA values (grams to 0.1, kcal and sodium whole) where they differed
 * by more than rounding. A nutrient USDA does not report for that record is
 * left out rather than guessed. Where USDA's total sugars exceed its
 * carbohydrate-by-difference (milks, heavy cream, ginger ale), sugar is capped
 * at carbs. For the chocolate hazelnut spread, USDA's saturated fat (28.4 of
 * 29.7 g fat) is implausible, so it is left out. Several records are the
 * generic choice for a vaguer name (for example white bread is "commercially
 * prepared", sourdough is "french or vienna (includes sourdough)", pancakes are
 * FNDDS "Pancakes, plain"). Household servings were compared with the record's
 * USDA portions where one corresponds; servings USDA does not list are unchecked.
 * An independent second pass looked up all 321 records again from a fresh
 * download and confirmed every per-100 g value; it also found the lox record
 * and some twenty serving weights that disagreed with USDA's own portions,
 * which are corrected here (soft drinks, for instance, weigh more than their
 * volume in ml).
 *
 * The other 26 foods have no honest USDA equivalent and stay `verified: false`
 * with typical-label or recipe-based estimates: labneh, halloumi, gummy candy,
 * Caesar salads and Greek salad (USDA versions have no dressing or oil),
 * shakshuka, Israeli salad, chicken shawarma (both), chicken schnitzel,
 * bourekas, latte/cappuccino/mocha with whole milk (USDA's use unspecified
 * milk) and the five protein products, and six tea and coffee drinks.
 *
 * The six tea and coffee 'splash of milk / sugar' rows are computed from
 * b_coffee_black or b_tea_brewed, b_milk_2pct and b_sugar_white (220 ml brew +
 * 30 ml milk [+ 4.2 g sugar] per 250 ml cup; sugar only: 250 ml brew + 4.2 g);
 * src/data/data-integrity.test.ts recomputes them. They are not USDA records
 * because FNDDS "Tea, hot, with milk" (2710506) is a sweetened chai and
 * "Coffee, pre-lightened" (2710464) uses powdered creamer. Milky coffees are
 * Latte and Cappuccino. The water screen logs them (src/features/drinks).
 *
 * Tuple order: [kcal, protein, carbs, fat, fiber, sugar, satFat, sodiumMg]
 */
import type { Food } from '@/types';

type Opt = number | undefined;
type N = [number, number, number, number, Opt?, Opt?, Opt?, Opt?];
type S = [string, number][];

// `fdcId` is the USDA FoodData Central record the values were checked against.
// A food is `verified` exactly when it has one.
const f = (id: string, name: string, emoji: string, category: string, n: N, servings: S, fdcId?: number): Food => ({
  id: `b_${id}`,
  name,
  emoji,
  category,
  source: 'builtin',
  verified: fdcId !== undefined,
  ...(fdcId !== undefined && { fdcId }),
  per100g: {
    kcal: n[0],
    protein: n[1],
    carbs: n[2],
    fat: n[3],
    ...(n[4] !== undefined && { fiber: n[4] }),
    ...(n[5] !== undefined && { sugar: n[5] }),
    ...(n[6] !== undefined && { satFat: n[6] }),
    ...(n[7] !== undefined && { sodium: n[7] }),
  },
  servings: servings.map(([label, grams]) => ({ label, grams })),
});

export const BUILTIN_FOODS: Food[] = [
  // ------------------------------------------------------------------ fruit
  f('apple', 'Apple, raw', '🍎', 'fruit', [52, 0.26, 13.8, 0.17, 2.4, 10.4, 0.03, 1], [['1 medium', 182], ['1 small', 149], ['1 large', 223]], 171688),
  f('banana', 'Banana, raw', '🍌', 'fruit', [89, 1.09, 22.8, 0.33, 2.6, 12.2, 0.11, 1], [['1 medium', 118], ['1 large', 136], ['1 small', 101]], 173944),
  f('orange', 'Orange, raw', '🍊', 'fruit', [47, 0.94, 11.75, 0.12, 2.4, 9.35, 0.02, 0], [['1 medium', 131], ['1 large', 184], ['1 small', 96]], 169097),
  f('mandarin', 'Mandarin / clementine, raw', '🍊', 'fruit', [47, 0.85, 12, 0.15, 1.7, 9.2, undefined, 1], [['1 medium', 74], ['2 fruits', 148]], 168195),
  f('grapes', 'Grapes, red or green, raw', '🍇', 'fruit', [69, 0.72, 18.1, 0.16, 0.9, 15.5, 0.05, 2], [['1 cup', 151], ['10 grapes', 49]], 174683),
  f('strawberries', 'Strawberries, raw', '🍓', 'fruit', [32, 0.67, 7.68, 0.3, 2, 4.89, 0.02, 1], [['1 cup whole', 144], ['5 medium', 60]], 167762),
  f('blueberries', 'Blueberries, raw', '🫐', 'fruit', [57, 0.74, 14.5, 0.33, 2.4, 9.96, 0.03, 1], [['1 cup', 148], ['1/2 cup', 74]], 171711),
  f('raspberries', 'Raspberries, raw', '🍓', 'fruit', [52, 1.2, 11.9, 0.65, 6.5, 4.42, 0.02, 1], [['1 cup', 123], ['1/2 cup', 62]], 167755),
  f('blackberries', 'Blackberries, raw', '🫐', 'fruit', [43, 1.39, 9.61, 0.49, 5.3, 4.88, 0.01, 1], [['1 cup', 144], ['1/2 cup', 72]], 173946),
  f('watermelon', 'Watermelon, raw', '🍉', 'fruit', [30, 0.61, 7.55, 0.15, 0.4, 6.2, 0.02, 1], [['1 cup diced', 152], ['1 wedge', 286]], 167765),
  f('cantaloupe', 'Cantaloupe melon, raw', '🍈', 'fruit', [34, 0.84, 8.16, 0.19, 0.9, 7.86, 0.05, 16], [['1 cup diced', 156], ['1 wedge (1/8)', 69]], 169092),
  f('honeydew', 'Honeydew melon, raw', '🍈', 'fruit', [36, 0.54, 9.09, 0.14, 0.8, 8.12, 0.03, 18], [['1 cup diced', 170], ['1 wedge (1/8)', 125]], 169911),
  f('pineapple', 'Pineapple, raw', '🍍', 'fruit', [50, 0.54, 13.12, 0.12, 1.4, 9.85, 0.01, 1], [['1 cup chunks', 165], ['1 slice', 84]], 169124),
  f('mango', 'Mango, raw', '🥭', 'fruit', [60, 0.82, 14.98, 0.38, 1.6, 13.66, 0.09, 1], [['1 cup sliced', 165], ['1 fruit', 336]], 169910),
  f('papaya', 'Papaya, raw', '🥭', 'fruit', [43, 0.47, 10.82, 0.26, 1.7, 7.82, 0.08, 8], [['1 cup cubed', 145], ['1 small', 157]], 169926),
  f('kiwi', 'Kiwifruit, green, raw', '🥝', 'fruit', [61, 1.14, 14.66, 0.52, 3, 8.99, 0.03, 3], [['1 medium', 69], ['2 fruits', 138]], 168153),
  f('peach', 'Peach, raw', '🍑', 'fruit', [39, 0.91, 9.54, 0.25, 1.5, 8.39, 0.02, 0], [['1 medium', 150], ['1 small', 130]], 169928),
  f('nectarine', 'Nectarine, raw', '🍑', 'fruit', [44, 1.06, 10.55, 0.32, 1.7, 7.89, 0.03, 0], [['1 medium', 142]], 169914),
  f('plum', 'Plum, raw', '🍑', 'fruit', [46, 0.7, 11.42, 0.28, 1.4, 9.92, 0.02, 0], [['1 medium', 66], ['2 plums', 132]], 169949),
  f('apricot', 'Apricot, raw', '🍑', 'fruit', [48, 1.4, 11.12, 0.39, 2, 9.24, 0.03, 1], [['1 apricot', 35], ['3 apricots', 105]], 171697),
  f('cherries', 'Cherries, sweet, raw', '🍒', 'fruit', [63, 1.06, 16.01, 0.2, 2.1, 12.82, 0.04, 0], [['1 cup with pits', 138], ['10 cherries', 68]], 171719),
  f('pear', 'Pear, raw', '🍐', 'fruit', [57, 0.36, 15.23, 0.14, 3.1, 9.75, 0.01, 1], [['1 medium', 178], ['1 small', 148]], 169118),
  f('pomegranate', 'Pomegranate seeds (arils), raw', '🍎', 'fruit', [83, 1.67, 18.7, 1.17, 4, 13.67, 0.12, 3], [['1/2 cup', 87], ['1 whole fruit (arils)', 282]], 169134),
  f('fig_fresh', 'Figs, fresh, raw', '🍈', 'fruit', [74, 0.75, 19.18, 0.3, 2.9, 16.26, 0.06, 1], [['1 medium', 50], ['3 figs', 150]], 173021),
  f('grapefruit', 'Grapefruit, pink/red, raw', '🍊', 'fruit', [42, 0.77, 10.66, 0.14, 1.6, 6.89, 0.02, 0], [['1/2 medium', 123], ['1 whole', 246]], 174673),
  f('lemon', 'Lemon, raw, without peel', '🍋', 'fruit', [29, 1.1, 9.32, 0.3, 2.8, 2.5, 0.04, 2], [['1 lemon', 58], ['1 tbsp juice', 15]], 167746),
  f('avocado', 'Avocado, raw', '🥑', 'fruit', [160, 2, 8.53, 14.66, 6.7, 0.66, 2.13, 7], [['1/2 fruit', 100], ['1 whole', 201], ['1/4 fruit', 50]], 171705),
  f('coconut_meat', 'Coconut meat, raw', '🥥', 'fruit', [354, 3.33, 15.23, 33.49, 9, 6.23, 29.7, 20], [['1 piece (2x2")', 45], ['1/2 cup shredded', 40]], 170169),
  f('raisins', 'Raisins, seedless', '🍇', 'fruit', [299, 3.3, 79.3, 0.2, 4.5, 65.2, 0.06, 26], [['1 small box', 43], ['1/4 cup', 40], ['1 tbsp', 10]], 168165),
  f('dates_medjool', 'Dates, Medjool', '🌴', 'fruit', [277, 1.81, 74.97, 0.15, 6.7, 66.47, undefined, 1], [['1 date', 24], ['3 dates', 72]], 168191),
  f('dried_apricots', 'Apricots, dried', '🍑', 'fruit', [241, 3.39, 62.64, 0.51, 7.3, 53.44, 0, 10], [['1/4 cup', 33], ['5 halves', 21]], 173941),
  f('prunes', 'Prunes, dried', '🍑', 'fruit', [240, 2.18, 63.88, 0.38, 7.1, 38.13, 0.1, 2], [['1 prune', 9.5], ['5 prunes', 48]], 168162),
  f('dried_cranberries', 'Cranberries, dried, sweetened', '🍒', 'fruit', [308, 0.2, 82.8, 1.1, 5.3, 72.56, 0.12, 5], [['1/4 cup', 40], ['1 tbsp', 10]], 171723),
  f('dried_figs', 'Figs, dried', '🍈', 'fruit', [249, 3.3, 63.87, 0.93, 9.8, 47.92, 0.14, 10], [['1 fig', 8], ['3 figs', 24], ['1/4 cup', 37]], 174665),

  // ------------------------------------------------------------- vegetables
  f('broccoli_raw', 'Broccoli, raw', '🥦', 'vegetables', [34, 2.82, 6.64, 0.37, 2.6, 1.7, 0.1, 33], [['1 cup chopped', 91], ['1 medium stalk', 151]], 170379),
  f('broccoli_cooked', 'Broccoli, cooked (boiled)', '🥦', 'vegetables', [35, 2.38, 7.18, 0.41, 3.3, 1.39, 0.06, 41], [['1 cup chopped', 156], ['1/2 cup', 78]], 169967),
  f('carrot_raw', 'Carrot, raw', '🥕', 'vegetables', [41, 0.93, 9.58, 0.24, 2.8, 4.74, 0.04, 69], [['1 medium', 61], ['1 cup chopped', 128], ['1 large', 72]], 170393),
  f('carrot_cooked', 'Carrots, cooked (boiled)', '🥕', 'vegetables', [35, 0.76, 8.22, 0.18, 3, 3.45, 0.04, 58], [['1 cup sliced', 156], ['1/2 cup', 78]], 170394),
  f('tomato', 'Tomato, red, raw', '🍅', 'vegetables', [18, 0.88, 3.89, 0.2, 1.2, 2.63, 0.03, 5], [['1 medium', 123], ['1 cup chopped', 180], ['1 cherry tomato', 17]], 170457),
  f('cucumber', 'Cucumber, with peel, raw', '🥒', 'vegetables', [15, 0.65, 3.63, 0.11, 0.5, 1.67, 0.04, 2], [['1 cup sliced', 104], ['1 cucumber (8 in)', 301]], 168409),
  f('lettuce_romaine', 'Lettuce, romaine, raw', '🥬', 'vegetables', [17, 1.23, 3.29, 0.3, 2.1, 1.19, 0.04, 8], [['1 cup shredded', 47], ['2 cups', 94]], 169247),
  f('lettuce_iceberg', 'Lettuce, iceberg, raw', '🥬', 'vegetables', [14, 0.9, 2.97, 0.14, 1.2, 2, 0.02, 10], [['1 cup shredded', 72], ['1 wedge (1/6 head)', 89]], 169248),
  f('spinach_raw', 'Spinach, raw', '🥬', 'vegetables', [23, 2.86, 3.63, 0.39, 2.2, 0.42, 0.06, 79], [['1 cup', 30], ['2 cups', 60]], 168462),
  f('spinach_cooked', 'Spinach, cooked (boiled)', '🥬', 'vegetables', [23, 2.97, 3.75, 0.26, 2.4, 0.43, 0.04, 70], [['1 cup', 180], ['1/2 cup', 90]], 168463),
  f('kale', 'Kale, raw', '🥬', 'vegetables', [35, 2.92, 4.42, 1.49, 4.1, 0.99, 0.18, 53], [['1 cup chopped', 21], ['1 leaf', 10]], 168421),
  f('cabbage', 'Cabbage, green, raw', '🥬', 'vegetables', [25, 1.28, 5.8, 0.1, 2.5, 3.2, 0.03, 18], [['1 cup shredded', 70], ['1 wedge', 90]], 169975),
  f('cauliflower', 'Cauliflower, raw', '🥦', 'vegetables', [25, 1.9, 4.97, 0.3, 2, 1.91, 0.1, 30], [['1 cup chopped', 107], ['1 floret', 13]], 169986),
  f('bell_pepper_red', 'Bell pepper, red, raw', '🫑', 'vegetables', [26, 0.99, 6.03, 0.3, 2.1, 4.2, 0.06, 4], [['1 medium', 119], ['1 cup chopped', 149]], 170108),
  f('bell_pepper_green', 'Bell pepper, green, raw', '🫑', 'vegetables', [20, 0.86, 4.64, 0.17, 1.7, 2.4, 0.03, 3], [['1 medium', 119], ['1 cup chopped', 149]], 170427),
  f('onion', 'Onion, raw', '🧅', 'vegetables', [40, 1.1, 9.34, 0.1, 1.7, 4.24, 0.04, 4], [['1 medium', 110], ['1 cup chopped', 160], ['1 tbsp chopped', 10]], 170000),
  f('garlic', 'Garlic, raw', '🧄', 'vegetables', [149, 6.36, 33.06, 0.5, 2.1, 1, 0.09, 17], [['1 clove', 3], ['1 tsp minced', 3]], 169230),
  f('mushrooms', 'Mushrooms, white, raw', '🍄', 'vegetables', [22, 3.09, 3.26, 0.34, 1, 1.98, 0.05, 5], [['1 cup sliced', 70], ['1 medium', 18]], 169251),
  f('zucchini', 'Zucchini, raw', '🥒', 'vegetables', [17, 1.21, 3.11, 0.32, 1, 2.5, 0.08, 8], [['1 medium', 196], ['1 cup sliced', 113]], 169291),
  f('eggplant_raw', 'Eggplant, raw', '🍆', 'vegetables', [25, 0.98, 5.88, 0.18, 3, 3.53, 0.03, 2], [['1 cup cubed', 82], ['1 medium', 458]], 169228),
  f('eggplant_cooked', 'Eggplant, cooked (boiled)', '🍆', 'vegetables', [35, 0.83, 8.73, 0.23, 2.5, 3.2, 0.04, 1], [['1 cup cubed', 99]], 169229),
  f('celery', 'Celery, raw', '🥬', 'vegetables', [14, 0.69, 2.97, 0.17, 1.6, 1.34, 0.04, 80], [['1 stalk', 40], ['1 cup chopped', 101]], 169988),
  f('potato_baked', 'Potato, baked, with skin', '🥔', 'vegetables', [93, 2.5, 21.15, 0.13, 2.2, 1.18, 0.03, 10], [['1 medium', 173], ['1 large', 299], ['1 small', 138]], 170093),
  f('potato_boiled', 'Potato, boiled, without skin', '🥔', 'vegetables', [86, 1.7, 20, 0.1, 1.8, 0.85, 0.03, 5], [['1 medium', 167], ['1 cup cubed', 156]], 170440),
  f('potato_raw', 'Potato, raw, with skin', '🥔', 'vegetables', [77, 2.05, 17.49, 0.09, 2.1, 0.82, 0.03, 6], [['1 medium', 213], ['1 small', 170]], 170026),
  f('mashed_potato', 'Mashed potato, with milk and butter', '🥔', 'vegetables', [113, 1.91, 16.8, 4.2, 1.5, 1.4, 2.6, 317], [['1 cup', 210], ['1/2 cup', 105]], 168555),
  f('sweet_potato', 'Sweet potato, baked in skin (flesh)', '🍠', 'vegetables', [90, 2.01, 20.71, 0.15, 3.3, 6.48, 0.03, 36], [['1 medium', 114], ['1 large', 180], ['1 cup cubed', 200]], 168483),
  f('corn_cooked', 'Sweet corn, yellow, cooked (boiled)', '🌽', 'vegetables', [96, 3.41, 20.98, 1.5, 2.4, 4.5, 0.2, 1], [['1 cup kernels', 149], ['1 ear medium', 103]], 169999),
  f('peas_cooked', 'Green peas, cooked (boiled)', '🫛', 'vegetables', [84, 5.36, 15.63, 0.22, 5.5, 5.93, 0.04, 3], [['1 cup', 160], ['1/2 cup', 80]], 170420),
  f('green_beans', 'Green beans, cooked (boiled)', '🫛', 'vegetables', [35, 1.89, 7.88, 0.28, 3.2, 3.6, 0.07, 1], [['1 cup', 125], ['1/2 cup', 63]], 169141),
  f('asparagus', 'Asparagus, raw', '🥦', 'vegetables', [20, 2.2, 3.88, 0.12, 2.1, 1.88, 0.04, 2], [['5 spears', 80], ['1 cup', 134]], 168389),
  f('beets_cooked', 'Beets, cooked (boiled)', '🫜', 'vegetables', [44, 1.68, 9.96, 0.18, 2, 7.96, 0.03, 77], [['1 cup sliced', 170], ['1 beet (2")', 50]], 169146),
  f('pumpkin_cooked', 'Pumpkin, cooked (boiled)', '🎃', 'vegetables', [20, 0.72, 4.9, 0.07, 1.1, 2.1, 0.05, 1], [['1 cup mashed', 245], ['1/2 cup', 123]], 168449),
  f('butternut_squash', 'Butternut squash, baked', '🎃', 'vegetables', [40, 0.9, 10.5, 0.1, 3.2, 2, 0.02, 4], [['1 cup cubes', 205], ['1/2 cup', 103]], 169296),
  f('artichoke', 'Artichoke, globe, cooked (boiled)', '🥬', 'vegetables', [53, 2.89, 11.95, 0.34, 5.7, 0.99, 0.07, 60], [['1 medium', 120], ['1/2 cup hearts', 84]], 168386),
  f('brussels_sprouts', 'Brussels sprouts, cooked (boiled)', '🥬', 'vegetables', [36, 2.55, 7.13, 0.5, 2.6, 1.7, 0.11, 21], [['1 cup', 156], ['5 sprouts', 105]], 169971),
  f('radish', 'Radish, raw', '🥬', 'vegetables', [16, 0.68, 3.4, 0.1, 1.6, 1.86, 0.03, 39], [['1 cup sliced', 116], ['5 radishes', 22]], 169276),
  f('parsley', 'Parsley, fresh', '🌿', 'vegetables', [36, 2.97, 6.33, 0.79, 3.3, 0.85, 0.13, 56], [['1 tbsp chopped', 3.8], ['1/2 cup chopped', 30], ['1 bunch', 60]], 170416),
  f('olives_black', 'Olives, ripe (black), canned', '🫒', 'vegetables', [116, 0.84, 6.04, 10.9, 1.6, 0, 2.3, 735], [['5 large', 22], ['10 olives', 44], ['1 tbsp sliced', 8]], 169094),
  f('olives_green', 'Olives, green, pickled', '🫒', 'vegetables', [145, 1, 3.84, 15.32, 3.3, 0.54, 2, 1556], [['5 olives', 14], ['10 olives', 27]], 169096),
  f('pickles_dill', 'Pickles, dill cucumber', '🥒', 'vegetables', [12, 0.5, 2.4, 0.3, 1, 1.1, 0.05, 809], [['1 spear', 35], ['1 medium pickle', 65], ['3 slices', 21]], 168558),
  f('sauerkraut', 'Sauerkraut, canned', '🥬', 'vegetables', [19, 0.91, 4.28, 0.14, 2.9, 1.8, 0.02, 661], [['1 cup', 142], ['2 tbsp', 18]], 169279),

  // --------------------------------------------------- grains, bread, pasta
  f('rice_white_cooked', 'White rice, long-grain, COOKED', '🍚', 'grains', [130, 2.69, 28.17, 0.28, 0.4, 0.05, 0.08, 1], [['1 cup cooked', 158], ['1/2 cup cooked', 79]], 168878),
  f('rice_white_dry', 'White rice, long-grain, DRY (uncooked)', '🍚', 'grains', [365, 7.13, 79.95, 0.66, 1.3, 0.12, 0.18, 5], [['1/4 cup dry', 46], ['1 cup dry', 185]], 168877),
  f('rice_brown_cooked', 'Brown rice, long-grain, COOKED', '🍚', 'grains', [123, 2.74, 25.58, 0.97, 1.6, 0.24, 0.3, 4], [['1 cup cooked', 202], ['1/2 cup cooked', 101]], 169704),
  f('rice_brown_dry', 'Brown rice, long-grain, DRY (uncooked)', '🍚', 'grains', [367, 7.5, 76.2, 3.2, 3.6, 0.7, 0.58, 5], [['1/4 cup dry', 46], ['1 cup dry', 185]], 169703),
  f('pasta_cooked', 'Pasta, enriched, COOKED', '🍝', 'grains', [158, 5.8, 30.9, 0.93, 1.8, 0.56, 0.18, 1], [['1 cup cooked', 140], ['1/2 cup cooked', 70]], 169737),
  f('pasta_dry', 'Pasta, enriched, DRY (uncooked)', '🍝', 'grains', [371, 13, 74.65, 1.5, 3.2, 2.67, 0.27, 6], [['2 oz dry (1 serving)', 56], ['1 cup dry (small shapes)', 100]], 169736),
  f('pasta_wholewheat_cooked', 'Whole-wheat pasta, COOKED', '🍝', 'grains', [149, 6, 30.1, 1.7, 3.9, 0.8, 0.2, 4], [['1 cup cooked', 140], ['1/2 cup cooked', 70]], 168910),
  f('egg_noodles_cooked', 'Egg noodles, enriched, COOKED', '🍜', 'grains', [138, 4.54, 25.16, 2.07, 1.2, 0.4, 0.4, 5], [['1 cup cooked', 160]], 169732),
  f('rice_noodles_cooked', 'Rice noodles, COOKED', '🍜', 'grains', [108, 1.8, 24, 0.2, 1, 0, 0.05, 19], [['1 cup cooked', 176]], 168914),
  f('couscous_cooked', 'Couscous, COOKED', '🍚', 'grains', [112, 3.79, 23.22, 0.16, 1.4, 0.1, 0.04, 5], [['1 cup cooked', 157], ['1/2 cup cooked', 79]], 169700),
  f('couscous_dry', 'Couscous, DRY (uncooked)', '🍚', 'grains', [376, 12.76, 77.43, 0.64, 5, undefined, 0.1, 10], [['1/4 cup dry', 43], ['1 cup dry', 173]], 169699),
  f('quinoa_cooked', 'Quinoa, COOKED', '🌾', 'grains', [120, 4.4, 21.3, 1.92, 2.8, 0.87, 0.23, 7], [['1 cup cooked', 185], ['1/2 cup cooked', 93]], 168917),
  f('quinoa_dry', 'Quinoa, DRY (uncooked)', '🌾', 'grains', [368, 14.12, 64.16, 6.07, 7, undefined, 0.71, 5], [['1/4 cup dry', 43], ['1 cup dry', 170]], 168874),
  f('bulgur_cooked', 'Bulgur, COOKED', '🌾', 'grains', [83, 3.08, 18.58, 0.24, 4.5, 0.1, 0.04, 5], [['1 cup cooked', 182], ['1/2 cup cooked', 91]], 170287),
  f('bulgur_dry', 'Bulgur, DRY (uncooked)', '🌾', 'grains', [342, 12.3, 75.9, 1.33, 12.5, 0.41, 0.24, 17], [['1/4 cup dry', 35], ['1 cup dry', 140]], 170688),
  f('oats_dry', 'Oats, rolled, DRY (uncooked)', '🥣', 'grains', [379, 13.15, 67.7, 6.52, 10.1, 0.99, 1.11, 6], [['1/2 cup dry', 40], ['1 cup dry', 81], ['1/3 cup dry', 27]], 173904),
  f('oatmeal_cooked', 'Oatmeal, cooked with water', '🥣', 'grains', [71, 2.54, 12, 1.52, 1.7, 0.27, 0.26, 4], [['1 cup cooked', 234], ['1/2 cup cooked', 117]], 173905),
  f('bread_white', 'Bread, white, sliced', '🍞', 'grains', [266, 8.85, 49.4, 3.33, 2.7, 5.67, 0.7, 490], [['1 slice', 28], ['2 slices', 56]], 174924),
  f('bread_wholewheat', 'Bread, whole-wheat, sliced', '🍞', 'grains', [252, 12.45, 42.71, 3.5, 6, 4.3, 0.7, 455], [['1 slice', 32], ['2 slices', 64]], 172688),
  f('bread_rye', 'Bread, rye', '🍞', 'grains', [259, 8.5, 48.3, 3.3, 5.8, 3.9, 0.6, 603], [['1 slice', 32], ['2 slices', 64]], 172684),
  f('bread_sourdough', 'Bread, sourdough', '🍞', 'grains', [272, 10.8, 51.9, 2.4, 2.2, 4.6, 0.5, 602], [['1 slice', 40], ['1 thick slice', 60]], 172675),
  f('bagel', 'Bagel, plain', '🥯', 'grains', [264, 10.6, 52.4, 1.3, 1.6, 8.4, 0.4, 422], [['1 medium (4")', 105], ['1 small', 71], ['1 large', 131]], 174899),
  f('english_muffin', 'English muffin, plain', '🍞', 'grains', [227, 8.9, 44.2, 1.7, 3.5, 3.5, 0.7, 425], [['1 muffin', 57]], 174994),
  f('pita_white', 'Pita bread, white', '🫓', 'grains', [275, 9.1, 55.7, 1.2, 2.2, 1.3, 0.17, 536], [['1 large (6.5")', 60], ['1 small (4")', 28]], 174915),
  f('pita_wholewheat', 'Pita bread, whole-wheat', '🫓', 'grains', [262, 9.8, 55.9, 1.7, 6.1, 2.9, 0.2, 421], [['1 large (6.5")', 64], ['1 small (4")', 28]], 174916),
  f('tortilla_flour', 'Tortilla, flour', '🫓', 'grains', [306, 8.2, 49.4, 8, 3.5, 3.7, 2.9, 736], [['1 medium (8")', 49], ['1 large (10")', 72], ['1 small (6")', 30]], 175037),
  f('tortilla_corn', 'Tortilla, corn', '🫓', 'grains', [218, 5.7, 44.6, 2.9, 6.3, 0.9, 0.5, 45], [['1 tortilla (6")', 24], ['2 tortillas', 48]], 175036),
  f('naan', 'Naan bread', '🫓', 'grains', [291, 9.6, 50.4, 5.7, 2.2, 3.5, 1.4, 465], [['1 piece', 90], ['1/2 piece', 45]], 171845),
  f('croissant', 'Croissant, butter', '🥐', 'grains', [406, 8.2, 45.8, 21, 2.6, 11.3, 11.7, 384], [['1 medium', 57], ['1 large', 67]], 174987),
  f('rice_cakes', 'Rice cakes, plain', '🍘', 'grains', [387, 8.2, 81.5, 2.8, 4.2, 0.9, 0.6, 26], [['1 cake', 9], ['2 cakes', 18]], 170250),
  f('crackers_saltine', 'Crackers, saltine', '🍘', 'grains', [418, 9.5, 74.1, 8.6, 2.8, 1.3, 1.7, 941], [['5 crackers', 15], ['1 cracker', 3]], 172746),
  f('flour_white', 'Flour, white all-purpose', '🌾', 'grains', [364, 10.33, 76.31, 0.98, 2.7, 0.27, 0.15, 2], [['1 cup', 125], ['1 tbsp', 8]], 168894),

  // ----------------------------------------------------- sugars & sweeteners
  f('sugar_white', 'Sugar, white granulated', '🍬', 'sweeteners', [387, 0, 99.98, 0, 0, 99.8, 0, 1], [['1 tsp', 4.2], ['1 tbsp', 12.6], ['1 sugar cube', 2.3]], 169655),
  f('sugar_brown', 'Sugar, brown', '🍬', 'sweeteners', [380, 0.12, 98.09, 0, 0, 97, 0, 28], [['1 tbsp packed', 14], ['1 tsp', 4.6]], 168833),
  f('honey', 'Honey', '🍯', 'sweeteners', [304, 0.3, 82.4, 0, 0.2, 82.12, 0, 4], [['1 tbsp', 21], ['1 tsp', 7]], 169640),
  f('maple_syrup', 'Maple syrup', '🍁', 'sweeteners', [260, 0.04, 67.04, 0.06, 0, 60.5, 0.01, 12], [['1 tbsp', 20], ['1/4 cup', 80]], 169661),
  f('jam', 'Jam / fruit preserves', '🍓', 'sweeteners', [278, 0.37, 68.9, 0.07, 1.1, 48.5, 0.01, 32], [['1 tbsp', 20], ['1 tsp', 7]], 169641),

  // ----------------------------------------------------------------- legumes
  f('lentils_cooked', 'Lentils, COOKED (boiled)', '🫘', 'legumes', [116, 9.02, 20.13, 0.38, 7.9, 1.8, 0.05, 2], [['1 cup cooked', 198], ['1/2 cup cooked', 99]], 172421),
  f('lentils_dry', 'Lentils, DRY (uncooked)', '🫘', 'legumes', [352, 24.63, 63.35, 1.06, 10.7, 2.03, 0.15, 6], [['1/4 cup dry', 48], ['1 cup dry', 192]], 172420),
  f('chickpeas_cooked', 'Chickpeas, COOKED (boiled)', '🫘', 'legumes', [164, 8.86, 27.42, 2.59, 7.6, 4.8, 0.27, 7], [['1 cup cooked', 164], ['1/2 cup cooked', 82]], 173757),
  f('chickpeas_dry', 'Chickpeas, DRY (uncooked)', '🫘', 'legumes', [378, 20.47, 62.95, 6.04, 12.2, 10.7, 0.63, 24], [['1/4 cup dry', 50], ['1 cup dry', 200]], 173756),
  f('black_beans', 'Black beans, COOKED (boiled)', '🫘', 'legumes', [132, 8.86, 23.71, 0.54, 8.7, 0.32, 0.14, 1], [['1 cup cooked', 172], ['1/2 cup cooked', 86]], 173735),
  f('kidney_beans', 'Kidney beans, COOKED (boiled)', '🫘', 'legumes', [127, 8.67, 22.8, 0.5, 6.4, 0.3, 0.07, 1], [['1 cup cooked', 177], ['1/2 cup cooked', 89]], 173740),
  f('white_beans', 'White beans (navy), COOKED (boiled)', '🫘', 'legumes', [140, 8.23, 26.05, 0.62, 10.5, 0.34, 0.1, 0], [['1 cup cooked', 182], ['1/2 cup cooked', 91]], 173746),
  f('pinto_beans', 'Pinto beans, COOKED (boiled)', '🫘', 'legumes', [143, 9.01, 26.22, 0.65, 9, 0.34, 0.14, 1], [['1 cup cooked', 171], ['1/2 cup cooked', 86]], 175200),
  f('fava_beans', 'Fava beans, COOKED (boiled)', '🫘', 'legumes', [110, 7.6, 19.65, 0.4, 5.4, 1.8, 0.08, 5], [['1 cup cooked', 170], ['1/2 cup cooked', 85]], 173753),
  f('split_peas', 'Split peas, COOKED (boiled)', '🫛', 'legumes', [118, 8.34, 21.1, 0.39, 8.3, 2.9, 0.05, 2], [['1 cup cooked', 196], ['1/2 cup cooked', 98]], 172429),
  f('edamame', 'Edamame, shelled, cooked', '🫛', 'legumes', [121, 11.9, 8.9, 5.2, 5.2, 2.2, 0.6, 6], [['1 cup shelled', 155], ['1/2 cup shelled', 78]], 168411),
  f('tofu_firm', 'Tofu, firm', '🧈', 'legumes', [78, 9, 2.9, 4.2, 0.9, 0.62, 0.8, 12], [['1/2 cup', 126], ['3 oz', 85]], 172448),
  f('tempeh', 'Tempeh', '🧈', 'legumes', [192, 20.3, 7.64, 10.8, undefined, undefined, 2.5, 9], [['3 oz', 85], ['1 cup', 166]], 174272),

  // -------------------------------------------------------------------- meat
  f('beef_ground_80_raw', 'Ground beef, 80% lean, RAW', '🥩', 'meat', [254, 17.17, 0, 20, 0, 0, 7.6, 66], [['4 oz raw patty', 113], ['1 lb raw', 454]], 174036),
  f('beef_ground_85_cooked', 'Ground beef, 85% lean, COOKED (pan-browned)', '🥩', 'meat', [256, 27.7, 0, 15.3, 0, 0, 5.8, 89], [['3 oz cooked', 85], ['1 patty', 85]], 174034),
  f('beef_ground_90_cooked', 'Ground beef, 90% lean, COOKED (pan-browned)', '🥩', 'meat', [230, 28.4, 0, 12, 0, 0, 4.7, 87], [['3 oz cooked', 85], ['1 patty', 85]], 171794),
  f('beef_sirloin_cooked', 'Beef sirloin steak, lean, COOKED (grilled)', '🥩', 'meat', [183, 30.6, 0, 5.8, 0, 0, 2.2, 64], [['3 oz cooked', 85], ['1 steak (6 oz)', 170]], 168634),
  f('beef_ribeye_cooked', 'Beef ribeye steak, COOKED (grilled)', '🥩', 'meat', [291, 23.7, 0, 21.8, 0, 0, 9.7, 54], [['3 oz cooked', 85], ['1 steak (8 oz raw)', 170]], 173392),
  f('lamb_leg_cooked', 'Lamb leg, COOKED (roasted)', '🍖', 'meat', [258, 25.6, 0, 16.5, 0, 0, 6.9, 66], [['3 oz cooked', 85], ['1 serving', 120]], 174312),
  f('lamb_ground_cooked', 'Ground lamb, COOKED', '🍖', 'meat', [283, 24.8, 0, 19.6, 0, 0, 8.1, 81], [['3 oz cooked', 85], ['1 patty', 85]], 172544),
  f('pork_chop_cooked', 'Pork chop, COOKED (broiled)', '🥩', 'meat', [209, 25.6, 0, 11.1, 0, 0, 3.5, 55], [['1 chop', 157], ['3 oz cooked', 85]], 167827),
  f('pork_tenderloin_cooked', 'Pork tenderloin, COOKED (roasted)', '🥩', 'meat', [143, 26.2, 0, 3.5, 0, 0, 1.2, 57], [['3 oz cooked', 85], ['1/2 tenderloin', 160]], 168250),
  f('bacon_cooked', 'Bacon, COOKED (pan-fried)', '🥓', 'meat', [468, 33.9, 1.7, 35.1, 0, 0, 12, 1684], [['1 slice', 11.5], ['3 slices', 34.5]], 168322),
  f('ham_deli', 'Ham, sliced, lean (deli)', '🍖', 'meat', [107, 16.9, 0.7, 4, 0, 0, 1.2, 945], [['1 slice', 13], ['2 slices', 26]], 173863),
  f('turkey_deli', 'Turkey breast, sliced (deli)', '🦃', 'meat', [106, 14.8, 2.2, 3.8, 0, 0.9, 0.9, 898], [['1 slice', 16], ['3 slices', 48]], 172941),
  f('sausage_pork', 'Pork sausage, COOKED', '🌭', 'meat', [325, 18.5, 1.4, 27.2, 0, 1.1, 8.8, 814], [['1 link', 25], ['1 patty', 27]], 174578),
  f('hotdog_frank', 'Frankfurter / hot dog, beef (no bun)', '🌭', 'meat', [322, 11.7, 2.7, 29.4, 0, 1.3, 11.6, 852], [['1 frankfurter', 48], ['1 jumbo', 76]], 174614),
  f('salami', 'Salami, dry, pork and beef', '🥓', 'meat', [378, 21.1, 0.7, 31.6, 0, 0.3, 11.4, 1756], [['1 slice', 10], ['3 slices', 30]], 174582),
  f('beef_jerky', 'Beef jerky', '🥩', 'meat', [410, 33.2, 11, 25.6, 1.8, 9, 10.8, 1785], [['1 oz', 28], ['1 piece', 20]], 167536),

  // ----------------------------------------------------------------- poultry
  f('chicken_breast_cooked', 'Chicken breast, skinless, COOKED (roasted)', '🍗', 'poultry', [165, 31.02, 0, 3.57, 0, 0, 1.01, 74], [['1 breast', 172], ['3 oz cooked', 85], ['1/2 breast', 86]], 171477),
  f('chicken_breast_raw', 'Chicken breast, skinless, RAW', '🍗', 'poultry', [120, 22.5, 0, 2.62, 0, 0, 0.56, 45], [['1 breast', 174], ['4 oz raw', 113]], 171077),
  f('chicken_thigh_cooked', 'Chicken thigh, skinless, COOKED (roasted)', '🍗', 'poultry', [179, 24.8, 0, 8.2, 0, 0, 2.3, 106], [['1 thigh (boneless)', 116], ['3 oz cooked', 85]], 172388),
  f('chicken_thigh_skin_cooked', 'Chicken thigh, with skin, COOKED (roasted)', '🍗', 'poultry', [232, 23.3, 0, 14.7, 0, 0, 4.1, 102], [['1 thigh (meat+skin)', 137], ['3 oz cooked', 85]], 173625),
  f('chicken_wing_cooked', 'Chicken wings, with skin, COOKED (roasted)', '🍗', 'poultry', [254, 23.8, 0, 16.9, 0, 0, 5, 98], [['1 wing (meat+skin)', 34], ['6 wings', 204]], 173630),
  f('chicken_nuggets', 'Chicken nuggets, cooked', '🍗', 'poultry', [307, 15.9, 14.9, 20.4, 0.9, 0.1, 3.6, 594], [['1 nugget', 17], ['6 nuggets', 100]], 2706092),
  f('turkey_breast_cooked', 'Turkey breast, roasted, no skin', '🦃', 'poultry', [136, 29.5, 0, 2, 0, 0, 0.7, 114], [['3 oz cooked', 85], ['1 slice thick', 40]], 174516),
  f('turkey_ground_cooked', 'Ground turkey, COOKED', '🦃', 'poultry', [203, 27.4, 0, 10.4, 0, 0, 2.7, 78], [['3 oz cooked', 85], ['1 patty', 85]], 171506),

  // --------------------------------------------------------- fish & seafood
  f('salmon_cooked', 'Salmon, Atlantic farmed, COOKED', '🐟', 'seafood', [206, 22.1, 0, 12.35, 0, 0, 2.4, 61], [['1/2 fillet', 178], ['3 oz cooked', 85]], 175168),
  f('salmon_raw', 'Salmon, Atlantic farmed, RAW', '🐟', 'seafood', [208, 20.42, 0, 13.42, 0, 0, 3.05, 59], [['1 fillet (6 oz)', 170], ['4 oz raw', 113]], 175167),
  f('salmon_wild_cooked', 'Salmon, Atlantic wild, COOKED', '🐟', 'seafood', [182, 25.44, 0, 8.13, 0, undefined, 1.3, 56], [['1 fillet', 154], ['3 oz cooked', 85]], 171998),
  f('tuna_canned_water', 'Tuna, canned in water, drained', '🐟', 'seafood', [86, 19.4, 0, 1, 0, 0, 0.22, 247], [['1 can drained', 112], ['3 oz', 85]], 173709),
  f('tuna_canned_oil', 'Tuna, canned in oil, drained', '🐟', 'seafood', [198, 29.1, 0, 8.2, 0, 0, 1.5, 416], [['1 can drained', 112], ['3 oz', 85]], 173708),
  f('tuna_steak_cooked', 'Tuna steak, bluefin, COOKED', '🐟', 'seafood', [184, 29.9, 0, 6.28, 0, undefined, 1.6, 50], [['1 steak', 145], ['3 oz cooked', 85]], 173707),
  f('cod_cooked', 'Cod, Atlantic, COOKED', '🐟', 'seafood', [105, 22.8, 0, 0.86, 0, 0, 0.2, 78], [['1 fillet', 180], ['3 oz cooked', 85]], 171956),
  f('tilapia_cooked', 'Tilapia, COOKED', '🐟', 'seafood', [128, 26.15, 0, 2.65, 0, 0, 0.9, 56], [['1 fillet', 87], ['3 oz cooked', 85]], 175177),
  f('shrimp_cooked', 'Shrimp, COOKED', '🍤', 'seafood', [99, 24, 0.2, 0.28, undefined, undefined, 0.08, 111], [['3 oz cooked', 85], ['1 large shrimp', 6], ['6 large', 36]], 175180),
  f('sardines_canned', 'Sardines, canned in oil, drained', '🐟', 'seafood', [208, 24.62, 0, 11.45, 0, 0, 1.5, 307], [['1 can drained', 92], ['1 sardine', 12]], 175139),
  f('trout_cooked', 'Trout, rainbow, farmed, COOKED', '🐟', 'seafood', [168, 23.8, 0, 7.4, 0, 0, 1.7, 61], [['1 fillet', 71], ['3 oz cooked', 85]], 173718),
  f('mackerel_cooked', 'Mackerel, Atlantic, COOKED', '🐟', 'seafood', [262, 23.85, 0, 17.8, 0, undefined, 4.2, 83], [['1 fillet', 88], ['3 oz cooked', 85]], 175120),
  f('halibut_cooked', 'Halibut, COOKED', '🐟', 'seafood', [111, 22.54, 0, 1.62, 0, 0, 0.4, 82], [['1 fillet', 159], ['3 oz cooked', 85]], 174201),
  f('crab_cooked', 'Crab, blue, COOKED', '🦀', 'seafood', [83, 17.9, 0.04, 0.7, 0, 0, 0.2, 395], [['3 oz cooked', 85], ['1 cup', 135]], 174205),
  f('mussels_cooked', 'Mussels, COOKED', '🦪', 'seafood', [172, 23.8, 7.4, 4.5, 0, undefined, 0.8, 369], [['3 oz cooked', 85], ['1 cup', 150]], 174217),
  f('smoked_salmon', 'Salmon, smoked (lox)', '🐟', 'seafood', [117, 18.28, 0, 4.32, 0, 0, 0.9, 2000], [['1 oz', 28], ['3 oz', 85]], 171985),

  // -------------------------------------------------------------------- eggs
  f('egg_raw', 'Egg, whole, RAW', '🥚', 'eggs', [143, 12.56, 0.72, 9.51, 0, 0.37, 3.13, 142], [['1 large', 50], ['1 medium', 44], ['1 extra large', 56]], 171287),
  f('egg_boiled', 'Egg, hard-boiled', '🥚', 'eggs', [155, 12.58, 1.12, 10.61, 0, 1.12, 3.27, 124], [['1 large', 50], ['2 large', 100]], 173424),
  f('egg_scrambled', 'Egg, scrambled (with milk and fat)', '🍳', 'eggs', [149, 9.99, 1.61, 11, 0, 1.4, 3.3, 145], [['1 egg worth', 61], ['2 eggs worth', 122]], 172187),
  f('egg_fried', 'Egg, fried', '🍳', 'eggs', [196, 13.6, 0.83, 14.8, 0, 0.4, 4.3, 207], [['1 large', 46], ['2 large', 92]], 173423),
  f('egg_white', 'Egg white, raw', '🥚', 'eggs', [52, 10.9, 0.73, 0.17, 0, 0.71, 0, 166], [['1 large white', 33], ['3 whites', 99]], 172183),
  f('egg_yolk', 'Egg yolk, raw', '🥚', 'eggs', [322, 15.86, 3.59, 26.54, 0, 0.56, 9.55, 48], [['1 large yolk', 17]], 172184),

  // ------------------------------------------------------------------- dairy
  f('milk_whole', 'Milk, whole', '🥛', 'dairy', [61, 3.15, 4.8, 3.25, 0, 4.8, 1.86, 43], [['1 cup', 244], ['1 glass (200 ml)', 206]], 171265),
  f('milk_2pct', 'Milk, reduced fat (2%)', '🥛', 'dairy', [50, 3.3, 4.8, 1.98, 0, 4.8, 1.3, 47], [['1 cup', 244], ['1 glass (200 ml)', 206]], 171267),
  f('milk_skim', 'Milk, skim (nonfat)', '🥛', 'dairy', [34, 3.37, 4.96, 0.08, 0, 4.96, 0.05, 42], [['1 cup', 245], ['1 glass (200 ml)', 206]], 171269),
  f('buttermilk', 'Buttermilk, low-fat', '🥛', 'dairy', [40, 3.31, 4.79, 1.1, 0, 4.79, 0.7, 148], [['1 cup', 245]], 170874),
  f('yogurt_plain_whole', 'Yogurt, plain, whole milk', '🥣', 'dairy', [61, 3.47, 4.66, 3.25, 0, 4.66, 2.1, 46], [['1 cup', 245], ['1 container (6 oz)', 170]], 171284),
  f('yogurt_plain_lowfat', 'Yogurt, plain, low-fat', '🥣', 'dairy', [63, 5.25, 7.04, 1.55, 0, 7.04, 1, 70], [['1 cup', 245], ['1 container (6 oz)', 170]], 170886),
  f('greek_yogurt_nonfat', 'Greek yogurt, plain, nonfat', '🥣', 'dairy', [59, 10.19, 3.6, 0.39, 0, 3.2, 0.1, 36], [['1 container (170 g)', 170], ['1 cup', 245], ['1 tbsp', 15]], 170894),
  f('greek_yogurt_whole', 'Greek yogurt, plain, whole milk', '🥣', 'dairy', [97, 9, 3.98, 5, 0, 3.98, 2.4, 35], [['1 container (170 g)', 170], ['1 cup', 245], ['1 tbsp', 15]], 171304),
  f('labneh', 'Labneh (strained yogurt cheese), full fat', '🥣', 'dairy', [160, 7.0, 4.0, 12.5, 0, 3.5, 8.0, 350], [['2 tbsp', 30], ['1 tbsp', 15], ['1/4 cup', 60]]),
  f('kefir', 'Kefir, plain, low-fat', '🥛', 'dairy', [43, 3.8, 4.8, 1, 0, 4.6, 0.7, 40], [['1 cup', 243]], 170904),
  f('cottage_cheese_2pct', 'Cottage cheese, 2% fat', '🥣', 'dairy', [81, 10.45, 4.76, 2.27, 0, 4, 1.2, 308], [['1/2 cup', 113], ['1 cup', 226]], 172182),
  f('cottage_cheese_4pct', 'Cottage cheese, 4% fat', '🥣', 'dairy', [98, 11.12, 3.38, 4.3, 0, 2.67, 1.7, 315], [['1/2 cup', 113], ['1 cup', 226]], 172179),
  f('sour_cream', 'Sour cream', '🥣', 'dairy', [198, 2.44, 4.63, 19.35, 0, 3.4, 10.1, 31], [['1 tbsp', 12], ['2 tbsp', 24], ['1/4 cup', 58]], 171257),
  f('cream_cheese', 'Cream cheese', '🧈', 'dairy', [350, 6.2, 5.5, 34.44, 0, 3.8, 20.2, 314], [['1 tbsp', 14.5], ['1 oz', 28], ['2 tbsp', 29]], 173418),
  f('cream_heavy', 'Heavy whipping cream', '🥛', 'dairy', [340, 2.84, 2.8, 36.08, 0, 2.8, 23, 27], [['1 tbsp', 15], ['1 cup', 238]], 170859),
  f('half_and_half', 'Half-and-half cream', '🥛', 'dairy', [131, 3.13, 4.3, 11.5, 0, 4.1, 7, 61], [['1 tbsp', 15], ['1 cup', 242]], 171255),
  f('butter', 'Butter, salted', '🧈', 'dairy', [717, 0.85, 0.06, 81.11, 0, 0.06, 51.4, 643], [['1 tbsp', 14.2], ['1 tsp', 4.7], ['1 pat', 5]], 173410),
  f('ghee', 'Ghee (clarified butter)', '🧈', 'dairy', [876, 0.28, 0, 99.48, 0, 0, 61.9, 2], [['1 tbsp', 13], ['1 tsp', 4.3]], 173412),
  f('ice_cream_vanilla', 'Ice cream, vanilla', '🍨', 'dairy', [207, 3.5, 23.6, 11, 0.7, 21.2, 6.8, 80], [['1/2 cup', 66], ['1 scoop', 72], ['1 cup', 132]], 167575),
  f('condensed_milk', 'Condensed milk, sweetened', '🥛', 'dairy', [321, 7.91, 54.4, 8.7, 0, 54.4, 5.5, 127], [['1 tbsp', 19], ['2 tbsp', 38]], 171275),
  f('almond_milk', 'Almond milk, unsweetened', '🥛', 'dairy', [15, 0.4, 1.3, 1, 0.2, 0.8, 0.1, 72], [['1 cup', 240], ['1 glass (200 ml)', 200]], 174832),
  f('soy_milk', 'Soy milk, unsweetened', '🥛', 'dairy', [33, 2.86, 1.74, 1.61, 0.5, 0.4, 0.2, 37], [['1 cup', 243], ['1 glass (200 ml)', 200]], 175215),
  f('oat_milk', 'Oat milk', '🥛', 'dairy', [45, 0.7, 5.4, 2.3, 0.5, 2, 0.2, 43], [['1 cup', 240], ['1 glass (200 ml)', 200]], 2705412),
  f('coconut_milk_canned', 'Coconut milk, canned (full fat)', '🥥', 'dairy', [197, 2.02, 2.81, 21.33, undefined, undefined, 18.9, 13], [['1/4 cup', 57], ['1 cup', 226], ['1 tbsp', 15]], 170173),

  // ------------------------------------------------------------------ cheese
  f('cheddar', 'Cheddar cheese', '🧀', 'cheese', [403, 22.87, 3.4, 33.31, 0, 0.48, 18.9, 653], [['1 slice', 21], ['1 oz', 28], ['1 cup shredded', 113]], 173414),
  f('mozzarella', 'Mozzarella, whole milk', '🧀', 'cheese', [299, 22.17, 2.4, 22.1, 0, 0, 13.9, 486], [['1 oz', 28], ['1/4 cup shredded', 28]], 170845),
  f('mozzarella_part_skim', 'Mozzarella, part-skim', '🧀', 'cheese', [254, 24.26, 2.77, 15.92, 0, 1.13, 10.1, 619], [['1 oz', 28], ['1/4 cup shredded', 28]], 170847),
  f('parmesan', 'Parmesan cheese, hard', '🧀', 'cheese', [392, 35.75, 3.22, 25, 0, 0.1, 14.8, 1175], [['1 tbsp grated', 5], ['1 oz', 28]], 170848),
  f('feta', 'Feta cheese', '🧀', 'cheese', [265, 14.21, 3.9, 21.5, 0, 0, 13.3, 1139], [['1 oz', 28], ['1/4 cup crumbled', 38]], 173420),
  f('swiss', 'Swiss cheese', '🧀', 'cheese', [393, 26.96, 1.4, 31, 0, 0, 18.2, 187], [['1 slice', 22], ['1 oz', 28]], 171251),
  f('gouda', 'Gouda cheese', '🧀', 'cheese', [356, 24.94, 2.22, 27.44, 0, 2.22, 17.6, 819], [['1 slice', 28], ['1 oz', 28]], 171241),
  f('brie', 'Brie cheese', '🧀', 'cheese', [334, 20.75, 0.45, 27.68, 0, 0.45, 17.4, 629], [['1 oz', 28], ['1 wedge', 40]], 172177),
  f('goat_cheese', 'Goat cheese, soft', '🧀', 'cheese', [264, 18.5, 0, 21.1, 0, 0, 14.6, 459], [['1 oz', 28], ['2 tbsp crumbled', 20]], 173435),
  f('halloumi', 'Halloumi cheese', '🧀', 'cheese', [321, 21.0, 2.2, 25.0, 0, 1.5, 16.0, 1200], [['1 slice', 30], ['1 oz', 28], ['3 slices', 90]]),
  f('ricotta', 'Ricotta cheese, whole milk', '🧀', 'cheese', [150, 7.5, 7.3, 10.2, 0, 0.27, 6.4, 110], [['1/2 cup', 124], ['1/4 cup', 62]], 170851),
  f('provolone', 'Provolone cheese', '🧀', 'cheese', [351, 25.58, 2.14, 26.62, 0, 0.55, 17.1, 727], [['1 slice', 28], ['1 oz', 28]], 170850),
  f('american_cheese', 'American cheese, processed', '🧀', 'cheese', [366, 18.1, 4.8, 30.7, 0, 2.3, 18.1, 1671], [['1 slice', 21], ['2 slices', 42]], 170853),

  // -------------------------------------------------------- nuts and seeds
  f('almonds', 'Almonds, raw', '🌰', 'nuts_seeds', [579, 21.15, 21.55, 49.93, 12.5, 4.35, 3.8, 1], [['1 oz (23 almonds)', 28], ['1/4 cup', 36], ['10 almonds', 12]], 170567),
  f('walnuts', 'Walnuts', '🌰', 'nuts_seeds', [654, 15.23, 13.71, 65.21, 6.7, 2.61, 6.13, 2], [['1 oz (14 halves)', 28], ['1/4 cup', 29]], 170187),
  f('cashews', 'Cashews, raw', '🌰', 'nuts_seeds', [553, 18.22, 30.19, 43.85, 3.3, 5.91, 7.8, 12], [['1 oz (18 nuts)', 28], ['1/4 cup', 34]], 170162),
  f('pistachios', 'Pistachios, raw', '🌰', 'nuts_seeds', [560, 20.16, 27.2, 45.3, 10.6, 7.66, 5.9, 1], [['1 oz (49 kernels)', 28], ['1/4 cup', 31]], 170184),
  f('pecans', 'Pecans', '🌰', 'nuts_seeds', [691, 9.17, 13.86, 71.97, 9.6, 3.97, 6.18, 0], [['1 oz (19 halves)', 28], ['1/4 cup', 27]], 170182),
  f('hazelnuts', 'Hazelnuts', '🌰', 'nuts_seeds', [628, 14.95, 16.7, 60.75, 9.7, 4.34, 4.46, 0], [['1 oz (21 nuts)', 28], ['1/4 cup', 34]], 170581),
  f('macadamia', 'Macadamia nuts, raw', '🌰', 'nuts_seeds', [718, 7.91, 13.82, 75.77, 8.6, 4.57, 12.06, 5], [['1 oz (11 nuts)', 28], ['1/4 cup', 34]], 170178),
  f('brazil_nuts', 'Brazil nuts', '🌰', 'nuts_seeds', [659, 14.32, 11.74, 67.1, 7.5, 2.33, 16.1, 3], [['1 oz (6 nuts)', 28], ['1 nut', 5]], 170569),
  f('peanuts', 'Peanuts, raw', '🥜', 'nuts_seeds', [567, 25.8, 16.13, 49.24, 8.5, 4.7, 6.28, 18], [['1 oz', 28], ['1/4 cup', 37]], 172430),
  f('pine_nuts', 'Pine nuts', '🌰', 'nuts_seeds', [673, 13.69, 13.08, 68.37, 3.7, 3.59, 4.9, 2], [['1 oz', 28], ['1 tbsp', 9]], 170591),
  f('chia_seeds', 'Chia seeds', '🌱', 'nuts_seeds', [486, 16.54, 42.12, 30.74, 34.4, undefined, 3.33, 16], [['1 tbsp', 12], ['1 oz', 28]], 170554),
  f('flaxseed', 'Flaxseed', '🌱', 'nuts_seeds', [534, 18.29, 28.88, 42.16, 27.3, 1.55, 3.67, 30], [['1 tbsp whole', 10], ['1 tbsp ground', 7]], 169414),
  f('sunflower_seeds', 'Sunflower seed kernels', '🌻', 'nuts_seeds', [584, 20.78, 20, 51.46, 8.6, 2.62, 4.46, 9], [['1 oz', 28], ['1/4 cup', 35]], 170562),
  f('pumpkin_seeds', 'Pumpkin seeds (pepitas), hulled', '🎃', 'nuts_seeds', [559, 30.23, 10.71, 49.05, 6, 1.4, 8.66, 7], [['1 oz', 28], ['1/4 cup', 32]], 170556),
  f('sesame_seeds', 'Sesame seeds', '🌱', 'nuts_seeds', [573, 17.73, 23.45, 49.67, 11.8, 0.3, 6.96, 11], [['1 tbsp', 9], ['1 tsp', 3]], 170150),
  f('hemp_seeds', 'Hemp seeds, hulled', '🌱', 'nuts_seeds', [553, 31.56, 8.67, 48.75, 4, 1.5, 4.6, 5], [['1 tbsp', 10], ['3 tbsp', 30]], 170148),
  f('peanut_butter', 'Peanut butter, smooth', '🥜', 'nuts_seeds', [598, 22.2, 22.3, 51.4, 5, 10.5, 10.3, 426], [['1 tbsp', 16], ['2 tbsp', 32], ['1 tsp', 5]], 174266),
  f('almond_butter', 'Almond butter', '🥜', 'nuts_seeds', [614, 20.96, 18.82, 55.5, 10.3, 6.3, 6.5, 227], [['1 tbsp', 16], ['2 tbsp', 32]], 168603),
  f('tahini', 'Tahini (sesame paste)', '🥜', 'nuts_seeds', [595, 17, 21.2, 53.76, 9.3, 0.5, 7.5, 115], [['1 tbsp', 15], ['2 tbsp', 30], ['1 tsp', 5]], 170189),
  f('chocolate_hazelnut_spread', 'Chocolate hazelnut spread', '🍫', 'nuts_seeds', [539, 5.4, 62.4, 29.7, 5.4, 54, undefined, 41], [['1 tbsp', 19], ['2 tbsp', 37]], 168000),
  f('trail_mix', 'Trail mix, with nuts, seeds and chocolate chips', '🥜', 'nuts_seeds', [484, 14.2, 44.9, 31.9, 5, 23.9, 6.1, 121], [['1/4 cup', 38], ['1 oz', 28]], 167969),

  // ------------------------------------------------------------- oils, fats
  f('olive_oil', 'Olive oil', '🫒', 'oils_fats', [884, 0, 0, 100, 0, 0, 13.8, 2], [['1 tbsp', 13.5], ['1 tsp', 4.5]], 171413),
  f('canola_oil', 'Canola oil', '🛢️', 'oils_fats', [884, 0, 0, 100, 0, 0, 7.4, 0], [['1 tbsp', 14], ['1 tsp', 4.7]], 172336),
  f('vegetable_oil', 'Vegetable oil (soybean)', '🛢️', 'oils_fats', [884, 0, 0, 100, 0, 0, 15.7, 0], [['1 tbsp', 13.6], ['1 tsp', 4.5]], 171411),
  f('coconut_oil', 'Coconut oil', '🥥', 'oils_fats', [892, 0, 0, 99.06, 0, 0, 82.5, 0], [['1 tbsp', 13.6], ['1 tsp', 4.5]], 171412),
  f('sesame_oil', 'Sesame oil', '🛢️', 'oils_fats', [884, 0, 0, 100, 0, 0, 14.2, 0], [['1 tbsp', 13.6], ['1 tsp', 4.5]], 171016),
  f('avocado_oil', 'Avocado oil', '🥑', 'oils_fats', [884, 0, 0, 100, 0, undefined, 11.6, 0], [['1 tbsp', 13.6], ['1 tsp', 4.5]], 173573),
  f('margarine', 'Margarine, tub, 80% fat', '🧈', 'oils_fats', [713, 0.2, 0.7, 80.2, 0, 0, 14.2, 657], [['1 tbsp', 14], ['1 tsp', 4.7]], 172347),
  f('mayonnaise', 'Mayonnaise, regular', '🥫', 'oils_fats', [680, 0.96, 0.57, 74.85, 0, 0.57, 11.7, 635], [['1 tbsp', 13.8], ['1 tsp', 4.6]], 171009),

  // ------------------------------------------------ sauces, condiments etc.
  f('ketchup', 'Ketchup', '🍅', 'sauces', [101, 1.04, 27.4, 0.1, 0.3, 21.3, 0, 907], [['1 tbsp', 17], ['2 tbsp', 34], ['1 packet', 9]], 168556),
  f('mustard', 'Mustard, yellow, prepared', '🌭', 'sauces', [60, 3.74, 5.83, 3.34, 4, 0.9, 0.2, 1104], [['1 tsp', 5], ['1 tbsp', 15]], 172234),
  f('soy_sauce', 'Soy sauce', '🥫', 'sauces', [53, 8.14, 4.93, 0.57, 0.8, 0.4, 0.1, 5493], [['1 tbsp', 16], ['1 tsp', 5.3]], 174277),
  f('bbq_sauce', 'Barbecue sauce', '🥫', 'sauces', [172, 0.8, 40.8, 0.6, 0.9, 33.2, 0, 1027], [['1 tbsp', 17], ['2 tbsp', 34]], 174523),
  f('salsa', 'Salsa, tomato, ready-to-serve', '🥫', 'sauces', [29, 1.5, 6.6, 0.2, 1.9, 4, 0, 711], [['2 tbsp', 36], ['1/4 cup', 65]], 174524),
  f('marinara', 'Pasta sauce, marinara', '🍅', 'sauces', [50, 1.4, 7.4, 1.6, 1.8, 4.9, 0.2, 437], [['1/2 cup', 132], ['1 cup', 264]], 171192),
  f('tomato_sauce', 'Tomato sauce, canned', '🍅', 'sauces', [24, 1.2, 5.3, 0.3, 1.5, 3.6, 0.03, 474], [['1/2 cup', 122], ['1 cup', 245]], 170054),
  f('tomato_paste', 'Tomato paste', '🍅', 'sauces', [82, 4.32, 18.91, 0.47, 4.1, 12.2, 0.07, 59], [['1 tbsp', 16], ['2 tbsp', 32]], 170459),
  f('balsamic_vinegar', 'Balsamic vinegar', '🫙', 'sauces', [88, 0.49, 17.03, 0, undefined, 14.95, 0, 23], [['1 tbsp', 16], ['1 tsp', 5]], 172241),
  f('ranch_dressing', 'Ranch dressing, regular', '🥗', 'sauces', [430, 1.3, 5.9, 44.5, 0, 4.7, 7, 901], [['1 tbsp', 15], ['2 tbsp', 30]], 173592),
  f('teriyaki_sauce', 'Teriyaki sauce', '🥫', 'sauces', [89, 5.93, 15.6, 0.04, 0.1, 14.1, 0, 3833], [['1 tbsp', 18], ['2 tbsp', 36]], 171167),
  f('hoisin_sauce', 'Hoisin sauce', '🥫', 'sauces', [220, 3.3, 44.1, 3.4, 2.8, 27.3, 0.6, 1615], [['1 tbsp', 16], ['2 tbsp', 32]], 172886),
  f('pesto', 'Pesto sauce, basil', '🌿', 'sauces', [418, 9.8, 10.1, 37.6, 1.8, 6.3, 7.1, 603], [['1 tbsp', 16], ['2 tbsp', 32]], 171579),
  f('guacamole', 'Guacamole', '🥑', 'sauces', [155, 1.96, 8.4, 14.2, 6.5, 0.7, 2.1, 344], [['2 tbsp', 30], ['1/4 cup', 60]], 2709307),
  f('tzatziki', 'Tzatziki (yogurt-cucumber dip)', '🥒', 'sauces', [91, 5.2, 4.1, 6, 0.2, 2.5, 1.9, 307], [['2 tbsp', 30], ['1/4 cup', 60]], 2705448),

  // ------------------------------------------------------- snacks, sweets
  f('potato_chips', 'Potato chips, salted', '🍟', 'snacks_sweets', [532, 6.4, 53.8, 34, 3.1, 0.3, 3.4, 527], [['1 oz (about 15 chips)', 28], ['1 small bag', 43]], 169677),
  f('tortilla_chips', 'Tortilla chips, salted', '🌽', 'snacks_sweets', [472, 7.1, 67.8, 20.7, 5.4, 0.8, 2.8, 328], [['1 oz', 28], ['10 chips', 20]], 167558),
  f('pretzels', 'Pretzels, hard, salted', '🥨', 'snacks_sweets', [384, 10, 80.4, 2.9, 3.4, 2.2, 0.4, 1240], [['1 oz', 28], ['10 twists', 60]], 167555),
  f('popcorn_air', 'Popcorn, air-popped', '🍿', 'snacks_sweets', [387, 12.9, 77.8, 4.54, 14.5, 0.87, 0.6, 8], [['1 cup', 8], ['3 cups', 24]], 167959),
  f('dark_chocolate', 'Dark chocolate, 70-85% cacao', '🍫', 'snacks_sweets', [598, 7.79, 45.9, 42.63, 10.9, 24, 24.5, 20], [['1 square', 10], ['1 oz', 28], ['1 bar (100 g)', 100]], 170273),
  f('milk_chocolate', 'Milk chocolate', '🍫', 'snacks_sweets', [535, 7.65, 59.4, 29.66, 3.4, 51.5, 18.5, 79], [['1 oz', 28], ['1 bar', 44]], 167587),
  f('cookie_choc_chip', 'Cookie, chocolate chip, commercial', '🍪', 'snacks_sweets', [492, 5.1, 65.4, 24.7, 2, 32.9, 8.1, 311], [['1 cookie (2¼ in)', 10], ['1 large cookie (3½ in)', 40]], 172716),
  f('brownie', 'Brownie, commercial', '🍫', 'snacks_sweets', [405, 4.8, 63.9, 16.3, 2.1, 36.6, 4.2, 286], [['1 brownie', 56], ['1 small piece', 30]], 172713),
  f('donut_glazed', 'Doughnut, glazed, yeast', '🍩', 'snacks_sweets', [421, 6.1, 47.9, 22.7, 2.1, 22.8, 9.5, 316], [['1 doughnut', 63], ['1 large', 75]], 172758),
  f('cheesecake', 'Cheesecake', '🍰', 'snacks_sweets', [321, 5.5, 25.5, 22.5, 0.4, 21.8, 9.9, 438], [['1 slice (1/12)', 125], ['1 small slice', 90]], 172711),
  f('chocolate_cake', 'Chocolate cake with frosting', '🍰', 'snacks_sweets', [389, 3.5, 52.8, 20.1, 2.2, 40, 5.9, 348], [['1 slice (1/12 cake)', 138], ['1 small slice', 70]], 174934),
  f('apple_pie', 'Apple pie', '🥧', 'snacks_sweets', [237, 1.9, 34, 11, 1.6, 15.7, 3.8, 201], [['1 slice (1/8 pie)', 125], ['1 small slice', 80]], 175011),
  f('gummy_candy', 'Gummy candy', '🍬', 'snacks_sweets', [343, 6.9, 77.0, 0.1, 0, 46.0, 0, 60], [['1 oz', 28], ['10 pieces', 30]]),
  f('granola_bar', 'Granola bar, chewy', '🍫', 'snacks_sweets', [443, 7.4, 67.3, 17.2, 4.6, undefined, 7.2, 278], [['1 bar', 28], ['1 large bar', 40]], 167954),
  f('marshmallows', 'Marshmallows', '🍬', 'snacks_sweets', [318, 1.8, 81.3, 0.2, 0.1, 57.6, 0.1, 80], [['1 large', 7], ['4 large', 28], ['1 cup mini', 50]], 167995),

  // --------------------------------------------------------------- breakfast
  f('granola', 'Granola, with oats, nuts and honey', '🥣', 'breakfast', [489, 13.7, 53.9, 24.3, 8.9, 19.8, 4, 26], [['1/2 cup', 61], ['1/4 cup', 30], ['1 tbsp', 8]], 171646),
  f('cornflakes', 'Corn flakes cereal', '🥣', 'breakfast', [365, 6.4, 79.5, 1.6, 3.5, 9.4, 0.2, 703], [['1 cup', 28], ['1 1/2 cups', 42]], 2708453),
  f('pancakes', 'Pancakes, plain', '🥞', 'breakfast', [282, 7.4, 35.3, 12.1, 2.1, 7, 3, 508], [['1 pancake (4")', 38], ['1 large (6")', 77], ['3 pancakes', 114]], 2708304),
  f('waffle', 'Waffle, plain', '🧇', 'breakfast', [373, 8.7, 41.5, 18.8, 2.5, 8.3, 4.2, 597], [['1 waffle (7")', 75], ['1 small', 40]], 2708325),
  f('french_toast', 'French toast', '🍞', 'breakfast', [273, 10.4, 32.3, 11.4, 1.2, 10.1, 3.3, 302], [['1 slice', 65], ['2 slices', 130]], 2708335),
  f('hash_browns', 'Hash browns, pan-fried', '🥔', 'breakfast', [217, 2.6, 28.2, 11.5, 3.2, 0.3, 0.9, 398], [['1 patty', 56], ['1 cup', 156]], 2709477),

  // ---------------------------------------------------------- prepared dishes
  f('pizza_cheese', 'Pizza, cheese, regular crust', '🍕', 'prepared', [266, 11.4, 33.3, 9.7, 2.3, 3.6, 4.5, 598], [['1 slice (1/8 of 14")', 107], ['1 large slice', 150], ['1 small slice', 80]], 173292),
  f('pizza_pepperoni', 'Pizza, pepperoni, regular crust', '🍕', 'prepared', [282, 11.7, 32, 11.9, 2.3, 3.3, 5.1, 685], [['1 slice (1/8 of 14")', 113], ['1 large slice', 155]], 173295),
  f('hamburger', 'Hamburger, single patty with bun', '🍔', 'prepared', [263, 13.3, 29.6, 10.2, 1.8, 6, 3.6, 487], [['1 hamburger', 97], ['1 large', 190]], 170694),
  f('cheeseburger', 'Cheeseburger, single patty with bun', '🍔', 'prepared', [270, 13.5, 25.5, 12.9, 1.9, 5.2, 5.8, 628], [['1 cheeseburger', 127], ['1 large', 200]], 170691),
  f('french_fries', 'French fries, fast-food style', '🍟', 'prepared', [312, 3.43, 41.44, 14.73, 3.8, 0.3, 2.3, 210], [['small', 71], ['medium', 117], ['large', 154]], 170698),
  f('hot_dog_bun', 'Hot dog with bun', '🌭', 'prepared', [296, 10.8, 23.7, 17.4, 0.8, 3.9, 6.7, 681], [['1 hot dog with bun', 98]], 2707056),
  f('grilled_cheese', 'Grilled cheese sandwich', '🥪', 'prepared', [343, 11, 28.1, 20.8, 1.2, 4.5, 10, 822], [['1 sandwich', 116], ['1/2 sandwich', 58]], 2705801),
  f('burrito_beef_bean', 'Burrito, beef and bean', '🌯', 'prepared', [191, 11.5, 19.5, 7.5, 3, 2.2, 2.9, 570], [['1 burrito', 241], ['1 small burrito', 150]], 173277),
  f('taco_beef', 'Taco, hard shell, beef', '🌮', 'prepared', [226, 8.9, 19.9, 12.7, 3.9, 0.9, 4.4, 397], [['1 taco', 69], ['2 tacos', 138]], 170689),
  f('quesadilla_cheese', 'Quesadilla, cheese', '🫓', 'prepared', [316, 13.4, 28.6, 16.2, 2, 2.4, 8.5, 676], [['1 quesadilla', 120], ['1 wedge', 40]], 2708591),
  f('caesar_salad', 'Caesar salad, no chicken', '🥗', 'prepared', [130, 3.5, 6.5, 10.5, 1.5, 1.5, 2.2, 330], [['1 side salad', 100], ['1 bowl', 200]]),
  f('caesar_salad_chicken', 'Caesar salad, with grilled chicken', '🥗', 'prepared', [148, 10.0, 5.0, 9.5, 1.2, 1.2, 2.5, 330], [['1 bowl', 300], ['1 small bowl', 200]]),
  f('greek_salad', 'Greek salad (tomato, cucumber, feta, olives, oil)', '🥗', 'prepared', [115, 3.5, 5.0, 9.0, 1.5, 3.0, 3.5, 300], [['1 bowl', 250], ['1 side salad', 150]]),
  f('spaghetti_meat_sauce', 'Spaghetti with meat sauce', '🍝', 'prepared', [125, 5.9, 19.1, 2.6, 1.6, 2.4, 0.7, 199], [['1 cup', 250], ['1 plate', 350]], 2708838),
  f('mac_and_cheese', 'Macaroni and cheese', '🧀', 'prepared', [223, 8.7, 23.1, 10.5, 1.2, 2.4, 5.2, 358], [['1 cup', 230], ['1 small bowl', 150]], 2708811),
  f('lasagna', 'Lasagna with meat sauce', '🍝', 'prepared', [139, 7.5, 16.2, 5, 1.6, 3.3, 2.3, 390], [['1 piece', 250], ['1 small piece', 180]], 2708750),
  f('fried_rice', 'Fried rice', '🍚', 'prepared', [174, 3.8, 32.5, 3.2, 1.1, 0.6, 0.5, 361], [['1 cup', 198], ['1 plate', 300]], 2708952),
  f('pad_thai', 'Pad thai (chicken or shrimp)', '🍜', 'prepared', [154, 8.1, 14.4, 7.5, 1.2, 4.1, 1.3, 384], [['1 cup', 200], ['1 plate', 350]], 2708804),
  f('sushi_california', 'Sushi roll, California (crab, avocado, cucumber)', '🍣', 'prepared', [94, 2.9, 18.4, 0.7, 1, 2.1, 0.1, 428], [['1 piece', 28], ['1 roll (8 pieces)', 220]], 2708961),
  f('sushi_salmon_nigiri', 'Sushi, salmon nigiri', '🍣', 'prepared', [107, 8.9, 13.4, 1.7, 0.6, 0.8, 0.3, 317], [['1 piece', 35], ['2 pieces', 70]], 2708969),
  f('chicken_curry', 'Chicken curry (sauce, no rice)', '🍛', 'prepared', [107, 6.5, 6.5, 6.5, 1.4, 2.6, 1.6, 376], [['1 cup', 240], ['1 serving', 300]], 2706437),
  f('chili_beans', 'Chili con carne with beans', '🌶️', 'prepared', [118, 9.8, 10.2, 4.3, 3, 1.5, 1.6, 340], [['1 cup', 255], ['1 bowl', 350]], 2706375),

  // ------------------------------------------- Middle Eastern / Mediterranean
  f('hummus', 'Hummus, commercial', '🧆', 'middle_eastern', [237, 7.8, 15, 17.8, 5.5, 0.6, 2.6, 426], [['2 tbsp', 30], ['1/4 cup', 60], ['1 tbsp', 15]], 174289),
  f('baba_ganoush', 'Baba ganoush (eggplant dip)', '🍆', 'middle_eastern', [183, 4.8, 8.2, 15, 3.9, 2.8, 2.2, 209], [['2 tbsp', 30], ['1/4 cup', 60]], 2710049),
  f('falafel', 'Falafel, fried', '🧆', 'middle_eastern', [333, 13.31, 31.84, 17.8, undefined, undefined, 2.4, 294], [['1 patty', 17], ['3 patties', 51], ['6 patties', 102]], 172455),
  f('shakshuka', 'Shakshuka (eggs poached in tomato-pepper sauce)', '🍳', 'middle_eastern', [90, 5.0, 5.0, 5.5, 1.3, 3.5, 1.5, 300], [['1 serving (2 eggs)', 300], ['1 cup', 240]]),
  f('israeli_salad', 'Israeli salad (tomato, cucumber, onion, oil, lemon)', '🥗', 'middle_eastern', [56, 1.0, 4.5, 3.8, 1.2, 2.8, 0.6, 100], [['1 cup', 160], ['1 bowl', 250], ['1/2 cup', 80]]),
  f('tabbouleh', 'Tabbouleh (parsley, bulgur, tomato, oil, lemon)', '🌿', 'middle_eastern', [127, 1.6, 9.7, 9.7, 1.8, 1.3, 1.5, 495], [['1 cup', 160], ['1/2 cup', 80]], 2709131),
  f('chicken_shawarma', 'Chicken shawarma, meat only', '🥙', 'middle_eastern', [200, 24.0, 1.5, 11.0, 0.3, 0.5, 3.0, 500], [['1 serving', 150], ['3 oz', 85]]),
  f('shawarma_pita', 'Chicken shawarma in pita (with salad and sauce)', '🥙', 'middle_eastern', [215, 13.0, 25.0, 7.0, 2.0, 3.0, 1.5, 450], [['1 pita sandwich', 280], ['1 laffa wrap', 350]]),
  f('schnitzel_chicken', 'Chicken schnitzel (breaded, pan-fried)', '🍗', 'middle_eastern', [255, 20.0, 12.0, 14.0, 0.8, 0.8, 2.5, 450], [['1 piece', 130], ['1 large piece', 180]]),
  f('bourekas_cheese', 'Bourekas, cheese (puff pastry)', '🥐', 'middle_eastern', [335, 9.0, 28.0, 21.0, 1.0, 1.5, 9.0, 600], [['1 piece', 80], ['1 large', 110], ['1 small', 55]]),
  f('dolma', 'Stuffed grape leaves (dolma), rice-filled', '🍃', 'middle_eastern', [168, 2.3, 13.9, 11.9, 3.1, 2.8, 1.9, 166], [['1 piece', 56], ['3 pieces', 168]], 2709064),
  f('halva', 'Halva (tahini halva)', '🍬', 'middle_eastern', [469, 12.5, 60.5, 21.5, 4.5, undefined, 4.1, 195], [['1 oz', 28], ['1 slice', 30], ['2 tbsp crumbled', 25]], 167996),

  // ------------------------------------------------------------------ drinks
  f('coffee_black', 'Coffee, brewed, black', '☕', 'drinks', [1, 0.12, 0, 0.02, 0, 0, 0, 2], [['1 cup (8 fl oz)', 237], ['1 mug (12 fl oz)', 355]], 171890),
  f('espresso', 'Espresso', '☕', 'drinks', [9, 0.12, 1.67, 0.18, 0, 0, 0.1, 14], [['1 shot', 30], ['1 double', 60]], 171891),
  f('latte', 'Latte, whole milk', '☕', 'drinks', [55, 3.0, 4.6, 2.8, 0, 4.4, 1.6, 40], [['1 cup (8 fl oz)', 240], ['tall (12 fl oz)', 355], ['grande (16 fl oz)', 473]]),
  f('cappuccino', 'Cappuccino, whole milk', '☕', 'drinks', [41, 2.2, 3.6, 2.1, 0, 3.5, 1.2, 30], [['1 cup (6 fl oz)', 180], ['12 fl oz', 355]]),
  f('mocha', 'Cafe mocha, whole milk', '☕', 'drinks', [75, 2.7, 9.0, 3.0, 0.5, 8.0, 1.8, 45], [['12 fl oz', 355], ['16 fl oz', 473]]),
  f('tea_brewed', 'Tea, brewed, unsweetened', '🍵', 'drinks', [1, 0, 0.3, 0, 0, 0, 0, 3], [['1 cup', 237], ['1 mug', 355]], 173227),
  // Computed from the rows above (see the header): a 250 ml cup is 220 ml brew + 30 ml 2% milk [+ 1 tsp sugar].
  f('coffee_milk', 'Coffee with a splash of milk (2%)', '☕', 'drinks', [7.0, 0.51, 0.59, 0.26, 0, 0.59, 0.16, 8], [['1 cup (250 ml)', 251], ['1 mug (350 ml)', 351]]),
  f('coffee_milk_sugar', 'Coffee with a splash of milk and 1 tsp sugar', '☕', 'drinks', [13.3, 0.5, 2.23, 0.26, 0, 2.22, 0.16, 7], [['1 cup (250 ml)', 255], ['1 mug (350 ml)', 357]]),
  f('coffee_sugar', 'Coffee with 1 tsp sugar', '☕', 'drinks', [7.4, 0.12, 1.65, 0.02, 0, 1.65, 0, 2], [['1 cup (250 ml)', 254], ['1 mug (350 ml)', 356]]),
  f('tea_milk', 'Tea with a splash of milk (2%)', '🍵', 'drinks', [7.0, 0.41, 0.85, 0.24, 0, 0.59, 0.16, 8], [['1 cup (250 ml)', 251], ['1 mug (350 ml)', 351]]),
  f('tea_milk_sugar', 'Tea with a splash of milk and 1 tsp sugar', '🍵', 'drinks', [13.3, 0.4, 2.49, 0.24, 0, 2.22, 0.16, 8], [['1 cup (250 ml)', 255], ['1 mug (350 ml)', 357]]),
  f('tea_sugar', 'Tea with 1 tsp sugar', '🍵', 'drinks', [7.4, 0, 1.95, 0, 0, 1.65, 0, 3], [['1 cup (250 ml)', 254], ['1 mug (350 ml)', 356]]),
  f('iced_tea_sweet', 'Iced tea, sweetened', '🧋', 'drinks', [32, 0, 7.9, 0, 0, 7.7, 0, 3], [['1 glass (12 fl oz)', 372], ['1 bottle (16.9 fl oz)', 524]], 2710515),
  f('orange_juice', 'Orange juice', '🧃', 'drinks', [49, 0.7, 11.5, 0.1, 0.3, 8.3, 0.02, 2], [['1 cup', 248], ['1 small glass (6 fl oz)', 186]], 169100),
  f('apple_juice', 'Apple juice', '🧃', 'drinks', [46, 0.1, 11.3, 0.13, 0.2, 9.62, 0.02, 4], [['1 cup', 248], ['1 small glass (6 fl oz)', 186]], 173933),
  f('grape_juice', 'Grape juice', '🧃', 'drinks', [60, 0.37, 14.77, 0.13, 0.2, 14.2, 0.04, 5], [['1 cup', 253]], 173042),
  f('cranberry_juice', 'Cranberry juice cocktail', '🧃', 'drinks', [54, 0, 13.5, 0.1, 0, 11.9, 0, 2], [['1 cup', 253]], 171903),
  f('tomato_juice', 'Tomato juice', '🍅', 'drinks', [17, 0.8, 3.53, 0.3, 0.4, 2.6, 0.01, 253], [['1 cup', 243], ['1 small can (5.5 oz)', 163]], 170458),
  f('lemonade', 'Lemonade', '🍋', 'drinks', [40, 0.1, 10.4, 0, 0, 10, 0, 4], [['1 cup', 248], ['1 glass (12 fl oz)', 372]], 173217),
  f('coconut_water', 'Coconut water', '🥥', 'drinks', [18, 0.2, 4.2, 0, 0, 3.9, 0, 26], [['1 cup', 240], ['1 carton (11 fl oz)', 330]], 174831),
  f('cola', 'Cola, regular', '🥤', 'drinks', [42, 0, 10.4, 0.2, 0, 9.9, 0, 3], [['1 can (12 fl oz)', 370], ['1 bottle (20 fl oz)', 617], ['1 cup', 247]], 174852),
  f('cola_diet', 'Cola, diet', '🥤', 'drinks', [2, 0.1, 0.3, 0, 0, 0, 0, 8], [['1 can (12 fl oz)', 355], ['1 bottle (20 fl oz)', 591]], 175099),
  f('lemon_lime_soda', 'Lemon-lime soda', '🥤', 'drinks', [41, 0.1, 10.4, 0, 0, 10.4, 0, 10], [['1 can (12 fl oz)', 368], ['1 bottle (20 fl oz)', 613]], 173205),
  f('ginger_ale', 'Ginger ale', '🥤', 'drinks', [34, 0, 8.8, 0, 0, 8.8, 0, 7], [['1 can (12 fl oz)', 366], ['1 cup', 244]], 174846),
  f('energy_drink', 'Energy drink, sugared', '⚡', 'drinks', [43, 0.5, 10.2, 0, 0, 10.2, 0, 39], [['1 can (8.4 fl oz)', 250], ['1 can (16 fl oz)', 473]], 2710756),
  f('sports_drink', 'Sports drink (electrolyte)', '🥤', 'drinks', [26, 0, 6.4, 0, 0, 5.2, 0, 39], [['1 bottle (20 fl oz)', 620], ['1 bottle (12 fl oz)', 372]], 2710771),
  f('sports_drink_low', 'Sports drink, low calorie', '🥤', 'drinks', [8, 0.05, 1.94, 0.01, 0, 1.3, 0, 45], [['1 bottle (20 fl oz)', 600], ['1 cup', 240]], 2710774),
  f('smoothie_fruit', 'Fruit smoothie (fruit and yogurt)', '🥤', 'drinks', [66, 2.3, 12, 1.1, 1.1, 8.9, 0.6, 28], [['1 cup', 216], ['16 fl oz', 432]], 2705513),
  f('milkshake_vanilla', 'Milkshake, vanilla', '🥤', 'drinks', [112, 3.9, 17.8, 3, 0, 17.8, 1.9, 95], [['small (12 fl oz)', 330], ['medium (16 fl oz)', 450]], 170884),
  f('hot_chocolate', 'Hot chocolate (cocoa mix with milk)', '☕', 'drinks', [97, 3.8, 15.5, 2.2, 0.5, 13.1, 1.3, 102], [['1 cup', 250], ['1 mug (12 fl oz)', 355]], 2705484),
  f('beer', 'Beer, regular (about 5% ABV)', '🍺', 'drinks', [43, 0.46, 3.55, 0, 0, 0, 0, 4], [['1 can/bottle (12 fl oz)', 356], ['1 pint (16 fl oz)', 473], ['1 half-litre', 500]], 168746),
  f('beer_light', 'Beer, light (about 4% ABV)', '🍺', 'drinks', [29, 0.24, 1.64, 0, 0, 0.1, 0, 4], [['1 can/bottle (12 fl oz)', 354], ['1 pint (16 fl oz)', 473]], 168749),
  f('wine_red', 'Wine, red table', '🍷', 'drinks', [85, 0.07, 2.61, 0, 0, 0.62, 0, 4], [['1 glass (5 fl oz)', 147], ['1 large glass (8 fl oz)', 235]], 173190),
  f('wine_white', 'Wine, white table', '🥂', 'drinks', [82, 0.07, 2.6, 0, 0, 0.96, 0, 5], [['1 glass (5 fl oz)', 147], ['1 large glass (8 fl oz)', 235]], 174837),
  f('spirits', 'Spirits (vodka, whiskey, rum, gin; 80 proof)', '🥃', 'drinks', [231, 0, 0, 0, 0, 0, 0, 1], [['1 shot (1.5 fl oz)', 42], ['1 oz', 28], ['double (3 fl oz)', 84]], 174815),

  // ---------------------------------------------------------- sports nutrition
  f('whey_protein', 'Whey protein powder (concentrate, generic)', '💪', 'sports', [400, 80.0, 7.0, 6.0, 0, 5.0, 3.0, 300], [['1 scoop', 30], ['2 scoops', 60]]),
  f('whey_isolate', 'Whey protein isolate powder (generic)', '💪', 'sports', [370, 88.0, 2.0, 1.0, 0, 1.0, 0.5, 400], [['1 scoop', 30], ['2 scoops', 60]]),
  f('pea_protein', 'Plant protein powder (pea, generic)', '💪', 'sports', [380, 75.0, 8.0, 5.0, 2.0, 1.0, 1.0, 1000], [['1 scoop', 33], ['2 scoops', 66]]),
  f('protein_bar', 'Protein bar (generic, about 20 g protein)', '🍫', 'sports', [390, 33.0, 38.0, 12.0, 8.0, 12.0, 5.0, 350], [['1 bar', 60], ['1 small bar', 45]]),
  f('protein_shake_rtd', 'Protein shake, ready-to-drink', '🥤', 'sports', [49, 9.2, 1.5, 0.9, 0.5, 1.0, 0.4, 70], [['1 bottle (11 fl oz)', 325], ['1 carton (14 fl oz)', 414]]),
];
