import { router, useLocalSearchParams } from 'expo-router';
import { Info, Star, Trash2 } from 'lucide-react-native';
import React, { useState } from 'react';
import { View } from 'react-native';

import { detailDrinkNote, waterPointingAt } from '@/features/drinks/rules';
import { updateEntryDirect } from '@/features/food/actions';
import { AmountEditor } from '@/features/food/AmountEditor';
import { UNKNOWN_AI_CONFIDENCE, bandSpread, estimateRange, scaleRange, spreadRange } from '@/features/food/build';
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
import { Button, Card, CupKey, Divider, EmptyState, Header, IconButton, MacroBar, NumberField, PressableScale, Screen, Text, TextField, goBack } from '@/ui';

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

/** The band a new log of an AI food will get: its last band's width (bandSpread), else from its confidence (log.ts, lastEstimate). */
function nextBand(entries: FoodEntry[], foodId: string, kcalNow: number): [number, number] {
  let best: FoodEntry | undefined;
  for (const e of entries) if (e.foodId === foodId && e.confidence !== undefined && (!best || e.loggedAt > best.loggedAt)) best = e;
  const spread = best ? bandSpread(best.kcalRange, best.nutrients.kcal) : undefined;
  return spread !== undefined ? spreadRange(kcalNow, spread) : estimateRange(kcalNow, best?.confidence ?? UNKNOWN_AI_CONFIDENCE);
}

/**
 * The words for a logged estimate's band. Not "likely" and no confidence figure: a quick photo band holds the
 * true calories only about two times in three (the review calls it "rough"), and a model's own confidence is
 * not the chance the band holds the truth. One wording for every estimate, before or after logging.
 */
function estimateBandText([low, high]: [number, number]): string {
  return `Estimate, between ${kcal(low)} and ${kcal(high)} kcal`;
}

/**
 * Under the amount of a drink logged on the water screen: it is also counted in Water, an amount or
 * day saved here moves the water record with it, and a delete here keeps the water.
 */
function DrinkNote({ entryId }: { entryId?: string }) {
  const water = useStore((s) => (entryId ? waterPointingAt(s.water, entryId) : null));
  const units = useStore((s) => s.profile?.units ?? 'metric');
  if (!water) return null;
  return (
    <Text testID="detail-drink-note" variant="caption" color="textSecondary">
      {detailDrinkNote(water, units)}
    </Text>
  );
}

