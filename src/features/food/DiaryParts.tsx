import { router } from 'expo-router';
import { CalendarPlus, Copy, MoreHorizontal, Plus, Repeat2, Save, Trash2 } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { SourceMark, sourceMarkTop } from '@/features/ai/mark';
import { ALSO_IN_WATER, waterFor } from '@/features/drinks/rules';
import { isWaterDrinkEntry } from '@/features/drinks/via';
import { isolateRtl, withoutMarks } from '@/lib/bidi';
import { addDays, formatDayLabel } from '@/lib/dates';
import { MEAL_LABEL, entriesTotal } from '@/lib/nutrition';
import { useToday } from '@/store/clock';
import type { DaySummary } from '@/store/selectors';
import { favoriteRecordId, useStore } from '@/store';
import { cup, fonts, useTheme } from '@/theme';
import type { FoodEntry, ISODate, MealType, WaterEntry } from '@/types';
import { AnimatedList, AnimatedNumber, Button, Card, CupKey, Divider, FadeUp, Hatch, IconButton, ListRow, PressableScale, ProgressBar, RestoreRow, Sheet, Text, Trough } from '@/ui';
import { spokenUnits } from '@/lib/spokenUnits';

import { clearEntries, copyEntries } from './actions';
import { foodNameHead } from './addedTo';
import { DayStepper, KcalTrail, MealPicker, RowEmoji } from './components';
import { displayFoodName } from './displayName';
import { toggleFoodFavorite } from './favoriteActions';
import { FAVOURITE_ACTION, favoriteActionLabel } from './favoriteWords';
import { dayPhrase, href, kcal, portionLabel, sourceInfo, withSourceWord } from './helpers';
import { deleteEntry } from './log';
import { useSaveMealStep } from './SaveMealSheet';
import { SAVE_HINT_NOT_NOW, SAVE_HINT_NOT_NOW_A11Y, saveHintA11y, saveHintLabel } from './saveWords';
import { currentKcal } from './usuals';
import { removedToday } from './restore';
import { FadeRow, Unfold, useLeavingRows } from './rowMotion';

/**
 * The diary summary: calories left as a big number, the day as a trough
 * (eaten poured in from the left, exercise headroom hatched at the right end),
 * then the three macros with their level ticks.
 */
/**
 * The day's numbers at the top of the diary. `share` (the day's share button) sits at the top right, beside the big
 * number; `action` (on a day with nothing logged, "Copy yesterday") is the card's last row, under a divider.
 */
