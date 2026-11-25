import React, { useMemo } from 'react';
import { View } from 'react-native';

import { foodLoggedDates, useLive } from '@/store/selectors';
import { useTheme } from '@/theme';
import type { ISODate } from '@/types';
import { DECORATIVE, MiniCup } from '@/ui';

import { KEPT_THICK, keptDashes, keptDays } from './kept';

/** The kit cup's wall (`Vessel`'s edge): the kept line runs between the walls, as a level line does. */
const CUP_WALL = 1.5;

/**
 * The dashed "kept" line drawn over a mini cup `width` x `height`: a broken level line across the cup's middle, wall
 * to wall, in `dashEdge` (the dash that carries meaning, 3:1 on the card in every look). It marks a quiet day the
 * streak kept: never amber (nothing is above a limit) and never a check (the check means only a day on budget).
 * Decorative: the day's name says it (`KEPT_SPOKEN`). Place it in a box the cup's size, after the cup.
 */
export function KeptMark({ width, height }: { width: number; height: number }) {
  const { colors } = useTheme();
  const inner = width - 2 * CUP_WALL;
  const { count, dash, gap, offset } = keptDashes(inner);
  const top = Math.round((height - CUP_WALL) / 2 - KEPT_THICK / 2);
  return (
    <View pointerEvents="none" {...DECORATIVE} testID="kept-mark" style={{ position: 'absolute', left: CUP_WALL + offset, top, flexDirection: 'row', gap }}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={{ width: dash, height: KEPT_THICK, backgroundColor: colors.dashEdge }} />
      ))}
    </View>
  );
}

/** The legend's key: an empty mini cup with the kept line, the calendar's picture in little. */
export function KeptKey({ width = 12, height = 15 }: { width?: number; height?: number }) {
  const { colors } = useTheme();
  return (
    <View style={{ width, height }} {...DECORATIVE}>
      <MiniCup progress={0} width={width} height={height} color={colors.calories} animate={false} />
      <KeptMark width={width} height={height} />
    </View>
  );
}

/** Every kept day on the phone (`keptDays`), from the days with food logged: one answer for the strip and the calendar. */
export function useKeptDays(today: ISODate): Set<ISODate> {
  const food = useLive('foodEntries');
  return useMemo(() => keptDays(foodLoggedDates(food), today), [food, today]);
}
