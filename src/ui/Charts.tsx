import React, { useState } from 'react';
import { View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';

import { fonts, useTheme } from '@/theme';

import { haptic } from './haptics';
import { Text } from './Text';

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
  /** Stacked parts, bottom first. Their values should add up to `value`. */
  segments?: { value: number; color: string }[];
  /** Text for the scrub tooltip, e.g. 'Mon, Nov 3 · 1,980 kcal'. Defaults to label and value. */
  detail?: string;
}

/** A shaded horizontal zone, such as a target range. */
export interface ChartBand {
  from: number;
  to: number;
  /** Defaults to the chart colour. */
  color?: string;
}

/** Index of the slot under a touch, for scrubbing. */
function slotAt(e: GestureResponderEvent, count: number, x0: number, w: number): number {
  const x = e.nativeEvent.locationX - x0;
  return Math.max(0, Math.min(count - 1, Math.floor((x / Math.max(1, w)) * count)));
}

/** Floating pill above a chart while scrubbing. */
function ScrubPill({ text, x, width }: { text: string; x: number; width: number }) {
  const { colors, radius, spacing } = useTheme();
  const pillW = Math.min(width, Math.max(96, text.length * 6.6 + 20));
  const left = Math.max(0, Math.min(width - pillW, x - pillW / 2));
  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', top: -6, left, width: pillW, paddingVertical: 4, paddingHorizontal: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.text, alignItems: 'center' }}>
      <Text variant="caption" numberOfLines={1} style={{ color: colors.bg, fontFamily: fonts.bold }}>
        {text}
      </Text>
    </View>
  );
}

/**
 * Vertical bars with an optional dashed goal line, a shaded target band,
 * stacked segments and press-and-drag scrubbing (when `scrub` is set).
 */
