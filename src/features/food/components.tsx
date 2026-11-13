import { CalendarDays, Check, ChevronLeft, ChevronRight, Plus } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { addDays, formatDayLabel, formatLongDate, today } from '@/lib/dates';
import { MEALS } from '@/lib/nutrition';
import { useTheme } from '@/theme';
import type { Food, FoodSource, ISODate, MealType } from '@/types';
import { Avatar, IconButton, PressableScale, Text } from '@/ui';

import { kcal, sourceInfo } from './helpers';

/** Pill naming where the numbers come from. */
export function SourceBadge({ source, style }: { source: FoodSource; style?: StyleProp<ViewStyle> }) {
  const { colors, radius } = useTheme();
  const info = sourceInfo(source);
  const c = colors[info.color];
  return (
    <View
      testID="food-source-badge"
      accessibilityLabel={`Data source: ${info.label}`}
      style={[
        { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, height: 26, borderRadius: radius.pill, backgroundColor: `${c}22`, alignSelf: 'flex-start' },
        style,
      ]}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c }} />
      <Text variant="caption" color={c}>
        {info.label}
      </Text>
    </View>
  );
}

/** Tiny dot + word for list rows: present but quiet. */
export function SourceTag({ source }: { source: FoodSource }) {
  const { colors } = useTheme();
  const info = sourceInfo(source);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: colors[info.color] }} />
      <Text variant="caption" color="textTertiary" style={{ fontSize: 11 }}>
        {info.short}
      </Text>
    </View>
  );
}

/** Meal selector as four chips with stable test ids (`meal-breakfast`, ...). */
export function MealPicker({ value, onChange, testIDPrefix = 'meal' }: { value: MealType; onChange: (m: MealType) => void; testIDPrefix?: string }) {
  const { colors, radius } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 6, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: 4 }}>
      {MEALS.map((m) => {
        const active = m.id === value;
        return (
          <PressableScale
            key={m.id}
            testID={`${testIDPrefix}-${m.id}`}
            feedback="select"
            scaleTo={0.97}
            onPress={() => onChange(m.id)}
            accessibilityLabel={m.label}
            accessibilityState={{ selected: active }}
            style={{
              flex: 1,
              minHeight: 44,
              borderRadius: radius.sm,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: active ? colors.surface : 'transparent',
              borderWidth: active ? 1 : 0,
              borderColor: colors.borderStrong,
            }}>
            <Text variant="label" color={active ? 'text' : 'textSecondary'} numberOfLines={1}>
              {m.label}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}

/** Previous / next day with the date in the middle; tap the label to return to today. */
export function DayStepper({ value, onChange, testIDPrefix = 'day' }: { value: ISODate; onChange: (d: ISODate) => void; testIDPrefix?: string }) {
  const { colors, radius } = useTheme();
  const isToday = value === today();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: 4 }}>
      <IconButton testID={`${testIDPrefix}-prev`} accessibilityLabel="Previous day" tone="clear" size={44} onPress={() => onChange(addDays(value, -1))}>
        <ChevronLeft size={20} color={colors.text} />
      </IconButton>
      <PressableScale
        testID={`${testIDPrefix}-today`}
        onPress={() => !isToday && onChange(today())}
        feedback={isToday ? 'none' : 'tap'}
        accessibilityLabel={isToday ? 'Today' : `${formatLongDate(value)}, tap for today`}
        style={{ flex: 1, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6, minHeight: 44 }}>
        <CalendarDays size={16} color={colors.textSecondary} />
        <Text variant="label">{formatDayLabel(value)}</Text>
      </PressableScale>
      <IconButton testID={`${testIDPrefix}-next`} accessibilityLabel="Next day" tone="clear" size={44} onPress={() => onChange(addDays(value, 1))}>
        <ChevronRight size={20} color={colors.text} />
      </IconButton>
    </View>
  );
}

/** Calories as a large number with a small unit. */
export function KcalValue({ value, variant = 'numL', color }: { value: number; variant?: 'numXL' | 'numL' | 'numM'; color?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
      <Text variant={variant} tabular color={color ?? 'text'}>
        {kcal(value)}
      </Text>
      <Text variant="label" color="textSecondary">
        kcal
      </Text>
    </View>
  );
}

/**
 * Search result row: tap opens the detail screen, the trailing button logs the
 * shown portion in one tap. The button briefly turns into a tick.
 */
export function FoodRow({
  food,
  subtitle,
  kcalValue,
  onPress,
  onQuickAdd,
  trailing,
  testID,
}: {
  food: Food;
  subtitle: string;
  kcalValue: number;
  onPress: () => void;
  onQuickAdd?: () => void;
  trailing?: React.ReactNode;
  testID?: string;
}) {
  const { colors, spacing } = useTheme();
  const [added, setAdded] = useState(false);
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
        style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 60, paddingVertical: spacing.sm }}>
        <Avatar emoji={food.emoji ?? '🍽️'} size={42} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {food.name}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text variant="caption" color="textSecondary" numberOfLines={1} style={{ flexShrink: 1 }}>
              {food.brand ? `${food.brand} · ` : ''}
              {subtitle} · {kcal(kcalValue)} kcal
            </Text>
            <SourceTag source={food.source} />
          </View>
        </View>
      </PressableScale>
      {trailing}
      {onQuickAdd ? (
        <IconButton
          testID={testID ? `${testID}-add` : undefined}
          accessibilityLabel={`Add ${food.name}`}
          tone={added ? 'primary' : 'alt'}
          size={40}
          onPress={() => {
            setAdded(true);
            onQuickAdd();
          }}>
          {added ? <Check size={18} color={colors.onPrimary} /> : <Plus size={18} color={colors.text} />}
        </IconButton>
      ) : null}
    </View>
  );
}

/** Small labelled number used in macro rows: "32 g / 150 g". */
export function MacroStat({ label, value, target, color }: { label: string; value: number; target?: number; color: string }) {
  return (
    <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
        <Text variant="caption" color="textSecondary" numberOfLines={1}>
          {label}
        </Text>
      </View>
      <Text variant="bodyStrong" tabular numberOfLines={1}>
        {Math.round(value)}
        <Text variant="caption" color="textSecondary">
          {target !== undefined ? ` / ${Math.round(target)} g` : ' g'}
        </Text>
      </Text>
    </View>
  );
}
