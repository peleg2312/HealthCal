import { useLocalSearchParams } from 'expo-router';
import { Trash2 } from 'lucide-react-native';
import React, { useState } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { deleteCustomFood } from '@/features/food/actions';
import { setFoodDraft, useFoodDraft } from '@/features/food/draft';
import { drinkByDefault } from '@/features/food/drinkDefault';
import { href, kcal, param, parseMeal, toPer100 } from '@/features/food/helpers';
import { logFood } from '@/features/food/log';
import { isolateRtl } from '@/lib/bidi';
import { today } from '@/lib/dates';
import { atwaterKcal, GRAM_SERVING } from '@/lib/nutrition';
import { useStore } from '@/store';
import { cupFor, useTheme } from '@/theme';
import type { CustomFood, Nutrients } from '@/types';
import { Button, Card, EmptyState, Header, IconButton, NumberField, PressableScale, Screen, Segmented, Text, TextField, ToggleRow, goBack, haptic, toast } from '@/ui';

type Basis = 'serving' | 'per100';
type Values = Record<keyof Nutrients, number | null>;

const EMOJIS = ['🍽️', '🥗', '🍲', '🥪', '🍝', '🍛', '🥣', '🍫', '🍪', '🥤', '🧃', '🍕'];
const NUTRIENT_KEYS: (keyof Nutrients)[] = ['kcal', 'protein', 'carbs', 'fat', 'fiber', 'sugar', 'satFat', 'sodium'];

function initialValues(food: CustomFood | undefined, basis: Basis, grams: number): Values {
  const out = {} as Values;
  for (const k of NUTRIENT_KEYS) {
    const v = food?.per100g[k];
    out[k] = v === undefined ? null : Math.round((basis === 'serving' ? (v * grams) / 100 : v) * 10) / 10;
  }
  return out;
}

export default function CustomFoodScreen() {
  const params = useLocalSearchParams<{ id?: string; barcode?: string; name?: string; meal?: string; date?: string }>();
  const id = param(params.id);
  const existing = useStore((s) => (id ? s.customFoods[id] : undefined));
  if (id && (!existing || existing.deleted)) {
    return (
      <Screen header={<Header title="Food" subtitle="Not found" />}>
        <EmptyState emoji="🗂️" title="Food not found" message="It may have been deleted." action="Back to search" onAction={() => goBack('/food/search')} />
      </Screen>
    );
  }
  return <CustomFoodForm key={id ?? 'new'} existing={existing} barcode={param(params.barcode)} name={param(params.name)} meal={param(params.meal)} date={param(params.date)} />;
}

