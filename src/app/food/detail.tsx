import { router, useLocalSearchParams } from 'expo-router';
import { Info } from 'lucide-react-native';
import React, { useState } from 'react';
import { AccessibilityInfo, Platform, View } from 'react-native';

import { detailWaterAdds, diaryDrink, diaryDrinkMl } from '@/features/drinks/diary';
import { detailDrinkNote, pairEditProblem, waterFor, waterPointingAt, type PairEditProblem } from '@/features/drinks/rules';
import { updateEntryDirect } from '@/features/food/actions';
import { AmountEditor } from '@/features/food/AmountEditor';
import { UNKNOWN_AI_CONFIDENCE, bandSpread, estimateRange, scaleRange, spreadRange } from '@/features/food/build';
import { DayStepper, KcalValue, MacroStat, MealPicker, SourceBadge } from '@/features/food/components';
import { displayFoodName } from '@/features/food/displayName';
import { useFoodDraft } from '@/features/food/draft';
import { FavoriteStar } from '@/features/food/FavoriteStar';
import { toggleFoodFavorite } from '@/features/food/favoriteActions';
import { dayPhrase, href, portionLabel, kcal, labelAmount, lastPortions, matchServing, param, parseDate, parseMeal, portionFor, sourceInfo, sourceKindOf, valuesUpdated, type SourceKind } from '@/features/food/helpers';
import { deleteEntry, logFood } from '@/features/food/log';
import { mealPickAdvice, pickMovesAtOnce } from '@/features/food/mealMove';
import { AskLine, askTie } from '@/features/food/AskLine';
import { editedKcalAsks, kcalAsk, kcalSaveTitle, portionAsk, portionAsks, portionTitle, pressFor, waitsFor } from '@/features/food/softCheck';
import { spokenUnits } from '@/lib/spokenUnits';
import { RequireProfile } from '@/features/food/RequireProfile';
import { isolateRtl } from '@/lib/bidi';
import { MEAL_LABEL, atwaterKcal, formatMacro, scaleNutrients } from '@/lib/nutrition';
import { useStore } from '@/store';
import { useToday } from '@/store/clock';
import { useDay, useLive } from '@/store/selectors';
import { cup, useLargeText, useTheme } from '@/theme';
import type { Food, FoodEntry, ISODate, MealType, Nutrients, Serving, WaterEntry } from '@/types';
import { Button, Card, CupKey, Divider, EmptyState, Header, MacroBar, NumberField, numberTextProblem, PressableScale, Screen, Text, TextField, goBack, haptic } from '@/ui';

/** Hidden from sight, kept for screen readers: the polite live region that says why Add or Save waited. */
const SPOKEN_ONLY = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', opacity: 0 } as const;

/**
 * The soft check's second press (`pressFor`, @/features/food/softCheck) as a screen holds it: the amount the last
 * press asked about, a press that stores or asks (saying why without moving the focus: announced natively, through
 * the polite live region `spoken` on the web), and that region.
 */
function useSecondPress() {
  const [askedFor, setAskedFor] = useState<number | null>(null);
  const [spoken, setSpoken] = useState('');
  const press = (asks: boolean, amount: number, line: string, store: () => void) => {
    if (pressFor(asks, amount, askedFor) === 'add') return store();
    setAskedFor(amount);
    haptic.warn();
    const said = spokenUnits(line);
    if (Platform.OS !== 'web') return AccessibilityInfo.announceForAccessibility(said);
    // Emptied first, so the same words after a second question are still a change the region reads out.
    setSpoken('');
    setTimeout(() => setSpoken(said), 150);
  };
  const region =
    Platform.OS === 'web' ? (
      <Text testID="detail-announce" style={SPOKEN_ONLY} {...({ 'aria-live': 'polite', 'aria-atomic': true } as object)}>
        {spoken}
      </Text>
    ) : null;
  return { askedFor, press, region };
}

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
 * A drink also counted in Water: its live water record of either origin (logged on Water, or logged
 * here as food), and why the edit on screen cannot be saved, or null. Only a drink logged on the water
 * screen can be refused (a future day, more than one water record holds); Save is off while there is
 * one. A drink logged in the diary is never refused: its water follows the entry.
 */
