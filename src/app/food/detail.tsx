import { router, useLocalSearchParams } from 'expo-router';
import { PenLine, Star, Trash2 } from 'lucide-react-native';
import React, { useState } from 'react';
import { View } from 'react-native';

import { updateEntryDirect } from '@/features/food/actions';
import { AmountEditor } from '@/features/food/AmountEditor';
import { UNKNOWN_AI_CONFIDENCE, estimateRange, scaleRange } from '@/features/food/build';
import { DayStepper, KcalValue, MacroStat, MealPicker, SourceBadge } from '@/features/food/components';
import { useFoodDraft } from '@/features/food/draft';
import { dayPhrase, href, portionLabel, kcal, lastPortions, matchServing, param, parseDate, parseMeal, portionFor, sourceInfo } from '@/features/food/helpers';
import { deleteEntry, logFood } from '@/features/food/log';
import { RequireProfile } from '@/features/food/RequireProfile';
import { MEAL_LABEL, atwaterKcal, formatMacro, scaleNutrients } from '@/lib/nutrition';
import { useStore } from '@/store';
import { useDay, useLive } from '@/store/selectors';
import { cup, useTheme } from '@/theme';
import type { Food, FoodEntry, ISODate, MealType, Nutrients, Serving } from '@/types';
import { Button, Card, CupKey, Divider, EmptyState, Header, IconButton, MacroBar, NumberField, Screen, Text, TextField, goBack } from '@/ui';

export default function FoodDetailRoute() {
  return (
    <RequireProfile>
      <FoodDetail />
    </RequireProfile>
  );
}

function FoodDetail() {
  const params = useLocalSearchParams<{ meal?: string; date?: string; entryId?: string }>();
  const entryId = param(params.entryId);
  const entry = useStore((s) => (entryId ? s.foodEntries[entryId] : undefined));
  const draft = useFoodDraft((s) => s.food);
  // A custom food can be edited or deleted while this screen sits under the
  // edit form, so read its live record instead of the snapshot in the draft.
  const liveCustom = useStore((s) => (draft?.source === 'custom' ? s.customFoods[draft.id] : undefined));

  if (entryId) {
    if (!entry || entry.deleted) return <Missing message="This entry was removed." />;
    if (entry.food) return <FoodEditor key={entry.id} food={entry.food} entry={entry} initialMeal={entry.meal} initialDate={entry.date} />;
    return <ManualEditor key={entry.id} entry={entry} />;
  }
  if (!draft) return <Missing message="Pick a food from search to see its details." />;
  if (liveCustom?.deleted) return <Missing message="This food was deleted." />;
  const food = liveCustom ?? draft;
  return <FoodEditor key={`${food.id}-${liveCustom?.updatedAt ?? ''}`} food={food} initialMeal={parseMeal(params.meal)} initialDate={parseDate(params.date)} />;
}

function latestConfidence(entries: FoodEntry[], foodId: string): number | undefined {
  let best: FoodEntry | undefined;
  for (const e of entries) if (e.foodId === foodId && e.confidence !== undefined && (!best || e.loggedAt > best.loggedAt)) best = e;
  return best?.confidence;
}

function Missing({ message }: { message: string }) {
  return (
    <Screen header={<Header title="Food" />}>
      <EmptyState emoji="🔎" title="Nothing to show" message={message} action="Search foods" onAction={() => router.replace('/food/search' as never)} />
    </Screen>
  );
}

/** "Leaves 640 kcal for today" / "Puts today 120 kcal over budget". */
function ImpactLine({ date, kcalValue, replacing }: { date: ISODate; kcalValue: number; replacing?: FoodEntry }) {
  const { colors, radius, spacing } = useTheme();
  const day = useDay(date);
  const base = day.remaining + (replacing && replacing.date === date && !replacing.deleted ? replacing.nutrients.kcal : 0);
  const after = Math.round(base - kcalValue);
  const over = after < 0;
  return (
    <View
      testID="detail-impact"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        ...cup(radius.tile, 5),
        backgroundColor: colors.surfaceAlt,
      }}>
      <CupKey color={over ? colors.warning : colors.calories} />
      <Text variant="label" color="text" style={{ flex: 1 }}>
        {over ? `Puts ${dayPhrase(date)} ${kcal(-after)} kcal over budget` : `Leaves ${kcal(after)} kcal for ${dayPhrase(date)}`}
      </Text>
    </View>
  );
}

