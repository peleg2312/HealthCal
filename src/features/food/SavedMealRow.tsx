/**
 * The saved-meal row of food search (the Saved meals tab and the Favourites tab): the kind mark, the name
 * and its caption (an estimate's calories with "~"), a star and the "+" cup, side by side (never one
 * pressable inside another). The "+" logs at once, as a food row's "+" and the + sheet's meal tile do (one
 * serving for a recipe, one toast with Undo: `logSavedMeal`); the body opens the review sheet (servings,
 * which items); a long press, or the named accessibility action, stars it as the star does. Also here: the
 * "Save lunch as a meal" row (R5) and the order fixed per visit.
 */
import { useFocusEffect } from 'expo-router';
import { ChevronRight, Plus, Save, Utensils } from 'lucide-react-native';
import React, { useCallback, useState } from 'react';
import { View } from 'react-native';

import { isWaterDrinkEntry } from '@/features/drinks/via';
import { isolateRtl } from '@/lib/bidi';
import { sumNutrients } from '@/lib/nutrition';
import { useStore } from '@/store';
import { live } from '@/store/selectors';
import { cup, fonts, useTheme } from '@/theme';
import type { FoodEntry, ISODate, MealType, SavedMeal } from '@/types';
import { IconButton, PressableScale, Text } from '@/ui';
import { spokenUnits } from '@/lib/spokenUnits';

import { formatPortion, itemsRange, mealServings } from './build';
import { FavoriteStar } from './FavoriteStar';
import { toggleMealFavorite } from './favoriteActions';
import { favoriteMeals, inVisitOrder, isFavoriteMeal, orderSavedMeals } from './favorites';
import { approxKcalSpoken, favoriteActionLabel, favoriteLabel, FAVOURITE_ACTION, logMealLabel, saveRowDay, savedRowCaption } from './favoriteWords';
import { SaveMealSheet } from './SaveMealSheet';
import { itemCount, saveHintLabel } from './saveWords';
import { currentValues } from './usuals';

/**
 * The saved meals in the order fixed when the screen came into view (favourites first), so a star changes
 * only its icon until the next visit and never moves a row from under the finger (`inVisitOrder`), and
 * the meals that were favourites then (a list of favourites keeps a meal unstarred on this visit, with its
 * outline star, so it can be starred again).
 */
export function useVisitOrder(meals: readonly SavedMeal[]): { ordered: SavedMeal[]; starredAtVisit: ReadonlySet<string> } {
  const [visit, setVisit] = useState<{ order: string[]; starred: Set<string> } | null>(null);
  useFocusEffect(
    useCallback(() => {
      const now = live(useStore.getState().savedMeals);
      setVisit({ order: orderSavedMeals(now).map((m) => m.id), starred: new Set(favoriteMeals(now).map((m) => m.id)) });
    }, []),
  );
  return { ordered: inVisitOrder(meals, visit?.order ?? null), starredAtVisit: visit?.starred ?? new Set(favoriteMeals(meals).map((m) => m.id)) };
}

/** The row's figures, as logging adds them: a bundled food at today's values, per serving for a recipe. */
function rowFigures(m: SavedMeal) {
  const count = mealServings(m);
  const total = sumNutrients(m.items.map(currentValues).map((it) => it.nutrients)).kcal / count;
  return { count, total, estimate: !!itemsRange(m.items) };
}

/**
 * `onReview` opens the review sheet (the body's tap); `onLog` logs the meal at once (the "+"); `onHold`
 * runs before a long press stars it (search marks its hold hint learnt).
 */