function usePairedDrink(entry: FoodEntry | undefined, after: { grams: number; date: ISODate }): { water: WaterEntry | null; problem: PairEditProblem | null } {
  const water = useStore((s) => (entry ? (waterFor(s.water, entry.id)?.water ?? null) : null));
  const fromWater = useStore((s) => (entry ? waterPointingAt(s.water, entry.id) : null));
  const units = useStore((s) => s.profile?.units ?? 'metric');
  const todayDate = useToday();
  const problem = fromWater && entry ? pairEditProblem(fromWater, entry, after, todayDate, units) : null;
  return { water, problem };
}

/**
 * Before Add, under the amount: "Also adds 500 ml to Water." for a drink (`diaryDrink`, following the
 * amount on screen); nothing for a food that is not a drink, or with "Count drinks from the diary" off.
 */
function WaterAdds({ food, serving, quantity }: { food: Food; serving: Serving; quantity: number }) {
  const profile = useStore((s) => s.profile);
  const text = detailWaterAdds(diaryDrink({ food, servingLabel: serving.label, quantity, grams: serving.grams * quantity }, profile), profile?.units ?? 'metric');
  if (!text) return null;
  return (
    <Text testID="detail-water-adds" variant="caption" color="textSecondary">
      {text}
    </Text>
  );
}

/**
 * Under the amount of a drink logged on the water screen: it is also counted in Water, an amount or
 * day saved here moves the water record with it, and a delete here keeps the water. An amount the
 * pair cannot follow says why here, under the amount it is about (Save waits).
 * A drink logged here in the diary names the volume of the amount on screen (`shown`, the same
 * `diaryDrinkMl` the save recomputes its water with), as the Add line does; else the stored volume.
 */
function DrinkNote({ water, problem, hasAmount, shown }: { water: WaterEntry | null; problem: PairEditProblem | null; hasAmount: boolean; shown?: { food: Food; serving: Serving; quantity: number } }) {
  const units = useStore((s) => s.profile?.units ?? 'metric');
  if (!water) return null;
  const fromDiary = !!water.fromEntryId && !water.foodEntryId;
  const ml = fromDiary && shown ? (diaryDrinkMl({ food: shown.food, servingLabel: shown.serving.label, quantity: shown.quantity, grams: shown.serving.grams * shown.quantity }) ?? water.ml) : water.ml;
  return (
    <View style={{ gap: 4 }}>
      <Text testID="detail-drink-note" variant="caption" color="textSecondary">
        {detailDrinkNote({ ...water, ml }, units, hasAmount)}
      </Text>
      {problem?.field === 'amount' ? <PairProblem text={problem.text} /> : null}
    </View>
  );
}

/** One neutral line beside the control an edit of a paired drink cannot use (a future day, more than 10,000 ml). */
function PairProblem({ text }: { text: string }) {
  return (
    <Text testID="detail-drink-problem" variant="caption" color="warningInk">
      {text}
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

/** "Leaves 640 kcal for today" / "Puts today 120 kcal above the budget". */
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
        {over ? `Puts ${dayPhrase(date)} ${kcal(-after)} kcal above the budget` : `Leaves ${kcal(after)} kcal for ${dayPhrase(date)}`}
      </Text>
    </View>
  );
}

/**
 * `whole`: an estimate (an AI food, or an entry with a range) gives its grams whole, never a false tenth ("47 g", not "46.5 g").
 * Every gram row is whole grams in both columns: protein, carbohydrates and fat as the stats above them show them
 * ("8 g" in both places, never "8 g" and "7.9 g"), and the lines under them (fibre, sugar, saturated fat) like
 * their parents, so one table has one precision ("Carbohydrates 41 g", "Fibre 6 g"). Under the quick add's own
 * fields (`asStats` false) every gram row is said as typed.
 */