function NutritionFacts({ portion, per100g, showPer100 }: { portion: Nutrients; per100g?: Nutrients; showPer100: boolean }) {
  const { spacing } = useTheme();
  const rows: [string, keyof Nutrients, string, boolean?][] = [
    ['Calories', 'kcal', 'kcal'],
    ['Protein', 'protein', 'g'],
    ['Carbohydrates', 'carbs', 'g'],
    ['Fibre', 'fiber', 'g', true],
    ['Sugar', 'sugar', 'g', true],
    ['Fat', 'fat', 'g'],
    ['Saturated fat', 'satFat', 'g', true],
    ['Sodium', 'sodium', 'mg'],
  ];
  const fmt = (v: number | undefined, unit: string) =>
    v === undefined ? '–' : unit === 'kcal' || unit === 'mg' ? `${kcal(v)} ${unit}` : `${formatMacro(v)} ${unit}`;
  return (
    <Card testID="detail-facts">
      <View style={{ flexDirection: 'row', paddingBottom: spacing.sm }}>
        <Text variant="h3" style={{ flex: 1 }}>
          Nutrition facts
        </Text>
        <Text variant="caption" color="textSecondary" style={{ width: 84, textAlign: 'right' }}>
          This portion
        </Text>
        {showPer100 ? (
          <Text variant="caption" color="textSecondary" style={{ width: 76, textAlign: 'right' }}>
            Per 100 g
          </Text>
        ) : null}
      </View>
      {rows
        .filter(([, key]) => portion[key] !== undefined || per100g?.[key] !== undefined)
        .map(([label, key, unit, sub]) => (
          <View key={key}>
            <Divider />
            <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 36 }}>
              <Text variant={sub ? 'body' : 'bodyStrong'} color={sub ? 'textSecondary' : 'text'} style={{ flex: 1, paddingLeft: sub ? spacing.md : 0 }}>
                {label}
              </Text>
              <Text variant="body" tabular style={{ width: 84, textAlign: 'right' }}>
                {fmt(portion[key], unit)}
              </Text>
              {showPer100 ? (
                <Text variant="body" color="textSecondary" tabular style={{ width: 76, textAlign: 'right' }}>
                  {fmt(per100g?.[key], unit)}
                </Text>
              ) : null}
            </View>
          </View>
        ))}
    </Card>
  );
}

function Hero({ name, brand, source, explain }: { name: string; brand?: string; emoji?: string; source: Food['source']; explain: string }) {
  return (
    <View>
      <View style={{ gap: 6 }}>
        <Text variant="h2" numberOfLines={3} testID="detail-name">
          {name}
        </Text>
        {brand ? (
          <Text variant="label" color="textSecondary">
            {brand}
          </Text>
        ) : null}
        <SourceBadge source={source} />
        <Text variant="caption" color="textTertiary">
          {explain}
        </Text>
      </View>
    </View>
  );
}

function MacroSummary({ n, kcalNote, range }: { n: Nutrients; kcalNote: string; range?: [number, number] | null }) {
  const { colors, spacing } = useTheme();
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.md }}>
        <View testID="detail-kcal">
          <KcalValue value={n.kcal} variant="numXL" color="caloriesInk" />
        </View>
        <Text variant="caption" color="textSecondary" align="right" style={{ flexShrink: 1, paddingBottom: 6 }} numberOfLines={2}>
          {kcalNote}
        </Text>
      </View>
      {range ? (
        <Text variant="caption" color="textSecondary" tabular testID="detail-kcal-range">
          Likely between {kcal(range[0])} and {kcal(range[1])} kcal
        </Text>
      ) : null}
      <View style={{ marginTop: spacing.md }}>
        <MacroBar protein={n.protein * 4} carbs={n.carbs * 4} fat={n.fat * 9} />
      </View>
      <View style={{ flexDirection: 'row', gap: spacing.lg, marginTop: spacing.md }}>
        <MacroStat label="Protein" value={n.protein} color={colors.protein} />
        <MacroStat label="Carbs" value={n.carbs} color={colors.carbs} />
        <MacroStat label="Fat" value={n.fat} color={colors.fat} />
      </View>
    </Card>
  );
}

