import { router } from 'expo-router';
import { ArrowRightLeft, CalendarPlus, ChevronDown, ChevronUp, Copy, MoreHorizontal, Plus, Repeat2, Save, Trash2 } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { SourceMark, sourceMarkTop } from '@/features/ai/mark';
import { ALSO_IN_WATER, waterFor } from '@/features/drinks/rules';
import { isWaterDrinkEntry } from '@/features/drinks/via';
import { MealMenuJournalRow } from '@/features/journal/JournalRows';
import { ShowToFriendsRow, useShowMealStep } from '@/features/friends/ShowMeal';
import { figureWords, otherFigure, setCalorieFigure, useCalorieFigure } from '@/features/today/calorieFigure';
import { isolateRtl, withoutMarks } from '@/lib/bidi';
import { addDays, formatDayLabel } from '@/lib/dates';
import { MEAL_LABEL, entriesTotal } from '@/lib/nutrition';
import { useToday } from '@/store/clock';
import type { DaySummary } from '@/store/selectors';
import { favoriteRecordId, useStore } from '@/store';
import { cup, fonts, useTheme, useVeryLargeText } from '@/theme';
import type { FoodEntry, ISODate, MealType, WaterEntry } from '@/types';
import { ANDROID_TOUCH, AnimatedList, AnimatedNumber, Button, Card, CupKey, Divider, FadeUp, figure, IconButton, ListRow, PressableScale, ProgressBar, RestoreRow, Sheet, Text, Trough, useGrownText } from '@/ui';
import { spokenUnits } from '@/lib/spokenUnits';

import { clearEntries, copyEntries } from './actions';
import { foodNameHead } from './addedTo';
import { DayStepper, KcalTrail, MealPicker, RowEmoji } from './components';
import { displayFoodName } from './displayName';
import { toggleFoodFavorite } from './favoriteActions';
import { FAVOURITE_ACTION, favoriteActionLabel } from './favoriteWords';
import { dayPhrase, href, kcal, portionLabel, rowSourceWord, sourceInfo, sourceKindOf, withSourceWord } from './helpers';
import { deleteEntry } from './log';
import { mealMacroLine, mealMacroSpoken } from './mealMacros';
import { useSaveMealStep } from './SaveMealSheet';
import { SAVE_HINT_NOT_NOW, SAVE_HINT_NOT_NOW_A11Y, saveHintA11y, saveHintLabel } from './saveWords';
import { currentKcal } from './usuals';
import { removedToday } from './restore';
import { FadeRow, Unfold, useComeBack, useLeavingRows } from './rowMotion';

/** Whether the summary's details (the day as a trough, the target, workouts and macros) are open: kept for the session, so paging days keeps it. */
let summaryOpen = false;

/**
 * The day's numbers at the top of the diary, compact so the meals lead the first view (Lunch's add is in it at
 * 360 x 740): calories left as the figure and "eaten of" the budget under it, the day's share button and a chevron
 * cup that opens the rest in place (`diary-summary-details`, `aria-expanded`): the day as a trough (eaten poured in
 * from the left, exercise headroom hatched at the right end), the target and what workouts add, and the three macros
 * with their level ticks. `action` (on a day with nothing logged, "Copy yesterday") is the card's last row, under a
 * divider, open or not.
 */
