import React, { useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { PrimSvg } from '@/features/share/CardArt';
import { useTextGrowth, useTheme } from '@/theme';
import { DECORATIVE, figure, motion, Text, useFadeAfter, usePour } from '@/ui';

import { columnCentre, gridGeometry, rowPrims, type GridGeometry } from './grid';
import type { CupRow, PeriodKind } from './period';

const WEEKDAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
/** Rows pour one after another, the last landing within the routine 600 ms. */
const STAGGER: Record<PeriodKind, number> = { month: 24, year: 12 };

/**
 * One row of cups, poured once: the row's fills slide up from below its cups' base as one layer (a transform,
 * clipped at the base), so every cup fills from the bottom with its level line on top and stops at its own
 * level; amber caps and checks appear as the pour lands. `memoryKey` keeps it poured for the session, and under
 * reduced motion it is drawn at once (`usePour`).
 */
function PourRow({ g, row, index, kind, memoryKey }: { g: GridGeometry; row: CupRow; index: number; kind: PeriodKind; memoryKey: string }) {
  const { colors } = useTheme();
  const pour = usePour(1, { duration: motion.duration.pourSmall, delay: index * STAGGER[kind], memoryKey: `${memoryKey}-${row.key}`, settle: 0 });
  // A row that mounts already poured (remembered) shows its marks at once too.
  const marks = useFadeAfter(true, pour.endsIn, pour.instant || pour.endsIn === 0);
  const travel = g.cupH + g.rim;
  const { level } = pour;
  const fillStyle = useAnimatedStyle(() => ({ opacity: level.get() > 0.001 ? 1 : 0, transform: [{ translateY: (1 - level.get()) * travel }] }));
  const markStyle = useAnimatedStyle(() => ({ opacity: marks.get() }));
  const layers = rowPrims(colors, g, row, colors.surface);
  const abs = { position: 'absolute', left: 0, top: 0, width: g.width, height: g.rowH } as const;
  return (
    <View style={{ width: g.width, height: g.rowH }}>
      {g.labelW ? (
        <View style={{ position: 'absolute', left: 0, top: g.top, width: g.labelW - 4, height: g.cupH, justifyContent: 'center' }}>
          <Text variant="caption" color="textSecondary" numberOfLines={1} style={{ fontSize: 11, lineHeight: 14 }}>
            {row.label}
          </Text>
        </View>
      ) : null}
      <View style={abs}>
        <PrimSvg prims={layers.under} width={g.width} height={g.rowH} />
      </View>
      <View style={[abs, { overflow: 'hidden' }]}>
        <Animated.View style={[abs, fillStyle]}>
          <PrimSvg prims={layers.fills} width={g.width} height={g.rowH} />
        </Animated.View>
      </View>
      <View style={abs}>
        <PrimSvg prims={layers.frame} width={g.width} height={g.rowH} />
      </View>
      <Animated.View style={[abs, markStyle]}>
        <PrimSvg prims={layers.marks} width={g.width} height={g.rowH} />
      </Animated.View>
    </View>
  );
}

/**
 * A month (Monday-first weeks) or a year (a row per month) as small cups, one a day, poured once on arrival.
 * One picture to a screen reader, named by `accessibilityLabel` (what the cups count, said in words).
 */
export function CupGrid({ kind, rows, memoryKey, accessibilityLabel, testID }: { kind: PeriodKind; rows: CupRow[]; memoryKey: string; accessibilityLabel: string; testID?: string }) {
  const { width: winW } = useWindowDimensions();
  // The card's inside at this window (the screen's 20 px sides, the card's 1 px line and 16 px padding) until measured.
  const [w, setW] = useState(Math.min(winW, 560) - 40 - 2 - 32);
  // A year's month names keep their room as text grows, so "Sep" is never cut.
  const growth = useTextGrowth();
  const grow = Math.min(2, Math.max(1, growth));
  const g = gridGeometry(kind, rows.length, w, { labelW: Math.ceil(30 * grow), headerH: Math.ceil(18 * grow) });
  return (
    <View
      testID={testID}
      onLayout={(e) => {
        const next = Math.floor(e.nativeEvent.layout.width);
        if (next > 0 && Math.abs(next - w) >= 1) setW(next);
      }}
      {...figure(accessibilityLabel)}
      style={{ width: '100%', height: g.height }}>
      <View {...DECORATIVE}>
        {kind === 'month' ? (
          <View style={{ height: g.headerH, width: g.width }}>
            {WEEKDAY_LETTERS.map((l, i) => (
              <Text key={i} variant="caption" color="textSecondary" align="center" style={{ position: 'absolute', top: 0, left: columnCentre(g, i) - g.slot / 2, width: g.slot, fontSize: 11, lineHeight: 14 }}>
                {l}
              </Text>
            ))}
          </View>
        ) : null}
        <View style={{ gap: g.rowGap }}>
          {rows.map((row, i) => (
            <PourRow key={row.key} g={g} row={row} index={i} kind={kind} memoryKey={memoryKey} />
          ))}
        </View>
      </View>
    </View>
  );
}
