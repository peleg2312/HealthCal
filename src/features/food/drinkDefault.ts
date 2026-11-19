/**
 * The default of the own-food switch "This is a drink" (src/app/food/custom.tsx): on only when the
 * serving's name names a volume (ml, cl, L or fl oz; never "cup") AND the food's name has none of the
 * not-a-drink words the diary's fallback rule uses (`notADrinkByName`: soup, broth, sauce, syrup, oil,
 * cream; מרק, רוטב, ציר). So "Bone broth, 1 cup (250 ml)" is not a drink by default. The screen follows
 * this while the person types, until they touch the switch; from then on the choice is theirs.
 */
import { notADrinkByName } from '@/features/drinks/diary';
import { readLabelMl } from '@/features/drinks/rules';

export function drinkByDefault(servingLabel: string, foodName: string): boolean {
  return readLabelMl(servingLabel, false) !== null && !notADrinkByName(foodName);
}