function FoodEditor({ food, entry, initialMeal, initialDate }: { food: Food; entry?: FoodEntry; initialMeal: MealType; initialDate: ISODate }) {
  const { colors, spacing } = useTheme();
  const entries = useLive('foodEntries');
  const isFav = useStore((s) => s.favoriteFoodIds.includes(food.id));
  const [portion, setPortion] = useState<{ serving: Serving; quantity: number }>(() => {
    if (entry) return { serving: matchServing(food, entry.servingLabel, entry.quantity > 0 ? entry.grams / entry.quantity : entry.grams), quantity: entry.quantity };
    return portionFor(food, lastPortions(entries));
  });
  const [meal, setMeal] = useState(initialMeal);
  const [date, setDate] = useState(initialDate);
  const [gramsInvalid, setGramsInvalid] = useState(false);
  const { serving, quantity } = portion;
  const totalGrams = serving.grams * quantity;
  const n = scaleNutrients(food.per100g, totalGrams);
  const info = sourceInfo(food.source);
  const perGram = serving.label === '1 g';
  // An estimate keeps showing as one: the entry's own range scaled to the amount, or the band a new log will get.
  const range = entry?.kcalRange
    ? entry.nutrients.kcal > 0
      ? scaleRange(entry.kcalRange, n.kcal / entry.nutrients.kcal)
      : null
    : food.source === 'ai'
      ? estimateRange(n.kcal, latestConfidence(entries, food.id) ?? UNKNOWN_AI_CONFIDENCE)
      : null;

  const save = () => {
    logFood({ food, serving, quantity, meal, date, entryId: entry?.id });
    goBack(href('/diary', { date }));
  };

  return (
    <Screen
      testID="food-detail-screen"
      header={
        <Header
          title={entry ? 'Edit entry' : 'Add food'}
          subtitle={`${MEAL_LABEL[meal]} · ${dayPhrase(date).replace(/^./, (c) => c.toUpperCase())}`}
          right={
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              {food.source === 'custom' && !food.id.startsWith('meal_') ? (
                <IconButton testID="detail-edit-food" accessibilityLabel="Edit this food" onPress={() => router.push(href('/food/custom', { id: food.id, meal, date }) as never)}>
                  <PenLine size={18} color={colors.text} />
                </IconButton>
              ) : null}
              <IconButton
                testID="detail-favorite"
                accessibilityLabel={isFav ? 'Remove from favourites' : 'Add to favourites'}
                onPress={() => useStore.getState().toggleFavoriteFood(food)}>
                <Star size={19} color={isFav ? colors.warning : colors.text} fill={isFav ? colors.warning : 'transparent'} />
              </IconButton>
            </View>
          }
        />
      }
      footer={
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          {entry ? (
            <IconButton
              testID="detail-delete"
              accessibilityLabel="Delete entry"
              size={48}
              tone="clear"
              style={{ borderWidth: 1.5, borderColor: colors.danger }}
              onPress={() => {
                deleteEntry(entry);
                goBack(href('/diary', { date: entry.date }));
              }}>
              <Trash2 size={20} color={colors.danger} strokeWidth={1.9} />
            </IconButton>
          ) : null}
          <Button
            testID="detail-save"
            style={{ flex: 1 }}
            title={entry ? 'Save changes' : `Add to ${MEAL_LABEL[meal].toLowerCase()}`}
            disabled={!(totalGrams > 0) || gramsInvalid}
            onPress={save}
          />
        </View>
      }>
      <Hero name={food.name} brand={food.brand} emoji={food.emoji} source={food.source} explain={info.explain} />

      <MacroSummary range={range} n={n} kcalNote={`${portionLabel(serving.label, quantity)}${perGram || serving.label === '100 g' || (quantity === 1 && /\d\s?g\)*$/.test(serving.label)) ? '' : ` · ${Math.round(totalGrams)} g`}`} />

      <Card>
        <Text variant="h3">Amount</Text>
        <AmountEditor food={food} value={portion} onChange={setPortion} onPendingChange={setGramsInvalid} testIDPrefix="detail" />
      </Card>

      <ImpactLine date={date} kcalValue={n.kcal} replacing={entry} />

      <Card style={{ gap: spacing.md }}>
        <Text variant="h3">Meal and day</Text>
        <MealPicker value={meal} onChange={setMeal} testIDPrefix="detail-meal" />
        <DayStepper value={date} onChange={setDate} testIDPrefix="detail-day" />
      </Card>

      <NutritionFacts portion={n} per100g={food.per100g} showPer100 />
    </Screen>
  );
}

