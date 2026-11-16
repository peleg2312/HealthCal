import React, { useState } from 'react';
import { View } from 'react-native';

import { servingsFor } from '@/lib/nutrition';
import { useTheme } from '@/theme';
import type { Food, Serving } from '@/types';
import { Chip, ChipWrap, NumberField, Stepper } from '@/ui';

import { formatQty } from './helpers';

export interface AmountValue {
  serving: Serving;
  quantity: number;
}

/**
 * Serving chips, a quantity stepper and a grams field for one food. Shared by
 * the detail screen and the search screen's amount sheet.
 *
 * The grams field keeps what is being typed (including an empty field) on its
 * own, so clearing it and typing a new amount replaces the number instead of
 * appending to it. Only a valid amount above 0 reaches `onChange`; on blur an
 * empty or invalid field shows the last valid amount again.
 */
/** The largest amount one entry can hold. */
const MAX_GRAMS = 20000;

export function AmountEditor({
  food,
  value,
  onChange,
  onPendingChange,
  testIDPrefix = 'detail',
}: {
  food: Food;
  value: AmountValue;
  onChange: (v: AmountValue) => void;
  /** True while the grams field holds something that is not a usable amount (empty, 0). */
  onPendingChange?: (invalid: boolean) => void;
  testIDPrefix?: string;
}) {
  const { spacing } = useTheme();
  const [typed, setTyped] = useState<number | null | undefined>(undefined);
  const { serving, quantity } = value;
  const options = servingsFor(food);
  const servingList = options.some((s) => s.label === serving.label) ? options : [serving, ...options];
  const totalGrams = serving.grams * quantity;
  const perGram = serving.label === '1 g';

  const setTypedState = (g: number | null | undefined) => {
    setTyped(g);
    // Empty, zero or beyond the limit: the field does not match the amount that would be saved, so saving waits.
    onPendingChange?.(g !== undefined && !(g !== null && g > 0 && g <= MAX_GRAMS));
  };

  const chooseServing = (s: Serving) => {
    setTypedState(undefined);
    // Gram-based servings keep the amount; household measures start at one.
    const keepGrams = s.label === '1 g' || s.label === '100 g';
    onChange({ serving: s, quantity: keepGrams ? Math.max(0.01, Math.round((totalGrams / s.grams) * 100) / 100) : 1 });
  };

  return (
    <View style={{ gap: spacing.md }}>
      {/* Wrapped, not a sideways row: inside a card or sheet a scrolling row would run past the card's edge. */}
      <ChipWrap>
        {servingList.map((s, i) => (
          <Chip
            key={`${s.label}-${i}`}
            testID={`${testIDPrefix}-serving-${i}`}
            label={s.label === '1 g' ? 'grams' : s.label}
            selected={s.label === serving.label}
            onPress={() => chooseServing(s)}
          />
        ))}
      </ChipWrap>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, flexWrap: 'wrap' }}>
        {/* Compact, so the stepper and the grams field share one row in a card at 360 px; at 320 the field wraps under it, full width. */}
        <Stepper
          compact
          label="quantity"
          value={quantity}
          step={perGram ? 10 : 0.5}
          min={perGram ? 1 : 0.25}
          max={perGram ? MAX_GRAMS : Math.max(50, Math.floor(MAX_GRAMS / Math.max(serving.grams, 1)))}
          format={(v) => (perGram ? `${formatQty(v)} g` : formatQty(v))}
          onChange={(v) => {
            setTypedState(undefined);
            onChange({ serving, quantity: v });
          }}
        />
        <NumberField
          testID={`${testIDPrefix}-grams`}
          value={typed !== undefined ? typed : Math.round(totalGrams * 10) / 10}
          onChange={(g) => {
            setTypedState(g);
            if (g !== null && g > 0 && g <= MAX_GRAMS) onChange({ serving, quantity: g / serving.grams });
          }}
          onBlur={() => setTypedState(undefined)}
          suffix="g"
          accessibilityLabel="Amount in grams"
          style={{ flexGrow: 1, flexBasis: 104, maxWidth: 200 }}
        />
      </View>
    </View>
  );
}
