import { router, useLocalSearchParams } from 'expo-router';
import { PenLine, Plus, Trash2 } from 'lucide-react-native';
import React, { useState } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { deleteSavedMeal } from '@/features/food/actions';
import { formatPortion, itemsRange, mealServings } from '@/features/food/build';
import { DayStepper, MealPicker, RowEmoji } from '@/features/food/components';
import { FavoriteStar } from '@/features/food/FavoriteStar';
import { toggleMealFavorite } from '@/features/food/favoriteActions';
import { isFavoriteMeal, mealToSave } from '@/features/food/favorites';
import { favoriteLabel } from '@/features/food/favoriteWords';
import { href, kcal, parseDate, parseMeal } from '@/features/food/helpers';
import { ItemCaption, LogSavedMealSheet } from '@/features/food/SavedMealParts';
import { SaveCurrentMealRow, useVisitOrder } from '@/features/food/SavedMealRow';
import { currentValues } from '@/features/food/usuals';
import { isolateRtl } from '@/lib/bidi';
import { MEAL_LABEL, sumNutrients } from '@/lib/nutrition';
import { useToday } from '@/store/clock';
import { useLive } from '@/store/selectors';
import { useTheme } from '@/theme';
import type { SavedMeal } from '@/types';
import { Button, Card, EmptyState, Header, IconButton, MacroBar, Screen, Text } from '@/ui';

export default function SavedMealsScreen() {
  const { colors, spacing } = useTheme();
  const narrow = useWindowDimensions().width < 360;
  const params = useLocalSearchParams<{ meal?: string; date?: string }>();
  const [meal, setMeal] = useState(() => parseMeal(params.meal));
  const [date, setDate] = useState(() => parseDate(params.date));
  const todayDate = useToday();
  const saved = useLive('savedMeals');
  // Favourites first, in the order fixed when the screen came into view: a star changes only its icon
  // until the next visit, so the card never moves from under the finger.
  const meals = useVisitOrder(saved).ordered;
  const entries = useLive('foodEntries');
  // "Save lunch as a meal": the meal and day chosen above, while it holds two foods or more that are not a saved meal yet.
  const toSave = mealToSave(entries, meal, date, saved);
  const [logging, setLogging] = useState<SavedMeal | null>(null);
  const build = (id?: string) => router.push(href('/food/meal-edit', { id, meal, date }) as never);

  return (
    <Screen
      testID="food-meals-screen"
      header={<Header title="Saved meals" subtitle="Meals and recipes you saved" />}
      // The one primary action, pinned. With no meals yet the empty state offers it instead.
      footer={meals.length > 0 ? <Button testID="meals-new" title="New meal or recipe" icon={<Plus size={18} color={colors.onPrimary} />} onPress={() => build()} /> : undefined}>
      {meals.length > 0 ? (
        <View style={{ gap: spacing.sm }}>
          {/* Where a meal is logged to: the meal and the day. */}
          <MealPicker value={meal} onChange={setMeal} testIDPrefix="meals-meal" />
          <DayStepper value={date} onChange={setDate} testIDPrefix="meals-day" />
        </View>
      ) : null}

      {toSave ? <SaveCurrentMealRow meal={meal} date={date} today={todayDate} entries={toSave} /> : null}

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
          // Each line as logging it adds it: a bundled food at today's values (currentValues); the saved meal is not changed.
          const items = m.items.map(currentValues);
          const n = sumNutrients(items.map((it) => it.nutrients));
          const count = mealServings(m);
          const approx = itemsRange(m.items) ? '~' : '';
          const on = isFavoriteMeal(m);
          return (
            <Card key={m.id} testID={`saved-meal-card-${i}`} style={{ gap: spacing.md }}>
              {/* The name and its caption, the star beside them (a sibling: the card itself takes no tap). The star's
                  negative margins keep the card's height and leave it 10 px inside the card's edge. */}
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text variant="h3" numberOfLines={2}>
                    {isolateRtl(m.name)}
                  </Text>
                  <Text variant="caption" color="textSecondary" tabular numberOfLines={2} testID={`saved-meal-caption-${i}`}>
                    {count > 1
                      ? `${approx}${kcal(n.kcal / count)} kcal per serving · makes ${formatPortion(count)}`
                      : `${approx}${kcal(n.kcal)} kcal · P ${Math.round(n.protein)} g · C ${Math.round(n.carbs)} g · F ${Math.round(n.fat)} g`}
                  </Text>
                </View>
                <FavoriteStar testID={`saved-meal-favorite-${i}`} on={on} label={favoriteLabel(m.name, on)} onPress={() => toggleMealFavorite(m)} style={{ marginTop: -6, marginRight: -6 }} />
              </View>
              <MacroBar protein={n.protein * 4} carbs={n.carbs * 4} fat={n.fat * 9} height={6} />
              {/* Each item's amount goes under its name, as in the diary, so neither squeezes the other into a few letters. */}
              <View style={{ gap: spacing.sm }}>
                {items.map((it, j) => (
                  <View key={j} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                    <RowEmoji emoji={it.emoji} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text variant="body" numberOfLines={2}>
                        {isolateRtl(it.name)}
                      </Text>
                      <ItemCaption item={it} testID={`saved-meal-item-${i}-${j}`} />
                    </View>
                  </View>
                ))}
              </View>
              {/* Log leads; changing and deleting (soft, with Undo) sit beside it, smaller. */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <Button
                  testID={`saved-meal-log-${i}`}
                  // At 320 px "Log to breakfast" does not fit beside edit and delete: the meal is chosen just above, so "Log" says it.
                  title={narrow ? 'Log' : `Log to ${MEAL_LABEL[meal].toLowerCase()}`}
                  accessibilityLabel={`Log ${m.name} to ${MEAL_LABEL[meal].toLowerCase()}`}
                  size="md"
                  variant="secondary"
                  full={false}
                  style={{ flex: 1 }}
                  onPress={() => setLogging(m)}
                />
                <IconButton testID={`saved-meal-edit-${i}`} accessibilityLabel={`Edit ${m.name}`} tone="clear" onPress={() => build(m.id)}>
                  <PenLine size={18} color={colors.textSecondary} />
                </IconButton>
                <IconButton testID={`saved-meal-delete-${i}`} accessibilityLabel={`Delete ${m.name}`} tone="clear" onPress={() => deleteSavedMeal(m)}>
                  <Trash2 size={18} color={colors.textSecondary} />
                </IconButton>
              </View>
            </Card>
          );
        })
      )}

      <LogSavedMealSheet key={logging?.id ?? 'none'} meal={logging} mealType={meal} date={date} onClose={() => setLogging(null)} />
    </Screen>
  );
}
