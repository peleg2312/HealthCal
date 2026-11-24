import { useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';

import { DayStepper, MealPicker } from '@/features/food/components';
import { QUICK_KCAL_LIMIT, href, kcal, parseDate, parseMeal } from '@/features/food/helpers';
import { logQuickAdd } from '@/features/food/log';
import { useBigText } from '@/features/food/textGrowth';
import { atwaterKcal, MEAL_LABEL } from '@/lib/nutrition';
import { useTheme } from '@/theme';
import { Button, Card, CupKey, Header, NumberField, Screen, Text, TextField, goBack, useLeaveGuard } from '@/ui';

export default function QuickAddScreen() {
  const { colors, spacing } = useTheme();
  const params = useLocalSearchParams<{ meal?: string; date?: string }>();
  const [meal, setMeal] = useState(() => parseMeal(params.meal));
  const [date, setDate] = useState(() => parseDate(params.date));
  const [name, setName] = useState('');
  // With large text a shorter placeholder, so it is never cut mid-word in its field.
  const big = useBigText();
  const macroCell = big ? { flexGrow: 1, flexBasis: 110 } : { flex: 1 };
  const [kcalV, setKcal] = useState<number | null>(null);
  const [protein, setProtein] = useState<number | null>(null);
  const [carbs, setCarbs] = useState<number | null>(null);
  const [fat, setFat] = useState<number | null>(null);

  const hasMacros = protein !== null || carbs !== null || fat !== null;
  const implied = Math.round(atwaterKcal({ protein: protein ?? 0, carbs: carbs ?? 0, fat: fat ?? 0 }));
  const calories = kcalV ?? (hasMacros ? implied : null);
  const mismatch = kcalV !== null && hasMacros && implied > 40 && Math.abs(implied - kcalV) > Math.max(50, kcalV * 0.2);
  const valid = calories !== null && calories > 0 && calories < QUICK_KCAL_LIMIT;
  // Typed numbers or a name are not dropped without asking (the X, back, a swipe back).
  const typed = kcalV !== null || hasMacros || name.trim().length > 0;
  const leave = useLeaveGuard(typed ? 'Discard this quick add?' : null);

  const save = () => {
    if (!valid) return;
    logQuickAdd({ name, meal, date, nutrients: { kcal: calories!, protein: protein ?? 0, carbs: carbs ?? 0, fat: fat ?? 0 } });
    leave.allowLeave();
    goBack(href('/diary', { date }));
  };

  return (
    <Screen
      testID="food-quick-screen"
      header={<Header title="Quick add" subtitle="When you just know the numbers" close />}
      footer={<Button testID="quick-save" title={`Add to ${MEAL_LABEL[meal].toLowerCase()}`} disabled={!valid} onPress={save} />}>
      <Card style={{ gap: spacing.md }}>
        <NumberField
          testID="quick-kcal"
          label="Calories"
          suffix="kcal"
          decimals={0}
          value={kcalV}
          onChange={setKcal}
          autoFocus
          placeholder={hasMacros ? String(implied) : 'e.g. 350'}
          hint={kcalV === null && hasMacros ? `Worked out from the macros: ${kcal(implied)} kcal` : undefined}
          onSubmitEditing={save}
        />
        <TextField testID="quick-name" label="Name (optional)" placeholder={big ? 'e.g. Cake' : 'e.g. Office birthday cake'} value={name} onChangeText={setName} maxLength={80} />
      </Card>

      <Card style={{ gap: spacing.md }}>
        <View>
          <Text variant="h3">Macros</Text>
          <Text variant="caption" color="textSecondary">
            Optional, and enough on their own.
          </Text>
        </View>
        {/* With large text the three wrap (each at least 110 wide), so "Protein" is never split. */}
        <View style={{ flexDirection: 'row', flexWrap: big ? 'wrap' : 'nowrap', gap: spacing.sm }}>
          <NumberField testID="quick-protein" label="Protein" suffix="g" value={protein} onChange={setProtein} style={macroCell} />
          <NumberField testID="quick-carbs" label="Carbs" suffix="g" value={carbs} onChange={setCarbs} style={macroCell} />
          <NumberField testID="quick-fat" label="Fat" suffix="g" value={fat} onChange={setFat} style={macroCell} />
        </View>
        {mismatch ? (
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
            <CupKey color={colors.warning} style={{ marginTop: 4 }} />
            <Text testID="quick-mismatch" variant="caption" color="text" style={{ flex: 1 }}>
              These macros add up to about {kcal(implied)} kcal, not {kcal(kcalV!)}. Labels round; check for a typo.
            </Text>
          </View>
        ) : null}
      </Card>

      <Card style={{ gap: spacing.md }}>
        <Text variant="h3">Meal and day</Text>
        <MealPicker value={meal} onChange={setMeal} testIDPrefix="quick-meal" />
        <DayStepper value={date} onChange={setDate} testIDPrefix="quick-day" />
      </Card>
      {leave.guard}
    </Screen>
  );
}
