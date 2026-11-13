import React, { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';

import { fonts, useTheme } from '@/theme';

function useWidth(): [number, (e: LayoutChangeEvent) => void] {
  const [w, setW] = useState(0);
  return [w, (e) => setW(Math.round(e.nativeEvent.layout.width))];
}

let seq = 0;

export interface BarDatum {
  label: string;
  value: number;
  /** Optional per-bar colour override. */
  color?: string;
}

/** Vertical bars with an optional dashed goal line. */
export function BarChart({
  data,
  color,
  height = 150,
  goal,
  highlightIndex,
  formatValue,
}: {
  data: BarDatum[];
  color: string;
  height?: number;
  goal?: number;
  highlightIndex?: number;
  formatValue?: (n: number) => string;
}) {
  const { colors } = useTheme();
  const [width, onLayout] = useWidth();
  const labelH = 20;
  const topPad = 18;
  const chartH = height - labelH - topPad;
  const max = Math.max(goal ?? 0, ...data.map((d) => d.value), 1) * 1.08;
  const slot = data.length ? width / data.length : 0;
  const barW = Math.min(28, slot * 0.56);
  const y = (v: number) => topPad + chartH - (v / max) * chartH;
  return (
    <View onLayout={onLayout} style={{ height }}>
      {width > 0 ? (
        <Svg width={width} height={height}>
          {goal ? (
            <Line x1={0} x2={width} y1={y(goal)} y2={y(goal)} stroke={colors.borderStrong} strokeWidth={1} strokeDasharray="4 5" />
          ) : null}
          {data.map((d, i) => {
            const h = Math.max(d.value > 0 ? 4 : 0, (d.value / max) * chartH);
            const x = i * slot + (slot - barW) / 2;
            const active = highlightIndex === undefined || highlightIndex === i;
            return (
              <React.Fragment key={`${d.label}-${i}`}>
                <Rect x={x} y={topPad} width={barW} height={chartH} rx={barW / 2.6} fill={colors.track} opacity={0.5} />
                {h > 0 ? <Rect x={x} y={topPad + chartH - h} width={barW} height={h} rx={Math.min(barW / 2.6, h / 2)} fill={d.color ?? color} opacity={active ? 1 : 0.45} /> : null}
                {highlightIndex === i && d.value > 0 ? (
                  <SvgText x={x + barW / 2} y={Math.max(11, topPad + chartH - h - 5)} fontSize={10} fontFamily={fonts.bold} fill={colors.text} textAnchor="middle">
                    {formatValue ? formatValue(d.value) : Math.round(d.value)}
                  </SvgText>
                ) : null}
                <SvgText x={x + barW / 2} y={height - 5} fontSize={10} fontFamily={fonts.medium} fill={highlightIndex === i ? colors.text : colors.textTertiary} textAnchor="middle">
                  {d.label}
                </SvgText>
              </React.Fragment>
            );
          })}
        </Svg>
      ) : null}
    </View>
  );
}

export interface LinePoint {
  /** Position along x in any consistent unit (e.g. day index). */
  x: number;
  y: number;
}

function toPath(points: { px: number; py: number }[], smooth: boolean): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].px} ${points[0].py}`;
  if (!smooth) return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.px} ${p.py}`).join(' ');
  let d = `M ${points[0].px} ${points[0].py}`;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const cx = (a.px + b.px) / 2;
    d += ` C ${cx} ${a.py}, ${cx} ${b.py}, ${b.px} ${b.py}`;
  }
  return d;
}

/**
 * Line chart with a filled main series, optional scattered raw points and an
 * optional horizontal goal line. Used for the weight trend.
 */
