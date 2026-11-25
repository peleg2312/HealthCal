import React, { useId, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { labelMl } from '@/features/drinks/rules';
import { servingsFor } from '@/lib/nutrition';
import { useTheme } from '@/theme';
import type { Food, Serving } from '@/types';
import { Chip, NumberField, Stepper } from '@/ui';

import { AskLine, askTie } from './AskLine';
import { balancedLines, chipWidth } from './chipLines';
import { formatQty, servingText } from './helpers';

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
  ask,
}: {
  food: Food;
  value: AmountValue;
  onChange: (v: AmountValue) => void;
  /** True while the grams field holds something that is not a usable amount (empty, 0). */
  onPendingChange?: (invalid: boolean) => void;
  testIDPrefix?: string;
  /**
   * While the screen's Add waits for a second press (`portionAsk`, ./softCheck): the question under the amount
   * (`AskLine`), tied to the grams field (`askTie`). testID `<prefix>-ask`.
   */
  ask?: string | null;
}) {
  const { spacing } = useTheme();
  const askId = `${testIDPrefix}-ask-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const { width } = useWindowDimensions();
  const [typed, setTyped] = useState<number | null | undefined>(undefined);
  const { serving, quantity } = value;
  const options = servingsFor(food);
  const servingList = options.some((s) => s.label === serving.label) ? options : [serving, ...options];
  const totalGrams = serving.grams * quantity;
  const perGram = serving.label === '1 g';
  // A volume portion ("250 ml", "8 fl oz") shows whole grams, as the line above it does ("258 g");
  // display only: the stored grams and the calories keep their tenth.
  const shownGrams = labelMl(serving.label) !== null ? Math.round(totalGrams) : Math.round(totalGrams * 10) / 10;

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
      {/* Laid out in lines ahead of drawing (in a card: the screen's 20 px sides and the card's 18), so no chip is left alone on the last one. */}
      <View style={{ rowGap: 12 }}>
        {balancedLines(
          servingList.map((s) => chipWidth(s.label === '1 g' ? 'grams' : s.label)),
          Math.min(width, 560) - 76,
        ).map((line) => (
          <View key={line.join('-')} style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 8, rowGap: 12 }}>
            {line.map((i) => {
              const s = servingList[i];
              return (
                <Chip
                  key={`${s.label}-${i}`}
                  testID={`${testIDPrefix}-serving-${i}`}
                  label={s.label === '1 g' ? 'grams' : servingText(s.label)}
                  // Named as drawn, units included (label in name), without the direction marks a Hebrew label is drawn with.
                  accessibilityLabel={s.label === '1 g' ? 'grams' : s.label}
                  selected={s.label === serving.label}
                  onPress={() => chooseServing(s)}
                />
              );
            })}
          </View>
        ))}
      </View>
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
          value={typed !== undefined ? typed : shownGrams}
          onChange={(g) => {
            setTypedState(g);
            if (g !== null && g > 0 && g <= MAX_GRAMS) onChange({ serving, quantity: g / serving.grams });
          }}
          onBlur={() => setTypedState(undefined)}
          suffix="g"
          // An amount it cannot take is said under the field and tied to it (WCAG 3.3.1); on blur the last good amount returns.
          error={typed !== undefined && typed !== null && !(typed > 0 && typed <= MAX_GRAMS) ? `Enter more than 0 g, up to ${MAX_GRAMS.toLocaleString('en-US')} g.` : null}
          accessibilityLabel="Amount in grams"
          {...(ask ? askTie(askId, ask) : null)}
          style={{ flexGrow: 1, flexBasis: 104, maxWidth: 200 }}
        />
      </View>
      {ask ? <AskLine id={askId} line={ask} testID={`${testIDPrefix}-ask`} /> : null}
    </View>
  );
}