function CustomFoodForm({ existing, barcode, name: initialName, meal, date }: { existing?: CustomFood; barcode?: string; name?: string; meal?: string; date?: string }) {
  const { colors, spacing } = useTheme();
  const winW = useWindowDimensions().width;
  const stackCodes = winW < 440;
  const own = existing?.servings[0];
  const [basis, setBasis] = useState<Basis>(own && Math.abs(own.grams - 100) > 0.01 ? 'serving' : existing ? 'per100' : 'serving');
  const [name, setName] = useState(existing?.name ?? initialName ?? '');
  const [brand, setBrand] = useState(existing?.brand ?? '');
  const [code, setCode] = useState(existing?.barcode ?? barcode ?? '');
  const [emoji, setEmoji] = useState(existing?.emoji ?? '🍽️');
  const [servingLabel, setServingLabel] = useState(own?.label ?? '1 serving');
  const [servingGrams, setServingGrams] = useState<number | null>(own?.grams ?? null);
  const [values, setValues] = useState<Values>(() => initialValues(existing, basis, own?.grams ?? 100));
  const [tried, setTried] = useState(false);
  // "This is a drink": the person's own choice once made (or saved before); until then it follows the
  // serving's name and the food's name (`drinkByDefault`: on when the serving names ml, cl, L or fl oz
  // and the name is not a soup, sauce, oil or cream). An own food saved before this switch existed
  // keeps no flag until it is edited and saved here.
  const [drinkChoice, setDrinkChoice] = useState<boolean | null>(existing?.beverage ?? null);
  const isDrink = drinkChoice ?? drinkByDefault(servingLabel, name);

  const set = (k: keyof Nutrients) => (v: number | null) => setValues((s) => ({ ...s, [k]: v }));
  const factor = basis === 'serving' ? servingGrams ?? 0 : 100;
  const per100 = (v: number | null) => (v === null ? undefined : basis === 'serving' ? toPer100(v, factor) : v);

  const errors = {
    name: !name.trim() ? 'Give it a name' : null,
    kcal: values.kcal === null ? 'Calories are needed' : null,
    grams: basis === 'serving' && !(servingGrams && servingGrams > 0) ? 'Size in grams is needed' : null,
  };
  const macroSum100 = (per100(values.protein) ?? 0) + (per100(values.carbs) ?? 0) + (per100(values.fat) ?? 0);
  const impossible = factor > 0 && macroSum100 > 101 ? 'Per 100 g these macros add up to more than 100 g. Check the serving size.' : null;
  const valid = !errors.name && !errors.kcal && !errors.grams && !impossible;
  const implied = atwaterKcal({ protein: values.protein ?? 0, carbs: values.carbs ?? 0, fat: values.fat ?? 0 });
  const mismatch = values.kcal !== null && implied > 40 && Math.abs(implied - values.kcal) > Math.max(40, values.kcal * 0.25);

  const switchBasis = (b: Basis) => {
    if (b === basis) return;
    // Convert what was typed so the numbers keep meaning the same food.
    const g = servingGrams && servingGrams > 0 ? servingGrams : null;
    if (g) {
      setValues((s) => {
        const out = {} as Values;
        for (const k of NUTRIENT_KEYS) {
          const v = s[k];
          out[k] = v === null ? null : Math.round((b === 'per100' ? (v * 100) / g : (v * g) / 100) * 10) / 10;
        }
        return out;
      });
    }
    setBasis(b);
  };

  const save = () => {
    setTried(true);
    if (!valid) {
      haptic.warn();
      return;
    }
    const n: Nutrients = { kcal: Math.round(per100(values.kcal)! * 100) / 100, protein: per100(values.protein) ?? 0, carbs: per100(values.carbs) ?? 0, fat: per100(values.fat) ?? 0 };
    for (const k of ['fiber', 'sugar', 'satFat', 'sodium'] as const) {
      const v = per100(values[k]);
      if (v !== undefined) n[k] = Math.round(v * 100) / 100;
    }
    const g = servingGrams && servingGrams > 0 ? servingGrams : null;
    const food = useStore.getState().upsert('customFoods', {
      ...(existing ?? {}),
      id: existing?.id,
      name: name.trim(),
      brand: brand.trim() || undefined,
      barcode: code.replace(/\s/g, '') || undefined,
      emoji,
      per100g: n,
      servings: g ? [{ label: servingLabel.trim() || `1 serving`, grams: g }] : [],
      source: 'custom',
      verified: false,
      category: 'custom',
      beverage: isDrink,
    });
    haptic.success();
    if (existing) {
      toast('Food updated');
      // Keep a detail screen underneath in step with the new definition.
      if (useFoodDraft.getState().food?.id === food.id) setFoodDraft(food);
      goBack('/food/search');
      return;
    }
    if (meal) {
      // Opened to log into a meal: log one serving at once (with Undo in its toast) and go back.
      logFood({ food, serving: food.servings[0] ?? GRAM_SERVING, quantity: 1, meal: parseMeal(meal), date: date ?? today() });
      goBack(href('/food/search', { meal, date }));
      return;
    }
    toast(`Saved ${isolateRtl(food.name)} to my foods`, { label: 'Undo', onPress: () => useStore.getState().remove('customFoods', food.id) });
    goBack('/food/search');
  };

  return (
    <Screen
      testID="food-custom-screen"
      header={<Header title={existing ? 'Edit food' : 'Create a food'} subtitle={existing ? 'Changes apply to future logs' : 'From the nutrition label'} />}
      footer={
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          {existing ? (
            <IconButton
              testID="custom-delete"
              accessibilityLabel="Delete food"
              size={48}
              tone="clear"
              style={{ borderWidth: 1.5, borderColor: colors.danger }}
              onPress={() => {
                deleteCustomFood(existing);
                goBack('/food/search');
              }}>
              <Trash2 size={20} color={colors.danger} />
            </IconButton>
          ) : null}
          <Button testID="custom-save" style={{ flex: 1 }} title={existing ? 'Save changes' : meal ? 'Save and log' : 'Save'} onPress={save} />
        </View>
      }>
      <Card style={{ gap: spacing.md }}>
        <TextField testID="custom-name" label="Name" placeholder="e.g. Protein bar, chocolate" value={name} onChangeText={setName} maxLength={80} error={tried ? errors.name : null} autoFocus={!existing && !initialName} />
        {/* A 13-digit barcode needs about 125 px of text plus the field's padding: side by side only on a wide
            screen (at 360 and 390 px its last digits were cut at the field's edge). */}
        <View style={{ flexDirection: stackCodes ? 'column' : 'row', gap: stackCodes ? spacing.md : spacing.sm }}>
          <TextField testID="custom-brand" label="Brand (optional)" value={brand} onChangeText={setBrand} maxLength={60} style={stackCodes ? undefined : { flex: 1 }} />
          <TextField testID="custom-barcode" label="Barcode (optional)" value={code} onChangeText={setCode} keyboardType="number-pad" inputMode="numeric" maxLength={20} style={stackCodes ? undefined : { flex: 1 }} />
        </View>
        <View style={{ gap: 6 }}>
          <Text variant="label" color="textSecondary">
            Icon
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {EMOJIS.map((e) => (
              <PressableScale
                key={e}
                testID={`custom-emoji-${EMOJIS.indexOf(e)}`}
                feedback="select"
                onPress={() => setEmoji(e)}
                accessibilityLabel={`Icon ${e}`}
                accessibilityState={{ selected: e === emoji }}
                style={{
                  width: 44,
                  height: 44,
                  ...cupFor(44),
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1.5,
                  borderColor: e === emoji ? colors.text : 'transparent',
                }}>
                <Text style={{ fontSize: 20, lineHeight: 26 }}>{e}</Text>
              </PressableScale>
            ))}
          </View>
        </View>
      </Card>

      <Card style={{ gap: spacing.md }}>
        <Text variant="h3">Serving</Text>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <TextField testID="custom-serving-label" label="Serving name" placeholder="1 bar" value={servingLabel} onChangeText={setServingLabel} maxLength={40} style={{ flex: 1.3 }} />
          <NumberField
            testID="custom-serving-grams"
            label="Size"
            suffix="g"
            value={servingGrams}
            onChange={setServingGrams}
            style={{ flex: 1 }}
            error={tried ? errors.grams : null}
          />
        </View>
        <ToggleRow testID="custom-drink" title="This is a drink" subtitle="Its amount also counts in Water" value={isDrink} onChange={setDrinkChoice} />
      </Card>

      <Card style={{ gap: spacing.md }}>
        <Text variant="h3">Nutrition</Text>
        <Segmented
          options={[
            { value: 'serving', label: 'Per serving' },
            { value: 'per100', label: 'Per 100 g' },
          ]}
          value={basis}
          onChange={switchBasis}
        />
        <Text variant="caption" color="textSecondary">
          Copy the column from the label.
        </Text>
        <NumberField testID="custom-kcal" label="Calories" suffix="kcal" decimals={0} value={values.kcal} onChange={set('kcal')} error={tried ? errors.kcal : null} />
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <NumberField testID="custom-protein" label="Protein" suffix="g" value={values.protein} onChange={set('protein')} style={{ flex: 1 }} />
          <NumberField testID="custom-carbs" label="Carbs" suffix="g" value={values.carbs} onChange={set('carbs')} style={{ flex: 1 }} />
          <NumberField testID="custom-fat" label="Fat" suffix="g" value={values.fat} onChange={set('fat')} style={{ flex: 1 }} />
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <NumberField testID="custom-fiber" label="Fibre" suffix="g" value={values.fiber} onChange={set('fiber')} style={{ flex: 1 }} />
          <NumberField testID="custom-sugar" label="Sugar" suffix="g" value={values.sugar} onChange={set('sugar')} style={{ flex: 1 }} />
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <NumberField testID="custom-satfat" label="Saturated fat" suffix="g" value={values.satFat} onChange={set('satFat')} style={{ flex: 1 }} />
          <NumberField testID="custom-sodium" label="Sodium" suffix="mg" decimals={0} value={values.sodium} onChange={set('sodium')} style={{ flex: 1 }} />
        </View>
        {impossible ? (
          <Text variant="caption" color="danger">
            {impossible}
          </Text>
        ) : mismatch ? (
          <Text testID="custom-mismatch" variant="caption" color="warningInk">
            The macros add up to about {kcal(implied)} kcal. Labels round, so small gaps are normal; a big one is usually a typo.
          </Text>
        ) : null}
      </Card>
    </Screen>
  );
}
