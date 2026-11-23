/**
 * Plates for "Meals that fit" when the person's own meals give fewer than three ideas: a fixed,
 * hand-written list, about four per meal, built from bundled foods at whole servings a person would
 * recognise ("1 breast", "1 cup cooked", "2 slices"). Nothing is generated: a plate is only ever shown
 * whole or halved (`ideas.ts`).
 *
 * Rules every plate keeps (proved in plates.test.ts against src/data/foods.ts):
 * - every id is a bundled food and every serving label is one of its own servings;
 * - no alcohol, no oil or fat, no sauce, no sweetener, no pork and no shellfish;
 * - never meat or poultry with a dairy food or cheese on one plate;
 * - each meal has at least one plate without meat, poultry or fish (`meatOrFish: false`).
 * The calories and protein are never written here: they are what the foods give today.
 */
import type { MealType } from '@/types';

export interface PlateItem {
  /** A bundled food's id (`b_...`). */
  foodId: string;
  /** One of the food's own serving labels. */
  serving: string;
  /** Whole servings. */
  quantity: number;
}

export interface Plate {
  id: string;
  meal: MealType;
  name: string;
  items: PlateItem[];
  /** True when the plate holds meat, poultry or fish. */
  meatOrFish: boolean;
}

const p = (foodId: string, serving: string, quantity = 1): PlateItem => ({ foodId, serving, quantity });

export const PLATES: readonly Plate[] = [
  // ------------------------------------------------------------ breakfast
  {
    id: 'eggs-bread',
    meal: 'breakfast',
    name: 'Eggs, bread and vegetables',
    items: [p('b_egg_boiled', '2 large'), p('b_bread_wholewheat', '2 slices'), p('b_tomato', '1 medium'), p('b_cucumber', '1 cup sliced')],
    meatOrFish: false,
  },
  {
    id: 'yogurt-oats',
    meal: 'breakfast',
    name: 'Greek yogurt, oatmeal and berries',
    items: [p('b_greek_yogurt_nonfat', '1 container (170 g)'), p('b_oatmeal_cooked', '1 cup cooked'), p('b_blueberries', '1 cup')],
    meatOrFish: false,
  },
  {
    id: 'cottage-bread',
    meal: 'breakfast',
    name: 'Cottage cheese, bread and pepper',
    items: [p('b_cottage_cheese_3pct', '1 tub'), p('b_bread_wholewheat', '2 slices'), p('b_bell_pepper_red', '1 medium')],
    meatOrFish: false,
  },
  {
    id: 'lox-rye',
    meal: 'breakfast',
    name: 'Smoked salmon on rye',
    items: [p('b_smoked_salmon', '3 oz'), p('b_bread_rye', '2 slices'), p('b_cucumber', '1 cup sliced')],
    meatOrFish: true,
  },
  // ---------------------------------------------------------------- lunch
  {
    id: 'chicken-rice',
    meal: 'lunch',
    name: 'Chicken, rice and salad',
    items: [p('b_chicken_breast_cooked', '1 breast'), p('b_rice_white_cooked', '1 cup cooked'), p('b_tomato', '1 medium'), p('b_cucumber', '1 cup sliced')],
    meatOrFish: true,
  },
  {
    id: 'mejadra-yogurt',
    meal: 'lunch',
    name: 'Mejadra, yogurt and salad',
    items: [p('b_mejadra', '1 cup'), p('b_greek_yogurt_nonfat', '1 container (170 g)'), p('b_tomato', '1 medium'), p('b_cucumber', '1 cup sliced')],
    meatOrFish: false,
  },
  {
    id: 'tuna-pita',
    meal: 'lunch',
    name: 'Tuna in pita with vegetables',
    items: [p('b_tuna_canned_water', '1 can drained'), p('b_pita_wholewheat', '1 large (6.5")'), p('b_tomato', '1 medium'), p('b_cucumber', '1 cup sliced')],
    meatOrFish: true,
  },
  {
    id: 'turkey-sweet-potato',
    meal: 'lunch',
    name: 'Turkey, sweet potato and broccoli',
    items: [p('b_turkey_breast_cooked', '3 oz cooked'), p('b_sweet_potato', '1 large'), p('b_broccoli_cooked', '1 cup chopped')],
    meatOrFish: true,
  },
  // --------------------------------------------------------------- dinner
  {
    id: 'salmon-quinoa',
    meal: 'dinner',
    name: 'Salmon, quinoa and green beans',
    items: [p('b_salmon_wild_cooked', '1 fillet'), p('b_quinoa_cooked', '1 cup cooked'), p('b_green_beans', '1 cup')],
    meatOrFish: true,
  },
  {
    id: 'chicken-potato',
    meal: 'dinner',
    name: 'Chicken thigh, potato and carrots',
    items: [p('b_chicken_thigh_cooked', '1 thigh (boneless)'), p('b_potato_baked', '1 medium'), p('b_carrot_cooked', '1 cup sliced')],
    meatOrFish: true,
  },
  {
    id: 'beans-rice',
    meal: 'dinner',
    name: 'Black beans, brown rice and peppers',
    items: [p('b_black_beans', '1 cup cooked'), p('b_rice_brown_cooked', '1 cup cooked'), p('b_bell_pepper_red', '1 medium'), p('b_tomato', '1 medium')],
    meatOrFish: false,
  },
  {
    id: 'cod-couscous',
    meal: 'dinner',
    name: 'Cod, couscous and zucchini',
    items: [p('b_cod_cooked', '1 fillet'), p('b_couscous_cooked', '1 cup cooked'), p('b_zucchini', '1 medium')],
    meatOrFish: true,
  },
  // ---------------------------------------------------------------- snack
  {
    id: 'yogurt-apple',
    meal: 'snack',
    name: 'Greek yogurt and an apple',
    items: [p('b_greek_yogurt_nonfat', '1 container (170 g)'), p('b_apple', '1 medium')],
    meatOrFish: false,
  },
  {
    id: 'almonds-orange',
    meal: 'snack',
    name: 'Almonds and an orange',
    items: [p('b_almonds', '1 oz (23 almonds)'), p('b_orange', '1 medium')],
    meatOrFish: false,
  },
  {
    id: 'cottage-rice-cakes',
    meal: 'snack',
    name: 'Cottage cheese on rice cakes',
    items: [p('b_cottage_cheese_2pct', '1/2 cup'), p('b_rice_cakes', '2 cakes'), p('b_tomato', '1 medium')],
    meatOrFish: false,
  },
  {
    id: 'hummus-pita',
    meal: 'snack',
    name: 'Hummus, carrot and small pita',
    items: [p('b_hummus', '1/4 cup'), p('b_carrot_raw', '1 medium'), p('b_pita_wholewheat', '1 small (4")')],
    meatOrFish: false,
  },
];

/** The plates for one meal, in the list's order. */
export function platesFor(meal: MealType): Plate[] {
  return PLATES.filter((pl) => pl.meal === meal);
}
