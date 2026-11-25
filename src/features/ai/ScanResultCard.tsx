import { X } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { Animated, Platform, useWindowDimensions, View } from 'react-native';

import { SourceTag } from '@/features/food/components';
import { displayFoodName } from '@/features/food/displayName';
import { dayPhrase, formatQty, kcal, lastPortions, portionFor, servingText } from '@/features/food/helpers';
import { isolateRtl } from '@/lib/bidi';
import { MEAL_LABEL, scaleNutrients, servingsFor } from '@/lib/nutrition';
import { useDay, useLive } from '@/store/selectors';
import { cup, useTheme } from '@/theme';
import type { Food, ISODate, MealType, Serving } from '@/types';
import { Button, CupKey, Chip, ChipRow, IconButton, Stepper, Text } from '@/ui';

export type ScanFoundFrom = 'custom' | 'recent' | 'diary' | 'openfoodfacts';

/** Shown beside the source tag when the product came from this device, not the network. */
const FROM_COPY: Record<ScanFoundFrom, string> = {
  custom: '',
  recent: 'Logged before',
  diary: 'Logged before',
  openfoodfacts: '',
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
  const narrow = useWindowDimensions().width < 360;
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
        ...cup(radius.card),
        borderWidth: 1,
        borderColor: colors.border,
        padding: spacing.lg,
        gap: spacing.md,
        opacity: enter,
        transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [32, 0] }) }],
      }}>
      <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text variant="title" numberOfLines={2} testID="scan-result-name">
            {isolateRtl(displayFoodName(food))}
          </Text>
          {food.brand ? (
            <Text variant="caption" color="textSecondary" numberOfLines={1}>
              {isolateRtl(food.brand)}
            </Text>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 2 }}>
            <SourceTag source={food.source} />
            {from === 'recent' || from === 'diary' ? (
              <Text variant="caption" color="textSecondary">
                · {FROM_COPY[from]}
              </Text>
            ) : null}
          </View>
        </View>
        <IconButton testID="scan-result-close" accessibilityLabel="Close and scan again" size={36} tone="clear" onPress={onClose}>
          <X size={18} color={colors.textSecondary} strokeWidth={1.9} />
        </IconButton>
      </View>

      {/* The stepper goes under the number when both do not fit (a narrow phone, a four-digit number). */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', columnGap: spacing.md, rowGap: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
          <Text variant="numL" tabular color="caloriesInk" testID="scan-result-kcal">
            {kcal(n.kcal)}
          </Text>
          <Text variant="unit">kcal</Text>
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
            label={servingText(s.label)}
            // Named as drawn, units included (label in name), without a Hebrew label's direction marks.
            accessibilityLabel={s.label}
            selected={s.label === portion.serving.label}
            onPress={() => setPortion({ serving: s, quantity: 1 })}
          />
        ))}
      </ChipRow>

      <Impact date={date} kcalValue={n.kcal} grams={grams} />

      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        {/* Tighter side padding on a narrow phone, so "Add to breakfast" is never cut. */}
        <Button testID="scan-result-details" title="Details" variant="ghost" size="md" full={false} onPress={onDetails} style={narrow ? { paddingHorizontal: 12 } : undefined} />
        <Button
          testID="scan-result-add"
          title={`Add to ${MEAL_LABEL[meal].toLowerCase()}`}
          size="md"
          style={narrow ? { flex: 1, paddingHorizontal: 12 } : { flex: 1 }}
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
        ...cup(radius.buttonSm, 5),
        backgroundColor: colors.surfaceAlt,
      }}>
      <CupKey color={over ? colors.warning : colors.calories} />
      <Text variant="caption" color="text" style={{ flex: 1 }}>
        {over ? `Puts ${dayPhrase(date)} ${kcal(-after)} kcal above the budget` : `Leaves ${kcal(after)} kcal for ${dayPhrase(date)}`}
      </Text>
      <Text variant="caption" color="textSecondary" tabular>
        {Math.round(grams)} g
      </Text>
    </View>
  );
}