export function DaySummaryCard({ day, share, action }: { day: DaySummary; share?: React.ReactNode; action?: React.ReactNode }) {
  const { colors, spacing } = useTheme();
  const { width: screenW } = useWindowDimensions();
  const narrow = screenW < 360;
  // On a phone "eaten of" always sits under the big number. Wrapping only when the number grew
  // a digit would make the whole page jump by a line as a log or a delete ticks it past 999.
  const stacked = screenW < 480;
  const over = day.remaining < 0;
  const budget = Math.max(0, day.budget);
  // Calories workouts add to this day (its own and shares carried from the six days before), drawn as
  // hatched headroom at the right end. Read from the day's rule, never from budget minus target.
  const headroom = Math.max(0, day.exerciseAdded);
  const notAdded = day.exerciseRule === 'off' && day.exerciseNet > 0;
  // The run log's words for what workouts add (`budgetAdds`, @/features/activity/logWords), always "~": an estimate.
  const addedLine = day.exerciseRule === 'week' ? `~${kcal(headroom)} kcal added over 7 days` : `~${kcal(headroom)} kcal added`;
  return (
    <Card testID="diary-summary" padding={18}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }}>
        <View style={stacked ? { flex: 1, minWidth: 0, gap: 2 } : { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
            <AnimatedNumber
              variant="numXL"
              color={over ? 'warningInk' : 'caloriesInk'}
              testID="diary-remaining"
              numberOfLines={1}
              value={day.remaining}
              format={(n) => kcal(Math.abs(n))}
              accessibilityLabel={`${kcal(Math.abs(day.remaining))} kilocalories ${over ? 'above the budget' : 'left'}`}
              style={{ fontSize: narrow ? 40 : 46, lineHeight: narrow ? 44 : 50, letterSpacing: -1.4 }}
            />
            <Text variant="unit" style={{ fontSize: 15 }}>{over ? 'kcal above' : 'kcal left'}</Text>
          </View>
          <Text variant="caption" color="textSecondary" style={{ paddingBottom: stacked ? 0 : 4 }}>
            <AnimatedNumber variant="numM" style={{ fontSize: 16, lineHeight: 20 }} testID="diary-eaten" value={day.eaten.kcal} format={kcal} />
            {' eaten of '}
            <Text variant="numM" style={{ fontSize: 16, lineHeight: 20 }}>
              {kcal(budget)}
            </Text>
          </Text>
        </View>
        {share}
      </View>
      <Trough value={day.eaten.kcal} max={budget} headroom={headroom} color={colors.calories} memoryKey={`diary-${day.date}`} style={{ marginTop: spacing.md }} />
      {/* On a narrow phone a long exercise line moves under the target, whole, rather than squeezing both. */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', columnGap: spacing.md, rowGap: 4, marginTop: 10 }}>
        <Text variant="caption" color="textSecondary" tabular numberOfLines={1}>
          {`Target ${kcal(day.target)}`}
        </Text>
        {headroom > 0 || notAdded ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
            {headroom > 0 ? (
              <View style={{ width: 11, height: 11, overflow: 'hidden', borderWidth: 1, borderColor: colors.headroom, borderRadius: 2 }}>
                <Hatch width={11} height={11} color={colors.headroom} step={4} opacity={1} />
              </View>
            ) : null}
            <Text variant="caption" color="textSecondary" tabular numberOfLines={2} style={{ flexShrink: 1 }} testID="diary-exercise">
              {headroom > 0 ? addedLine : `~${kcal(day.exerciseNet)} kcal not added`}
            </Text>
          </View>
        ) : null}
      </View>
      <View style={{ height: 1, backgroundColor: colors.border, marginVertical: spacing.md }} />
      <View style={{ flexDirection: 'row', gap: narrow ? spacing.md : spacing.lg }}>
        {(
          [
            ['Protein', day.eaten.protein, day.macros.proteinG, colors.protein, 'reach'],
            ['Carbs', day.eaten.carbs, day.macros.carbsG, colors.carbs, 'limit'],
            ['Fat', day.eaten.fat, day.macros.fatG, colors.fat, 'limit'],
          ] as const
        ).map(([label, value, target, color, goalKind]) => (
          <View key={label} style={{ flex: 1, minWidth: 0, gap: 8 }} accessible accessibilityLabel={`${label}, ${Math.round(value)} of ${target} grams`}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <CupKey color={color} />
              <Text variant="label" numberOfLines={1}>
                {label}
              </Text>
            </View>
            <ProgressBar progress={target > 0 ? value / target : 0} color={color} height={6} goalKind={goalKind} />
            {/* The target may wrap under the number on a narrow phone, whole ("/ 493 g"); it is never cut. */}
            <AnimatedNumber variant="numM" value={Math.round(value)} style={{ fontSize: narrow ? 15 : 17, lineHeight: narrow ? 20 : 22 }}>
              <Text variant="caption" color="textSecondary">{` /\u00A0${Math.round(target)}\u00A0g`}</Text>
            </AnimatedNumber>
          </View>
        ))}
      </View>
      {action ? (
        <>
          <View style={{ height: 1, backgroundColor: colors.border, marginVertical: spacing.md }} />
          {action}
        </>
      ) : null}
    </Card>
  );
}

/** On a day with nothing logged, the first meal's slot says what the search it opens offers (one line at 320 px). */
export const EMPTY_DAY_NOTE = 'Search, scan or snap a photo';

