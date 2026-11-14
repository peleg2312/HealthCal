import { CalendarDays, Check, ChevronLeft, ChevronRight, Minus, Plus } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { useToday } from '@/store/clock';
import { addDays, formatDayLabel, formatLongDate, today } from '@/lib/dates';
import { MEALS } from '@/lib/nutrition';
import { cup, fonts, useTheme } from '@/theme';
import type { Food, FoodSource, ISODate, MealType } from '@/types';
import { CupKey, IconButton, PressableScale, Text } from '@/ui';

import { kcal, sourceInfo } from './helpers';

/** How a data source is marked: a filled cup key for reference data, an outline for community or your own numbers, dashed for an AI estimate. */
export function sourceKeyVariant(source: FoodSource): 'filled' | 'outline' | 'dashed' {
  if (source === 'builtin' || source === 'usda') return 'filled';
  if (source === 'ai') return 'dashed';
  return 'outline';
}

/** A cup key plus the source's name, on a faint tint (the detail page). */
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
      <CupKey color={colors.textSecondary} variant={sourceKeyVariant(source)} />
      <Text variant="label" color="text">
        {info.label}
      </Text>
    </View>
  );
}

/** Cup key and short source name for list captions: present but quiet. */
export function SourceTag({ source }: { source: FoodSource }) {
  const { colors } = useTheme();
  const info = sourceInfo(source);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 0 }}>
      <CupKey color={colors.textSecondary} variant={sourceKeyVariant(source)} size={8} />
      <Text variant="caption" color="textSecondary" numberOfLines={1}>
        {info.short}
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
            style={{ flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 2 }}>
            <Text variant="label" color={active ? 'text' : 'textSecondary'} numberOfLines={1} style={{ fontSize: 14.5, lineHeight: 20, fontFamily: active ? fonts.bold : fonts.semibold }}>
              {m.label}
            </Text>
            {active ? <View pointerEvents="none" style={{ position: 'absolute', left: '18%', right: '18%', bottom: -2, height: 3, borderRadius: 1, backgroundColor: colors.rim }} /> : null}
          </PressableScale>
        );
      })}
    </View>
  );
}

/** Previous / next day with the date in the middle; tap the label to return to today. */
export function DayStepper({ value, onChange, testIDPrefix = 'day' }: { value: ISODate; onChange: (d: ISODate) => void; testIDPrefix?: string }) {
  const { colors, radius } = useTheme();
  const isToday = value === useToday();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, ...cup(radius.buttonSm, 5), borderWidth: 1.5, borderColor: colors.borderStrong }}>
      <IconButton testID={`${testIDPrefix}-prev`} accessibilityLabel="Previous day" tone="clear" size={44} onPress={() => onChange(addDays(value, -1))}>
        <ChevronLeft size={20} color={colors.text} strokeWidth={1.9} />
      </IconButton>
      <PressableScale
        testID={`${testIDPrefix}-today`}
        onPress={() => !isToday && onChange(today())}
        feedback={isToday ? 'none' : 'tap'}
        accessibilityLabel={isToday ? 'Today' : `${formatLongDate(value)}, tap for today`}
        style={{ flex: 1, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6, minHeight: 44 }}>
        <CalendarDays size={16} color={colors.textSecondary} strokeWidth={1.9} />
        <Text variant="label">{formatDayLabel(value)}</Text>
      </PressableScale>
      <IconButton testID={`${testIDPrefix}-next`} accessibilityLabel="Next day" tone="clear" size={44} onPress={() => onChange(addDays(value, 1))}>
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
}: {
  food: Food;
  subtitle: string;
  kcalValue: number;
  onPress: () => void;
  onQuickAdd?: () => void;
  trailing?: React.ReactNode;
  testID?: string;
  amount?: RowAmount;
}) {
  const { colors, spacing } = useTheme();
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
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
      <PressableScale
        testID={testID}
        onPress={onPress}
        scaleTo={0.985}
        accessibilityLabel={`${food.name}, ${Math.round(kcalValue)} kilocalories. Open details`}
        style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56, paddingVertical: 11 }}>
        <RowEmoji emoji={food.emoji} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text variant="bodyStrong" numberOfLines={1} style={{ fontFamily: fonts.semibold }}>
            {food.name}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text variant="caption" color="textSecondary" numberOfLines={1} style={{ flexShrink: 1 }}>
              {/* Once added, the live kcal leads so a narrower line still shows it. */}
              {amount ? `${kcal(kcalValue)} kcal · ` : food.brand ? `${food.brand} · ` : ''}
              {subtitle}
              {amount ? '' : ` · ${kcal(kcalValue)} kcal`}
            </Text>
            <SourceTag source={food.source} />
          </View>
        </View>
      </PressableScale>
      {trailing}
      {amount ? (
        <AmountStepper amount={guarded ?? amount} name={food.name} testID={testID} />
      ) : onQuickAdd ? (
        <IconButton
          testID={testID ? `${testID}-add` : undefined}
          accessibilityLabel={`Add ${food.name}`}
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
      <IconButton testID={testID ? `${testID}-less` : undefined} accessibilityLabel={`Less ${name}`} tone="clear" size={42} onPress={() => amount.onStep(-1)}>
        <Minus size={18} color={colors.text} strokeWidth={2.2} />
      </IconButton>
      <PressableScale
        testID={testID ? `${testID}-amount` : undefined}
        onPress={amount.onOpen}
        feedback="select"
        accessibilityLabel={`${name}, ${amount.label}. Change amount`}
        style={{ minWidth: 40, minHeight: 42, alignItems: 'center', justifyContent: 'center' }}>
        <Text variant="numM" tabular numberOfLines={1} style={{ fontSize: 14.5, lineHeight: 18 }}>
          {amount.label}
        </Text>
      </PressableScale>
      <IconButton testID={testID ? `${testID}-more` : undefined} accessibilityLabel={`More ${name}`} tone="clear" size={42} onPress={() => amount.onStep(1)}>
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
