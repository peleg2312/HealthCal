import { CalendarDays, ChevronLeft, ChevronRight, Minus, Plus } from 'lucide-react-native';
import React, { useEffect, useId, useState } from 'react';
import { Platform, useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native';

import { SourceMark, sourceMarkTop } from '@/features/ai/mark';
import { useToday } from '@/store/clock';
import { isolateRtl, withoutMarks } from '@/lib/bidi';
import { addDays } from '@/lib/dates';
import { MEALS } from '@/lib/nutrition';
import { cup, fonts, useLargeText, useTheme } from '@/theme';
import type { Food, ISODate, MealType } from '@/types';
import { CupKey, IconButton, PressableScale, Text } from '@/ui';
import { rovingIndex } from '@/ui/controlRules';

import { displayFoodName } from './displayName';
import { canStepForward, entryDayLabel, entryDaySpoken, foodLatestDay } from './entryDay';
import { kcal, rowSourceWord, sourceInfo, sourceKindOf, withSourceWord, type SourceKind } from './helpers';
import { LangIconButton, useLangName } from './langName';

// How a data source is marked lives with the mark itself (`SourceMark`, `@/features/ai/mark`): a filled cup
// key for reference data, an outline for community or your own numbers, the small AI mark for an AI estimate.

/** The source's mark plus its name, on a faint tint (the detail page). */
export function SourceBadge({ source, style }: { source: SourceKind; style?: StyleProp<ViewStyle> }) {
  const { colors, radius } = useTheme();
  const info = sourceInfo(source);
  return (
    <View
      testID="food-source-badge"
      accessibilityLabel={`Data source: ${info.label}`}
      style={[
        { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, height: 26, borderRadius: radius.chip, backgroundColor: colors.surfaceAlt, alignSelf: 'flex-start' },
        style,
      ]}>
      <SourceMark source={source} color={colors.textSecondary} size={9} />
      <Text variant="label" color="text">
        {info.label}
      </Text>
    </View>
  );
}

/**
 * The source's mark and its short name for list captions: present but quiet. `plain`: the kit's key even for
 * an AI estimate, and `label` the word instead of the source's (the sample result, which is not the AI: "Sample").
 */
export function SourceTag({ source, plain = false, label }: { source: SourceKind; plain?: boolean; label?: string }) {
  const { colors } = useTheme();
  const info = sourceInfo(source);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 0 }}>
      <SourceMark source={source} plain={plain} color={colors.textSecondary} size={8} />
      <Text variant="caption" color="textSecondary" numberOfLines={1}>
        {label ?? info.short}
      </Text>
    </View>
  );
}

