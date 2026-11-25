/**
 * The small key under the Water screen's layered cup: each kind of drink the day holds, with its layer's
 * colour as a cup key and what it counts toward the goal ("Water 1.25 L", "Coffee 225 ml"), largest first
 * (`drinkKey`). Shown only with two kinds or more (`showDrinkKey`). Caption words in `textSecondary`: the
 * colour is a key mark only, never text. One element to a screen reader ("In the cup: water 1.25 litres, ...").
 *
 * The items wrap in balanced lines (`balancedLines`), so no item is left alone on the last line; `keyLines`
 * says how many lines that takes, so a screen can make room for them ahead of drawing.
 */
import React from 'react';
import { View } from 'react-native';

import { balancedLines } from '@/features/food/chipLines';
import { useTextGrowth, useTheme } from '@/theme';
import type { UnitSystem } from '@/types';
import { CupKey, figure, Text } from '@/ui';

import { DRINK_LAYER_COLOR, drinkKeySpoken, drinkKeyText, type DrinkKeyItem } from './layers';

/** The key's line height (the caption's) and the room between its items. */
export const KEY_LINE = 17;
const KEY_GAP = 12;
const KEY_MARK = 9;

/** An item's width, a little generous: the mark, its 6 px, and the caption at about 6.8 px a letter, grown with the text. */
function itemWidth(text: string, growth: number): number {
  return KEY_MARK + 6 + text.length * 6.8 * growth;
}

/** The key's items in lines for `room` px. */
export function keyLines(key: readonly DrinkKeyItem[], units: UnitSystem, room: number, growth = 1): DrinkKeyItem[][] {
  const lines = balancedLines(
    key.map((k) => itemWidth(drinkKeyText(k, units), growth)),
    room,
    KEY_GAP,
  );
  return lines.map((line) => line.map((i) => key[i]));
}

export function DrinkKey({ items, units, room, testID }: { items: readonly DrinkKeyItem[]; units: UnitSystem; room: number; testID?: string }) {
  const { colors } = useTheme();
  const growth = useTextGrowth();
  const lines = keyLines(items, units, room, growth);
  return (
    <View testID={testID} style={{ gap: 4 }} {...figure(drinkKeySpoken(items, units))}>
      {lines.map((line, r) => (
        <View key={r} style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: KEY_GAP, rowGap: 4 }}>
          {line.map((k) => (
            <View key={k.kind} testID={testID ? `${testID}-${k.kind}` : undefined} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <CupKey color={colors[DRINK_LAYER_COLOR[k.kind]]} size={KEY_MARK} />
              <Text variant="caption" color="textSecondary">
                {drinkKeyText(k, units)}
              </Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}
