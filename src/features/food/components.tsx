import { CalendarDays, Check, ChevronLeft, ChevronRight, Minus, Plus } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native';

import { SourceMark, sourceMarkTop } from '@/features/ai/mark';
import { useToday } from '@/store/clock';
import { isolateRtl } from '@/lib/bidi';
import { addDays } from '@/lib/dates';
import { MEALS } from '@/lib/nutrition';
import { cup, fonts, useTheme } from '@/theme';
import type { Food, FoodSource, ISODate, MealType } from '@/types';
import { CupKey, IconButton, PressableScale, Text } from '@/ui';

import { displayFoodName } from './displayName';
import { canStepForward, entryDayLabel, entryDaySpoken, foodLatestDay } from './entryDay';
import { kcal, sourceInfo, withSourceWord } from './helpers';

// How a data source is marked lives with the mark itself (`SourceMark`, `@/features/ai/mark`): a filled cup
// key for reference data, an outline for community or your own numbers, the small AI mark for an AI estimate.

/** The source's mark plus its name, on a faint tint (the detail page). */
export function SourceBadge({ source, style }: { source: FoodSource; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  const info = sourceInfo(source);
  return (
    <View
      testID="food-source-badge"
      accessibilityLabel={`Data source: ${info.label}`}
      style={[
        { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, height: 26, borderRadius: 4, backgroundColor: colors.surfaceAlt, alignSelf: 'flex-start' },
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
export function SourceTag({ source, plain = false, label }: { source: FoodSource; plain?: boolean; label?: string }) {
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
    <View style={{ width: 24, alignItems: 'center' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
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

/** Meal selector as an underline tab row with stable test ids (`meal-breakfast`, ...). */
export function MealPicker({ value, onChange, testIDPrefix = 'meal' }: { value: MealType; onChange: (m: MealType) => void; testIDPrefix?: string }) {
  const { colors } = useTheme();
  // Four equal cells leave about 60 px each on a 320 px phone: 'Breakfast' fits there one size down.
  const narrow = useWindowDimensions().width < 340;
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border }}>
      {MEALS.map((m) => {
        const active = m.id === value;
        return (
          <PressableScale
            key={m.id}
            testID={`${testIDPrefix}-${m.id}`}
            feedback="select"
            scaleTo={0.98}
            onPress={() => onChange(m.id)}
            accessibilityRole="tab"
            accessibilityLabel={m.label}
            accessibilityState={{ selected: active }}
            style={{ flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: narrow ? 0 : 2 }}>
            <Text variant="label" color={active ? 'text' : 'textSecondary'} numberOfLines={1} style={{ fontSize: narrow ? 13 : 14.5, lineHeight: 20, fontFamily: active ? fonts.bold : fonts.semibold }}>
              {m.label}
            </Text>
            {active ? <View pointerEvents="none" style={{ position: 'absolute', left: '18%', right: '18%', bottom: -2, height: 3, borderRadius: 1, backgroundColor: colors.rim }} /> : null}
          </PressableScale>
        );
      })}
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
export function DayStepper({ value, onChange, testIDPrefix = 'day', latest }: { value: ISODate; onChange: (d: ISODate) => void; testIDPrefix?: string; latest?: ISODate }) {
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
        feedback={isToday ? 'none' : 'tap'}
        accessibilityLabel={entryDaySpoken(value, todayDate)}
        style={{ flex: 1, minWidth: 0, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6, minHeight: 44 }}>
        <CalendarDays size={16} color={colors.textSecondary} strokeWidth={1.9} />
        <Text variant="label" testID={`${testIDPrefix}-label`} numberOfLines={1} style={{ flexShrink: 1 }}>
          {entryDayLabel(value, todayDate)}
        </Text>
      </PressableScale>
      <IconButton
        testID={`${testIDPrefix}-next`}
        accessibilityLabel="Next day"
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
        accessibilityLabel={`${name}${matched ? `, ${matched}` : ''}, ${Math.round(kcalValue)} kilocalories, ${sourceInfo(food.source).label}. Open details`}
        style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56, paddingVertical: 11 }}>
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
            <SourceMark source={food.source} color={colors.textSecondary} size={8} style={{ marginTop: sourceMarkTop(food.source) }} />
            <Text variant="caption" color="textSecondary" numberOfLines={2} style={{ flexShrink: 1 }}>
              {/* Once added, the live kcal leads. */}
              {withSourceWord(
                `${amount ? `${kcal(kcalValue)} kcal · ` : food.brand ? `${isolateRtl(food.brand)} · ` : ''}${subtitle}${amount ? '' : ` · ${kcal(kcalValue)} kcal`}`,
                food.source,
              )}
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
        <IconButton
          testID={testID ? `${testID}-add` : undefined}
          accessibilityLabel={`Add ${name}`}
          tone={added ? 'primary' : 'surface'}
          size={44}
          onPress={() => {
            setAddedAt(Date.now());
            setAdded(true);
            onQuickAdd();
          }}>
          {added ? <Check size={20} color={colors.onPrimary} strokeWidth={2.2} /> : <Plus size={20} color={colors.text} strokeWidth={2.2} />}
        </IconButton>
      ) : null}
    </View>
  );
}

function AmountStepper({ amount, name, testID }: { amount: RowAmount; name: string; testID?: string }) {
  const { colors, radius } = useTheme();
  return (
    <View
      testID={testID ? `${testID}-stepper` : undefined}
      style={{ flexDirection: 'row', alignItems: 'center', ...cup(radius.buttonSm, 5), borderWidth: 1.5, borderColor: colors.borderStrong }}>
      <IconButton testID={testID ? `${testID}-less` : undefined} accessibilityLabel={`Less ${name}`} tone="clear" size={44} onPress={() => amount.onStep(-1)}>
        <Minus size={18} color={colors.text} strokeWidth={2.2} />
      </IconButton>
      <PressableScale
        testID={testID ? `${testID}-amount` : undefined}
        onPress={amount.onOpen}
        feedback="select"
        accessibilityLabel={`${name}, ${amount.label}. Change amount`}
        style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
        <Text variant="numM" tabular numberOfLines={1} style={{ fontSize: 14.5, lineHeight: 18 }}>
          {amount.label}
        </Text>
      </PressableScale>
      <IconButton testID={testID ? `${testID}-more` : undefined} accessibilityLabel={`More ${name}`} tone="clear" size={44} onPress={() => amount.onStep(1)}>
        <Plus size={18} color={colors.text} strokeWidth={2.2} />
      </IconButton>
    </View>
  );
}

/** Small labelled number used in macro rows: a cup key, the label, then "32 / 150 g". */
export function MacroStat({ label, value, target, color }: { label: string; value: number; target?: number; color: string }) {
  return (
    <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
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