function NutritionFacts({
  portion,
  per100g,
  showPer100,
  whole = false,
  asStats = true,
}: {
  portion: Nutrients;
  per100g?: Nutrients;
  showPer100: boolean;
  whole?: boolean;
  /** False under the quick add's own number fields, which show a macro as typed ("7.9"): the facts then say it the same way. */
  asStats?: boolean;
}) {
  const { spacing } = useTheme();
  // With large text each row's name has a line of its own and its values share the line under it in two equal
  // columns, so a figure never runs into the next one nor parts from its unit.
  const big = useLargeText();
  const portionCol = big ? { flex: 1 } : { width: 84 };
  const per100Col = big ? { flex: 1 } : { width: 76 };
  // [label, key, unit, a line under a macro]
  const rows: [string, keyof Nutrients, string, boolean][] = [
    ['Calories', 'kcal', 'kcal', false],
    ['Protein', 'protein', 'g', false],
    ['Carbohydrates', 'carbs', 'g', false],
    ['Fibre', 'fiber', 'g', true],
    ['Sugar', 'sugar', 'g', true],
    ['Fat', 'fat', 'g', false],
    ['Saturated fat', 'satFat', 'g', true],
    ['Sodium', 'sodium', 'mg', false],
  ];
  const fmt = (v: number | undefined, unit: string) =>
    v === undefined ? '–' : unit === 'kcal' || unit === 'mg' ? `${kcal(v)} ${unit}` : `${whole || asStats ? Math.round(v) : formatMacro(v)} ${unit}`;
  return (
    <Card testID="detail-facts">
      <View style={{ flexDirection: 'row', flexWrap: big ? 'wrap' : 'nowrap', paddingBottom: spacing.sm, columnGap: big ? spacing.md : 0 }}>
        <Text variant="h3" style={big ? { flexBasis: '100%', marginBottom: spacing.xs } : { flex: 1 }}>
          Nutrition facts
        </Text>
        <Text variant="caption" color="textSecondary" style={[portionCol, { textAlign: 'right' }]}>
          This portion
        </Text>
        {showPer100 ? (
          <Text variant="caption" color="textSecondary" style={[per100Col, { textAlign: 'right' }]}>
            Per 100 g
          </Text>
        ) : null}
      </View>
      {rows
        .filter(([, key]) => portion[key] !== undefined || per100g?.[key] !== undefined)
        .map(([label, key, unit, sub]) => (
          <View key={key}>
            <Divider />
            <View style={{ flexDirection: 'row', flexWrap: big ? 'wrap' : 'nowrap', alignItems: 'center', minHeight: 36, columnGap: big ? spacing.md : 0, paddingVertical: big ? spacing.xs : 0 }}>
              <Text variant={sub ? 'body' : 'bodyStrong'} color={sub ? 'textSecondary' : 'text'} style={[big ? { flexBasis: '100%' } : { flex: 1 }, { paddingLeft: sub ? spacing.md : 0 }]}>
                {label}
              </Text>
              <Text variant="body" tabular style={[portionCol, { textAlign: 'right' }]}>
                {fmt(portion[key], unit)}
              </Text>
              {showPer100 ? (
                <Text variant="body" color="textSecondary" tabular style={[per100Col, { textAlign: 'right' }]}>
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
function Hero({ name, brand, source, explain, note, onEdit }: { name: string; brand?: string; source: SourceKind; explain: string; note?: string; onEdit?: () => void }) {
  const { colors, spacing } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      {/* The food's name at a section title's size: the header above holds the screen's title. */}
      <Text variant="h3" numberOfLines={3} testID="detail-name">
        {isolateRtl(name)}
      </Text>
      {brand ? (
        <Text variant="label" color="textSecondary" numberOfLines={2}>
          {isolateRtl(brand)}
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

/** Said under the calories when an entry opens at other calories than it stores (`valuesUpdated`). */
const VALUES_UPDATED = "This food's values were updated since you logged it. Saving uses the new ones.";

/** The least room the portion's words take beside the calories before they go under them: two lines of about 16 letters. */
const NOTE_ROOM = 104;

/** Calories (large) with the portion beside them, the macro bar and the three macros: the top of the portion card. */
function MacroSummary({ n, kcalNote, range, updated }: { n: Nutrients; kcalNote: string; range?: [number, number] | null; updated?: boolean }) {
  const { colors, spacing } = useTheme();
  // With large text the portion's words go under the figure on a line of their own, and the macros wrap. So do
  // they when the figure leaves them less than `NOTE_ROOM` beside it (a four-figure portion at 320 px), so the
  // words are never cut at the card's edge.
  const big = useLargeText();
  const [rowW, setRowW] = useState(0);
  const [figureW, setFigureW] = useState(0);
  const stack = big || (rowW > 0 && figureW > 0 && rowW - figureW - spacing.md < NOTE_ROOM);
  return (
    <View>
      <View
        onLayout={(e) => setRowW(Math.round(e.nativeEvent.layout.width))}
        style={{ flexDirection: stack ? 'column' : 'row', alignItems: stack ? 'flex-start' : 'flex-end', justifyContent: 'space-between', gap: stack ? spacing.xs : spacing.md }}>
        <View testID="detail-kcal" onLayout={(e) => setFigureW(Math.round(e.nativeEvent.layout.width))}>
          <KcalValue value={n.kcal} variant="numXL" color="caloriesInk" />
        </View>
        <Text variant="caption" color="textSecondary" align={stack ? 'left' : 'right'} style={{ flexShrink: 1, paddingBottom: stack ? 0 : 6 }} numberOfLines={stack ? undefined : 2}>
          {kcalNote}
        </Text>
      </View>
      {range ? (
        <Text variant="caption" color="textSecondary" tabular testID="detail-kcal-range">
          {estimateBandText(range)}
        </Text>
      ) : null}
      {updated ? (
        <Text variant="caption" color="textSecondary" testID="detail-values-updated">
          {VALUES_UPDATED}
        </Text>
      ) : null}
      <View style={{ marginTop: spacing.md }}>
        <MacroBar protein={n.protein * 4} carbs={n.carbs * 4} fat={n.fat * 9} />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.lg, rowGap: spacing.sm, marginTop: spacing.md }}>
        <MacroStat label="Protein" value={n.protein} color={colors.protein} />
        <MacroStat label="Carbs" value={n.carbs} color={colors.carbs} />
        <MacroStat label="Fat" value={n.fat} color={colors.fat} />
      </View>
    </View>
  );
}

function FoodEditor({ food, entry, initialMeal, initialDate }: { food: Food; entry?: FoodEntry; initialMeal: MealType; initialDate: ISODate }) {
  const { spacing } = useTheme();
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
  const paired = usePairedDrink(entry, { grams: totalGrams, date });
  const n = scaleNutrients(food.per100g, totalGrams);
  // The sentence behind the badge names this food's own record (USDA, the national database, or none).
  const info = sourceInfo(food.source, food);
  const perGram = serving.label === '1 g';
  // An estimate keeps showing as one: the entry's own range scaled to the amount, or the band a new log will get.
  const range = entry?.kcalRange
    ? entry.nutrients.kcal > 0
      ? scaleRange(entry.kcalRange, n.kcal / entry.nutrients.kcal)
      : null
    : food.source === 'ai'
      ? nextBand(entries, food.id, n.kcal)
      : null;

  // A property of the stored entry, not of the amount being chosen: it stays while the amount changes.
  const updated = valuesUpdated(food, entry);

  // A portion above what one plausible entry holds is stored on a second press (`portionAsks`): the first stores
  // nothing, ties a line to the grams field and names the amount on the button. Another amount asks again.
  const second = useSecondPress();
  const gramsKey = Math.round(totalGrams * 10) / 10;
  const asks = portionAsks(food, totalGrams, n.kcal, entry?.grams);
  const waiting = waitsFor(asks, gramsKey, second.askedFor);
  const save = () =>
    second.press(asks, gramsKey, portionAsk(totalGrams, !!entry), () => {
      logFood({ food, serving, quantity, meal, date, entryId: entry?.id });
      goBack(href('/diary', { date }));
    });
  // Moving an entry is one tap (D3-08: diary, the row, the meal = 3 from Today): in Edit entry, another meal
  // picked while nothing else has changed saves at once and goes back, with the save's toast and Undo. With
  // the amount or the day changed too, the meal is only chosen, and Save writes everything together. The line
  // under the meal choice says which of the two a pick does now, before it is made (`mealPickAdvice`, WCAG 3.2.2).
  const moves = pickMovesAtOnce(entry, { date, quantity, servingLabel: serving.label, savable: totalGrams > 0 && !gramsInvalid && !paired.problem });
  const pickMeal = (m: MealType) => {
    setMeal(m);
    if (!moves || !entry || m === entry.meal) return;
    logFood({ food, serving, quantity, meal: m, date, entryId: entry.id });
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
            // Outline when off, filled primaryInk when on (never the amber of "over"); a toast with Undo.
            <FavoriteStar testID="detail-favorite" size={44} tone="surface" offColor="text" on={isFav} name={displayFoodName(food)} onPress={() => toggleFoodFavorite(food)} />
          }
        />
      }
      footer={
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          {entry ? (
            // The kit's danger button, its word drawn (one delete per screen; the entry comes back with the toast's Undo).
            <Button
              testID="detail-delete"
              title="Delete"
              accessibilityLabel="Delete entry"
              variant="danger"
              full={false}
              onPress={() => {
                deleteEntry(entry);
                goBack(href('/diary', { date: entry.date }));
              }}
            />
          ) : null}
          <Button
            testID="detail-save"
            style={{ flex: 1 }}
            title={waiting ? portionTitle(!!entry, meal, totalGrams) : entry ? 'Save changes' : `Add to ${MEAL_LABEL[meal].toLowerCase()}`}
            disabled={!(totalGrams > 0) || gramsInvalid || !!paired.problem}
            onPress={save}
          />
        </View>
      }>
      <Hero
        // Drawn without the reference list's capitals; stored as it is.
        name={displayFoodName(food)}
        brand={food.brand}
        source={sourceKindOf(food)}
        explain={info.explain}
        onEdit={food.source === 'custom' && !food.id.startsWith('meal_') ? () => router.push(href('/food/custom', { id: food.id, meal, date }) as never) : undefined}
      />

      {/* One card for the portion: what it holds, then how much. The amount stays in the first view at 360 x 740. */}
      <Card style={{ gap: spacing.lg }} testID="detail-portion">
        <MacroSummary range={range} n={n} updated={updated} kcalNote={`${portionLabel(serving.label, quantity)}${perGram || labelAmount(serving.label) !== null || (quantity === 1 && /\d\s?g\)*$/.test(serving.label)) ? '' : ` · ${Math.round(totalGrams)} g`}`} />
        <Divider />
        <AmountEditor food={food} value={portion} onChange={setPortion} onPendingChange={setGramsInvalid} testIDPrefix="detail" ask={waiting ? portionAsk(totalGrams, !!entry) : null} />
      </Card>
      <DrinkNote water={paired.water} problem={paired.problem} hasAmount shown={{ food, serving, quantity }} />
      {entry ? null : <WaterAdds food={food} serving={serving} quantity={quantity} />}

      <ImpactLine date={date} kcalValue={n.kcal} replacing={entry} />

      <Card style={{ gap: spacing.md }}>
        <Text variant="h3">Meal and day</Text>
        <MealPicker value={meal} onChange={pickMeal} testIDPrefix="detail-meal" advice={entry ? mealPickAdvice(moves) : undefined} />
        <DayStepper value={date} onChange={setDate} testIDPrefix="detail-day" />
        {paired.problem?.field === 'day' ? <PairProblem text={paired.problem.text} /> : null}
      </Card>

      <NutritionFacts portion={n} per100g={food.per100g} showPer100 whole={!!range} />
      {second.region}
    </Screen>
  );
}

/** AI estimates and quick adds have no food definition: edit the numbers themselves. */
function ManualEditor({ entry }: { entry: FoodEntry }) {
  const { spacing } = useTheme();
  const [name, setName] = useState(entry.name);
  const [kcalV, setKcal] = useState<number | null>(Math.round(entry.nutrients.kcal));
  const [protein, setProtein] = useState<number | null>(entry.nutrients.protein || null);
  const [carbs, setCarbs] = useState<number | null>(entry.nutrients.carbs || null);
  const [fat, setFat] = useState<number | null>(entry.nutrients.fat || null);
  // The macros as typed: a refused minus empties a value while its field still shows it with its words, so Save
  // waits rather than store 0 over it (`numberTextProblem`).
  const [macroTyped, setMacroTyped] = useState<{ protein?: string; carbs?: string; fat?: string }>({});
  const macroProblem = ([['protein', protein], ['carbs', carbs], ['fat', fat]] as const).some(([k, v]) => v === null && !!numberTextProblem(macroTyped[k] ?? ''));
  const [meal, setMeal] = useState(entry.meal);
  const [date, setDate] = useState(entry.date);
  const paired = usePairedDrink(entry, { grams: entry.grams, date });
  const info = sourceInfo(entry.source, entry.food);
  const n: Nutrients = { kcal: kcalV ?? 0, protein: protein ?? 0, carbs: carbs ?? 0, fat: fat ?? 0 };
  const implied = atwaterKcal(n);
  const rangeKept = entry.kcalRange && Math.round(n.kcal) === Math.round(entry.nutrients.kcal);
  // Calories changed to more than one plausible entry holds are saved on a second press, as quick add's are.
  const second = useSecondPress();
  const kcalAsks = editedKcalAsks(kcalV, entry.nutrients.kcal);
  const waiting = waitsFor(kcalAsks, kcalV, second.askedFor);
  const askId = `manual-kcal-ask-${entry.id}`;

  return (
    <Screen
      testID="food-detail-screen"
      header={<Header title="Edit entry" subtitle={`${MEAL_LABEL[meal]} · ${dayPhrase(date).replace(/^./, (c) => c.toUpperCase())}`} />}
      footer={
        <View style={{ flexDirection: 'row', gap: spacing.md }}>
          <Button
            testID="detail-delete"
            title="Delete"
            accessibilityLabel="Delete entry"
            variant="danger"
            full={false}
            onPress={() => {
              deleteEntry(entry);
              goBack(href('/diary', { date: entry.date }));
            }}
          />
          <Button
            testID="detail-save"
            style={{ flex: 1 }}
            title={waiting && kcalV !== null ? kcalSaveTitle(kcalV) : 'Save changes'}
            disabled={kcalV === null || kcalV < 0 || macroProblem || !!paired.problem}
            onPress={() =>
              second.press(kcalAsks, kcalV ?? 0, kcalAsk(kcalV ?? 0, true), () => {
                updateEntryDirect(entry, { name, nutrients: n, meal, date });
                goBack(href('/diary', { date }));
              })
            }
          />
        </View>
      }>
      <Hero
        name={name || entry.name}
        source={sourceKindOf(entry)}
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
        <NumberField
          testID="manual-kcal"
          label="Calories"
          suffix="kcal"
          value={kcalV}
          onChange={setKcal}
          decimals={0}
          hint={entry.grams > 0 ? `About ${Math.round(entry.grams)} g` : undefined}
          {...(waiting ? askTie(askId, kcalAsk(kcalV ?? 0, true)) : null)}
        />
        {waiting ? <AskLine id={askId} line={kcalAsk(kcalV ?? 0, true)} testID="manual-kcal-ask" /> : null}
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <NumberField
            testID="manual-protein"
            label="Protein"
            suffix="g"
            value={protein}
            onChange={(v, t) => {
              setProtein(v);
              setMacroTyped((x) => ({ ...x, protein: t }));
            }}
            style={{ flex: 1 }}
          />
          <NumberField
            testID="manual-carbs"
            label="Carbs"
            suffix="g"
            value={carbs}
            onChange={(v, t) => {
              setCarbs(v);
              setMacroTyped((x) => ({ ...x, carbs: t }));
            }}
            style={{ flex: 1 }}
          />
          <NumberField
            testID="manual-fat"
            label="Fat"
            suffix="g"
            value={fat}
            onChange={(v, t) => {
              setFat(v);
              setMacroTyped((x) => ({ ...x, fat: t }));
            }}
            style={{ flex: 1 }}
          />
        </View>
        <MacroBar protein={n.protein * 4} carbs={n.carbs * 4} fat={n.fat * 9} height={6} />
        {implied > 40 && kcalV !== null && Math.abs(implied - kcalV) > Math.max(60, kcalV * 0.25) ? (
          <Text variant="caption" color="textSecondary">
            The macros add up to about {kcal(implied)} kcal. Both can be right (labels round), but it may be worth a second look.
          </Text>
        ) : null}
      </Card>
      <DrinkNote water={paired.water} problem={paired.problem} hasAmount={entry.grams > 0} />
      <ImpactLine date={date} kcalValue={n.kcal} replacing={entry} />
      <Card style={{ gap: spacing.md }}>
        <Text variant="h3">Meal and day</Text>
        <MealPicker value={meal} onChange={setMeal} testIDPrefix="detail-meal" />
        <DayStepper value={date} onChange={setDate} testIDPrefix="detail-day" />
        {paired.problem?.field === 'day' ? <PairProblem text={paired.problem.text} /> : null}
      </Card>
      {entry.nutrients.fiber !== undefined || entry.nutrients.sodium !== undefined ? (
        <NutritionFacts portion={{ ...entry.nutrients, ...n }} showPer100={false} asStats={false} />
      ) : null}
      {second.region}
    </Screen>
  );
}
