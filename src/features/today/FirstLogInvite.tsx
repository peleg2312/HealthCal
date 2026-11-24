import { router } from 'expo-router';
import { Plus } from 'lucide-react-native';
import React from 'react';
import { ScrollView, View } from 'react-native';

import { BUILTIN_FOODS } from '@/data/foods';
import { foodNameHead } from '@/features/food/addedTo';
import { displayFoodName } from '@/features/food/displayName';
import { logFood } from '@/features/food/log';
import { matchServing } from '@/features/food/helpers';
import { customFoodIndex, resolveUsuals, usualFoods } from '@/features/food/usuals';
import { isolateRtl } from '@/lib/bidi';
import { MEAL_LABEL, MEAL_SHARE, scaleNutrients } from '@/lib/nutrition';
import { formatNumber } from '@/lib/units';
import { useLive } from '@/store/selectors';
import { useTheme } from '@/theme';
import type { Food, ISODate, MealType, Serving } from '@/types';
import { Button, Chip, Text } from '@/ui';

/** Bundled staples offered for a meal when there is no history yet: short names, a common first serving. */
const STAPLES: Record<MealType, { id: string; label: string }[]> = {
  breakfast: [
    { id: 'b_banana', label: 'Banana' },
    { id: 'b_oatmeal_cooked', label: 'Oatmeal' },
    { id: 'b_greek_yogurt_nonfat', label: 'Greek yogurt' },
  ],
  lunch: [
    { id: 'b_greek_salad', label: 'Greek salad' },
    { id: 'b_chicken_breast_cooked', label: 'Chicken breast' },
    { id: 'b_apple', label: 'Apple' },
  ],
  dinner: [
    { id: 'b_salmon_cooked', label: 'Salmon' },
    { id: 'b_rice_white_cooked', label: 'White rice' },
    { id: 'b_chicken_breast_cooked', label: 'Chicken breast' },
  ],
  snack: [
    { id: 'b_apple', label: 'Apple' },
    { id: 'b_banana', label: 'Banana' },
    { id: 'b_almonds', label: 'Almonds' },
  ],
};

interface Pick {
  key: string;
  label: string;
  food: Food;
  serving: Serving;
  quantity: number;
  kcal: number;
}

const BY_ID = new Map(BUILTIN_FOODS.map((f) => [f.id, f]));

/**
 * Three one-tap foods for the meal: the person's usual ones when there are any, else bundled staples.
 * A usual food is the food as it is now at the remembered grams (`resolveUsuals`), so the chip's
 * calories are what a tap logs.
 */
function picks(entries: Parameters<typeof usualFoods>[0], meal: MealType, today: ISODate, customFoods: readonly Food[]): Pick[] {
  const usual: Pick[] = resolveUsuals(usualFoods(entries, meal, today, { withFood: true, limit: 3 }), customFoodIndex(customFoods)).flatMap((u) => {
    const food = u.last.food ?? u.food;
    if (!food) return [];
    const quantity = u.last.quantity || 1;
    const serving = matchServing(food, u.last.servingLabel, u.last.grams / quantity);
    // The name as drawn, up to its first comma outside brackets (never "Israeli salad (tomato").
    return [{ key: u.key, label: foodNameHead(displayFoodName(food)), food, serving, quantity, kcal: scaleNutrients(food.per100g, serving.grams * quantity).kcal }];
  });
  if (usual.length >= 3) return usual;
  const staples = STAPLES[meal].flatMap((s) => {
    const food = BY_ID.get(s.id);
    const serving = food?.servings[0];
    if (!food || !serving || usual.some((u) => u.food.id === food.id)) return [];
    return [{ key: s.id, label: s.label, food, serving, quantity: 1, kcal: scaleNutrients(food.per100g, serving.grams).kcal }];
  });
  return [...usual, ...staples].slice(0, 3);
}

/**
 * Day one of Today: one obvious first action. The meal for the time of day
 * with its share of the budget, a full-width button that opens food search for
 * it, and three foods that log in one tap (with Undo). The macro bars and the
 * budget line come back after the first entry. The button is the kit's secondary,
 * not a filled primary: the tab bar's + is the screen's one filled action.
 * `narrow` (a window under 360 px): a 44 px button and the three foods in one row
 * that scrolls sideways, so the water row under the card is in the first view at 320 x 640.
 */
export function FirstLogInvite({ meal, date, budget, narrow = false }: { meal: MealType; date: ISODate; budget: number; narrow?: boolean }) {
  const { colors, spacing } = useTheme();
  const entries = useLive('foodEntries');
  const customFoods = useLive('customFoods');
  const label = MEAL_LABEL[meal];
  const share = Math.round((budget * MEAL_SHARE[meal]) / 10) * 10;
  const options = picks(entries, meal, date, customFoods);
  const chip = (p: Pick) => (
    <Chip
      key={p.key}
      testID={`today-first-${p.key}`}
      label={`${isolateRtl(p.label)} · ${formatNumber(Math.round(p.kcal))} kcal`}
      accessibilityLabel={`Add ${p.label}, ${formatNumber(Math.round(p.kcal))} kilocalories, to ${label.toLowerCase()}`}
      icon={<Plus size={18} color={colors.text} strokeWidth={2.2} />}
      onPress={() => logFood({ food: p.food, serving: p.serving, quantity: p.quantity, meal, date })}
    />
  );
  return (
    <View testID="today-first-invite" style={{ gap: spacing.md }}>
      <Text variant="overline">{`${label} · around ${formatNumber(share)} kcal`}</Text>
      <Button
        testID="today-first-log"
        title={`Log ${label.toLowerCase()}`}
        variant="secondary"
        size={narrow ? 'md' : 'lg'}
        icon={<Plus size={18} color={colors.text} strokeWidth={2.2} />}
        onPress={() => router.push(`/food/search?meal=${meal}&date=${date}` as never)}
      />
      {options.length ? (
        // The chips follow the button with no line of their own: each one's "+" says a tap adds it, and the toast
        // names what was added, with Undo. 12 px between rows: each 32 px chip keeps its whole 44 px touch area,
        // never shared with the chip below. Kept this short so the water row under the card is in the first view.
        // Under 360 px they are one row that scrolls sideways, reaching the card's edges, with 6 px above and
        // below inside the scroller so each chip's 44 px touch area is not clipped.
        narrow ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            testID="today-first-chips"
            style={{ marginHorizontal: -12, marginVertical: -6 }}
            contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 6, gap: spacing.sm }}>
            {options.map((p) => chip(p))}
          </ScrollView>
        ) : (
          <View testID="today-first-chips" style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.sm, rowGap: spacing.md }}>
            {options.map((p) => chip(p))}
          </View>
        )
      ) : null}
    </View>
  );
}