const ROW_PAD = 18;
/** Where the text column starts in a meal card: the padding, the 24 px emoji column and the gap. */
const TEXT_INSET = ROW_PAD + 24 + 12;
/** A press and hold on a row that has nothing to star: taken, so it never ends as a tap. */
const holdNothing = () => {};

function EntryRow({ entry, inWater }: { entry: FoodEntry; inWater?: WaterEntry | null }) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  // On a narrow phone the name and the portion may take two lines rather than be cut.
  const narrow = width < 360;
  // Any entry that carries a range is an estimate, whatever food it was matched to afterwards.
  const ai = !!entry.kcalRange;
  const source = sourceInfo(ai ? 'ai' : entry.source);
  // A volume ("250 ml", "8.5 fl oz") is the portion as it was drunk: its grams are left out.
  const volume = /(ml|fl oz)$/.test(entry.servingLabel.trim());
  // A long press stars the row's food (with a toast and Undo); a quick add has no food and no long press.
  const food = entry.food;
  const starred = useStore((s) => (food ? !!s.favorites[favoriteRecordId(food.id)] && !s.favorites[favoriteRecordId(food.id)].deleted : false));
  const favoriteAction = food ? favoriteActionLabel(starred) : null;
  // The name as it is drawn (a bundled food's capitals in lower case); the store, the search and the export keep it as written.
  const name = displayFoodName(entry);
  const portion =
    entry.grams > 0 && !volume && entry.servingLabel !== `${Math.round(entry.grams)} g` && !/^\d+(\.\d+)?\s*g$/.test(entry.servingLabel.trim())
      ? `${portionLabel(entry.servingLabel, entry.quantity)} · ${Math.round(entry.grams)} g`
      : portionLabel(entry.servingLabel, entry.quantity);
  // Reference data has no word on the row (its filled key is its mark); the others are named. The label reads every source.
  const caption = withSourceWord(inWater ? `${portion} · ${ALSO_IN_WATER}` : portion, ai ? 'ai' : entry.source);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: ROW_PAD }}>
      <PressableScale
        testID={`entry-${entry.id}`}
        onPress={() => router.push(href('/food/detail', { entryId: entry.id, meal: entry.meal, date: entry.date }) as never)}
        scaleTo={0.985}
        // A row with no food (a quick add) takes the hold and does nothing: without a handler a hold
        // ends as a tap (react-native-web and React Native alike) and would open the row unasked.
        onLongPress={food ? () => toggleFoodFavorite(food) : holdNothing}
        accessibilityActions={favoriteAction ? [{ name: FAVOURITE_ACTION.name, label: favoriteAction }] : undefined}
        onAccessibilityAction={food ? (e) => e.nativeEvent.actionName === FAVOURITE_ACTION.name && toggleFoodFavorite(food) : undefined}
        // The whole row is one button whose name says what the row shows, its source in words included
        // ("Almonds, 1 oz · 28 g, 162 kilocalories, Reference data. Edit"): text inside a named button is not read.
        accessibilityLabel={spokenUnits(`${name}, ${withoutMarks(portion)}, ${ai ? 'about ' : ''}${Math.round(entry.nutrients.kcal)} kilocalories${inWater ? ', also counted in Water' : ''}, ${source.label}. Edit`)}
        style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 11 }}>
        <RowEmoji emoji={entry.emoji} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text variant="bodyStrong" numberOfLines={3} style={{ fontFamily: fonts.semibold }}>
            {isolateRtl(name)}
          </Text>
          {/* On a narrow phone the calories move to the end of the portion line, so the name has the row's width. */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
            {/* The source's mark leads the line and its word (none for reference data) ends it, so a portion that wraps never leaves the mark floating. */}
            <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
              <SourceMark source={ai ? 'ai' : entry.source} color={colors.textSecondary} size={8} style={{ marginTop: sourceMarkTop(ai ? 'ai' : entry.source) }} />
              {/* The mark "also in Water" may take one more line (on a 320 px phone "1 can (8.4 fl oz) · 250 g · also in Water · Your food" needs three), so the word Water is never cut. */}
              <Text testID={inWater ? `entry-in-water-${entry.id}` : undefined} variant="caption" color="textSecondary" numberOfLines={inWater ? 3 : 2} style={{ flexShrink: 1 }}>
                {caption}
              </Text>
            </View>
            {narrow ? <KcalTrail value={entry.nutrients.kcal} range={entry.kcalRange} /> : null}
          </View>
        </View>
        {narrow ? null : <KcalTrail value={entry.nutrients.kcal} range={entry.kcalRange} />}
      </PressableScale>
      {/* Delete on a list row is the trash can everywhere (Water, Train, Saved meals); an X only closes or dismisses. */}
      <IconButton testID={`entry-delete-${entry.id}`} accessibilityLabel={`Delete ${name}`} tone="clear" size={44} onPress={() => deleteEntry(entry)}>
        <Trash2 size={18} color={colors.textSecondary} strokeWidth={1.9} />
      </IconButton>
    </View>
  );
}

