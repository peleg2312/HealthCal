/**
 * Saved-meal pieces shared by the saved meals screen, the search screen's
 * Saved meals tab and the meal builder: the "log this meal" sheet and the
 * amount sheet for one line of a meal being built.
 */
import { Check } from 'lucide-react-native';
import React, { useState } from 'react';
import { View } from 'react-native';

import { isolateRtl, withoutMarks } from '@/lib/bidi';
import { MEAL_LABEL } from '@/lib/nutrition';
import { cup, useTheme } from '@/theme';
import type { ISODate, MealType, SavedMeal, SavedMealItem } from '@/types';
import { Button, Chip, ChipWrap, NumberField, PressableScale, Sheet, Stepper, Text } from '@/ui';

import { AmountEditor } from './AmountEditor';
import { RowEmoji } from './components';
import { formatPortion, mealServings, planSavedMeal, setItemAmount } from './build';
import { dayPhrase, formatQty, kcal, labelGrams, matchServing, portionLabel, servingText } from './helpers';
import { logSavedMeal } from './log';
import { currentValues } from './usuals';

const PORTIONS = [0.5, 1, 2];

/** "1 cup · 205 kcal" for a saved-meal line, with "~" for an estimate. */
export function itemLine(it: SavedMealItem): string {
  const portion = portionLabel(it.servingLabel, it.quantity);
  const g = Math.round(it.grams);
  // Show the weight too when the portion is a household measure ("1.5 × 1 cup · 240 g").
  const weight = g > 0 && !/\bg$/.test(withoutMarks(portion)) && it.servingLabel !== '1 g' ? ` · ${g} g` : '';
  return `${portion}${weight} · ${it.kcalRange ? '~' : ''}${kcal(it.nutrients.kcal)} kcal`;
}

/**
 * Pick how much of a saved meal to log: a portion for a recipe, a checklist
 * of its items, and one button. Render it with `key={meal.id}` so it starts
 * fresh for each meal.
 */
export function LogSavedMealSheet({ meal, mealType, date, onClose }: { meal: SavedMeal | null; mealType: MealType; date: ISODate; onClose: () => void }) {
  const { colors, spacing } = useTheme();
  const [portion, setPortion] = useState<number | null>(1);
  const [other, setOther] = useState(false);
  const [include, setInclude] = useState<boolean[]>(() => (meal ? meal.items.map(() => true) : []));
  if (!meal) return <Sheet visible={false} onClose={onClose}>{null}</Sheet>;

  const servings = mealServings(meal);
  const recipe = servings > 1;
  const validPortion = !recipe || (portion !== null && portion > 0 && portion <= 100);
  const plan = planSavedMeal(meal, { portion: portion ?? 1, include });
  const ticked = include.filter(Boolean).length;
  const where = `${MEAL_LABEL[mealType].toLowerCase()}`;

  return (
    <Sheet
      visible
      onClose={onClose}
      title={isolateRtl(meal.name)}
      footer={
        <Button
          testID="log-meal-confirm"
          title={ticked === 0 ? 'Tick at least one item' : `Log to ${where}, ${plan.range ? '~' : ''}${kcal(plan.kcal)} kcal`}
          disabled={ticked === 0 || !validPortion}
          onPress={() => {
            logSavedMeal(meal, mealType, date, { portion: portion ?? 1, include });
            onClose();
          }}
        />
      }>
      <Text variant="body" color="textSecondary">
        {recipe ? `Makes ${formatPortion(servings)} servings. ` : ''}
        Adds to {where}, {dayPhrase(date)}.
      </Text>
      {recipe ? (
        <View style={{ gap: spacing.sm }}>
          <Text variant="label">How many servings did you have?</Text>
          {/* The question names the unit, so the choices are short and all four sit on one line at 320 px
              ("½ serving  1 serving  2 servings" left "Other" alone on a second line at 360). */}
          <ChipWrap>
            {PORTIONS.map((p) => (
              <Chip
                key={p}
                testID={`log-meal-portion-${p}`}
                label={formatPortion(p)}
                // A one-character label still makes a 48 px wide target, and the four read as one set.
                style={{ minWidth: 52, justifyContent: 'center' }}
                selected={!other && portion === p}
                onPress={() => {
                  setOther(false);
                  setPortion(p);
                }}
              />
            ))}
            <Chip testID="log-meal-portion-other" label="Other" selected={other} onPress={() => setOther(true)} style={{ minWidth: 52, justifyContent: 'center' }} />
          </ChipWrap>
          {other ? (
            <NumberField
              testID="log-meal-portion-input"
              label="Servings"
              suffix={`of ${formatPortion(servings)}`}
              value={portion}
              onChange={setPortion}
              decimals={2}
              autoFocus
            />
          ) : null}
        </View>
      ) : null}
      <View>
        <Text variant="label" style={{ marginBottom: spacing.xs }}>
          {recipe ? 'In this recipe' : 'Items'}
        </Text>
        {meal.items.map((saved, i) => {
          const on = include[i] ?? true;
          // The line as logging it adds it (currentValues), the same as the total on the button.
          const it = currentValues(saved);
          return (
            <PressableScale
              key={i}
              testID={`log-meal-item-${i}`}
              scaleTo={0.985}
              feedback="select"
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={`${it.name}, ${withoutMarks(itemLine(it))}`}
              onPress={() => setInclude((cur) => meal.items.map((_, j) => (j === i ? !(cur[j] ?? true) : (cur[j] ?? true))))}
              style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 48, paddingVertical: 4 }}>
              <View
                style={{
                  width: 24,
                  height: 24,
                  ...cup(7, 3),
                  borderWidth: 1.5,
                  borderColor: on ? colors.text : colors.borderStrong,
                  backgroundColor: on ? colors.text : 'transparent',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                {on ? <Check size={16} color={colors.bg} strokeWidth={3} /> : null}
              </View>
              <RowEmoji emoji={it.emoji} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text variant="body" numberOfLines={2} color={on ? 'text' : 'textTertiary'}>
                  {isolateRtl(it.name)}
                </Text>
                <Text variant="caption" color="textSecondary" numberOfLines={2} tabular>
                  {itemLine(it)}
                </Text>
              </View>
            </PressableScale>
          );
        })}
      </View>
      {plan.range ? (
        <Text variant="caption" color="textSecondary" tabular testID="log-meal-range">
          Includes estimates: likely between {kcal(plan.range[0])} and {kcal(plan.range[1])} kcal
        </Text>
      ) : null}
    </Sheet>
  );
}

