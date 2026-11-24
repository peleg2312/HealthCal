import React, { useState } from 'react';
import { View } from 'react-native';
import Svg, { Line, Path, Polygon, Rect } from 'react-native-svg';

import { formatWeight } from '@/lib/units';
import { useTextGrowth, useTheme } from '@/theme';
import type { UnitSystem } from '@/types';
import { DrawReveal, Text } from '@/ui';

import { rangeShort, shortDate, type Projection } from './projection';

const PLOT_H = 148;
const PAD_TOP = 28;
const PAD_BOTTOM = 12;
const PAD_X = 10;

/**
 * The road from today's weight to the target, in the brand colour: a flat
 * 2 px line, a flat 12% band for real-world pace (no gradient, no glow), the
 * level line (rim) as today's mark, square waypoint marks and the goal as a
 * small square-shouldered cup with the level line across it. The road draws
 * itself left to right once (the kit's DrawReveal); axis and labels are
 * there at once. Every label stays a text colour. Under the band's end the
 * goal is labelled with the title's months ("Late Jan to mid Mar",
 * `rangeShort`), never a day, since the title gives the goal as a range.
 */
export function ProjectionChart({ projection: p, units, delay = 0, now }: { projection: Projection; units: UnitSystem; delay?: number; now?: Date }) {
  const { colors, spacing } = useTheme();
  const [width, setWidth] = useState(0);
  // The date labels under the chart grow with the text (`useTextGrowth`): their boxes, the room between them and
  // the row's height grow with them, so nothing under the chart runs into the caption below it.
  const growth = useTextGrowth();
  const when = rangeShort(p, now);
  // The goal's months, right-aligned under the band's end; measured once drawn (about 7 px a character before that).
  const [whenW, setWhenW] = useState(0);

  const w = Math.max(0, width - PAD_X * 2);
  const h = PLOT_H - PAD_TOP - PAD_BOTTOM;
  const x = (weeks: number) => PAD_X + (weeks / p.slowWeeks) * w;
  const hiKg = Math.max(p.startKg, p.targetKg);
  const loKg = Math.min(p.startKg, p.targetKg);
  const y = (kg: number) => PAD_TOP + ((hiKg - kg) / (hiKg - loKg)) * h;

  const start = { x: x(0), y: y(p.startKg) };
  const end = { x: x(p.weeks), y: y(p.targetKg) };
  const band = [start, { x: x(p.fastWeeks), y: end.y }, { x: x(p.slowWeeks), y: end.y }].map((pt) => `${pt.x},${pt.y}`).join(' ');
  const axisY = PLOT_H - 2;
  const labelW = Math.round(64 * growth);
  // Each waypoint's date and weight keep clear of the next label and of the goal's months; on a narrow
  // phone only the halfway one is labelled (its dot and the others' stay on the line).
  const minLabelGap = Math.round(58 * growth);
  const whenLeft = width - PAD_X - (whenW || when.length * 7);
  const clearOfWhen = (at: number) => at + labelW / 2 <= whenLeft;
  const xs = p.waypoints.map((wp) => x(wp.weeks));
  const roomy = xs.every((at, i) => (i === 0 ? true : at - xs[i - 1] >= minLabelGap)) && clearOfWhen(xs[xs.length - 1]);
  const middle = p.waypoints[Math.floor(p.waypoints.length / 2)];
  const labelled = new Set<number>(roomy ? p.waypoints.map((wp) => wp.share) : middle && clearOfWhen(x(middle.weeks)) ? [middle.share] : []);
  // The goal cup: square shoulders on top, a round base, 12 px wide.
  const gw = 12;
  const gh = 11;
  const gx = end.x - gw / 2;
  const gy = end.y - 1;
  const goalCup = `M${gx},${gy} L${gx + gw},${gy} L${gx + gw},${gy + gh - 4} Q${gx + gw},${gy + gh} ${gx + gw - 4},${gy + gh} L${gx + 4},${gy + gh} Q${gx},${gy + gh} ${gx},${gy + gh - 4} Z`;

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={{ height: PLOT_H }}>
        {width > 0 ? (
          <>
            <Svg width={width} height={PLOT_H} style={{ position: 'absolute', left: 0, top: 0 }}>
              <Line x1={PAD_X} x2={width - PAD_X} y1={axisY} y2={axisY} stroke={colors.border} strokeWidth={1} />
              {p.waypoints.map((wp) => (
                <Line key={`t${wp.share}`} x1={x(wp.weeks)} x2={x(wp.weeks)} y1={y(wp.kg) + 6} y2={axisY} stroke={colors.border} strokeWidth={1} strokeDasharray="2 3" />
              ))}
              <Line x1={end.x} x2={end.x} y1={end.y + gh + 2} y2={axisY} stroke={colors.border} strokeWidth={1} strokeDasharray="2 3" />
            </Svg>
            <DrawReveal width={width} height={PLOT_H} delay={delay}>
              <Svg width={width} height={PLOT_H}>
                <Polygon points={band} fill={colors.primary} fillOpacity={0.12} />
                <Line x1={end.x} x2={x(p.slowWeeks)} y1={end.y} y2={end.y} stroke={colors.primary} strokeOpacity={0.5} strokeWidth={2} strokeDasharray="4 4" />
                <Path d={`M${start.x},${start.y} L${end.x},${end.y}`} stroke={colors.primary} strokeWidth={2.5} fill="none" />
                {p.waypoints.map((wp) => (
                  <Rect key={`d${wp.share}`} x={x(wp.weeks) - 3.5} y={y(wp.kg) - 3.5} width={7} height={7} rx={1} fill={colors.surface} stroke={colors.primary} strokeWidth={1.75} />
                ))}
                <Path d={goalCup} fill={colors.primary} />
                {/* The goal's level line across the top of its cup. */}
                <Rect x={end.x - 9} y={end.y - 2.5} width={18} height={3} rx={1} fill={colors.rim} />
              </Svg>
            </DrawReveal>
            {/* Today: the level line, where the road starts. Drawn at once. */}
            <View pointerEvents="none" style={{ position: 'absolute', left: start.x - 1.5, top: start.y - 8, width: 3, height: 16, borderRadius: 1, backgroundColor: colors.rim }} />
          </>
        ) : null}
        {width > 0 ? (
          <>
            <Text variant="caption" color="textSecondary" tabular style={{ position: 'absolute', left: PAD_X, top: 2 }}>
              {`${formatWeight(p.startKg, units)} today`}
            </Text>
            <Text variant="label" color="text" tabular style={{ position: 'absolute', right: PAD_X, top: Math.max(0, end.y - 28), textAlign: 'right' }}>
              {`Goal ${formatWeight(p.targetKg, units)}`}
            </Text>
          </>
        ) : null}
      </View>
      <View style={{ minHeight: Math.ceil(34 * growth), marginTop: spacing.xs }}>
        {width > 0 ? (
          <>
            {p.waypoints.filter((wp) => labelled.has(wp.share)).map((wp) => (
              <View key={wp.share} style={{ position: 'absolute', left: x(wp.weeks) - labelW / 2, width: labelW, alignItems: 'center' }}>
                <Text variant="caption" color="textSecondary" tabular>
                  {shortDate(wp.date)}
                </Text>
                <Text variant="caption" color="textSecondary" tabular style={{ fontSize: 11, lineHeight: 14 }}>
                  {formatWeight(wp.kg, units)}
                </Text>
              </View>
            ))}
            {/* In the flow, so the row is as tall as the range's words at any text size. */}
            <View style={{ alignSelf: 'flex-end', marginRight: PAD_X, maxWidth: width - 2 * PAD_X, alignItems: 'flex-end' }}>
              <Text
                variant="label"
                color="text"
                testID="plan-chart-when"
                onLayout={(e) => setWhenW(Math.ceil(e.nativeEvent.layout.width))}
                style={{ textAlign: 'right' }}>
                {when}
              </Text>
            </View>
          </>
        ) : null}
      </View>
    </View>
  );
}