/**
 * The diary's one-time hint, a sibling row under the meal's last entry with its own divider: "Save lunch
 * as a meal" (a tap opens the save sheet) and a quiet "Not now" at the end (hides it for good on this
 * device), a text action rather than an icon, so it is never taken for the entries' delete above it.
 */
function SaveHintRow({ meal, onSave, onClose }: { meal: MealType; onSave(): void; onClose(): void }) {
  const { colors, spacing } = useTheme();
  return (
    <FadeUp>
      <Divider inset={ROW_PAD} />
      <View testID="diary-save-hint-row" style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingLeft: ROW_PAD, paddingRight: 8 }}>
        <PressableScale
          testID="diary-save-hint"
          onPress={onSave}
          scaleTo={0.985}
          accessibilityLabel={saveHintA11y(meal)}
          style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 }}>
          {/* A fixed box, so a two-line label never squeezes the icon. */}
          <View style={{ width: 16, height: 16 }}>
            <Save size={16} color={colors.text} strokeWidth={2.2} />
          </View>
          <Text variant="label" color="text" numberOfLines={2} style={{ flexShrink: 1, textDecorationLine: 'underline' }}>
            {saveHintLabel(meal)}
          </Text>
        </PressableScale>
        <PressableScale
          testID="diary-save-hint-close"
          onPress={onClose}
          scaleTo={0.97}
          feedback="select"
          accessibilityLabel={SAVE_HINT_NOT_NOW_A11Y}
          style={{ minHeight: 44, minWidth: 44, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' }}>
          <Text variant="label" color="textSecondary">
            {SAVE_HINT_NOT_NOW}
          </Text>
        </PressableScale>
      </View>
    </FadeUp>
  );
}

export interface PreviousMeal {
  date: ISODate;
  entries: FoodEntry[];
}