/** A food or activity emoji as a 17 px content mark at the start of a row (no tile). */
export function RowEmoji({ emoji }: { emoji?: string }) {
  return (
    // At least 24 wide, wider as the text size grows (the emoji is a Text), so it never spills into the gutter.
    <View style={{ minWidth: 24, alignItems: 'center' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Text style={{ fontSize: 17, lineHeight: 24 }}>{emoji || '🍽️'}</Text>
    </View>
  );
}

/** Trailing calories in a row: Bricolage 17 with a small unit; an estimate reads "~72 kcal" with its range under it. */
export function KcalTrail({ value, range, approx, testID }: { value: number; range?: [number, number]; approx?: boolean; testID?: string }) {
  return (
    <View style={{ alignItems: 'flex-end', flexShrink: 0 }} testID={testID}>
      <Text variant="numM" style={{ fontSize: 17, lineHeight: 22 }}>
        {approx || range ? '~' : ''}
        {kcal(value)}
        <Text variant="unit">{' kcal'}</Text>
      </Text>
      {range ? (
        <Text variant="caption" color="textSecondary" tabular>
          {`${kcal(range[0])}–${kcal(range[1])} kcal`}
        </Text>
      ) : null}
    </View>
  );
}

/** A flex cell's floor on the web: its content's width (react-native-web sets 0). Yoga has no 'auto' minimum. */
const WEB_CELL = (Platform.OS === 'web' ? { minWidth: 'auto' } : null) as ViewStyle | null;

/**
 * Meal selector as an underline tab row with stable test ids (`meal-breakfast`, ...). `advice`: one line drawn
 * under the choice and tied to it (`aria-describedby` on the radiogroup on the web, each radio's
 * `accessibilityHint` natively), for a pick that does more than choose (Edit entry's one-tap move, WCAG 3.2.2);
 * testID `<prefix>-advice`.
 */
export function MealPicker({ value, onChange, testIDPrefix = 'meal', advice }: { value: MealType; onChange: (m: MealType) => void; testIDPrefix?: string; advice?: string }) {
  const { colors, spacing } = useTheme();
  // Four equal cells leave about 60 px each on a 320 px phone: 'Breakfast' fits there one size down.
  const narrow = useWindowDimensions().width < 340;
  // With large text the four take two lines of two, so no word reaches past the screen (never smaller text).
  const big = useLargeText();
  const web = Platform.OS === 'web';
  const adviceId = `${testIDPrefix}-advice-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const group = (
    // One choice of a form, read as radios (drawn as underline tabs, as the kit's Segmented with `role="radiogroup"`):
    // the meal is a field, not a view switch, so it is a radiogroup named "Meal", never tabs with no panel.
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel="Meal"
      {...(advice && web ? ({ 'aria-describedby': adviceId } as object) : null)}
      style={{ flexDirection: 'row', flexWrap: big ? 'wrap' : 'nowrap', borderBottomWidth: 1, borderBottomColor: colors.border }}>
      {MEALS.map((m, i) => {
        const active = m.id === value;
        return (
          <PressableScale
            key={m.id}
            testID={`${testIDPrefix}-${m.id}`}
            feedback="select"
            scaleTo={0.98}
            onPress={() => onChange(m.id)}
            accessibilityRole="radio"
            accessibilityLabel={m.label}
            accessibilityHint={advice && !web ? advice : undefined}
            accessibilityState={{ checked: active }}
            // react-native-web reads the aria prop, not accessibilityState.
            aria-checked={active}
            {...(web
              ? {
                  // One tab stop for the group, the chosen meal. The arrow keys move the focus and Space or Enter
                  // picks: in Edit entry a pick moves the entry at once (`pickMeal`), so an arrow never does it alone.
                  tabIndex: active ? 0 : -1,
                  onKeyDown: (e: { key: string; currentTarget: unknown; preventDefault: () => void }) => {
                    const next = rovingIndex(e.key, i, MEALS.length);
                    if (next === null) return;
                    e.preventDefault();
                    const row = (e.currentTarget as HTMLElement | null)?.parentElement;
                    (row?.children[next] as HTMLElement | undefined)?.focus();
                  },
                }
              : null)}
            // On the web a cell never shrinks below its word, so wider letter spacing (WCAG 1.4.12) widens
            // "Breakfast" at its neighbours' expense instead of cutting it; natively the word stays one line.
            style={[big ? { width: '50%', minHeight: 44, alignItems: 'center', justifyContent: 'center' } : [{ flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: narrow ? 0 : 2 }, WEB_CELL]]}>
            <Text variant="label" color={active ? 'text' : 'textSecondary'} numberOfLines={Platform.OS === 'web' ? undefined : 1} style={{ fontSize: narrow ? 13 : 14.5, lineHeight: 20, fontFamily: active ? fonts.bold : fonts.semibold }}>
              {m.label}
            </Text>
            {active ? <View pointerEvents="none" style={{ position: 'absolute', left: '18%', right: '18%', bottom: -2, height: 3, borderRadius: 1, backgroundColor: colors.rim }} /> : null}
          </PressableScale>
        );
      })}
    </View>
  );
  if (!advice) return group;
  return (
    <View style={{ gap: spacing.sm }}>
      {group}
      <Text testID={`${testIDPrefix}-advice`} nativeID={adviceId} variant="caption" color="textSecondary">
        {advice}
      </Text>
    </View>
  );
}

/**
 * The day of an entry, the one date control (food detail, quick add, Saved meals, copying a meal, and the run
 * and strength logs through `DateStepper` in `@/features/activity/components`): previous and next day with
 * the day named in the middle (`entryDayLabel`: "Today", "Yesterday", "Sat, Nov 14"); a tap on it returns to
 * today. It never goes past `latest`: by default the diary's week ahead (food can be planned), today for a
 * workout. testIDs: `<prefix>-prev`, `<prefix>-today` (the middle), `<prefix>-label` (its words), `<prefix>-next`.
 */
/** `nextHint`: why the next arrow is greyed when it is (a workout cannot be logged before it is done), read with it. */
export function DayStepper({ value, onChange, testIDPrefix = 'day', latest, nextHint }: { value: ISODate; onChange: (d: ISODate) => void; testIDPrefix?: string; latest?: ISODate; nextHint?: string }) {
  const { colors, radius } = useTheme();
  const todayDate = useToday();
  const isToday = value === todayDate;
  const last = latest ?? foodLatestDay(todayDate);
  const forward = canStepForward(value, last);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, ...cup(radius.buttonSm, 5), borderWidth: 1.5, borderColor: colors.borderStrong }}>
      <IconButton testID={`${testIDPrefix}-prev`} accessibilityLabel="Previous day" tone="clear" size={44} onPress={() => onChange(addDays(value, -1))}>
        <ChevronLeft size={20} color={colors.text} strokeWidth={1.9} />
      </IconButton>
      <PressableScale
        testID={`${testIDPrefix}-today`}
        onPress={() => !isToday && onChange(todayDate)}
        accessibilityLabel={entryDaySpoken(value, todayDate)}
        style={{ flex: 1, minWidth: 0, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6, minHeight: 44 }}>
        <CalendarDays size={18} color={colors.textSecondary} strokeWidth={1.9} />
        <Text variant="label" testID={`${testIDPrefix}-label`} numberOfLines={1} style={{ flexShrink: 1 }}>
          {entryDayLabel(value, todayDate)}
        </Text>
      </PressableScale>
      <IconButton
        testID={`${testIDPrefix}-next`}
        accessibilityLabel={!forward && nextHint ? `Next day. ${nextHint}` : 'Next day'}
        tone="clear"
        size={44}
        disabled={!forward}
        onPress={() => forward && onChange(addDays(value, 1))}>
        <ChevronRight size={20} color={colors.text} strokeWidth={1.9} />
      </IconButton>
    </View>
  );
}

/** Calories as a large number with a small unit. */
export function KcalValue({ value, variant = 'numL', color }: { value: number; variant?: 'numXL' | 'numL' | 'numM'; color?: 'text' | 'caloriesInk' | 'warning' }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 5 }}>
      <Text variant={variant} tabular color={color ?? 'text'}>
        {kcal(value)}
      </Text>
      <Text variant="unit" style={variant === 'numXL' ? { fontSize: 15 } : undefined}>
        kcal
      </Text>
    </View>
  );
}

/** Amount controls for a row whose food was just added: step it, or open the full amount editor. */
/** Taps on the stepper are ignored for this long after the + that created it. */
const STEPPER_GUARD_MS = 450;

export interface RowAmount {
  /** "1.5 ×" or "150 g". */
  label: string;
  onStep: (dir: 1 | -1) => void;
  onOpen: () => void;
}

/**
 * Search result row: tap opens the detail screen, the trailing button logs the
 * shown portion in one tap. Once added, the button becomes a compact stepper
 * for that diary entry (minus at the smallest step removes it).
 */
export function FoodRow({
  food,
  subtitle,
  kcalValue,
  onPress,
  onQuickAdd,
  trailing,
  testID,
  amount,
  matched,
  onLongPress,
  longPressLabel,
}: {
  food: Food;
  /** The portion, already for display (`portionLabel`). */
  subtitle: string;
  kcalValue: number;
  onPress: () => void;
  onQuickAdd?: () => void;
  trailing?: React.ReactNode;
  testID?: string;
  amount?: RowAmount;
  /**
   * The search name the query matched when it was not the stored name (a Hebrew name, `SearchHit.matched`):
   * one quiet line under the name, so a person sees why the row is there. Search results only.
   */
  matched?: string;
  /**
   * Press and hold (500 ms): stars or unstars the food (`toggleFoodFavorite`). A long press never also
   * opens the row. Screen readers get the same act as a named action, `longPressLabel`.
   */
  onLongPress?: () => void;
  /** "Add to favourites" or "Remove from favourites" (`favoriteActionLabel`). */
  longPressLabel?: string;
}) {
  const { colors, spacing } = useTheme();
  const { width } = useWindowDimensions();
  const [added, setAdded] = useState(false);
  // The + turns into a stepper whose own + sits under the same finger. A second tap of a
  // double tap must not land on it and change the amount that was just logged.
  const [addedAt, setAddedAt] = useState(0);
  const guarded: RowAmount | undefined = amount && {
    ...amount,
    onStep: (direction) => {
      if (Date.now() - addedAt < STEPPER_GUARD_MS) return;
      amount.onStep(direction);
    },
  };
  useEffect(() => {
    if (!added) return;
    const t = setTimeout(() => setAdded(false), 1400);
    return () => clearTimeout(t);
  }, [added]);
  // On a narrow phone the stepper (about 130 px) would leave the name a few words: it goes under the row instead.
  const stack = !!amount && width < 360;
  // Drawn without the reference list's capitals ("Oats, rolled, dry (uncooked)"); stored and searched as it is.
  const name = displayFoodName(food);
  // The source's mark leads the line and its word ends it (none for reference data, whose filled key is enough);
  // once added, the live kcal leads.
  const kind = sourceKindOf(food);
  const caption = withSourceWord(
    `${amount ? `${kcal(kcalValue)} kcal · ` : food.brand ? `${isolateRtl(food.brand)} · ` : ''}${subtitle}${amount ? '' : ` · ${kcal(kcalValue)} kcal`}`,
    kind,
  );
  // The row's name says what it shows, as drawn and in its order (WCAG 2.5.3, label in name), as the diary's row
  // does: the name (and the name the query found), the line under it, then the source in words where the line has no
  // word for it ("Whey protein shake, 1 scoop · 114 kcal, Reference data. Open details"); a name in Hebrew or Arabic
  // is spoken in its own language.
  const source = sourceInfo(kind);
  const lang = useLangName(`${name}${matched ? `, ${matched}` : ''}, ${withoutMarks(caption)}${rowSourceWord(kind) === source.label ? '' : `, ${source.label}`}. Open details`);
  return (
    <View style={stack ? { paddingBottom: spacing.sm } : { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
      <PressableScale
        testID={testID}
        onPress={onPress}
        onLongPress={onLongPress}
        {...(onLongPress && longPressLabel
          ? {
              accessibilityActions: [{ name: 'favorite', label: longPressLabel }],
              onAccessibilityAction: (e: { nativeEvent: { actionName: string } }) => {
                if (e.nativeEvent.actionName === 'favorite') onLongPress();
              },
            }
          : null)}
        scaleTo={0.985}
        // The source is said in words here for every source (the caption names only those worth a second look).
        accessibilityLabel={lang.label}
        {...lang.props}
        style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56, paddingVertical: 11 }}>
        {lang.hidden}
        <RowEmoji emoji={food.emoji} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          {/* Up to three lines, as in the diary: a long name ("Israeli salad (tomato, cucumber, onion, ...)") is read, not cut. */}
          <Text variant="bodyStrong" numberOfLines={3} style={{ fontFamily: fonts.semibold }}>
            {isolateRtl(name)}
          </Text>
          {/* The name the query found, on one line in the name's column (a title and its one line under it). */}
          {matched ? (
            <Text variant="caption" color="textSecondary" numberOfLines={1} testID={testID ? `${testID}-matched` : undefined}>
              {isolateRtl(matched)}
            </Text>
          ) : null}
          {/* The source's mark leads the line and its word ends it (none for reference data, whose filled key
              is enough), so a long portion or brand wraps to a second line instead of cutting the calories. */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
            <SourceMark source={kind} color={colors.textSecondary} size={8} style={{ marginTop: sourceMarkTop(kind) }} />
            <Text variant="caption" color="textSecondary" numberOfLines={2} style={{ flexShrink: 1 }}>
              {caption}
            </Text>
          </View>
        </View>
      </PressableScale>
      {trailing}
      {amount ? (
        <View style={stack ? { alignSelf: 'flex-end' } : undefined}>
          <AmountStepper amount={guarded ?? amount} name={name} testID={testID} />
        </View>
      ) : onQuickAdd ? (
        <LangIconButton
          testID={testID ? `${testID}-add` : undefined}
          accessibilityLabel={`Add ${name}`}
          tone="surface"
          size={44}
          onPress={() => {
            setAddedAt(Date.now());
            setAdded(true);
            onQuickAdd();
          }}>
          {/* Added: the done mark, the small filled ink cup (never a check, which means only a day on budget). */}
          {added ? <CupKey color={colors.text} size={12} /> : <Plus size={20} color={colors.text} strokeWidth={2.2} />}
        </LangIconButton>
      ) : null}
    </View>
  );
}

function AmountStepper({ amount, name, testID }: { amount: RowAmount; name: string; testID?: string }) {
  const { colors, radius } = useTheme();
  const lang = useLangName(`${name}, ${withoutMarks(amount.label)}. Change amount`);
  return (
    <View
      testID={testID ? `${testID}-stepper` : undefined}
      style={{ flexDirection: 'row', alignItems: 'center', ...cup(radius.buttonSm, 5), borderWidth: 1.5, borderColor: colors.borderStrong }}>
      <LangIconButton testID={testID ? `${testID}-less` : undefined} accessibilityLabel={`Less ${name}`} tone="clear" size={44} onPress={() => amount.onStep(-1)}>
        <Minus size={18} color={colors.text} strokeWidth={2.2} />
      </LangIconButton>
      <PressableScale
        testID={testID ? `${testID}-amount` : undefined}
        onPress={amount.onOpen}
        feedback="select"
        accessibilityLabel={lang.label}
        {...lang.props}
        style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
        {lang.hidden}
        <Text variant="numM" tabular numberOfLines={1} style={{ fontSize: 14.5, lineHeight: 18 }}>
          {amount.label}
        </Text>
      </PressableScale>
      <LangIconButton testID={testID ? `${testID}-more` : undefined} accessibilityLabel={`More ${name}`} tone="clear" size={44} onPress={() => amount.onStep(1)}>
        <Plus size={18} color={colors.text} strokeWidth={2.2} />
      </LangIconButton>
    </View>
  );
}

/** Small labelled number used in macro rows: a cup key, the label, then "32 / 150 g". */
export function MacroStat({ label, value, target, color }: { label: string; value: number; target?: number; color: string }) {
  // With large text a parent row that wraps gives each figure at least 120 px, so "Protein" is never cut.
  const big = useLargeText();
  return (
    <View style={[big ? { flexGrow: 1, flexBasis: 120 } : { flex: 1 }, { minWidth: 0, gap: 4 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <CupKey color={color} />
        <Text variant="label" numberOfLines={1} style={{ flexShrink: 1 }}>
          {label}
        </Text>
      </View>
      <Text variant="numM" tabular numberOfLines={1} style={{ fontSize: 17, lineHeight: 22 }}>
        {Math.round(value)}
        <Text variant="caption" color="textSecondary">
          {target !== undefined ? ` / ${Math.round(target)} g` : ' g'}
        </Text>
      </Text>
    </View>
  );
}
