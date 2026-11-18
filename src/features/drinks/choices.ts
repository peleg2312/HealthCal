/**
 * What a drink on the water screen was, one tap after its kind: the choices per kind, each mapped
 * to a bundled reference food (src/data/foods.ts) or to none (no calories). Pure data, tested in
 * choices.test.ts against the reference foods themselves.
 *
 * The kinds that meant "no calories" before drinks had choices (Tea, Coffee, Sports drink, Other)
 * start on their no-calorie choice, so a person who logs sparkling water as Other or electrolyte tabs
 * as Sports drink keeps the same result with the same taps. Milk and Juice always have calories and
 * start on the usual one. Water has no choices.
 */
import type { Beverage } from '@/types';

export interface DrinkChoice {
  /** Stored on the water record as `drink`. */
  id: string;
  kind: Beverage;
  /** The chip's words (at most 18 characters). */
  label: string;
  /** How the drink is named inside a sentence ("semi-skimmed milk"). */
  name: string;
  /** The bundled food whose numbers are logged; null: no calories (nothing goes to the diary). */
  foodId: string | null;
  /** For a null choice: the reference food that shows it has no calories to speak of (<= 2 kcal per 100 g). */
  refId?: string;
  /** The kind's choice when nothing is remembered on this device. */
  isDefault?: boolean;
}

const c = (kind: Beverage, id: string, label: string, name: string, foodId: string | null, extra: Partial<DrinkChoice> = {}): DrinkChoice => ({
  id,
  kind,
  label,
  name,
  foodId,
  ...extra,
});

export const DRINK_CHOICES: readonly DrinkChoice[] = [
  c('tea', 'tea_plain', 'Plain', 'tea', null, { refId: 'b_tea_brewed', isDefault: true }),
  c('tea', 'tea_milk', 'Splash of milk', 'tea with a splash of milk', 'b_tea_milk'),
  c('tea', 'tea_milk_sugar', 'Splash and sugar', 'tea with milk and sugar', 'b_tea_milk_sugar'),
  c('tea', 'tea_sugar', 'With sugar', 'tea with sugar', 'b_tea_sugar'),

  c('coffee', 'coffee_black', 'Black', 'black coffee', null, { refId: 'b_coffee_black', isDefault: true }),
  c('coffee', 'coffee_milk', 'Splash of milk', 'coffee with a splash of milk', 'b_coffee_milk'),
  c('coffee', 'coffee_milk_sugar', 'Splash and sugar', 'coffee with milk and sugar', 'b_coffee_milk_sugar'),
  c('coffee', 'coffee_sugar', 'With sugar', 'coffee with sugar', 'b_coffee_sugar'),
  c('coffee', 'latte', 'Latte', 'latte', 'b_latte'),
  c('coffee', 'cappuccino', 'Cappuccino', 'cappuccino', 'b_cappuccino'),

  c('juice', 'juice_orange', 'Orange', 'orange juice', 'b_orange_juice', { isDefault: true }),
  c('juice', 'juice_apple', 'Apple', 'apple juice', 'b_apple_juice'),

  c('milk', 'milk_semi', 'Semi-skimmed (2%)', 'semi-skimmed milk', 'b_milk_2pct', { isDefault: true }),
  c('milk', 'milk_whole', 'Whole', 'whole milk', 'b_milk_whole'),
  c('milk', 'milk_skim', 'Skimmed', 'skimmed milk', 'b_milk_skim'),
  c('milk', 'milk_oat', 'Oat', 'oat milk', 'b_oat_milk'),
  c('milk', 'milk_soy', 'Soy', 'soy milk', 'b_soy_milk'),
  c('milk', 'milk_almond', 'Almond', 'almond milk', 'b_almond_milk'),

  c('sports', 'sports_zero', 'No sugar', 'sugar-free sports drink', null, { isDefault: true }),
  c('sports', 'sports_regular', 'Regular', 'sports drink', 'b_sports_drink'),
  c('sports', 'sports_low', 'Low calorie', 'low-calorie sports drink', 'b_sports_drink_low'),

  c('other', 'other_none', 'No calories', 'drink', null, { isDefault: true }),
  c('other', 'soft_regular', 'Soft drink', 'soft drink', 'b_cola'),
];

/** `drink` on a water record whose food was picked in the "Choose a drink" sheet. */
export const PICKED = 'food';
/** `drink` on a water record whose calories were typed in ("Or enter calories"). */
export const ENTERED = 'kcal';

/** Kinds whose row ends in a chip that opens the drink sheet, with its words and the search it opens with. */
export const PICK_CHIP: Partial<Record<Beverage, { label: string; query: string }>> = {
  juice: { label: 'Other juice', query: 'juice' },
  other: { label: 'Choose a drink', query: '' },
};

/** kcal per 100 g at or under which a drink counts as "no calories" (black coffee and plain tea are 1); every food choice is above it. */
export const CHOICE_KCAL_LINE = 2;

export function choicesFor(kind: Beverage): DrinkChoice[] {
  return DRINK_CHOICES.filter((x) => x.kind === kind);
}

/** The kind's default choice id, or null for Water (no choices). */
export function defaultChoiceId(kind: Beverage): string | null {
  return DRINK_CHOICES.find((x) => x.kind === kind && x.isDefault)?.id ?? null;
}

export function choiceById(id: string | undefined | null): DrinkChoice | null {
  if (!id) return null;
  return DRINK_CHOICES.find((x) => x.id === id) ?? null;
}

/** Whether a kind's row offers a picked food (the drink sheet). */
export function canPick(kind: Beverage): boolean {
  return PICK_CHIP[kind] !== undefined;
}