/** Change the amount of one line of a meal being built, or remove it. */
export function ItemAmountSheet({
  item,
  onChange,
  onRemove,
  onClose,
}: {
  item: SavedMealItem | null;
  onChange: (item: SavedMealItem) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const { spacing } = useTheme();
  const [invalid, setInvalid] = useState(false);
  if (!item) return <Sheet visible={false} onClose={onClose}>{null}</Sheet>;
  const food = item.food;
  return (
    <Sheet
      visible
      onClose={onClose}
      title={isolateRtl(item.name)}
      footer={
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <Button testID="meal-item-remove" variant="secondary" full={false} title="Remove" onPress={onRemove} />
          <Button testID="meal-item-done" style={{ flex: 1 }} disabled={invalid} title={`Done · ${item.kcalRange ? '~' : ''}${kcal(item.nutrients.kcal)} kcal`} onPress={onClose} />
        </View>
      }>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <RowEmoji emoji={item.emoji} />
        <Text variant="caption" color="textSecondary" style={{ flex: 1 }} tabular>
          {item.kcalRange ? `Estimate, likely between ${kcal(item.kcalRange[0])} and ${kcal(item.kcalRange[1])} kcal` : itemLine(item)}
        </Text>
      </View>
      {food ? (
        <AmountEditor
          food={food}
          value={{ serving: matchServing(food, item.servingLabel, item.quantity > 0 ? item.grams / item.quantity : item.grams), quantity: item.quantity }}
          onChange={(v) => onChange(setItemAmount(item, v.serving, v.quantity))}
          onPendingChange={setInvalid}
          testIDPrefix="meal-item"
        />
      ) : (
        <View style={{ alignItems: 'center', paddingVertical: spacing.sm }}>
          <Stepper
            label="quantity"
            value={item.quantity}
            step={0.5}
            min={0.25}
            max={50}
            format={(v) => (labelGrams(item.servingLabel) !== null ? `${formatQty(labelGrams(item.servingLabel)! * v)} g` : `${formatQty(v)} × ${servingText(item.servingLabel)}`)}
            onChange={(q) => onChange(setItemAmount(item, { label: item.servingLabel, grams: 0 }, q))}
          />
        </View>
      )}
    </Sheet>
  );
}
