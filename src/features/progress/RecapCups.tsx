import { Check } from 'lucide-react-native';
import React, { useState } from 'react';
import { View } from 'react-native';

import { weekdayShort } from '@/lib/dates';
import { useTheme, withOpacity } from '@/theme';
import { MiniCup, PressableScale, Text } from '@/ui';

import type { RecapDayCup } from './recapDays';

const CUP_W = 34;
const CUP_H = 76;
const CHECK_H = 18;

/**
 * The week as seven cups that pour left to right when the recap opens (and not
 * again for the same week in this session). Each cup is that day's own budget:
 * the dashed line across their tops is "each day's budget", true of every cup.
 * A check sits over a fully logged day within 10% of it, amber marks a day
 * above it, a lighter fill a partly logged day and hatching today. Tap a cup
 * to read its numbers.
 */
export function RecapCups({ cups, week }: { cups: RecapDayCup[]; week: string }) {
  const { colors, spacing } = useTheme();
  const [selected, setSelected] = useState<string | null>(null);
  const sel = cups.find((c) => c.date === selected);
  return (
    <View style={{ gap: spacing.sm }}>
      <View>
        {/* The tops of the cups: each day's own budget. */}
        <View
          pointerEvents="none"
          style={{ position: 'absolute', left: 0, right: 0, top: CHECK_H, height: 0, borderTopWidth: 1.5, borderStyle: 'dashed', borderColor: colors.borderStrong }}
        />
        <View style={{ flexDirection: 'row' }} accessibilityRole="list">
          {cups.map((c, i) => {
            const active = c.date === selected;
            return (
              <PressableScale
                key={c.date}
                testID={`recap-day-${c.date}`}
                onPress={() => setSelected(active ? null : c.date)}
                feedback="select"
                scaleTo={0.96}
                accessibilityLabel={c.detail}
                accessibilityState={{ selected: active }}
                style={{ flex: 1, minWidth: 0, alignItems: 'center' }}>
                <View style={{ height: CHECK_H, justifyContent: 'flex-start' }}>
                  {c.inBand ? <Check size={14} color={colors.success} strokeWidth={2.6} /> : null}
                </View>
                <MiniCup
                  index={i}
                  memoryKey={`recap-${week}-${c.date}`}
                  progress={c.ratio}
                  over={c.over}
                  future={c.future}
                  hatchFill={c.isToday}
                  color={c.complete || c.isToday ? colors.calories : withOpacity(colors.calories, 0.45)}
                  width={CUP_W}
                  height={CUP_H}
                />
                <View
                  style={{
                    marginTop: 6,
                    minWidth: 30,
                    paddingHorizontal: 4,
                    height: 20,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderTopLeftRadius: 4,
                    borderTopRightRadius: 4,
                    borderBottomLeftRadius: 8,
                    borderBottomRightRadius: 8,
                    backgroundColor: active ? colors.text : 'transparent',
                  }}>
                  <Text variant="label" color={active ? 'bg' : c.isToday ? 'text' : 'textSecondary'} style={{ fontSize: 12 }}>
                    {weekdayShort(c.date)}
                  </Text>
                </View>
              </PressableScale>
            );
          })}
        </View>
      </View>
      <Text variant="caption" color="textSecondary" testID="recap-day-detail" style={{ minHeight: 17 }}>
        {sel ? sel.detail : 'Tap a day to read its numbers'}
      </Text>
    </View>
  );
}
