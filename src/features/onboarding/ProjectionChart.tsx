import React, { useState } from 'react';
import { View } from 'react-native';
import Svg, { Line, Path, Polygon, Rect } from 'react-native-svg';

import { formatWeight } from '@/lib/units';
import { useTheme } from '@/theme';
import type { UnitSystem } from '@/types';
import { Text } from '@/ui';

import { shortDate, type Projection } from './projection';

const PLOT_H = 148;
const PAD_TOP = 28;
const PAD_BOTTOM = 12;
const PAD_X = 10;

/**
 * The road from today's weight to the target: a flat 2 px line, a flat 12%
 * band for real-world pace (no gradient, no glow), square waypoint marks and
 * the goal marked by a rim tick (the level line). Drawn in the weight colour;
 * every label stays a text colour.
 */
export function ProjectionChart({ projection: p, units }: { projection: Projection; units: UnitSystem }) {
  const { colors, spacing } = useTheme();
  const [width, setWidth] = useState(0);

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
  const labelW = 64;

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={{ height: PLOT_H }}>
        {width > 0 ? (
          <Svg width={width} height={PLOT_H}>
            <Line x1={PAD_X} x2={width - PAD_X} y1={axisY} y2={axisY} stroke={colors.border} strokeWidth={1} />
            <Polygon points={band} fill={colors.weight} fillOpacity={0.12} />
            <Line x1={end.x} x2={x(p.slowWeeks)} y1={end.y} y2={end.y} stroke={colors.weight} strokeOpacity={0.5} strokeWidth={2} strokeDasharray="4 4" />
            {p.waypoints.map((wp) => (
              <Line key={`t${wp.share}`} x1={x(wp.weeks)} x2={x(wp.weeks)} y1={y(wp.kg) + 6} y2={axisY} stroke={colors.border} strokeWidth={1} strokeDasharray="2 3" />
            ))}
            <Line x1={end.x} x2={end.x} y1={end.y + 8} y2={axisY} stroke={colors.border} strokeWidth={1} strokeDasharray="2 3" />
            <Path d={`M${start.x},${start.y} L${end.x},${end.y}`} stroke={colors.weight} strokeWidth={2} fill="none" />
            {p.waypoints.map((wp) => (
              <Rect key={`d${wp.share}`} x={x(wp.weeks) - 3.5} y={y(wp.kg) - 3.5} width={7} height={7} rx={1} fill={colors.surface} stroke={colors.weight} strokeWidth={1.75} />
            ))}
            <Rect x={start.x - 3.5} y={start.y - 3.5} width={7} height={7} rx={1} fill={colors.weight} />
            {/* The goal: a level line across the end of the road. */}
            <Rect x={end.x - 9} y={end.y - 1.5} width={18} height={3} rx={1} fill={colors.rim} />
          </Svg>
        ) : null}
        {width > 0 ? (
          <>
            <Text variant="caption" color="textSecondary" tabular style={{ position: 'absolute', left: PAD_X, top: 2 }}>
              {`${formatWeight(p.startKg, units)} today`}
            </Text>
            <Text
              variant="caption"
              color="text"
              tabular
              style={{ position: 'absolute', right: PAD_X, top: end.y - 26, textAlign: 'right' }}>
              {`Goal ${formatWeight(p.targetKg, units)}`}
            </Text>
          </>
        ) : null}
      </View>
      <View style={{ height: 34, marginTop: spacing.xs }}>
        {width > 0 ? (
          <>
            {p.waypoints.map((wp) => (
              <View key={wp.share} style={{ position: 'absolute', left: x(wp.weeks) - labelW / 2, width: labelW, alignItems: 'center' }}>
                <Text variant="caption" color="textSecondary" tabular>
                  {shortDate(wp.date)}
                </Text>
                <Text variant="caption" color="textTertiary" tabular style={{ fontSize: 11, lineHeight: 14 }}>
                  {formatWeight(wp.kg, units)}
                </Text>
              </View>
            ))}
            <View style={{ position: 'absolute', left: end.x - labelW / 2, width: labelW, alignItems: 'center' }}>
              <Text variant="caption" color="text" tabular>
                {shortDate(p.date)}
              </Text>
            </View>
          </>
        ) : null}
      </View>
    </View>
  );
}
