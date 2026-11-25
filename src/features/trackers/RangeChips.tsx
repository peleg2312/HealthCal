import React from 'react';
import { Platform, View } from 'react-native';

import { useTheme } from '@/theme';
import { PressableScale, Text, useGrownText } from '@/ui';
import { rovingIndex } from '@/ui/controlRules';

import { WEIGHT_RANGES, type WeightRange } from './helpers';

/**
 * The weight chart's range, under the chart where the thumb is (`weight-range-<value>`): five chips sharing the
 * row ("1M", "3M", "6M", "1Y", "All"), the chosen one an ink chip as search's chips are. One choice, so it is a
 * `radiogroup` named "Chart range" holding a `radio` per range with `aria-checked`, one tab stop whose arrow
 * keys move the choice (as the kit's Segmented does); each is said in full ("3 months"), as a unit is.
 * 32 px tall and 44 to touch; as soon as text grows the chips take their labels' widths and wrap, never cut.
 */
export function RangeChips({ value, onChange, testID = 'weight-range' }: { value: WeightRange; onChange: (v: WeightRange) => void; testID?: string }) {
  const { colors, radius } = useTheme();
  const grown = useGrownText();
  const web = Platform.OS === 'web';
  const current = WEIGHT_RANGES.findIndex((r) => r.value === value);
  return (
    <View
      testID={testID}
      accessibilityRole="radiogroup"
      {...(web ? { role: 'radiogroup' as const } : null)}
      accessibilityLabel="Chart range"
      style={{ flexDirection: 'row', flexWrap: grown ? 'wrap' : 'nowrap', columnGap: 8, rowGap: 12 }}>
      {WEIGHT_RANGES.map((r, i) => {
        const on = r.value === value;
        return (
          <PressableScale
            key={r.value}
            testID={`${testID}-${r.value}`}
            onPress={() => onChange(r.value)}
            feedback="select"
            scaleTo={0.96}
            // 6 above and below makes the 44 px target; sideways the chips are 8 apart and reach into half of it.
            hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            aria-checked={on}
            accessibilityLabel={r.spoken}
            {...(web
              ? {
                  // One tab stop for the row: the chosen range. The arrow keys move the choice and the focus.
                  tabIndex: (current < 0 ? i === 0 : on) ? 0 : -1,
                  onKeyDown: (e: { key: string; currentTarget: unknown; preventDefault: () => void }) => {
                    const next = rovingIndex(e.key, i, WEIGHT_RANGES.length);
                    if (next === null) return;
                    e.preventDefault();
                    const row = (e.currentTarget as HTMLElement | null)?.parentElement;
                    (row?.children[next] as HTMLElement | undefined)?.focus();
                    if (WEIGHT_RANGES[next].value !== value) onChange(WEIGHT_RANGES[next].value);
                  },
                }
              : null)}
            style={{
              ...(grown ? { flexGrow: 1, flexBasis: 'auto', minHeight: 32, paddingVertical: 3 } : { flex: 1, height: 32 }),
              minWidth: 0,
              paddingHorizontal: 4,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: radius.chip,
              borderWidth: 1,
              borderColor: on ? colors.text : colors.borderStrong,
              backgroundColor: on ? colors.text : 'transparent',
            }}>
            <Text variant="label" color={on ? 'bg' : 'text'} numberOfLines={grown ? undefined : 1} align="center" style={{ fontSize: 13.5 }}>
              {r.label}
            </Text>
          </PressableScale>
        );
      })}
    </View>
  );
}
