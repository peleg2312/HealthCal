/**
 * The water screen's choice row: what the drink of the selected kind was, one tap after the kind
 * (Milk: Semi-skimmed, Whole, ...; Coffee: Black, Splash of milk, Latte, ...), then one line that
 * always names what the next tap logs ("Semi-skimmed milk: 129 kcal per 250 ml, to lunch" or "Black
 * coffee: no calories added"), and, when the same food is already in the diary within 3 hours, that
 * notice with a "Water only" chip (off by default; nothing is linked or dropped by itself). When that
 * entry is a drink logged in the diary that already added its water, the notice says so and no chip is
 * offered (it would count the same water twice).
 *
 * Only places words: the choices are `choicesFor` and `PICK_CHIP` (./choices.ts), the words come from
 * `planDrink` and `noticeLine` (./rules.ts). The row wraps (a ChipWrap), so the selected chip is
 * always on screen; never a second sideways scroller under the kind row.
 */
import React from 'react';
import { useWindowDimensions, View } from 'react-native';

import { isolateRtl } from '@/lib/bidi';
import { useTheme } from '@/theme';
import type { Beverage, Food, UnitSystem } from '@/types';
import { PressableScale, Text } from '@/ui';

import { balancedLines, chipWidth } from '@/features/food/chipLines';

import { PICK_CHIP, choicesFor, type DrinkChoice } from './choices';
import { choiceA11y, choiceFood, type SelectedDrink } from './rules';

/**
 * The kit's Chip with a spoken label of its own ("Whole, 157 kcal per 250 ml") and an optional
 * width cap (a picked drink's own name is cut by the chip). Same look: 32 visible, 44 to the finger.
 */
function DrinkChip({
  label,
  a11y,
  selected,
  onPress,
  testID,
  maxWidth,
}: {
  label: string;
  a11y: string;
  selected: boolean;
  onPress: () => void;
  testID: string;
  maxWidth?: number;
}) {
  const { colors, radius } = useTheme();
  return (
    <PressableScale
      testID={testID}
      onPress={onPress}
      feedback="select"
      hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      aria-pressed={selected}
      accessibilityLabel={a11y}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        height: 32,
        maxWidth,
        paddingHorizontal: 12,
        borderRadius: radius.chip,
        backgroundColor: selected ? colors.text : 'transparent',
        borderWidth: 1,
        borderColor: selected ? colors.text : colors.borderStrong,
      }}>
      <Text variant="label" color={selected ? 'bg' : 'text'} numberOfLines={1} style={{ fontSize: 13.5, flexShrink: 1 }}>
        {label}
      </Text>
    </PressableScale>
  );
}

/** A picked drink's own name is cut by its chip at this width. */
const PICKED_MAX_W = 200;

export function DrinkChoices({
  kind,
  selected,
  picked,
  glassMl,
  units,
  line,
  notice,
  waterOnlyOffered = true,
  waterOnly,
  onChoose,
  onPicked,
  onOpenPick,
  onWaterOnly,
}: {
  kind: Beverage;
  selected: SelectedDrink | null;
  /** The remembered picked drink shown as a chip of its own (`water-choice-food`), if any. */
  picked: Food | null;
  glassMl: number;
  units: UnitSystem;
  /** `water-drink-line`: what the next tap logs. */
  line: string;
  /** "Orange juice is already in breakfast (08:10).", or null. */
  notice: string | null;
  /** Whether the notice offers "Water only" (`waterOnlyOffered`): not for an entry that already added its water. */
  waterOnlyOffered?: boolean;
  waterOnly: boolean;
  onChoose: (choice: DrinkChoice) => void;
  onPicked: (food: Food) => void;
  onOpenPick: (query: string) => void;
  onWaterOnly: (on: boolean) => void;
}) {
  const { spacing } = useTheme();
  const { width } = useWindowDimensions();
  const pick = PICK_CHIP[kind];
  const choices = choicesFor(kind);
  if (choices.length === 0) return null;
  const chips: { key: string; width: number; node: React.ReactNode }[] = [
    ...choices.map((c) => ({
      key: c.id,
      width: chipWidth(c.label),
      node: (
        <DrinkChip
          testID={`water-choice-${c.id}`}
          label={c.label}
          a11y={choiceA11y(c.label, choiceFood(c), glassMl, units)}
          selected={selected?.id === c.id}
          onPress={() => onChoose(c)}
        />
      ),
    })),
    ...(picked
      ? [
          {
            key: 'food',
            width: chipWidth(picked.name, PICKED_MAX_W),
            node: (
              <DrinkChip
                testID="water-choice-food"
                label={isolateRtl(picked.name)}
                a11y={choiceA11y(picked.name, picked, glassMl, units)}
                selected={selected?.id === 'food'}
                maxWidth={PICKED_MAX_W}
                onPress={() => onPicked(picked)}
              />
            ),
          },
        ]
      : []),
    ...(pick
      ? [
          {
            key: 'pick',
            width: chipWidth(pick.label),
            node: <DrinkChip testID="water-choice-pick" label={pick.label} a11y={`${pick.label}: search drinks or enter calories`} selected={false} onPress={() => onOpenPick(pick.query)} />,
          },
        ]
      : []),
  ];
  // The screen's content width: the window (at most 560) less the 20 px sides.
  const lines = balancedLines(
    chips.map((c) => c.width),
    Math.min(width, 560) - 40,
  );
  return (
    <View style={{ gap: spacing.md }} testID="water-choices">
      {/* Lines 12 apart and chips 8 apart, as in ChipWrap, so two chips' touch areas meet in the gap. */}
      <View style={{ rowGap: 12 }}>
        {lines.map((line) => (
          <View key={line.map((i) => chips[i].key).join('|')} style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 8, rowGap: 12 }}>
            {line.map((i) => (
              <React.Fragment key={chips[i].key}>{chips[i].node}</React.Fragment>
            ))}
          </View>
        ))}
      </View>
      <Text testID="water-drink-line" variant="caption" color="textSecondary">
        {line}
      </Text>
      {notice ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <Text testID="water-drink-notice" variant="caption" color="text" style={{ flex: 1, minWidth: 0 }}>
            {notice}
          </Text>
          {waterOnlyOffered ? (
            <DrinkChip
              testID="water-water-only"
              label="Water only"
              a11y={waterOnly ? 'Water only, on: the next drink adds no calories' : 'Water only, off: the next drink adds its calories'}
              selected={waterOnly}
              onPress={() => onWaterOnly(!waterOnly)}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