export function DaySummaryCard({ day, share, action }: { day: DaySummary; /** The day's share cup, 44 px (`SUMMARY_CUP_NARROW` under 360 px at the designed text size). */ share?: React.ReactNode; action?: React.ReactNode }) {
  const { colors, spacing } = useTheme();
  const { width: screenW } = useWindowDimensions();
  const narrow = screenW < 360;
  // With very large text (150% and up) the card pads more and the three macros wrap (each at least 120 wide), so a name or
  // "/ 152 g" is never split. Through the phone's common steps the card keeps its shape with larger text, and the macros
  // stay side by side where they fit as drawn: each takes the width its words need and they wrap only where three do not
  // fit the row (`grown`).
  const big = useVeryLargeText();
  const grown = useGrownText();
  const [open, setOpenState] = useState(summaryOpen);
  const setOpen = (v: boolean) => {
    summaryOpen = v;
    setOpenState(v);
  };
  const budget = Math.max(0, day.budget);
  // The big figure is the one chosen on Today (what is left, or what was eaten; kept on this device), and a tap on it
  // switches both screens; the line under it holds the other figure. The diary keeps its own words on every day
  // ("left", "above"), as `isToday` gives them.
  const choice = useCalorieFigure();
  const words = figureWords(choice.figure, { remaining: day.remaining, eaten: day.eaten.kcal, isToday: true });
  const idFor = (id: 'today-remaining' | 'today-eaten') => (id === 'today-remaining' ? 'diary-remaining' : 'diary-eaten');
  const figureH = narrow && !big ? 28 : 36;
  // Calories workouts add to this day (its own and shares carried from the six days before), drawn as
  // hatched headroom at the right end. Read from the day's rule, never from budget minus target.
  const headroom = Math.max(0, day.exerciseAdded);
  const notAdded = day.exerciseRule === 'off' && day.exerciseNet > 0;
  // The run log's words for what workouts add (`budgetAdds`, @/features/activity/logWords), always "~": an estimate.
  const addedLine = day.exerciseRule === 'week' ? `~${kcal(headroom)} kcal added over 7 days` : `~${kcal(headroom)} kcal added`;
  return (
    // At the designed text size the card pads 10 above and below, so at 360 x 740 Breakfast and Lunch are whole in the
    // first view; under 360 px it is slimmer still (6, a 24 px figure), so at 320 x 640 Lunch's add is in it.
    <Card testID="diary-summary" padding={0} style={{ paddingHorizontal: 16, paddingVertical: big ? 14 : narrow ? 6 : 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <View testID="diary-summary-figures" style={{ flex: 1, minWidth: 0 }}>
          {/* The switch, Today's (`diary-figure`): its name is its words, then what a tap does ("941 kcal left. Switch to
              calories eaten"). A sibling of the line under it, never inside a figure: a button inside an image is no button.
              On a phone it waits for the stored choice, so the figure never flips once drawn. */}
          <PressableScale
            testID="diary-figure"
            scaleTo={0.97}
            feedback="select"
            onPress={() => setCalorieFigure(otherFigure(choice.figure))}
            accessibilityLabel={words.name}
            hitSlop={figureH < 44 ? Math.ceil((44 - figureH) / 2) : undefined}
            style={[{ alignSelf: 'flex-start', maxWidth: '100%' }, choice.ready ? null : { opacity: 0 }]}>
            {/* The unit stands on two lines beside the number ("kcal" over "eaten"), as on Today, so "11,480 kcal eaten" and the
                switch's mark keep one row beside the share and chevron cups at 320 px. */}
            <View style={{ flexDirection: 'row', flexWrap: big ? 'wrap' : 'nowrap', alignItems: 'flex-end', columnGap: 6 }}>
              <AnimatedNumber
                // Keyed by the choice: a switch draws the other figure at once; only a change of the day ticks.
                key={choice.figure}
                variant="numXL"
                color={words.big.tone}
                testID={idFor(words.big.testID)}
                numberOfLines={1}
                value={words.big.value}
                format={(n) => kcal(Math.abs(n))}
                accessibilityLabel={words.bigSpoken}
                style={[{ flexShrink: 0 }, narrow && !big ? { fontSize: 24, lineHeight: 28, letterSpacing: -0.6 } : { fontSize: narrow ? 30 : 32, lineHeight: 36, letterSpacing: -1 }]}
              />
              <Text variant="unit" style={narrow && !big ? { fontSize: 12.5, lineHeight: 14, marginBottom: 1 } : { fontSize: 14, lineHeight: 17, marginBottom: 2 }}>
                {`kcal\n${words.big.word}`}
              </Text>
              <ArrowRightLeft size={18} color={colors.actionInk} strokeWidth={2.2} style={{ marginBottom: narrow && !big ? 5 : 8 }} />
            </View>
          </PressableScale>
          {/* The other figure and the budget, one element with its units in full ("1,219 kilocalories eaten of 2,160 kilocalories").
              It takes no touch, so the switch's 44 px reach (4 px past its 36 px figure) is the switch's to its edge. */}
          <View pointerEvents="none">
            <Text variant="caption" color="textSecondary" {...figure(spokenUnits(`${words.line.text} kcal ${words.line.words} ${kcal(budget)} kcal`))}>
              <AnimatedNumber key={choice.figure} variant="numM" style={{ fontSize: 14, lineHeight: 18 }} testID={idFor(words.line.testID)} value={words.line.value} format={(n) => kcal(Math.abs(n))} />
              {` ${words.line.words} `}
              <Text variant="numM" style={{ fontSize: 14, lineHeight: 18 }}>
                {kcal(budget)}
              </Text>
              {/* Units always shown: the budget is kilocalories too (its leading space holds it to the number). */}
              {' kcal'}
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: narrow && !big ? SUMMARY_CUP_GAP : spacing.sm }}>
          {share}
          <IconButton
            testID="diary-summary-details"
            tone="clear"
            size={narrow && !big ? SUMMARY_CUP_NARROW : 44}
            expanded={open}
            accessibilityLabel={open ? "Hide the day's details" : "Show the day's details: the target, workouts and macros"}
            onPress={() => setOpen(!open)}>
            {open ? <ChevronUp size={20} color={colors.text} strokeWidth={2.2} /> : <ChevronDown size={20} color={colors.text} strokeWidth={2.2} />}
          </IconButton>
        </View>
      </View>
      {open ? (
        <View testID="diary-summary-more">
          <Trough value={day.eaten.kcal} max={budget} headroom={headroom} color={colors.calories} memoryKey={`diary-${day.date}`} style={{ marginTop: spacing.md }} />
          {/* On a narrow phone a long exercise line moves under the target, whole, rather than squeezing both. */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', columnGap: spacing.md, rowGap: 4, marginTop: 10 }}>
            <Text variant="caption" color="textSecondary" tabular numberOfLines={1}>
              {`Target ${kcal(day.target)} kcal`}
            </Text>
            {headroom > 0 || notAdded ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
                {headroom > 0 ? <CupKey color={colors.headroom} variant="hatched" /> : null}
                <Text variant="caption" color="textSecondary" tabular numberOfLines={2} style={{ flexShrink: 1 }} testID="diary-exercise">
                  {headroom > 0 ? addedLine : `~${kcal(day.exerciseNet)} kcal not added`}
                </Text>
              </View>
            ) : null}
          </View>
          <View style={{ height: 1, backgroundColor: colors.border, marginVertical: spacing.md }} />
          <View style={{ flexDirection: 'row', flexWrap: big || grown ? 'wrap' : 'nowrap', columnGap: narrow ? spacing.md : spacing.lg, rowGap: spacing.md }}>
            {(
              [
                ['Protein', day.eaten.protein, day.macros.proteinG, colors.protein, 'reach'],
                ['Carbs', day.eaten.carbs, day.macros.carbsG, colors.carbs, 'limit'],
                ['Fat', day.eaten.fat, day.macros.fatG, colors.fat, 'limit'],
              ] as const
            ).map(([label, value, target, color, goalKind]) => (
              <View
                key={label}
                style={[big ? { flexGrow: 1, flexBasis: 120 } : grown ? { flexGrow: 1, flexShrink: 1, flexBasis: 'auto' } : { flex: 1 }, { minWidth: 0, gap: 8 }]}
                {...figure(`${label}, ${Math.round(value)} of ${target} grams`)}>
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
        </View>
      ) : null}
      {action ? (
        <>
          <View style={{ height: 1, backgroundColor: colors.border, marginVertical: spacing.md }} />
          {action}
        </>
      ) : null}
    </Card>
  );
}

/**
 * The summary's share and chevron cups under 360 px at the designed text size: 36 px (44 to touch, 48 on Android, the
 * kit's slop), so the figures keep the room for "1,219 eaten of 2,160 kcal" on one line (152 px; two 44 px cups left
 * 142) and Lunch's add stays in the first view at 320 x 640. Elsewhere 44.
 */
export const SUMMARY_CUP_NARROW = 36;
/** The room between the two cups at 36 px: their 44 px touch areas meet (48 on Android, 12 apart), never overlap. */
const SUMMARY_CUP_GAP = ANDROID_TOUCH ? 12 : 8;

/** On a day with nothing logged, the first meal's slot says what the search it opens offers (one line at 320 px). */
export const EMPTY_DAY_NOTE = 'Search, scan or snap a photo';

/** A meal card's side padding, the summary card's, so the meals' names stand under its figure. */
const ROW_PAD = 16;
/** The room between a row's emoji, its words and its calories: at 360 px "Greek yogurt, plain, 2%" keeps one line. */
const ROW_GAP = 8;
/** Where the text column starts in a meal card: the padding, the 24 px emoji column and the gap. */
const TEXT_INSET = ROW_PAD + 24 + ROW_GAP;
/** A press and hold on a row that has nothing to star: taken, so it never ends as a tap. */
const holdNothing = () => {};

function EntryRow({ entry, inWater }: { entry: FoodEntry; inWater?: WaterEntry | null }) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  // On a narrow phone the name and the portion may take two lines rather than be cut.
  const narrow = width < 360;
  // With very large text (150% and up) the calories take a line of their own under the portion, so neither is squeezed.
  // Through the phone's common steps the row keeps its shape: the name and the portion take their lines beside the calories.
  const big = useVeryLargeText();
  // Any entry that carries a range is an estimate, whatever food it was matched to afterwards.
  const ai = !!entry.kcalRange;
  // A bundled food with no record reads "Typical" (its values are an estimate), never as reference data.
  const kind = ai ? 'ai' : sourceKindOf(entry);
  const source = sourceInfo(kind);
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
  const caption = withSourceWord(inWater ? `${portion} · ${ALSO_IN_WATER}` : portion, kind);
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
        // The whole row is one button whose name says what the row shows, as drawn and in its order (WCAG 2.5.3,
        // label in name), then its source in words where the row has no word for it ("Almonds, 1 oz · 28 g, 162 kcal,
        // Reference data. Edit"): text inside a named button is not read.
        accessibilityLabel={`${withoutMarks(name)}, ${withoutMarks(caption)}, ${ai ? '~' : ''}${kcal(entry.nutrients.kcal)} kcal${entry.kcalRange ? `, ${kcal(entry.kcalRange[0])}–${kcal(entry.kcalRange[1])} kcal` : ''}${rowSourceWord(kind) === source.label ? '' : `, ${source.label}`}. Edit`}
        // Tight at the designed text size, 46 px for a one-line name (48 on Android, the kit's reach), so a meal of three
        // foods and the next whole meal share the first view at 360 x 740; with large text the rows keep their room.
        style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: ROW_GAP, minHeight: big ? 56 : 46, paddingVertical: big ? 11 : 3 }}>
        <RowEmoji emoji={entry.emoji} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text variant="bodyStrong" numberOfLines={3} style={{ fontFamily: fonts.semibold }}>
            {isolateRtl(name)}
          </Text>
          {/* On a narrow phone the calories move to the end of the portion line, so the name has the row's width. */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
            {/* The source's mark leads the line and its word (none for reference data) ends it, so a portion that wraps never leaves the mark floating. */}
            <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
              <SourceMark source={kind} color={colors.textSecondary} size={8} style={{ marginTop: sourceMarkTop(kind) }} />
              {/* The mark "also in Water" may take one more line (on a 320 px phone "1 can (8.4 fl oz) · 250 g · also in Water · Your food" needs three), so the word Water is never cut. */}
              <Text testID={inWater ? `entry-in-water-${entry.id}` : undefined} variant="caption" color="textSecondary" numberOfLines={inWater ? 3 : 2} style={{ flexShrink: 1 }}>
                {caption}
              </Text>
            </View>
            {narrow && !big ? <KcalTrail value={entry.nutrients.kcal} range={entry.kcalRange} /> : null}
          </View>
          {big ? (
            <View style={{ alignSelf: 'flex-start' }}>
              <KcalTrail value={entry.nutrients.kcal} range={entry.kcalRange} />
            </View>
          ) : null}
        </View>
        {narrow || big ? null : <KcalTrail value={entry.nutrients.kcal} range={entry.kcalRange} />}
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
          {/* A fixed box, so a two-line label never squeezes the icon (18 px, the icons' least size). */}
          <View style={{ width: 18, height: 18 }}>
            <Save size={18} color={colors.text} strokeWidth={2.2} />
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
  const sum = entriesTotal(entries);
  const total = sum.kcal;
  // Its protein, carbs and fat under its name ("P 31 g · C 52 g · F 18 g"), none for calories typed in alone.
  const macros = mealMacroLine(sum);
  const add = () => router.push(href('/food/search', { meal, date }) as never);
  // A removed row fades where it is, then folds away while the rows below close the space.
  const rows = useLeavingRows(entries);
  // The second way back after a delete: what was removed from this meal today, each with Restore.
  const allEntries = useStore((s) => s.foodEntries);
  const todayDate = useToday();
  const removed = useMemo(() => removedToday(allEntries, date, meal, todayDate), [allEntries, date, meal, todayDate]);
  // An Undo or a Restore: the row that comes back unfolds in step with its Restore row folding out (`useComeBack`).
  const { back, restores } = useComeBack(
    entries.map((e) => e.id),
    removed,
  );
  // Restore rows already there when the card first drew this day are drawn at once; one that a delete brings
  // unfolds with the fold. Kept per day, so paging to another day draws its Restore rows at once too; a row that
  // comes back leaves the set, so deleting it again unfolds its Restore row like any other.
  const [drawn, setDrawn] = useState(() => ({ date, ids: new Set(removed.map((e) => e.id)) }));
  if (drawn.date !== date) setDrawn({ date, ids: new Set(removed.map((e) => e.id)) });
  else if ([...drawn.ids].some((id) => !removed.some((e) => e.id === id))) setDrawn({ date, ids: new Set([...drawn.ids].filter((id) => removed.some((e) => e.id === id))) });
  const atOnce = (id: string) => drawn.date === date && drawn.ids.has(id);
  // The Restore rows' frame (its divider and padding) opens and closes as a whole, with the first row that comes
  // and the last that goes; a row that joins or leaves a frame already drawn unfolds or folds on its own. The ids
  // the frame was drawn with are kept, so those rows open with the frame and not a second time inside it.
  const [frameIds, setFrameIds] = useState<ReadonlySet<string> | null>(() => (restores.length ? new Set(restores.map((r) => r.item.id)) : null));
  if (!restores.length && frameIds) setFrameIds(null);
  if (restores.length && !frameIds) setFrameIds(new Set(restores.map((r) => r.item.id)));
  const allLeaving = restores.every((r) => r.leaving);
  const mealWord = label.toLowerCase();
  // One add per meal: an empty meal's add is its dashed slot (`meal-add-<meal>`), with no "+" cup and no "..." in its
  // header (the menu's one action for an empty meal, copying the last one, is the Repeat under the slot).
  const filled = rows.length > 0;
  // With very large text (150% and up) the meal's name keeps its whole word: the "..." and "+" cups go under it when both
  // do not fit. Through the phone's common steps the header keeps its shape, its total going under the name where it must.
  const big = useVeryLargeText();
  // At the designed text size a filled meal is tight (10 px above its header, 36 px cups that still take 44 px of touch,
  // its macros under its name, a hairline and then its rows), so at 360 x 740 Breakfast and Lunch are whole in the first
  // view and at 320 x 640 Lunch's add is in it. Each cup's touch reaches 4 px past it (the kit's hitSlop), so the two
  // cups stand 8 px apart: their touch areas meet and never overlap, and never reach the hairline or the first row.
  const compact = !big;
  const cupSize = compact ? 36 : 44;
  return (
    <Card testID={`meal-card-${meal}`} padding={0} style={{ paddingTop: filled ? (compact ? 10 : 12) : compact ? 12 : 16, paddingBottom: filled ? 4 : ROW_PAD }}>
      <View style={{ flexDirection: 'row', flexWrap: big ? 'wrap' : 'nowrap', justifyContent: 'flex-end', alignItems: 'center', gap: compact ? spacing.sm : spacing.xs, paddingLeft: ROW_PAD, paddingRight: 14 }}>
        <View style={[big ? { flexGrow: 1, flexShrink: 1, flexBasis: 'auto' } : { flex: 1 }, { minWidth: 0 }]}>
          {/* A big total ("1,450 kcal") goes under the meal's name on a narrow phone rather than cutting it. */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 10 }}>
            {/* The meal's name is a heading at level 2, as a SectionTitle is (WCAG 1.3.1): the diary reads Breakfast, Lunch, ... by heading. */}
            <Text variant="h3" numberOfLines={1} accessibilityRole="header" {...({ 'aria-level': 2 } as object)} style={{ flexShrink: big ? 0 : 1 }}>
              {label}
            </Text>
            {entries.length > 0 ? (
              <AnimatedNumber
                variant="numM"
                color="textSecondary"
                testID={`meal-total-${meal}`}
                value={total}
                format={kcal}
                style={{ fontSize: 15, lineHeight: 20 }}
                // Read as one element with its unit in full ("446 kilocalories"), never as drawn.
                {...figure(`${kcal(total)} kilocalories`)}>
                <Text variant="unit">{' kcal'}</Text>
              </AnimatedNumber>
            ) : null}
          </View>
          {entries.length > 0 && macros ? (
            // Plain words, never in the macros' colours (data colours are fills and keys only); heard in full.
            <Text variant="caption" color="textSecondary" testID={`meal-macros-${meal}`} {...figure(mealMacroSpoken(sum))}>
              {macros}
            </Text>
          ) : null}
        </View>
        {filled ? (
          // The two cups move together: with large text they go under the name and its macros as a pair, never split.
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: compact ? spacing.sm : spacing.xs }}>
            <IconButton testID={`meal-menu-${meal}`} accessibilityLabel={`${label} options`} tone="clear" size={cupSize} onPress={onMenu}>
              <MoreHorizontal size={20} color={colors.textSecondary} strokeWidth={1.9} />
            </IconButton>
            <IconButton testID={`meal-add-${meal}`} accessibilityLabel={`Add food to ${label.toLowerCase()}`} tone="surface" size={cupSize} onPress={add} style={{ borderColor: colors.borderStrong }}>
              <Plus size={20} color={colors.text} strokeWidth={2.2} />
            </IconButton>
          </View>
        ) : null}
      </View>
      {/* A hairline under the header, so its macros are never read as the first row's portion. */}
      {filled ? (
        <View style={{ marginTop: 6 }}>
          <Divider inset={ROW_PAD} />
        </View>
      ) : null}
      {/* Always mounted (keyed by the day), so a meal's first row slides in too; Undo brings a row back the same way. */}
      <View>
        <AnimatedList key={date}>
          {rows.map(({ item: e, leaving }, i) => (
            <FadeRow key={e.id} leaving={leaving} back={back.has(e.id)}>
              {i > 0 ? <Divider inset={TEXT_INSET} /> : null}
              <EntryRow entry={e} inWater={waterEntries ? (waterFor(waterEntries, e.id)?.water ?? null) : null} />
            </FadeRow>
          ))}
        </AnimatedList>
      </View>
      {hint && rows.length > 0 ? <SaveHintRow meal={meal} onSave={hint.onSave} onClose={hint.onClose} /> : null}
      {restores.length ? (
        // The frame opens with the first Restore row a delete brings (after the leaving row's fade, as it folds)
        // and folds out with the last one that comes back (at once, as that row unfolds), so nothing snaps.
        <Unfold key={date} animate={!restores.every((r) => atOnce(r.item.id))} open={!allLeaving}>
          <View testID={`meal-removed-${meal}`}>
            {filled ? <Divider inset={ROW_PAD} /> : null}
            <View style={{ paddingLeft: ROW_PAD, paddingRight: 8, paddingTop: filled ? 2 : 8, paddingBottom: filled ? 6 : 0 }}>
              {restores.map(({ item: e, leaving }) => (
                <Unfold key={e.id} animate={!atOnce(e.id) && !(frameIds?.has(e.id) ?? true)} open={!leaving || allLeaving}>
                  <RestoreRow
                    testID={`entry-restore-${e.id}`}
                    label={`${isolateRtl(foodNameHead(displayFoodName(e)))} removed from ${mealWord}`}
                    onRestore={() => useStore.getState().restore('foodEntries', e.id)}
                  />
                </Unfold>
              ))}
            </View>
          </View>
        </Unfold>
      ) : null}
      {filled ? null : (
        <View style={{ marginTop: spacing.md, gap: spacing.md, paddingHorizontal: ROW_PAD }}>
          <PressableScale
            testID={`meal-add-${meal}`}
            onPress={add}
            scaleTo={0.985}
            // Its name starts with its visible words (WCAG 2.5.3): "Log breakfast", then the note when it shows one.
            accessibilityLabel={`Log ${label.toLowerCase()}${slotNote ? `. ${slotNote}` : ''}`}
            style={{
              minHeight: 48,
              paddingVertical: slotNote ? 10 : 0,
              paddingHorizontal: spacing.md,
              ...cup(radius.buttonSm, 5),
              borderWidth: 1.5,
              borderTopWidth: 0,
              borderStyle: 'dashed',
              borderColor: colors.dashEdge,
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
            }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Plus size={18} color={colors.textSecondary} strokeWidth={2.2} />
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
  // With very large text (150% and up) the caption has the card's width and Repeat goes under it, so no word is split.
  const big = useVeryLargeText();
  return (
    <View testID={`meal-repeat-row-${meal}`} style={{ flexDirection: big ? 'column' : 'row', alignItems: big ? 'flex-start' : 'center', gap: big ? spacing.sm : spacing.md }}>
      <Text variant="caption" color="textSecondary" numberOfLines={3} style={big ? { alignSelf: 'stretch' } : { flex: 1, minWidth: 0 }}>
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
        icon={<Repeat2 size={18} color={colors.text} strokeWidth={2.2} />}
        onPress={onRepeat}
        style={{ paddingHorizontal: 10, alignSelf: 'center' }}
      />
    </View>
  );
}

type MenuStep = 'menu' | 'copyTo' | 'save' | 'show';

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
  // Showing the meal to friends is the friends feature's step, shown in place the same way.
  const show = useShowMealStep({ open: !!meal && step === 'show', meal, date, entries, onClose });

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
      <Sheet visible onClose={onClose} title={save.title} footer={save.footer} unsaved={save.unsaved}>
        {save.body}
      </Sheet>
    );
  }

  if (step === 'show') {
    return (
      <Sheet visible onClose={onClose} title={show.title} subtitle={show.subtitle} footer={show.footer}>
        {show.body}
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
            {/* Show to friends: drawn by the friends feature only for someone with friends on, with its own divider. */}
            <ShowToFriendsRow meal={meal} date={date} entries={entries} onOpen={() => setStep('show')} onClose={onClose} />
            <Divider inset={32} />
            <ListRow
              testID="meal-menu-copy-to"
              title="Copy to another day"
              subtitle={`${count} · ${kcal(total)} kcal`}
              left={<CalendarPlus size={20} color={colors.text} />}
              onPress={() => setStep('copyTo')}
            />
            <Divider inset={32} />
            {/* The meal photo journal: photos of added AI estimates, kept on this phone only. */}
            <MealMenuJournalRow onClose={onClose} />
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

