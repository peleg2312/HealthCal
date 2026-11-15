import { router, useLocalSearchParams } from 'expo-router';
import { PenLine, Plus, Trash2 } from 'lucide-react-native';
import React, { useState } from 'react';
import { View } from 'react-native';

import { deleteSavedMeal } from '@/features/food/actions';
import { formatPortion, itemsRange, mealServings } from '@/features/food/build';
import { DayStepper, MealPicker, RowEmoji } from '@/features/food/components';
import { dayPhrase, href, kcal, parseDate, parseMeal } from '@/features/food/helpers';
import { LogSavedMealSheet, itemLine } from '@/features/food/SavedMealParts';
import { MEAL_LABEL, sumNutrients } from '@/lib/nutrition';
import { useLive } from '@/store/selectors';
import { useTheme } from '@/theme';
import type { SavedMeal } from '@/types';
import { Button, Card, EmptyState, Header, IconButton, MacroBar, Screen, Text } from '@/ui';

export default function SavedMealsScreen() {
  const { colors, spacing } = useTheme();
  const params = useLocalSearchParams<{ meal?: string; date?: string }>();
  const [meal, setMeal] = useState(() => parseMeal(params.meal));
  const [date, setDate] = useState(() => parseDate(params.date));
  const saved = useLive('savedMeals');
  const meals = [...saved].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const [logging, setLogging] = useState<SavedMeal | null>(null);
  const build = (id?: string) => router.push(href('/food/meal-edit', { id, meal, date }) as never);

  return (
    <Screen testID="food-meals-screen" header={<Header title="Saved meals" subtitle={`Log to ${MEAL_LABEL[meal].toLowerCase()}, ${dayPhrase(date)}`} />}>
      {meals.length > 0 ? (
        <>
          <MealPicker value={meal} onChange={setMeal} testIDPrefix="meals-meal" />
          <DayStepper value={date} onChange={setDate} testIDPrefix="meals-day" />
          <Button testID="meals-new" variant="secondary" size="md" title="New meal or recipe" icon={<Plus size={18} color={colors.text} />} onPress={() => build()} />
        </>
      ) : null}

      {meals.length === 0 ? (
        <EmptyState
          emoji="🍱"
          title="No saved meals yet"
          message="Build a meal you eat often, or a recipe that makes several servings, and log it in a couple of taps. You can also save a meal from the diary's meal menu."
          action="New meal or recipe"
          onAction={() => build()}
        />
      ) : (
        meals.map((m, i) => {
          const n = sumNutrients(m.items.map((it) => it.nutrients));
          const count = mealServings(m);
          const approx = itemsRange(m.items) ? '~' : '';
          return (
            <Card key={m.id} testID={`saved-meal-card-${i}`} style={{ gap: spacing.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text variant="h3" numberOfLines={1}>
                    {m.name}
                  </Text>
                  <Text variant="caption" color="textSecondary" tabular numberOfLines={2}>
                    {count > 1
                      ? `${approx}${kcal(n.kcal / count)} kcal per serving · makes ${formatPortion(count)}`
                      : `${approx}${kcal(n.kcal)} kcal · P ${Math.round(n.protein)} g · C ${Math.round(n.carbs)} g · F ${Math.round(n.fat)} g`}
                  </Text>
                </View>
                <IconButton testID={`saved-meal-edit-${i}`} accessibilityLabel={`Edit ${m.name}`} tone="clear" onPress={() => build(m.id)}>
                  <PenLine size={18} color={colors.textSecondary} />
                </IconButton>
                <IconButton testID={`saved-meal-delete-${i}`} accessibilityLabel={`Delete ${m.name}`} tone="clear" onPress={() => deleteSavedMeal(m)}>
                  <Trash2 size={18} color={colors.textSecondary} />
                </IconButton>
              </View>
              <MacroBar protein={n.protein * 4} carbs={n.carbs * 4} fat={n.fat * 9} height={6} />
              <View style={{ gap: 6 }}>
                {m.items.map((it, j) => (
                  <View key={j} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                    <RowEmoji emoji={it.emoji} />
                    {/* Name and amount share the row and each may take two lines, so neither squeezes the other out. */}
                    <Text variant="body" numberOfLines={2} style={{ flex: 1, minWidth: 0 }}>
                      {it.name}
                    </Text>
                    <Text variant="caption" color="textSecondary" numberOfLines={2} style={{ flexShrink: 1, maxWidth: '55%', textAlign: 'right' }}>
                      {itemLine(it).replace(/(\d) (g|kcal|ml)\b/g, '$1\u00A0$2')}
                    </Text>
                  </View>
                ))}
              </View>
              <Button
                testID={`saved-meal-log-${i}`}
                title={`Log to ${MEAL_LABEL[meal].toLowerCase()}`}
                size="md"
                variant="secondary"
                onPress={() => setLogging(m)}
              />
            </Card>
          );
        })
      )}

      <LogSavedMealSheet key={logging?.id ?? 'none'} meal={logging} mealType={meal} date={date} onClose={() => setLogging(null)} />
    </Screen>
  );
}
