import { X } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { Animated, Platform, View } from 'react-native';

import { SourceTag } from '@/features/food/components';
import { dayPhrase, formatQty, kcal, lastPortions, portionFor } from '@/features/food/helpers';
import { MEAL_LABEL, scaleNutrients, servingsFor } from '@/lib/nutrition';
import { useDay, useLive } from '@/store/selectors';
import { useTheme } from '@/theme';
import type { Food, ISODate, MealType, Serving } from '@/types';
import { Avatar, Button, Chip, ChipRow, IconButton, Stepper, Text } from '@/ui';

export type ScanFoundFrom = 'custom' | 'recent' | 'diary' | 'openfoodfacts';

const FROM_COPY: Record<ScanFoundFrom, string> = {
  custom: 'From your foods',
  recent: 'Logged before',
  diary: 'Logged before',
  openfoodfacts: 'Open Food Facts',
};

/**
 * A scanned product, confirmed on a card over the live camera: the last
 * portion eaten (or the first serving), what it leaves for the day, and one
 * button to add it. The scanner stays ready for the next product.
 */
export function ScanResultCard({
  food,
  from,
  meal,
  date,
  onAdd,
  onDetails,
  onClose,
}: {
  food: Food;
  from: ScanFoundFrom;
  meal: MealType;
  date: ISODate;
  onAdd: (serving: Serving, quantity: number) => void;
  onDetails: () => void;
  onClose: () => void;
}) {
  const { colors, radius, spacing } = useTheme();
  const entries = useLive('foodEntries');
  const [portion, setPortion] = useState(() => portionFor(food, lastPortions(entries)));
  const [enter] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.spring(enter, { toValue: 1, useNativeDriver: Platform.OS !== 'web', speed: 18, bounciness: 4 }).start();
  }, [enter]);

  const options = servingsFor(food).filter((s) => s.label !== '1 g');
  const list = options.some((s) => s.label === portion.serving.label) ? options : [portion.serving, ...options];
  const grams = portion.serving.grams * portion.quantity;
  const n = scaleNutrients(food.per100g, grams);
  const isGrams = portion.serving.label === '1 g';

  return (
    <Animated.View
      testID="scan-result"
      style={{
        backgroundColor: colors.surface,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: colors.border,
        padding: spacing.lg,
        gap: spacing.md,
        opacity: enter,
        transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [32, 0] }) }],
      }}>
      <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
        <Avatar emoji={food.emoji ?? '🛒'} size={48} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text variant="title" numberOfLines={2} testID="scan-result-name">
            {food.name}
          </Text>
          {food.brand ? (
            <Text variant="caption" color="textSecondary" numberOfLines={1}>
              {food.brand}
            </Text>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 2 }}>
            <SourceTag source={food.source} />
            {from !== 'openfoodfacts' ? (
              <Text variant="caption" color="textTertiary" style={{ fontSize: 11 }}>
                · {FROM_COPY[from]}
              </Text>
            ) : null}
          </View>
        </View>
        <IconButton testID="scan-result-close" accessibilityLabel="Close and scan again" size={36} tone="alt" onPress={onClose}>
          <X size={18} color={colors.textSecondary} />
        </IconButton>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
          <Text variant="numL" tabular testID="scan-result-kcal">
            {kcal(n.kcal)}
          </Text>
          <Text variant="label" color="textSecondary">
            kcal
          </Text>
        </View>
        <Stepper
          label="quantity"
          value={portion.quantity}
          step={isGrams ? 10 : 0.5}
          min={isGrams ? 1 : 0.5}
          max={isGrams ? 5000 : 20}
          format={(v) => (isGrams ? `${formatQty(v)} g` : `${formatQty(v)} ×`)}
          onChange={(v) => setPortion({ serving: portion.serving, quantity: v })}
        />
      </View>

      <ChipRow>
        {list.map((s, i) => (
          <Chip
            key={`${s.label}-${i}`}
            testID={`scan-serving-${i}`}
            label={s.label}
            selected={s.label === portion.serving.label}
            onPress={() => setPortion({ serving: s, quantity: 1 })}
          />
        ))}
      </ChipRow>

      <Impact date={date} kcalValue={n.kcal} grams={grams} />

      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <Button testID="scan-result-details" title="Details" variant="ghost" size="md" full={false} onPress={onDetails} />
        <Button
          testID="scan-result-add"
          title={`Add to ${MEAL_LABEL[meal].toLowerCase()}`}
          size="md"
          style={{ flex: 1 }}
          disabled={!(grams > 0)}
          onPress={() => onAdd(portion.serving, portion.quantity)}
        />
      </View>
    </Animated.View>
  );
}

/** "Leaves 640 kcal for today", or amber when it goes over. */
function Impact({ date, kcalValue, grams }: { date: ISODate; kcalValue: number; grams: number }) {
  const { colors, radius, spacing } = useTheme();
  const day = useDay(date);
  const after = Math.round(day.remaining - kcalValue);
  const over = after < 0;
  return (
    <View
      testID="scan-result-impact"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: radius.md,
        backgroundColor: over ? `${colors.warning}22` : colors.primarySoft,
      }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: over ? colors.warning : colors.calories }} />
      <Text variant="caption" color={over ? 'warning' : 'text'} style={{ flex: 1 }}>
        {over ? `Puts ${dayPhrase(date)} ${kcal(-after)} kcal over budget` : `Leaves ${kcal(after)} kcal for ${dayPhrase(date)}`}
      </Text>
      <Text variant="caption" color="textSecondary" tabular>
        {Math.round(grams)} g
      </Text>
    </View>
  );
}