export function LineChart({
  line,
  dots,
  color,
  height = 180,
  goal,
  yLabels = 3,
  formatY,
  xLabels,
}: {
  line: LinePoint[];
  /** Raw measurements drawn as faint dots behind the line. */
  dots?: LinePoint[];
  color: string;
  height?: number;
  goal?: number;
  yLabels?: number;
  formatY?: (n: number) => string;
  /** Labels spread evenly along the x axis. */
  xLabels?: string[];
}) {
  const { colors } = useTheme();
  const [width, onLayout] = useWidth();
  const [gradId] = useState(() => `line-${seq++}`);
  const all = [...line, ...(dots ?? [])];
  const padL = 40;
  const padR = 10;
  const padT = 12;
  const padB = xLabels ? 22 : 8;
  if (all.length === 0) return <View style={{ height }} onLayout={onLayout} />;
  let minY = Math.min(...all.map((p) => p.y), goal ?? Infinity);
  let maxY = Math.max(...all.map((p) => p.y), goal ?? -Infinity);
  const span = Math.max(maxY - minY, 1);
  minY -= span * 0.12;
  maxY += span * 0.12;
  const minX = Math.min(...all.map((p) => p.x));
  const maxX = Math.max(...all.map((p) => p.x));
  const w = Math.max(1, width - padL - padR);
  const h = height - padT - padB;
  const sx = (x: number) => padL + (maxX === minX ? w / 2 : ((x - minX) / (maxX - minX)) * w);
  const sy = (v: number) => padT + h - ((v - minY) / (maxY - minY)) * h;
  const pts = line.map((p) => ({ px: sx(p.x), py: sy(p.y) }));
  const path = toPath(pts, true);
  const area = pts.length > 1 ? `${path} L ${pts[pts.length - 1].px} ${padT + h} L ${pts[0].px} ${padT + h} Z` : '';
  const ticks = Array.from({ length: yLabels }, (_, i) => minY + ((maxY - minY) * (i + 0.5)) / yLabels);
  return (
    <View onLayout={onLayout} style={{ height }}>
      {width > 0 ? (
        <Svg width={width} height={height}>
          <Defs>
            <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={color} stopOpacity={0.28} />
              <Stop offset="1" stopColor={color} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          {ticks.map((t, i) => (
            <React.Fragment key={i}>
              <Line x1={padL} x2={width - padR} y1={sy(t)} y2={sy(t)} stroke={colors.border} strokeWidth={1} />
              <SvgText x={padL - 8} y={sy(t) + 3} fontSize={10} fontFamily={fonts.medium} fill={colors.textTertiary} textAnchor="end">
                {formatY ? formatY(t) : t.toFixed(1)}
              </SvgText>
            </React.Fragment>
          ))}
          {goal !== undefined ? (
            <Line x1={padL} x2={width - padR} y1={sy(goal)} y2={sy(goal)} stroke={colors.success} strokeWidth={1.5} strokeDasharray="5 5" />
          ) : null}
          {area ? <Path d={area} fill={`url(#${gradId})`} /> : null}
          {(dots ?? []).map((p, i) => (
            <Circle key={i} cx={sx(p.x)} cy={sy(p.y)} r={2.6} fill={colors.textTertiary} opacity={0.7} />
          ))}
          {path ? <Path d={path} stroke={color} strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" /> : null}
          {pts.length ? (
            <>
              <Circle cx={pts[pts.length - 1].px} cy={pts[pts.length - 1].py} r={7} fill={color} opacity={0.25} />
              <Circle cx={pts[pts.length - 1].px} cy={pts[pts.length - 1].py} r={4} fill={color} />
            </>
          ) : null}
          {(xLabels ?? []).map((label, i, arr) => (
            <SvgText
              key={`${label}-${i}`}
              x={padL + (arr.length === 1 ? w / 2 : (i / (arr.length - 1)) * w)}
              y={height - 5}
              fontSize={10}
              fontFamily={fonts.medium}
              fill={colors.textTertiary}
              textAnchor={i === 0 ? 'start' : i === arr.length - 1 ? 'end' : 'middle'}>
              {label}
            </SvgText>
          ))}
        </Svg>
      ) : null}
    </View>
  );
}

/** Tiny inline trend line with no axes. */
export function Sparkline({ values, color, width = 72, height = 28 }: { values: number[]; color: string; width?: number; height?: number }) {
  if (values.length < 2) return <View style={{ width, height }} />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => ({ px: 2 + (i / (values.length - 1)) * (width - 4), py: 2 + (height - 4) - ((v - min) / span) * (height - 4) }));
  return (
    <Svg width={width} height={height}>
      <Path d={toPath(pts, true)} stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" />
      <Circle cx={pts[pts.length - 1].px} cy={pts[pts.length - 1].py} r={2.6} fill={color} />
    </Svg>
  );
}

/** Horizontal stacked bar showing macro split. */
export function MacroBar({ protein, carbs, fat, height = 8 }: { protein: number; carbs: number; fat: number; height?: number }) {
  const { colors } = useTheme();
  const total = protein + carbs + fat;
  if (total <= 0) return <View style={{ height, borderRadius: height / 2, backgroundColor: colors.track }} />;
  return (
    <View style={{ height, borderRadius: height / 2, flexDirection: 'row', overflow: 'hidden', gap: 2 }}>
      <View style={{ flex: protein, backgroundColor: colors.protein }} />
      <View style={{ flex: carbs, backgroundColor: colors.carbs }} />
      <View style={{ flex: fat, backgroundColor: colors.fat }} />
    </View>
  );
}