export function MealCard({
  meal,
  label,
  emoji,
  date,
  entries,
  waterEntries,
  previous,
  onMenu,
  onRepeat,
  hint,
  slotNote,
}: {
  meal: MealType;
  label: string;
  emoji: string;
  date: ISODate;
  entries: FoodEntry[];
  /** The day's live water records: an entry one of them points at is marked "also in Water". */
  waterEntries?: readonly WaterEntry[];
  previous: PreviousMeal | null;
  onMenu: () => void;
  onRepeat: () => void;
  /** The one-time "Save lunch as a meal" line under the last row (./saveHint.ts): on one card at most. */
  hint?: { onSave(): void; onClose(): void } | null;
  /** A second line in the empty meal's slot: on a day with nothing logged, the first card says what the search offers. */
  slotNote?: string | null;
}) {
  const { colors, spacing, radius } = useTheme();
  const total = entriesTotal(entries).kcal;
  const add = () => router.push(href('/food/search', { meal, date }) as never);
  // A removed row fades where it is, then folds away while the rows below close the space.
  const rows = useLeavingRows(entries);
  // The second way back after a delete: what was removed from this meal today, each with Restore.
  const allEntries = useStore((s) => s.foodEntries);
  const todayDate = useToday();
  const removed = useMemo(() => removedToday(allEntries, date, meal, todayDate), [allEntries, date, meal, todayDate]);
  // Rows already there when the card mounted are drawn at once; one that a delete brings unfolds with the fold.
  const [shownAtMount] = useState(() => new Set(removed.map((e) => `${date}:${e.id}`)));
  const mealWord = label.toLowerCase();
  // One add per meal: an empty meal's add is its dashed slot (`meal-add-<meal>`), with no "+" cup and no "..." in its
  // header (the menu's one action for an empty meal, copying the last one, is the Repeat under the slot).
  const filled = rows.length > 0;
  return (
    <Card testID={`meal-card-${meal}`} padding={0} style={{ paddingTop: filled ? 12 : 16, paddingBottom: filled ? 4 : ROW_PAD }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingLeft: ROW_PAD, paddingRight: 14 }}>
        {/* A big total ("1,450 kcal") goes under the meal's name on a narrow phone rather than cutting it. */}
        <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 10 }}>
          <Text variant="h3" numberOfLines={1} style={{ flexShrink: 1 }}>
            {label}
          </Text>
          {entries.length > 0 ? (
            <AnimatedNumber variant="numM" color="textSecondary" testID={`meal-total-${meal}`} value={total} format={kcal} style={{ fontSize: 15, lineHeight: 20 }}>
              <Text variant="unit">{' kcal'}</Text>
            </AnimatedNumber>
          ) : null}
        </View>
        {filled ? (
          <>
            <IconButton testID={`meal-menu-${meal}`} accessibilityLabel={`${label} options`} tone="clear" size={44} onPress={onMenu}>
              <MoreHorizontal size={20} color={colors.textSecondary} strokeWidth={1.9} />
            </IconButton>
            <IconButton testID={`meal-add-${meal}`} accessibilityLabel={`Add food to ${label.toLowerCase()}`} tone="surface" size={44} onPress={add} style={{ borderColor: colors.borderStrong }}>
              <Plus size={20} color={colors.text} strokeWidth={2.2} />
            </IconButton>
          </>
        ) : null}
      </View>
      {/* Always mounted (keyed by the day), so a meal's first row slides in too; Undo brings a row back the same way. */}
      <View style={{ marginTop: rows.length ? 6 : 0 }}>
        <AnimatedList key={date}>
          {rows.map(({ item: e, leaving }, i) => (
            <FadeRow key={e.id} leaving={leaving}>
              {i > 0 ? <Divider inset={TEXT_INSET} /> : null}
              <EntryRow entry={e} inWater={waterEntries ? (waterFor(waterEntries, e.id)?.water ?? null) : null} />
            </FadeRow>
          ))}
        </AnimatedList>
      </View>
      {hint && rows.length > 0 ? <SaveHintRow meal={meal} onSave={hint.onSave} onClose={hint.onClose} /> : null}
      {removed.length ? (
        <View testID={`meal-removed-${meal}`}>
          {/* Each row brings its own room (and the first its divider), so nothing appears at once around them. */}
          {removed.map((e, i) => (
            <Unfold key={e.id} animate={!shownAtMount.has(`${date}:${e.id}`)}>
              {i === 0 && filled ? <Divider inset={ROW_PAD} /> : null}
              <View style={{ paddingLeft: ROW_PAD, paddingRight: 8, paddingTop: i === 0 ? (filled ? 2 : 8) : 0, paddingBottom: i === removed.length - 1 && filled ? 6 : 0 }}>
                <RestoreRow
                  testID={`entry-restore-${e.id}`}
                  label={`${isolateRtl(foodNameHead(displayFoodName(e)))} removed from ${mealWord}`}
                  onRestore={() => useStore.getState().restore('foodEntries', e.id)}
                />
              </View>
            </Unfold>
          ))}
        </View>
      ) : null}
      {filled ? null : (
        <View style={{ marginTop: spacing.md, gap: spacing.md, paddingHorizontal: ROW_PAD }}>
          <PressableScale
            testID={`meal-add-${meal}`}
            onPress={add}
            scaleTo={0.985}
            accessibilityLabel={`Add food to ${label.toLowerCase()}`}
            style={{
              minHeight: 48,
              paddingVertical: slotNote ? 10 : 0,
              paddingHorizontal: spacing.md,
              ...cup(radius.buttonSm, 5),
              borderWidth: 1.5,
              borderTopWidth: 0,
              borderStyle: 'dashed',
              borderColor: colors.borderStrong,
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
            }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Plus size={16} color={colors.textSecondary} strokeWidth={2.2} />
              <Text variant="label" color="textSecondary">
                Log {label.toLowerCase()}
              </Text>
            </View>
            {slotNote ? (
              <Text variant="caption" color="textSecondary" testID={`meal-add-${meal}-note`} style={{ textAlign: 'center' }}>
                {slotNote}
              </Text>
            ) : null}
          </PressableScale>
          {previous ? <RepeatRow meal={meal} label={label} previous={previous} onRepeat={onRepeat} /> : null}
        </View>
      )}
    </Card>
  );
}

