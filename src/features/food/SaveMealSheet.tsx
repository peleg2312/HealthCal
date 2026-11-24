/**
 * Save a diary meal (lunch) as one of my meals: a name, prefilled, and one Save. The step the meal
 * menu's "Save as a meal" opens, the diary's one-time hint and the "Save lunch as a meal" row in Saved
 * meals (search's tab and /food/meals) all show this same sheet. `saveMeal` writes it (drinks logged on
 * Water are left out), with its toast and Undo.
 *
 * `useSaveMealStep` is the same step as parts (title, body, footer), so the meal menu shows it inside
 * its own open sheet: switching from the menu to this step changes the sheet's content in place rather
 * than closing one sheet and sliding another up.
 */
import React, { useState } from 'react';
import { View } from 'react-native';

import { isWaterDrinkEntry } from '@/features/drinks/via';
import { isolateRtl } from '@/lib/bidi';
import type { FoodEntry, ISODate, MealType } from '@/types';
import { Button, Sheet, Text, TextField } from '@/ui';

import { saveMeal } from './actions';
import { kcal } from './helpers';
import { defaultMealName, SAVE_NAME_MAX, saveSheetFoods, saveSheetLine, saveSheetTitle, showSaveSheetFoods } from './saveWords';
import { currentKcal } from './usuals';

export interface SaveMealStepProps {
  /** Whether the step is on screen now: each time it opens for a meal and day, the name is prefilled again. */
  open: boolean;
  meal: MealType | null;
  date: ISODate;
  entries: readonly FoodEntry[];
  /** After a save (and to close without one). */
  onClose(): void;
}

export interface SaveMealStep {
  title: string;
  body: React.ReactNode;
  footer: React.ReactNode;
}

/** The save step as parts, for a sheet that shows it in place (the meal menu). */
export function useSaveMealStep({ open, meal, date, entries, onClose }: SaveMealStepProps): SaveMealStep {
  const [name, setName] = useState('');
  const [openFor, setOpenFor] = useState<string | null>(null);
  // Prefill the name each time the step opens for a meal on a day (the render-time reset the menu uses).
  const key = open && meal ? `${meal}|${date}` : null;
  if (key !== openFor) {
    setOpenFor(key);
    if (key && meal) setName(defaultMealName(entries, meal));
  }
  // What the save stores: never a drink paired with Water (saveMeal leaves it out), at today's values.
  const food = entries.filter((e) => !isWaterDrinkEntry(e));
  const total = currentKcal(food);
  const estimate = food.some((e) => !!e.kcalRange);
  // The foods in bold only when the name offered says something else ("My lunch"): never the same words twice.
  const names = meal && showSaveSheetFoods(entries, meal) ? saveSheetFoods(entries).map(isolateRtl).join(', ') : null;
  const save = () => {
    saveMeal(name, [...entries]);
    onClose();
  };
  return {
    title: meal ? saveSheetTitle(meal) : '',
    body: (
      <>
        <View style={{ gap: 4 }}>
          {names ? (
            <Text variant="bodyStrong" numberOfLines={2} testID="save-meal-foods">
              {names}
            </Text>
          ) : null}
          <Text variant="body" color="textSecondary" testID="save-meal-line">
            {saveSheetLine(food.length, kcal(total), estimate)}
          </Text>
        </View>
        <TextField testID="save-meal-name" label="Name" value={name} onChangeText={setName} autoFocus maxLength={SAVE_NAME_MAX} returnKeyType="done" />
      </>
    ),
    footer: <Button testID="save-meal-confirm" title="Save meal" disabled={!name.trim() || food.length === 0} onPress={save} />,
  };
}

/**
 * The save step as a sheet of its own. `entries` are the meal's entries on that day as the diary holds
 * them (drinks logged on Water may be among them: they are left out of the save).
 */
export function SaveMealSheet({ visible, meal, date, entries, onClose }: { visible: boolean; meal: MealType; date: ISODate; entries: FoodEntry[]; onClose(): void }) {
  const step = useSaveMealStep({ open: visible, meal, date, entries, onClose });
  return (
    <Sheet visible={visible} onClose={onClose} title={step.title} footer={step.footer}>
      {step.body}
    </Sheet>
  );
}
