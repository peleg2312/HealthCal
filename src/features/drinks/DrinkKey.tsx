/**
 * The small key under the Water screen's layered cup: each kind of drink the day holds, with its layer's
 * colour as a cup key and what it counts toward the goal ("Water 1.25 L", "Coffee 225 ml"), largest first
 * (`drinkKey`). Shown only with two kinds or more (`showDrinkKey`). Caption words in `textSecondary`: the
 * colour is a key mark only, never text. One element to a screen reader ("In the cup: water 1.25 litres, ...").
 *
 * The items wrap in balanced lines (`balancedLines`), so no item is left alone on the last line; `keyLines`
 * says how many lines that takes, so a screen can make room for them ahead of drawing. With text grown through the
 * phone's common steps (`useGrownText`, under `VERY_LARGE_TEXT`) each item's width is measured as drawn
 * (`MeasureWidth`) rather than estimated, and `onExtraHeight` reports the height of the lines past the first as drawn.
 */
import React, { useEffect, useState } from 'react';
import { View } from 'react-native';

import { balancedLines } from '@/features/food/chipLines';
import { MeasureWidth, SizeProbe, useMeasureKey } from '@/features/today/MeasureWidth';
import { useTextGrowth, useTheme, useVeryLargeText } from '@/theme';
import type { UnitSystem } from '@/types';
import { CupKey, figure, Text, useGrownText } from '@/ui';

import { measuredLines } from './grownFit';
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

export function DrinkKey({
  items,
  units,
  room,
  testID,
  onExtraHeight,
}: {
  items: readonly DrinkKeyItem[];
  units: UnitSystem;
  room: number;
  testID?: string;
  /** With text grown (under very large text): the height of the key's lines past the first, as drawn (0 for one line). */
  onExtraHeight?: (px: number) => void;
}) {
  const { colors } = useTheme();
  const growth = useTextGrowth();
  // Text grown through the phone's common steps: the items are laid out by their widths as drawn.
  const grown = useGrownText();
  const veryLarge = useVeryLargeText();
  const fit = grown && !veryLarge;
  const measureKey = useMeasureKey();
  const [widths, setWidths] = useState<Partial<Record<string, number>>>({});
  // The key's height and its first line's, as drawn (fit only): what the lines past the first take.
  const [allH, setAllH] = useState(0);
  const [firstH, setFirstH] = useState(0);
  const extra = fit && allH > 0 && firstH > 0 ? Math.max(0, allH - firstH) : null;
  useEffect(() => {
    if (extra !== null) onExtraHeight?.(extra);
  }, [extra, onExtraHeight]);
  // Laid out by the items' widths as drawn once each is measured (fit), else by their estimate (`keyLines`).
  const measured = fit ? measuredLines(items, (k) => k.kind, widths, room, KEY_GAP) : null;
  const lines = measured ? measured.map((line) => line.map((i) => items[i])) : keyLines(items, units, room, growth);
  const item = (k: DrinkKeyItem) => (
    <>
      <CupKey color={colors[DRINK_LAYER_COLOR[k.kind]]} size={KEY_MARK} />
      <Text variant="caption" color="textSecondary">
        {drinkKeyText(k, units)}
      </Text>
    </>
  );
  const measureItem = (kind: string) => (w: number) => {
    if (widths[kind] !== w) setWidths((cur) => ({ ...cur, [kind]: w }));
  };
  return (
    <View testID={testID} style={{ gap: 4 }} {...figure(drinkKeySpoken(items, units))}>
      {fit ? <SizeProbe key={`all-${measureKey}`} onSize={(_w, h) => setAllH(Math.ceil(h))} /> : null}
      {fit
        ? items.map((k) => (
            <MeasureWidth key={`${k.kind}-${measureKey}`} onWidth={measureItem(k.kind)}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>{item(k)}</View>
            </MeasureWidth>
          ))
        : null}
      {lines.map((line, r) => (
        <View key={r} style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: KEY_GAP, rowGap: 4 }}>
          {fit && r === 0 ? <SizeProbe key={`first-${measureKey}`} onSize={(_w, h) => setFirstH(Math.ceil(h))} /> : null}
          {line.map((k) => (
            <View key={k.kind} testID={testID ? `${testID}-${k.kind}` : undefined} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {item(k)}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}