/**
 * Under an empty meal's slot: what the last time held ("Yesterday, 744 kcal: Israeli salad, Pasta, Chicken breast")
 * and the kit's small Repeat button beside it, the same control as on Today's meal rows.
 */
function RepeatRow({ meal, label, previous, onRepeat }: { meal: MealType; label: string; previous: PreviousMeal; onRepeat(): void }) {
  const { colors, spacing } = useTheme();
  const when = dayPhrase(previous.date);
  // Each name up to its first comma outside brackets: "Israeli salad (tomato, cucumber, ...)" is never cut to "Israeli salad (tomato".
  const foods = previous.entries.map((e) => foodNameHead(displayFoodName(e))).filter(Boolean);
  const total = kcal(currentKcal(previous.entries));
  return (
    <View testID={`meal-repeat-row-${meal}`} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
      <Text variant="caption" color="textSecondary" numberOfLines={3} style={{ flex: 1, minWidth: 0 }}>
        {/* The day and its calories first, so a long list of foods is what the third line's ellipsis shortens, never the number. */}
        {`${when.charAt(0).toUpperCase()}${when.slice(1)}, ${total} kcal: ${foods.map(isolateRtl).join(', ')}`}
      </Text>
      <Button
        testID={`meal-repeat-${meal}`}
        title="Repeat"
        accessibilityLabel={`Repeat ${label.toLowerCase()} from ${when}: ${foods.join(', ')}, ${total} kilocalories`}
        variant="secondary"
        size="sm"
        full={false}
        icon={<Repeat2 size={16} color={colors.text} strokeWidth={2.2} />}
        onPress={onRepeat}
        style={{ paddingHorizontal: 10, alignSelf: 'center' }}
      />
    </View>
  );
}

type MenuStep = 'menu' | 'copyTo' | 'save';

