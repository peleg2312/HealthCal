import React, { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

import { useTheme } from '@/theme';
import { BarChart, DECORATIVE, Text } from '@/ui';
import type { BarDatum, ChartBand } from '@/ui/Charts';

import { budgetScaleTop, budgetTicks } from './calorieBars';

/**
 * Progress's calorie bars ("Calories a day" on the overview and the Nutrition card's chart): the kit's
 * BarChart with each bar's own budget drawn as its mark, one grammar with the check-in's cups and the
 * calendar's (each day against its own budget, never the period's average). The marks are a layer behind
 * the bars in `dashEdge` (3:1 on the card), so a bar's level line is never covered: an under day stands
 * below its mark, a day on its budget meets it, and a day above it passes through it, its mark showing
 * past both walls and through the hairline between the bar and its amber part, so an over day is told by
 * its shape and not by its colour alone. The layer is hidden from assistive technology: the chart's own
 * name says each bar against its budget.
 */
export function BudgetBars({
  data,
  budgets,
  height,
  band,
  openIndex,
  scrub,
  testID,
  accessibilityLabel,
}: {
  data: BarDatum[];
  /** Each bar's own budget (`buildBars`), null where it has none. */
  budgets: (number | null)[];
  height: number;
  band?: ChartBand;
  openIndex?: number;
  scrub?: boolean;
  testID?: string;
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width));
  // The kit's scale top, so the marks stand on its scale: every bar, every budget and the band fit under it.
  const top = budgetScaleTop(
    data.map((d) => d.value),
    budgets,
    band?.to ?? 0,
  );
  const ticks = budgetTicks(budgets, width, height, top);
  return (
    <View onLayout={onLayout}>
      {ticks.length ? (
        // Drawn first, so the bars stand in front of their marks (a later sibling paints over an earlier one).
        <View {...DECORATIVE} pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0 }} testID={testID ? `${testID}-budgets` : undefined}>
          <Svg width={width} height={height}>
            {ticks.map((t) => (
              <Rect key={t.index} x={t.x} y={t.y - 1.5} width={t.w} height={2} fill={colors.dashEdge} />
            ))}
          </Svg>
        </View>
      ) : null}
      <BarChart data={data} color={colors.calories} maxValue={top} band={band} openIndex={openIndex} height={height} scrub={scrub} testID={testID} accessibilityLabel={accessibilityLabel} />
    </View>
  );
}

/**
 * The legend's two keys for these bars, each the mark it names: "That day's budget" is a run of the
 * marks, and "Above that day's budget" a small bar passing through its mark with the amber over it, the
 * same shape as in the chart, so the key is read without its colour too.
 */
export function BudgetKeys({ weekly }: { weekly: boolean }) {
  const { colors } = useTheme();
  const word = weekly ? "week's" : "day's";
  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View {...DECORATIVE}>
          <Svg width={16} height={10}>
            <Rect x={0} y={4} width={7} height={2} fill={colors.dashEdge} />
            <Rect x={9} y={4} width={7} height={2} fill={colors.dashEdge} />
          </Svg>
        </View>
        <Text variant="caption" color="textSecondary">
          {weekly ? "That week's budget" : "That day's budget"}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View {...DECORATIVE}>
          <Svg width={16} height={14}>
            {/* The bar under its budget, the hairline and the mark across it, the amber part above. */}
            <Rect x={4} y={8} width={8} height={6} rx={1.5} fill={colors.caloriesBar} />
            <Rect x={0} y={6} width={16} height={2} fill={colors.dashEdge} />
            <Rect x={4} y={0} width={8} height={5.5} fill={colors.warning} />
          </Svg>
        </View>
        <Text variant="caption" color="textSecondary">
          {`Above that ${word} budget`}
        </Text>
      </View>
    </>
  );
}
