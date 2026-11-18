import { router } from 'expo-router';
import { Plus } from 'lucide-react-native';
import React from 'react';
import { View } from 'react-native';

import { BUILTIN_FOODS } from '@/data/foods';
import { logFood } from '@/features/food/log';
import { usualFoods } from '@/features/food/usuals';
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

/** Three one-tap foods for the meal: the person's usual ones when there are any, else bundled staples. */
function picks(entries: Parameters<typeof usualFoods>[0], meal: MealType, today: ISODate): Pick[] {
  const usual: Pick[] = usualFoods(entries, meal, today, { withFood: true, limit: 3 }).flatMap((u) =>
    u.food
      ? [{ key: u.key, label: u.food.name.split(',')[0], food: u.food, serving: { label: u.last.servingLabel, grams: u.last.grams / (u.last.quantity || 1) }, quantity: u.last.quantity || 1, kcal: u.last.nutrients.kcal }]
      : [],
  );
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
 * it, and three foods that log in one tap (with Undo). The macro bars come back
 * after the first entry.
 */
export function FirstLogInvite({ meal, date, budget }: { meal: MealType; date: ISODate; budget: number }) {
  const { colors, spacing } = useTheme();
  const entries = useLive('foodEntries');
  const label = MEAL_LABEL[meal];
  const share = Math.round((budget * MEAL_SHARE[meal]) / 10) * 10;
  const options = picks(entries, meal, date);
  return (
    <View testID="today-first-invite" style={{ gap: spacing.md }}>
      <Text variant="overline">{`${label} · around ${formatNumber(share)} kcal`}</Text>
      <Button
        testID="today-first-log"
        title={`Log ${label.toLowerCase()}`}
        icon={<Plus size={18} color={colors.onPrimary} strokeWidth={2.4} />}
        onPress={() => router.push(`/food/search?meal=${meal}&date=${date}` as never)}
      />
      {options.length ? (
        <View style={{ gap: spacing.sm }}>
          <Text variant="caption" color="textSecondary">
            Or add one in a tap
          </Text>
          {/* 12 px between rows: each 32 px chip keeps its whole 44 px touch area, never shared with the chip below. */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.sm, rowGap: spacing.md }}>
            {options.map((p) => (
              <Chip
                key={p.key}
                testID={`today-first-${p.key}`}
                label={`${isolateRtl(p.label)} · ${formatNumber(Math.round(p.kcal))} kcal`}
                icon={<Plus size={14} color={colors.text} strokeWidth={2.2} />}
                onPress={() => logFood({ food: p.food, serving: p.serving, quantity: p.quantity, meal, date })}
              />
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}
