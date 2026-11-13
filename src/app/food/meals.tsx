import { router, useLocalSearchParams } from 'expo-router';
import { PenLine, Trash2 } from 'lucide-react-native';
import React, { useState } from 'react';
import { View } from 'react-native';

import { deleteSavedMeal, renameSavedMeal } from '@/features/food/actions';
import { DayStepper, MealPicker } from '@/features/food/components';
import { dayPhrase, href, kcal, parseDate, parseMeal, portionLabel } from '@/features/food/helpers';
import { logItems } from '@/features/food/log';
import { MEAL_LABEL, sumNutrients } from '@/lib/nutrition';
import { useLive } from '@/store/selectors';
import { useTheme } from '@/theme';
import type { SavedMeal } from '@/types';
import { Button, Card, EmptyState, Header, IconButton, MacroBar, Screen, Sheet, Text, TextField } from '@/ui';

export default function SavedMealsScreen() {
  const { colors, spacing } = useTheme();
  const params = useLocalSearchParams<{ meal?: string; date?: string }>();
  const [meal, setMeal] = useState(() => parseMeal(params.meal));
  const [date, setDate] = useState(() => parseDate(params.date));
  const saved = useLive('savedMeals');
  const meals = [...saved].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const [renaming, setRenaming] = useState<SavedMeal | null>(null);
  const [newName, setNewName] = useState('');

  return (
    <Screen testID="food-meals-screen" header={<Header title="Saved meals" subtitle={`Log to ${MEAL_LABEL[meal].toLowerCase()}, ${dayPhrase(date)}`} />}>
      {meals.length > 0 ? (
        <>
          <MealPicker value={meal} onChange={setMeal} testIDPrefix="meals-meal" />
          <DayStepper value={date} onChange={setDate} testIDPrefix="meals-day" />
        </>
      ) : null}

      {meals.length === 0 ? (
        <EmptyState
          emoji="🍱"
          title="No saved meals yet"
          message="Meals you eat often, saved once, log in one tap. In the diary, open a meal's menu and choose Save as a meal."
          action="Open diary"
          onAction={() => router.replace(href('/diary', { date }) as never)}
        />
      ) : (
        meals.map((m, i) => {
          const n = sumNutrients(m.items.map((it) => it.nutrients));
          return (
            <Card key={m.id} testID={`saved-meal-card-${i}`} style={{ gap: spacing.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text variant="h3" numberOfLines={1}>
                    {m.name}
                  </Text>
                  <Text variant="caption" color="textSecondary" tabular>
                    {kcal(n.kcal)} kcal · P {Math.round(n.protein)} g · C {Math.round(n.carbs)} g · F {Math.round(n.fat)} g
                  </Text>
                </View>
                <IconButton
                  testID={`saved-meal-rename-${i}`}
                  accessibilityLabel={`Rename ${m.name}`}
                  tone="clear"
                  onPress={() => {
                    setNewName(m.name);
                    setRenaming(m);
                  }}>
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
                    <Text style={{ fontSize: 16, lineHeight: 22 }}>{it.emoji ?? '🍽️'}</Text>
                    <Text variant="body" numberOfLines={1} style={{ flex: 1 }}>
                      {it.name}
                    </Text>
                    <Text variant="caption" color="textSecondary" numberOfLines={1}>
                      {portionLabel(it.servingLabel, it.quantity)} · {kcal(it.nutrients.kcal)} kcal
                    </Text>
                  </View>
                ))}
              </View>
              <Button
                testID={`saved-meal-log-${i}`}
                title={`Log to ${MEAL_LABEL[meal].toLowerCase()}`}
                size="md"
                variant="secondary"
                onPress={() => logItems(m.items, meal, date, `${m.name} added to ${MEAL_LABEL[meal].toLowerCase()}`)}
              />
            </Card>
          );
        })
      )}

      <Sheet
        visible={!!renaming}
        onClose={() => setRenaming(null)}
        title="Rename meal"
        footer={
          <Button
            testID="saved-meal-rename-save"
            title="Save name"
            disabled={!newName.trim()}
            onPress={() => {
              if (renaming) renameSavedMeal(renaming, newName);
              setRenaming(null);
            }}
          />
        }>
        <TextField testID="saved-meal-rename-input" label="Name" value={newName} onChangeText={setNewName} autoFocus maxLength={60} />
      </Sheet>
    </Screen>
  );
}