export function SavedMealRow({ meal, testID, onReview, onLog, onHold }: { meal: SavedMeal; testID: string; onReview: () => void; onLog: () => void; onHold?: () => void }) {
  const { colors, spacing } = useTheme();
  const on = isFavoriteMeal(meal);
  const { count, total, estimate } = rowFigures(meal);
  const caption = savedRowCaption({ items: meal.items.length, servings: count, servingsText: formatPortion(count), kcal: total, estimate });
  const star = () => toggleMealFavorite(meal);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
      <PressableScale
        testID={testID}
        onPress={onReview}
        onLongPress={() => {
          onHold?.();
          star();
        }}
        scaleTo={0.985}
        accessibilityLabel={spokenUnits(`${meal.name}, ${meal.items.length} items, ${approxKcalSpoken(total, estimate)}${on ? ', favourite' : ''}. Choose servings and items before logging`)}
        accessibilityActions={[{ name: FAVOURITE_ACTION.name, label: favoriteActionLabel(on) }]}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === FAVOURITE_ACTION.name) star();
        }}
        style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56, paddingVertical: 11 }}>
        <View style={{ width: 24, alignItems: 'center' }}>
          <Utensils size={19} color={colors.textSecondary} strokeWidth={1.9} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="bodyStrong" numberOfLines={2} style={{ fontFamily: fonts.semibold }}>
            {isolateRtl(meal.name)}
          </Text>
          {/* Two lines at most: beside the star and Log a recipe's "~410 kcal per serving · makes 4" can need them at 320 px. */}
          <Text variant="caption" color="textSecondary" numberOfLines={2} testID={`${testID}-caption`}>
            {caption}
          </Text>
        </View>
      </PressableScale>
      {/* 12 px to the "+": the star's touch area reaches 4 px past its edge, so neither takes the other's taps. */}
      <FavoriteStar testID={`${testID}-favorite`} on={on} label={favoriteLabel(meal.name, on)} onPress={star} style={{ marginRight: 4 }} />
      {/* The same "+" cup as a food row's, and it does the same: it adds at once, with one toast and Undo. */}
      <IconButton testID={`${testID}-log`} accessibilityLabel={count > 1 ? `Log one serving of ${meal.name}` : logMealLabel(meal.name)} tone="surface" size={44} onPress={onLog}>
        <Plus size={20} color={colors.text} strokeWidth={2.2} />
      </IconButton>
    </View>
  );
}

/**
 * "Save lunch as a meal · 3 items, today": the permanent way to save a diary meal, where people look for
 * their meals (search's Saved meals tab and /food/meals), shown while `mealToSave` offers that meal. It
 * opens the same save sheet as the diary's meal menu. A quiet control, not a notice: a surface tile with a
 * 1 px vesselEdge outline, its save icon, the count line and a chevron, at the weight of "New meal or
 * recipe" (a surfaceAlt panel is how the app's notes that cannot be tapped look). `today` is the parent's
 * `useToday()`, so the day word never comes from the clock while rendering.
 */
export function SaveCurrentMealRow({ meal, date, today, entries }: { meal: MealType; date: ISODate; today: ISODate; entries: FoodEntry[] }) {
  const { colors, radius, spacing } = useTheme();
  const [open, setOpen] = useState(false);
  const food = entries.filter((e) => !isWaterDrinkEntry(e));
  const caption = `${itemCount(food.length)}, ${saveRowDay(date, today)}`;
  return (
    <>
      <PressableScale
        testID="save-current-meal"
        onPress={() => setOpen(true)}
        scaleTo={0.985}
        accessibilityLabel={spokenUnits(`${saveHintLabel(meal)}, ${caption}`)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.md,
          minHeight: 56,
          paddingLeft: 14,
          paddingRight: 12,
          paddingVertical: 10,
          ...cup(radius.tile, 5),
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.vesselEdge,
        }}>
        <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
          <Save size={19} color={colors.text} strokeWidth={1.9} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="bodyStrong">{saveHintLabel(meal)}</Text>
          <Text variant="caption" color="textSecondary" testID="save-current-meal-count">
            {caption}
          </Text>
        </View>
        <ChevronRight size={18} color={colors.textTertiary} strokeWidth={1.9} />
      </PressableScale>
      <SaveMealSheet visible={open} meal={meal} date={date} entries={entries} onClose={() => setOpen(false)} />
    </>
  );
}