export function BarChart({
  data,
  color,
  height = 150,
  goal,
  band,
  highlightIndex,
  formatValue,
  scrub,
  marks,
  maxValue,
  testID,
}: {
  data: BarDatum[];
  color: string;
  height?: number;
  goal?: number;
  band?: ChartBand;
  highlightIndex?: number;
  formatValue?: (n: number) => string;
  /** Press and drag to read each bar's value. */
  scrub?: boolean;
  /** Small marks drawn above bars, e.g. a check on days within the band. */
  marks?: (boolean | undefined)[];
  /** Fixed top of the scale (e.g. 7 for days a week); taller bars and lines still widen it. */
  maxValue?: number;
  testID?: string;
}) {
  const { colors } = useTheme();
  const [width, onLayout] = useWidth();
  const [active, setActive] = useState<number | null>(null);
  const labelH = 20;
  const topPad = 18;
  const chartH = height - labelH - topPad;
  const max = maxValue && maxValue >= Math.max(goal ?? 0, band?.to ?? 0, ...data.map((d) => d.value))
    ? maxValue * 1.08
    : Math.max(goal ?? 0, band?.to ?? 0, ...data.map((d) => d.value), 1) * 1.08;
  const slot = data.length ? width / data.length : 0;
  const barW = Math.min(28, slot * 0.56);
  const y = (v: number) => topPad + chartH - (Math.min(v, max) / max) * chartH;
  const hi = active ?? highlightIndex;
  const fmt = (n: number) => (formatValue ? formatValue(n) : `${Math.round(n)}`);
  const move = (e: GestureResponderEvent) => {
    const i = slotAt(e, data.length, 0, width);
    if (i !== active) {
      haptic.select();
      setActive(i);
    }
  };
  const responder = scrub && data.length
    ? {
        onStartShouldSetResponder: () => true,
        onMoveShouldSetResponder: () => true,
        onResponderTerminationRequest: () => true,
        onResponderGrant: move,
        onResponderMove: move,
        onResponderRelease: () => setActive(null),
        onResponderTerminate: () => setActive(null),
      }
    : {};
  return (
    <View onLayout={onLayout} style={{ height }} testID={testID}>
      {width > 0 ? (
        <Svg width={width} height={height}>
          {data.map((d, i) => (
            <Rect key={`t-${i}`} x={i * slot + (slot - barW) / 2} y={topPad} width={barW} height={chartH} rx={barW / 2.6} fill={colors.track} opacity={0.5} />
          ))}
          {band && band.to > band.from ? (
            <Rect x={0} y={y(band.to)} width={width} height={Math.max(1, y(band.from) - y(band.to))} fill={band.color ?? color} opacity={0.18} rx={4} />
          ) : null}
          {goal ? (
            <Line x1={0} x2={width} y1={y(goal)} y2={y(goal)} stroke={colors.borderStrong} strokeWidth={1} strokeDasharray="4 5" />
          ) : null}
          {data.map((d, i) => {
            const h = Math.max(d.value > 0 ? 4 : 0, (Math.min(d.value, max) / max) * chartH);
            const x = i * slot + (slot - barW) / 2;
            const on = hi === undefined || hi === null || hi === i;
            const r = Math.min(barW / 2.6, h / 2);
            let acc = 0;
            return (
              <React.Fragment key={`${d.label}-${i}`}>
                {h > 0 && d.segments?.length
                  ? d.segments.map((sg, j, arr) => {
                      const sh = (Math.min(sg.value, max) / max) * chartH;
                      const top = topPad + chartH - acc - sh;
                      acc += sh;
                      const last = j === arr.length - 1;
                      if (sh <= 0) return null;
                      // 2 px gap between parts; only the top part is rounded.
                      return last ? (
                        <Path
                          key={j}
                          d={`M ${x} ${top + sh - (j ? 2 : 0)} L ${x} ${top + Math.min(r, sh / 2)} Q ${x} ${top} ${x + Math.min(r, sh / 2)} ${top} L ${x + barW - Math.min(r, sh / 2)} ${top} Q ${x + barW} ${top} ${x + barW} ${top + Math.min(r, sh / 2)} L ${x + barW} ${top + sh - (j ? 2 : 0)} Z`}
                          fill={sg.color}
                          opacity={on ? 1 : 0.45}
                        />
                      ) : (
                        <Rect key={j} x={x} y={top} width={barW} height={Math.max(0, sh - (j ? 2 : 0))} fill={sg.color} opacity={on ? 1 : 0.45} />
                      );
                    })
                  : h > 0
                    ? <Rect x={x} y={topPad + chartH - h} width={barW} height={h} rx={r} fill={d.color ?? color} opacity={on ? 1 : 0.45} />
                    : null}
                {marks?.[i] ? (
                  <Path
                    d={`M ${x + barW / 2 - 4} ${topPad + chartH - h - 9} l 3 3 l 5 -6`}
                    stroke={colors.success}
                    strokeWidth={2}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ) : null}
                {active === i ? <Line x1={x + barW / 2} x2={x + barW / 2} y1={topPad - 4} y2={topPad + chartH} stroke={colors.textSecondary} strokeWidth={1} /> : null}
                {active === null && highlightIndex === i && d.value > 0 ? (
                  <SvgText x={x + barW / 2} y={Math.max(11, topPad + chartH - h - 5)} fontSize={10} fontFamily={fonts.bold} fill={colors.text} textAnchor="middle">
                    {formatValue ? formatValue(d.value) : Math.round(d.value)}
                  </SvgText>
                ) : null}
                <SvgText x={x + barW / 2} y={height - 5} fontSize={10} fontFamily={fonts.medium} fill={hi === i ? colors.text : colors.textTertiary} textAnchor="middle">
                  {d.label}
                </SvgText>
              </React.Fragment>
            );
          })}
        </Svg>
      ) : null}
      {scrub ? <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, cursor: 'crosshair', userSelect: 'none' } as object} {...responder} /> : null}
      {active !== null && data[active] ? (
        <ScrubPill text={data[active].detail ?? `${data[active].label} · ${fmt(data[active].value)}`} x={active * slot + slot / 2} width={width} />
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
  band,
  yLabels = 3,
  formatY,
  xLabels,
  formatPoint,
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
  /** Shaded horizontal zone, in y units. */
  band?: ChartBand;
  /** When set, press and drag scrubs along the line and shows this text for the point. */
  formatPoint?: (p: LinePoint) => string;
}) {
  const { colors } = useTheme();
  const [width, onLayout] = useWidth();
  const [gradId] = useState(() => `line-${seq++}`);
  const [active, setActive] = useState<number | null>(null);
  const all = [...line, ...(dots ?? [])];
  const padL = 40;
  const padR = 10;
  const padT = 12;
  const padB = xLabels ? 22 : 8;
  if (all.length === 0) return <View style={{ height }} onLayout={onLayout} />;
  let minY = Math.min(...all.map((p) => p.y), goal ?? Infinity, band?.from ?? Infinity);
  let maxY = Math.max(...all.map((p) => p.y), goal ?? -Infinity, band?.to ?? -Infinity);
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
  const nearest = (e: GestureResponderEvent) => {
    const x = e.nativeEvent.locationX;
    let best = 0;
    for (let i = 1; i < pts.length; i++) if (Math.abs(pts[i].px - x) < Math.abs(pts[best].px - x)) best = i;
    return best;
  };
  const move = (e: GestureResponderEvent) => {
    const i = nearest(e);
    if (i !== active) {
      haptic.select();
      setActive(i);
    }
  };
  const responder =
    formatPoint && pts.length
      ? {
          onStartShouldSetResponder: () => true,
          onMoveShouldSetResponder: () => true,
          onResponderTerminationRequest: () => true,
          onResponderGrant: move,
          onResponderMove: move,
          onResponderRelease: () => setActive(null),
          onResponderTerminate: () => setActive(null),
        }
      : {};
  const ap = active !== null ? pts[active] : null;
  return (
    <View onLayout={onLayout} style={{ height }}>
      {width > 0 ? (
        <Svg width={width} height={height}>
          {band && band.to > band.from ? (
            <Rect x={padL} y={sy(Math.min(band.to, maxY))} width={w} height={Math.max(1, sy(Math.max(band.from, minY)) - sy(Math.min(band.to, maxY)))} fill={band.color ?? color} opacity={0.12} rx={4} />
          ) : null}
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
          {ap ? (
            <>
              <Line x1={ap.px} x2={ap.px} y1={padT} y2={padT + h} stroke={colors.textSecondary} strokeWidth={1} />
              <Circle cx={ap.px} cy={ap.py} r={5} fill={color} stroke={colors.surface} strokeWidth={2} />
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
      {formatPoint ? <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, cursor: 'crosshair', userSelect: 'none' } as object} {...responder} /> : null}
      {ap && formatPoint && active !== null ? <ScrubPill text={formatPoint(line[active])} x={ap.px} width={width} /> : null}
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
