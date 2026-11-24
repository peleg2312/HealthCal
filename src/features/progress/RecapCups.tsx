import { Check } from 'lucide-react-native';
import React, { useState } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { weekdayShort } from '@/lib/dates';
import { useTheme, withOpacity } from '@/theme';
import { MiniCup, PressableScale, Text } from '@/ui';

import type { RecapDayCup } from './recapDays';

const CUP_W = 34;
/** Under 360 px seven columns are about 35 px wide: a narrower cup keeps a gap between neighbours (and their lips). */
const CUP_W_NARROW = 28;
const CUP_H = 76;
const CHECK_H = 18;

/** The card's padding (the kit Card's default, spacing.lg): the row of cups reaches into it, so each day's column is wider. */
const CARD_PAD = 16;

/**
 * The week as seven cups that pour left to right when the recap opens (and not
 * again for the same week in this session). Each cup is that day's own budget:
 * the dashed line across their tops is "each day's budget", true of every cup.
 * Each cup gives one signal: a check sits over a fully logged day at 90 to
 * 100% of it, amber marks a day above it (with no check), a lighter fill a
 * partly logged day and hatching today. Tap a cup to read its numbers. The row spans the card's whole width
 * (into its padding), so each day's column is 44 px or wider at 360 and 390 (45.7 and 50); at 320 the columns
 * are 40 px (inside the card's 1 px edge) and a 3 px hit slop either side makes 45 to the finger. A day's spoken name starts with the weekday
 * it shows ("Mon, Nov 16 · 2,032 of 2,350 kcal, …"), and the chosen one is pressed.
 */
export function RecapCups({ cups, week }: { cups: RecapDayCup[]; week: string }) {
  const { colors, spacing } = useTheme();
  const [selected, setSelected] = useState<string | null>(null);
  const narrow = useWindowDimensions().width < 360;
  const cupW = narrow ? CUP_W_NARROW : CUP_W;
  const sel = cups.find((c) => c.date === selected);
  return (
    <View style={{ gap: spacing.sm }}>
      <View style={{ marginHorizontal: -CARD_PAD }}>
        {/* The tops of the cups: each day's own budget. */}
        <View
          pointerEvents="none"
          style={{ position: 'absolute', left: CARD_PAD / 2, right: CARD_PAD / 2, top: CHECK_H, height: 0, borderTopWidth: 1.5, borderStyle: 'dashed', borderColor: colors.borderStrong }}
        />
        <View style={{ flexDirection: 'row' }}>
          {cups.map((c, i) => {
            const active = c.date === selected;
            return (
              <PressableScale
                key={c.date}
                testID={`recap-day-${c.date}`}
                onPress={() => setSelected(active ? null : c.date)}
                feedback="select"
                scaleTo={0.96}
                accessibilityRole="button"
                accessibilityLabel={`${weekdayShort(c.date)}, ${c.detail}`}
                accessibilityState={{ selected: active }}
                // react-native-web reads the aria prop: the day whose numbers show under the cups is pressed.
                {...({ 'aria-pressed': active } as object)}
                hitSlop={narrow ? { top: 0, bottom: 0, left: 3, right: 3 } : undefined}
                style={{ flex: 1, minWidth: 0, alignItems: 'center' }}>
                <View style={{ height: CHECK_H, justifyContent: 'flex-start' }}>
                  {c.check ? <Check size={14} color={colors.success} strokeWidth={2.6} /> : null}
                </View>
                <MiniCup
                  index={i}
                  memoryKey={`recap-${week}-${c.date}`}
                  progress={c.ratio}
                  over={c.over}
                  future={c.future}
                  hatchFill={c.isToday}
                  color={c.complete || c.isToday ? colors.calories : withOpacity(colors.calories, 0.45)}
                  width={cupW}
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