/** Per-meal menu: copy from an earlier day, save, copy to another day, clear. */
export function MealMenuSheet({
  meal,
  date,
  entries,
  previous,
  onClose,
  onRepeat,
}: {
  meal: MealType | null;
  date: ISODate;
  entries: FoodEntry[];
  previous: PreviousMeal | null;
  onClose: () => void;
  onRepeat: () => void;
}) {
  const { colors } = useTheme();
  const todayDate = useToday();
  const [step, setStep] = useState<MenuStep>('menu');
  const [targetDate, setTargetDate] = useState<ISODate>(addDays(date, 1));
  const [targetMeal, setTargetMeal] = useState<MealType>(meal ?? 'breakfast');
  const [openFor, setOpenFor] = useState<string | null>(null);

  // Reset the sheet each time it opens for a meal.
  const key = meal ? `${meal}|${date}` : null;
  if (key !== openFor) {
    setOpenFor(key);
    if (meal) {
      setStep('menu');
      setTargetDate(date === todayDate ? addDays(date, 1) : todayDate);
      setTargetMeal(meal);
    }
  }
  // The save step is SaveMealSheet's, shown inside this sheet so the step changes in place.
  const save = useSaveMealStep({ open: !!meal && step === 'save', meal, date, entries, onClose });

  if (!meal) return <Sheet visible={false} onClose={onClose}>{null}</Sheet>;
  const label = MEAL_LABEL[meal];
  // What a copy or a saved meal of these logs: a bundled food at today's values (currentKcal), and never a
  // drink paired with Water (copyEntries and saveMeal leave it out), so the lines name what the tap stores.
  const copyable = entries.filter((e) => !isWaterDrinkEntry(e));
  const total = currentKcal(copyable);
  const count = `${copyable.length} ${copyable.length === 1 ? 'item' : 'items'}`;

  if (step === 'copyTo') {
    return (
      <Sheet
        visible
        onClose={onClose}
        title={`Copy ${label.toLowerCase()} to`}
        footer={
          <Button
            testID="copy-to-confirm"
            title={`Copy ${count}`}
            disabled={targetDate === date && targetMeal === meal}
            onPress={() => {
              copyEntries(entries, targetDate, targetMeal, `Copied ${count} to ${dayPhrase(targetDate)}`);
              onClose();
            }}
          />
        }>
        <DayStepper value={targetDate} onChange={setTargetDate} testIDPrefix="copy-day" />
        <MealPicker value={targetMeal} onChange={setTargetMeal} testIDPrefix="copy-meal" />
      </Sheet>
    );
  }

  if (step === 'save') {
    return (
      <Sheet visible onClose={onClose} title={save.title} footer={save.footer}>
        {save.body}
      </Sheet>
    );
  }

  return (
    <Sheet visible onClose={onClose} title={`${label} · ${formatDayLabel(date)}`}>
      <View>
        <ListRow
          testID="meal-menu-copy-previous"
          title={previous ? `Copy from ${dayPhrase(previous.date)}` : `Copy from an earlier day`}
          subtitle={
            previous
              ? `${previous.entries.length} ${previous.entries.length === 1 ? 'item' : 'items'} · ${kcal(currentKcal(previous.entries))} kcal`
              : `No ${label.toLowerCase()} logged in the last 60 days`
          }
          left={<Copy size={20} color={previous ? colors.text : colors.textTertiary} />}
          onPress={
            previous
              ? () => {
                  onRepeat();
                  onClose();
                }
              : undefined
          }
        />
        {entries.length > 0 ? (
          <>
            <Divider inset={32} />
            <ListRow
              testID="meal-menu-save"
              title="Save as a meal"
              subtitle="Log the same foods again in one tap"
              left={<Save size={20} color={colors.text} />}
              onPress={() => setStep('save')}
            />
            <Divider inset={32} />
            <ListRow
              testID="meal-menu-copy-to"
              title="Copy to another day"
              subtitle={`${count} · ${kcal(total)} kcal`}
              left={<CalendarPlus size={20} color={colors.text} />}
              onPress={() => setStep('copyTo')}
            />
            <Divider inset={32} />
            <ListRow
              testID="meal-menu-clear"
              title={`Clear ${label.toLowerCase()}`}
              subtitle="You can undo this"
              left={<Trash2 size={20} color={colors.danger} />}
              onPress={() => {
                clearEntries(entries, label.toLowerCase());
                onClose();
              }}
            />
          </>
        ) : null}
      </View>
    </Sheet>
  );
}