/** AI estimates and quick adds have no food definition: edit the numbers themselves. */
function ManualEditor({ entry }: { entry: FoodEntry }) {
  const { colors, spacing } = useTheme();
  const [name, setName] = useState(entry.name);
  const [kcalV, setKcal] = useState<number | null>(Math.round(entry.nutrients.kcal));
  const [protein, setProtein] = useState<number | null>(entry.nutrients.protein || null);
  const [carbs, setCarbs] = useState<number | null>(entry.nutrients.carbs || null);
  const [fat, setFat] = useState<number | null>(entry.nutrients.fat || null);
  const [meal, setMeal] = useState(entry.meal);
  const [date, setDate] = useState(entry.date);
  const info = sourceInfo(entry.source);
  const n: Nutrients = { kcal: kcalV ?? 0, protein: protein ?? 0, carbs: carbs ?? 0, fat: fat ?? 0 };
  const implied = atwaterKcal(n);
  const rangeKept = entry.kcalRange && Math.round(n.kcal) === Math.round(entry.nutrients.kcal);

  return (
    <Screen
      testID="food-detail-screen"
      header={<Header title="Edit entry" subtitle={`${MEAL_LABEL[meal]} · ${dayPhrase(date).replace(/^./, (c) => c.toUpperCase())}`} />}
      footer={
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <IconButton
            testID="detail-delete"
            accessibilityLabel="Delete entry"
            size={48}
            tone="clear"
            style={{ borderWidth: 1.5, borderColor: colors.danger }}
            onPress={() => {
              deleteEntry(entry);
              goBack(href('/diary', { date: entry.date }));
            }}>
            <Trash2 size={20} color={colors.danger} strokeWidth={1.9} />
          </IconButton>
          <Button
            testID="detail-save"
            style={{ flex: 1 }}
            title="Save changes"
            disabled={kcalV === null || kcalV < 0}
            onPress={() => {
              updateEntryDirect(entry, { name, nutrients: n, meal, date });
              goBack(href('/diary', { date }));
            }}
          />
        </View>
      }>
      <Hero
        name={name || entry.name}
        emoji={entry.emoji}
        source={entry.source}
        explain={
          rangeKept && entry.kcalRange
            ? `Likely between ${kcal(entry.kcalRange[0])} and ${kcal(entry.kcalRange[1])} kcal${entry.confidence !== undefined ? ` (${Math.round(entry.confidence * 100)}% confidence)` : ''}. Adjust if you know better.`
            : info.explain
        }
      />
      <MacroSummary n={n} kcalNote={entry.grams > 0 ? `about ${Math.round(entry.grams)} g` : entry.servingLabel} />
      <Card style={{ gap: spacing.md }}>
        <TextField testID="manual-name" label="Name" value={name} onChangeText={setName} maxLength={80} />
        <NumberField testID="manual-kcal" label="Calories" suffix="kcal" value={kcalV} onChange={setKcal} decimals={0} />
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <NumberField testID="manual-protein" label="Protein" suffix="g" value={protein} onChange={setProtein} style={{ flex: 1 }} />
          <NumberField testID="manual-carbs" label="Carbs" suffix="g" value={carbs} onChange={setCarbs} style={{ flex: 1 }} />
          <NumberField testID="manual-fat" label="Fat" suffix="g" value={fat} onChange={setFat} style={{ flex: 1 }} />
        </View>
        {implied > 40 && kcalV !== null && Math.abs(implied - kcalV) > Math.max(60, kcalV * 0.25) ? (
          <Text variant="caption" color="textSecondary">
            The macros add up to about {kcal(implied)} kcal. Both can be right (labels round), but it may be worth a second look.
          </Text>
        ) : null}
      </Card>
      <ImpactLine date={date} kcalValue={n.kcal} replacing={entry} />
      <Card style={{ gap: spacing.md }}>
        <Text variant="h3">Meal and day</Text>
        <MealPicker value={meal} onChange={setMeal} testIDPrefix="detail-meal" />
        <DayStepper value={date} onChange={setDate} testIDPrefix="detail-day" />
      </Card>
      {entry.nutrients.fiber !== undefined || entry.nutrients.sodium !== undefined ? (
        <NutritionFacts portion={{ ...entry.nutrients, ...n }} showPer100={false} />
      ) : null}
    </Screen>
  );
}