function Missing({ message }: { message: string }) {
  return (
    <Screen header={<Header title="Food" subtitle="Not found" />}>
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

/**
 * The food's name, brand and where its numbers come from. The source's one-sentence explanation
 * sits behind the badge (tap it), so the amount and its button stay in the first view; `note` is
 * shown always (an estimate's range is part of the honest number, not help text).
 */
function Hero({ name, brand, source, explain, note, onEdit }: { name: string; brand?: string; source: Food['source']; explain: string; note?: string; onEdit?: () => void }) {
  const { colors, spacing } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      {/* The food's name at a section title's size: the header above holds the screen's title. */}
      <Text variant="h3" numberOfLines={3} testID="detail-name">
        {name}
      </Text>
      {brand ? (
        <Text variant="label" color="textSecondary" numberOfLines={2}>
          {brand}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: 2 }}>
        <PressableScale
          testID="detail-source-info"
          onPress={() => setOpen((v) => !v)}
          feedback="select"
          hitSlop={9}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={`Data source: ${sourceInfo(source).label}. ${open ? 'Hide' : 'Show'} where the numbers come from`}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <SourceBadge source={source} />
          <Info size={16} color={colors.textSecondary} strokeWidth={1.9} />
        </PressableScale>
        {/* Your own food: its definition is yours to change (the header keeps one action, the favourite). */}
        {onEdit ? (
          <PressableScale testID="detail-edit-food" accessibilityRole="link" accessibilityLabel="Edit this food" onPress={onEdit} hitSlop={6} style={{ marginLeft: 'auto', minHeight: 44, justifyContent: 'center', marginVertical: -9 }}>
            <Text variant="label" color="text" style={{ textDecorationLine: 'underline' }}>
              Edit this food
            </Text>
          </PressableScale>
        ) : null}
      </View>
      {open ? (
        <Text variant="caption" color="textSecondary" testID="detail-source-explain">
          {explain}
        </Text>
      ) : null}
      {note ? (
        <Text variant="caption" color="textSecondary" testID="detail-note">
          {note}
        </Text>
      ) : null}
    </View>
  );
}

/** Calories (large) with the portion beside them, the macro bar and the three macros: the top of the portion card. */
function MacroSummary({ n, kcalNote, range }: { n: Nutrients; kcalNote: string; range?: [number, number] | null }) {
  const { colors, spacing } = useTheme();
  return (
    <View>
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
          {estimateBandText(range)}
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
    </View>
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
      ? nextBand(entries, food.id, n.kcal)
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
            <IconButton
              testID="detail-favorite"
              accessibilityLabel={isFav ? 'Remove from favourites' : 'Add to favourites'}
              onPress={() => useStore.getState().toggleFavoriteFood(food)}>
              <Star size={19} color={isFav ? colors.warning : colors.text} fill={isFav ? colors.warning : 'transparent'} />
            </IconButton>
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
      <Hero
        name={food.name}
        brand={food.brand}
        source={food.source}
        explain={info.explain}
        onEdit={food.source === 'custom' && !food.id.startsWith('meal_') ? () => router.push(href('/food/custom', { id: food.id, meal, date }) as never) : undefined}
      />

      {/* One card for the portion: what it holds, then how much. The amount stays in the first view at 360 x 740. */}
      <Card style={{ gap: spacing.lg }} testID="detail-portion">
        <MacroSummary range={range} n={n} kcalNote={`${portionLabel(serving.label, quantity)}${perGram || serving.label === '100 g' || (quantity === 1 && /\d\s?g\)*$/.test(serving.label)) ? '' : ` · ${Math.round(totalGrams)} g`}`} />
        <Divider />
        <AmountEditor food={food} value={portion} onChange={setPortion} onPendingChange={setGramsInvalid} testIDPrefix="detail" />
      </Card>
      <DrinkNote entryId={entry?.id} />

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
        source={entry.source}
        explain={info.explain}
        note={
          rangeKept && entry.kcalRange
            ? estimateBandText(entry.kcalRange)
            : undefined
        }
      />
      {/* The fields are the numbers: no summary above them repeating the same values. */}
      <Card style={{ gap: spacing.md }}>
        <TextField testID="manual-name" label="Name" value={name} onChangeText={setName} maxLength={80} />
        <NumberField testID="manual-kcal" label="Calories" suffix="kcal" value={kcalV} onChange={setKcal} decimals={0} hint={entry.grams > 0 ? `About ${Math.round(entry.grams)} g` : undefined} />
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <NumberField testID="manual-protein" label="Protein" suffix="g" value={protein} onChange={setProtein} style={{ flex: 1 }} />
          <NumberField testID="manual-carbs" label="Carbs" suffix="g" value={carbs} onChange={setCarbs} style={{ flex: 1 }} />
          <NumberField testID="manual-fat" label="Fat" suffix="g" value={fat} onChange={setFat} style={{ flex: 1 }} />
        </View>
        <MacroBar protein={n.protein * 4} carbs={n.carbs * 4} fat={n.fat * 9} height={6} />
        {implied > 40 && kcalV !== null && Math.abs(implied - kcalV) > Math.max(60, kcalV * 0.25) ? (
          <Text variant="caption" color="textSecondary">
            The macros add up to about {kcal(implied)} kcal. Both can be right (labels round), but it may be worth a second look.
          </Text>
        ) : null}
      </Card>
      <DrinkNote entryId={entry.id} />
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
