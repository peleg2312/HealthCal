import React, { useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Line, Path, Polygon } from 'react-native-svg';

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
 * The road from today's weight to the target: the planned line, a band for
 * real-world pace, and dated waypoints. Drawn in the weight colour only.
 */
export function ProjectionChart({ projection: p, units }: { projection: Projection; units: UnitSystem }) {
  const { colors, spacing } = useTheme();
  const [width, setWidth] = useState(0);
  const lose = p.targetKg < p.startKg;

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
            <Polygon points={band} fill={`${colors.weight}22`} />
            <Line x1={end.x} x2={x(p.slowWeeks)} y1={end.y} y2={end.y} stroke={colors.weight} strokeOpacity={0.5} strokeWidth={2} strokeDasharray="4 4" />
            {p.waypoints.map((wp) => (
              <Line key={`t${wp.share}`} x1={x(wp.weeks)} x2={x(wp.weeks)} y1={y(wp.kg) + 6} y2={axisY} stroke={colors.border} strokeWidth={1} strokeDasharray="2 3" />
            ))}
            <Line x1={end.x} x2={end.x} y1={end.y + 8} y2={axisY} stroke={colors.border} strokeWidth={1} strokeDasharray="2 3" />
            <Path d={`M${start.x},${start.y} L${end.x},${end.y}`} stroke={colors.weight} strokeWidth={3} strokeLinecap="round" fill="none" />
            {p.waypoints.map((wp) => (
              <Circle key={`d${wp.share}`} cx={x(wp.weeks)} cy={y(wp.kg)} r={4} fill={colors.surface} stroke={colors.weight} strokeWidth={2} />
            ))}
            <Circle cx={start.x} cy={start.y} r={5} fill={colors.weight} />
            <Circle cx={end.x} cy={end.y} r={8} fill={`${colors.weight}33`} />
            <Circle cx={end.x} cy={end.y} r={5} fill={colors.weight} />
          </Svg>
        ) : null}
        {width > 0 ? (
          <>
            <Text variant="caption" color="textSecondary" tabular style={{ position: 'absolute', left: PAD_X, top: lose ? 2 : PLOT_H - PAD_BOTTOM - 34 }}>
              {`${formatWeight(p.startKg, units)} today`}
            </Text>
            <Text
              variant="caption"
              color="weight"
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
              <Text variant="caption" color="weight" tabular>
                {shortDate(p.date)}
              </Text>
            </View>
          </>
        ) : null}
      </View>
    </View>
  );
}
