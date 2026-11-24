/**
 * Saved-meal pieces shared by the saved meals screen, the search screen's
 * Saved meals tab and the meal builder: the "log this meal" sheet and the
 * amount sheet for one line of a meal being built.
 */
import { Check } from 'lucide-react-native';
import React, { useState } from 'react';
import { View } from 'react-native';

import { SourceMark, sourceMarkTop } from '@/features/ai/mark';
import { isolateRtl, withoutMarks } from '@/lib/bidi';
import { MEAL_LABEL } from '@/lib/nutrition';
import { cup, useTheme } from '@/theme';
import type { ISODate, MealType, SavedMeal, SavedMealItem } from '@/types';
import { Button, Chip, ChipWrap, NumberField, PressableScale, Sheet, Stepper, Text } from '@/ui';
import { spokenUnits } from '@/lib/spokenUnits';

import { AmountEditor } from './AmountEditor';
import { RowEmoji } from './components';
import { formatPortion, mealServings, planSavedMeal, setItemAmount } from './build';
import { displayFoodName } from './displayName';
import { dayPhrase, kcal, matchServing, sourceInfo, withSourceWord } from './helpers';
import { itemLine, itemStepText } from './itemLine';
import { logSavedMeal } from './log';
import { currentValues } from './usuals';

const PORTIONS = [0.5, 1, 2];

export { itemLine } from './itemLine';

/** Where a saved line's numbers come from (principle 3): an estimate kept with its range is the AI's. */
export function itemSource(it: Pick<SavedMealItem, 'source' | 'kcalRange'>): SavedMealItem['source'] {
  return it.kcalRange ? 'ai' : it.source;
}

/**
 * One saved line's caption: its source's mark leading and its word ending the line, as on a food row
 * ("1 bowl · ~473 kcal · AI estimate"), so a long portion wraps instead of cutting the calories. Reference
 * data ends with no word (`withSourceWord`): its filled key is its mark.
 */
export function ItemCaption({ item, testID }: { item: SavedMealItem; testID?: string }) {
  const { colors } = useTheme();
  const source = itemSource(item);
  // The line is one element to a screen reader and names its source in words, reference data included
  // (the mark alone says nothing to it): "1.5 × 1/2 cup dry · 60 g · 227 kcal, Reference data".
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }} accessible accessibilityLabel={spokenUnits(`${withoutMarks(itemLine(item))}, ${sourceInfo(source).label}`)}>
      <SourceMark source={source} color={colors.textSecondary} size={8} style={{ marginTop: sourceMarkTop(source) }} />
      <Text variant="caption" color="textSecondary" numberOfLines={2} tabular style={{ flexShrink: 1 }} testID={testID}>
        {/* The source's word stays on one line ("AI estimate", "Your food"). */}
        {withSourceWord(itemLine(item), source)}
      </Text>
    </View>
  );
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
              accessibilityLabel={spokenUnits(`${displayFoodName(it)}, ${withoutMarks(itemLine(it))}, ${sourceInfo(itemSource(it)).label}`)}
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
                  {isolateRtl(displayFoodName(it))}
                </Text>
                <ItemCaption item={it} />
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
      title={isolateRtl(displayFoodName(item))}
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
            format={(v) => itemStepText(item.servingLabel, v)}
            onChange={(q) => onChange(setItemAmount(item, { label: item.servingLabel, grams: 0 }, q))}
          />
        </View>
      )}
    </Sheet>
  );
}
