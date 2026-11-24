import React, { useEffect, useState } from 'react';
import { View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import Svg, { Circle, ClipPath, Defs, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

import { niceTicks } from '@/lib/chart';
import { cup, fonts, motion, useReducedMotion, useTheme } from '@/theme';

import { haptic } from './haptics';
import { DrawReveal, ease } from './motion';
import { Text } from './Text';

function useWidth(): [number, (e: LayoutChangeEvent) => void] {
  const [w, setW] = useState(0);
  return [w, (e) => setW(Math.round(e.nativeEvent.layout.width))];
}

let seq = 0;

/** Room either side of a pouring column, so a value label wider than its slot is not clipped. */
const COL_PAD = 24;

/**
 * A chart column that pours from the baseline once, when it mounts: its content
 * rises out of a clip at the baseline (a transform only, on the UI thread).
 */
function PourColumn({ left, width, height, rise, delay = 0, children }: { left: number; width: number; height: number; rise: number; delay?: number; children: React.ReactNode }) {
  const reduce = useReducedMotion();
  const [animate] = useState(() => !reduce && rise > 0);
  const p = useSharedValue(animate ? 0 : 1);
  useEffect(() => {
    if (animate) p.set(withDelay(delay, withTiming(1, { duration: motion.duration.pourSmall, easing: ease.pour })));
  }, [animate, delay, p]);
  useEffect(() => {
    if (reduce) {
      cancelAnimation(p);
      p.set(1);
    }
  }, [reduce, p]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - p.get()) * rise }] }));
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left, top: 0, width, height, overflow: 'hidden' }}>
      <Animated.View style={[{ width, height }, style]}>{children}</Animated.View>
    </View>
  );
}

export interface BarDatum {
  label: string;
  value: number;
  /** Optional per-bar colour override. */
  color?: string;
  /** Stacked parts, bottom first. Their values should add up to `value`. */
  segments?: { value: number; color: string }[];
  /** Text for the scrub tooltip, e.g. 'Mon, Nov 3 · 1,980 kcal'. Defaults to label and value. */
  detail?: string;
  /**
   * This bar's own goal, when days have different ones (a calorie budget that changes with
   * exercise). It replaces the chart's `goal` for this bar's amber part and reached state, so a
   * day is never marked over against an average. The chart's `goal` still draws the dashed line.
   */
  goal?: number;
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

/** Ink label above a chart while scrubbing (a small cup, not a pill). */
function ScrubPill({ text, x, width }: { text: string; x: number; width: number }) {
  const { colors, spacing } = useTheme();
  const pillW = Math.min(width, Math.max(96, text.length * 6.6 + 20));
  const left = Math.max(0, Math.min(width - pillW, x - pillW / 2));
  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', top: -6, left, width: pillW, paddingVertical: 4, paddingHorizontal: spacing.sm, ...cup(8, 4), backgroundColor: colors.text, alignItems: 'center' }}>
      <Text variant="caption" numberOfLines={1} style={{ color: colors.bg, fontFamily: fonts.bold }}>
        {text}
      </Text>
    </View>
  );
}

/** Bar outline with square shoulders and a small round base (a slim cup). */
function cupPath(x: number, top: number, w: number, bottom: number, r: number): string {
  const rr = Math.max(0, Math.min(r, (bottom - top) / 2, w / 2));
  return `M ${x} ${top} L ${x + w} ${top} L ${x + w} ${bottom - rr} Q ${x + w} ${bottom} ${x + w - rr} ${bottom} L ${x + rr} ${bottom} Q ${x} ${bottom} ${x} ${bottom - rr} Z`;
}

/** "/" hatch lines covering a box, for clipping into a shape. */
function hatchLines(x: number, top: number, w: number, h: number, color: string, step = 4) {
  const out: React.ReactNode[] = [];
  for (let i = -h; i < w + step; i += step) out.push(<Line key={i} x1={x + i} y1={top + h} x2={x + i + h} y2={top} stroke={color} strokeWidth={1.5} />);
  return out;
}

/**
 * Rows of slim cups: each bar is a flat tint of its colour (the theme's
 * `chartFill`: 42% on the light papers, 70% in dark so a bar keeps its colour
 * instead of turning brown) with a solid 2.5 px rim (the day's level) on top,
 * so a row of bars reads as a skyline of level lines. The part above the
 * dashed `goal` line is amber, and that bar's level line (on its top) is
 * 1 px heavier, at the bar's own width, so a day over its line is told
 * without its colour (also a stacked bar whose top segment is the amber, as
 * Progress draws its calorie bars). It never reaches past the bar: a level
 * line wider than its bar is the brim, which means a goal reached. With
 * `goalKind="reach"` nothing turns amber and a bar at or past the goal wears
 * the brim line instead (its rim 1 to 2 px wider each side and 1 px
 * heavier), so the days that met the goal can be counted at a glance. The `openIndex` bar (today, not finished) is
 * hatched; it is the only bar drawn differently. `highlightIndex` prints that
 * bar's value and bolds its label, and never dims the others: every finished
 * bar keeps its colour and its rim. Stacked `segments` are drawn solid. Press
 * and drag scrubs when `scrub` is set (the other bars dim only while a finger
 * is down).
 */
export function BarChart({
  data,
  color,
  height = 150,
  goal,
  goalKind = 'limit',
  band,
  highlightIndex,
  openIndex,
  formatValue,
  scrub,
  marks,
  maxValue,
  testID,
}: {
  data: BarDatum[];
  color: string;
  height?: number;
  /** Dashed budget line; the part of a bar above it is drawn in warning. */
  goal?: number;
  /** 'limit' (default): the part of a bar above the goal is amber, as for calories. 'reach': the goal is something to get to (water, minutes), so nothing turns amber; a bar at or past it wears the brim line. */
  goalKind?: 'limit' | 'reach';
  band?: ChartBand;
  /** Print this bar's value above it and bold its label. It does not dim the other bars. */
  highlightIndex?: number;
  /** A bar whose day is still open (today): hatched instead of filled. */
  openIndex?: number;
  formatValue?: (n: number) => string;
  /** Press and drag to read each bar's value. */
  scrub?: boolean;
  /** Small marks drawn above bars, e.g. a check on days within the band. */
  marks?: (boolean | undefined)[];
  /** Fixed top of the scale (e.g. 7 for days a week); taller bars and lines still widen it. */
  maxValue?: number;
  testID?: string;
}) {
  const { colors, chartFill } = useTheme();
  const [width, onLayout] = useWidth();
  const [active, setActive] = useState<number | null>(null);
  const [uid] = useState(() => `bars-${seq++}`);
  const labelH = 20;
  const topPad = 18;
  const chartH = height - labelH - topPad;
  const max = maxValue && maxValue >= Math.max(goal ?? 0, band?.to ?? 0, ...data.map((d) => d.value))
    ? maxValue * 1.08
    : Math.max(goal ?? 0, band?.to ?? 0, ...data.map((d) => d.value), 1) * 1.08;
  const slot = data.length ? width / data.length : 0;
  const barW = Math.max(3, Math.min(20, slot * 0.5));
  const base = topPad + chartH;
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
  // Everything one bar draws, in chart coordinates: the cup, the amber over-goal part, the rim,
  // the check mark and the highlighted value. Drawn per column so each column can pour.
  const barParts = (d: BarDatum, i: number) => {
    const v = Math.max(0, d.value);
    const g = d.goal ?? goal;
    const h = Math.max(v > 0 ? 3 : 0, (Math.min(v, max) / max) * chartH);
    const x = i * slot + (slot - barW) / 2;
    // Bars dim only while scrubbing, to point at the one under the finger.
    const on = active === null || active === i;
    const over = goalKind === 'limit' && !!g && v > g;
    // A bar above its own line: the kit's amber part (`over`), or stacked segments whose top one is drawn
    // in the amber (Progress's calorie bars, `solidBar`): amber means over and nothing else.
    const top = d.segments?.[d.segments.length - 1];
    const overTop = over || (goalKind === 'limit' && (d.segments?.length ?? 0) > 1 && !!top && top.value > 0 && top.color === colors.warning);
    // A day that met a goal meant to be reached wears the brim line: its rim a little wider than the bar and 1 px heavier.
    const reached = goalKind === 'reach' && !!g && v >= g;
    const brim = reached ? (barW >= 10 ? 2 : 1) : 0;
    // Over, the level line on top of the bar is 1 px heavier but stays the bar's own width, so a day above its
    // line is told without its colour, and never in the brim's shape (wider than the bar means reached).
    const heavy = reached || overTop;
    const fillTo = over ? y(g) : base - h;
    const r = Math.min(3, barW / 3);
    const c = d.color ?? color;
    const open = openIndex === i;
    let acc = 0;
    return (
      <G key={`${d.label}-${i}`} opacity={on ? 1 : 0.5}>
        {h > 0 && d.segments?.length
          ? d.segments.map((sg, j) => {
              const sh = (Math.min(sg.value, max) / max) * chartH;
              const top = base - acc - sh;
              acc += sh;
              if (sh <= 0) return null;
              return j === 0 ? (
                <Path key={j} d={cupPath(x, top, barW, base, r)} fill={sg.color} />
              ) : (
                <Rect key={j} x={x} y={top} width={barW} height={Math.max(0, sh - 1.5)} fill={sg.color} />
              );
            })
          : h > 0 && open
            ? (
                <>
                  <Defs>
                    <ClipPath id={`${uid}-${i}`}>
                      <Path d={cupPath(x, fillTo, barW, base, r)} />
                    </ClipPath>
                  </Defs>
                  <G clipPath={`url(#${uid}-${i})`}>{hatchLines(x, fillTo, barW, base - fillTo, c)}</G>
                </>
              )
            : h > 0
              ? <Path d={cupPath(x, fillTo, barW, base, r)} fill={c} opacity={chartFill} />
              : null}
        {h > 0 && over ? <Rect x={x} y={base - h} width={barW} height={Math.max(0, fillTo - (base - h))} fill={colors.warning} /> : null}
        {h > 0 ? <Rect x={x - brim} y={base - h - (heavy ? 1.75 : 1.25)} width={barW + 2 * brim} height={heavy ? 3.5 : 2.5} fill={colors.rim} /> : null}
        {marks?.[i] ? (
          <Path
            d={`M ${x + barW / 2 - 4} ${base - h - 9} l 3 3 l 5 -6`}
            stroke={colors.success}
            strokeWidth={2}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}
        {active === null && highlightIndex === i && v > 0 ? (
          <SvgText x={x + barW / 2} y={Math.max(11, base - h - 6)} fontSize={11} fontFamily={fonts.numBold} fill={colors.text} textAnchor="middle">
            {formatValue ? formatValue(d.value) : Math.round(d.value)}
          </SvgText>
        ) : null}
      </G>
    );
  };
  // How far each column rises: its bar plus the mark or value above it.
  const riseOf = (d: BarDatum) => Math.min(base, Math.max(0, (Math.min(Math.max(0, d.value), max) / max) * chartH) + 22);
  // Up to two weeks, columns pour one by one; longer ranges rise as one layer, which mounts
  // as fast as the still chart (measured on Progress with the CPU throttled 4x).
  const perColumn = data.length <= 14;
  const stagger = Math.min(motion.duration.stagger, 360 / Math.max(1, data.length));
  return (
    <View onLayout={onLayout} style={{ height }} testID={testID}>
      {width > 0 ? (
        <>
          {band && band.to > band.from ? (
            <Svg width={width} height={height} style={{ position: 'absolute', left: 0, top: 0 }}>
              <Rect x={0} y={y(band.to)} width={width} height={Math.max(1, y(band.from) - y(band.to))} fill={band.color ?? color} opacity={0.12} rx={2} />
            </Svg>
          ) : null}
          {/* Keyed by length: a new range pours again, a value changing within it does not. */}
          <React.Fragment key={`bars-${data.length}`}>
            {perColumn ? (
              data.map((d, i) => (
                <PourColumn key={`${d.label}-${i}`} left={i * slot - COL_PAD} width={slot + 2 * COL_PAD} height={base} rise={riseOf(d)} delay={i * stagger}>
                  <Svg width={slot + 2 * COL_PAD} height={base}>
                    <G transform={`translate(${COL_PAD - i * slot}, 0)`}>{barParts(d, i)}</G>
                  </Svg>
                </PourColumn>
              ))
            ) : (
              <PourColumn left={0} width={width} height={base} rise={chartH}>
                <Svg width={width} height={base}>
                  {data.map(barParts)}
                </Svg>
              </PourColumn>
            )}
          </React.Fragment>
          <Svg width={width} height={height} style={{ position: 'absolute', left: 0, top: 0 }} pointerEvents="none">
            {active !== null && data[active] ? (
              <Line x1={active * slot + slot / 2} x2={active * slot + slot / 2} y1={topPad - 4} y2={base} stroke={colors.textSecondary} strokeWidth={1} />
            ) : null}
            {goal ? <Line x1={0} x2={width} y1={y(goal)} y2={y(goal)} stroke={colors.borderStrong} strokeWidth={1.5} strokeDasharray="4 4" /> : null}
            {data.map((d, i) => (
              <SvgText
                key={`l-${i}`}
                x={i * slot + slot / 2}
                y={height - 5}
                fontSize={10.5}
                fontFamily={hi === i ? fonts.bold : fonts.semibold}
                fill={hi === i ? colors.text : colors.textSecondary}
                textAnchor="middle">
                {d.label}
              </SvgText>
            ))}
          </Svg>
        </>
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
 * Line chart: a 2 px line in the data colour over a flat 10% tint (never a
 * gradient), optional faint raw points, a dashed borderStrong goal line and a
 * rim dot on the latest value. Used for the weight trend.
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
  // Round grid values (steps of 1, 2 or 5 times a power of ten) read better than even fractions of the range.
  const ticks = niceTicks(minY, maxY, yLabels);
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
          {ticks.map((t, i) => (
            <React.Fragment key={i}>
              <Line x1={padL} x2={width - padR} y1={sy(t)} y2={sy(t)} stroke={colors.border} strokeWidth={1} />
              <SvgText x={padL - 8} y={sy(t) + 3} fontSize={10.5} fontFamily={fonts.medium} fill={colors.textSecondary} textAnchor="end">
                {formatY ? formatY(t) : String(Math.round(t * 10) / 10)}
              </SvgText>
            </React.Fragment>
          ))}
          {goal !== undefined ? (
            <Line x1={padL} x2={width - padR} y1={sy(goal)} y2={sy(goal)} stroke={colors.borderStrong} strokeWidth={1.5} strokeDasharray="4 4" />
          ) : null}
          {(xLabels ?? []).map((label, i, arr) => (
            <SvgText
              key={`${label}-${i}`}
              x={padL + (arr.length === 1 ? w / 2 : (i / (arr.length - 1)) * w)}
              y={height - 5}
              fontSize={10.5}
              fontFamily={fonts.medium}
              fill={colors.textSecondary}
              textAnchor={i === 0 ? 'start' : i === arr.length - 1 ? 'end' : 'middle'}>
              {label}
            </SvgText>
          ))}
        </Svg>
      ) : null}
      {width > 0 ? (
        // The line draws left to right once, when the chart first appears.
        <DrawReveal width={width} height={height}>
          <Svg width={width} height={height}>
            {area ? <Path d={area} fill={color} opacity={0.1} /> : null}
            {(dots ?? []).map((p, i) => (
              <Circle key={i} cx={sx(p.x)} cy={sy(p.y)} r={2.6} fill={colors.textTertiary} opacity={0.7} />
            ))}
            {path ? <Path d={path} stroke={color} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" /> : null}
            {pts.length ? <Circle cx={pts[pts.length - 1].px} cy={pts[pts.length - 1].py} r={3} fill={colors.rim} stroke={colors.surface} strokeWidth={1.5} /> : null}
          </Svg>
        </DrawReveal>
      ) : null}
      {ap ? (
        <Svg width={width} height={height} style={{ position: 'absolute', left: 0, top: 0 }} pointerEvents="none">
          <Line x1={ap.px} x2={ap.px} y1={padT} y2={padT + h} stroke={colors.textSecondary} strokeWidth={1} />
          <Circle cx={ap.px} cy={ap.py} r={4} fill={colors.rim} stroke={colors.surface} strokeWidth={2} />
        </Svg>
      ) : null}
      {formatPoint ? <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, cursor: 'crosshair', userSelect: 'none' } as object} {...responder} /> : null}
      {ap && formatPoint && active !== null ? <ScrubPill text={formatPoint(line[active])} x={ap.px} width={width} /> : null}
    </View>
  );
}

/** Tiny inline trend line with no axes. */
export function Sparkline({ values, color, width = 72, height = 28 }: { values: number[]; color: string; width?: number; height?: number }) {
  const { colors } = useTheme();
  if (values.length < 2) return <View style={{ width, height }} />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => ({ px: 2 + (i / (values.length - 1)) * (width - 4), py: 2 + (height - 4) - ((v - min) / span) * (height - 4) }));
  return (
    <Svg width={width} height={height}>
      <Path d={toPath(pts, true)} stroke={color} strokeWidth={1.75} fill="none" strokeLinecap="round" />
      <Circle cx={pts[pts.length - 1].px} cy={pts[pts.length - 1].py} r={2.5} fill={colors.rim} />
    </Svg>
  );
}

/** Horizontal stacked bar showing macro split: flat parts, 2 px gaps, square-ish ends (radius 2). */
export function MacroBar({ protein, carbs, fat, height = 8 }: { protein: number; carbs: number; fat: number; height?: number }) {
  const { colors, radius } = useTheme();
  const total = protein + carbs + fat;
  if (total <= 0) return <View style={{ height, borderRadius: radius.track, backgroundColor: colors.track }} />;
  return (
    <View style={{ height, borderRadius: radius.track, flexDirection: 'row', overflow: 'hidden', gap: 2 }}>
      <View style={{ flex: protein, backgroundColor: colors.protein }} />
      <View style={{ flex: carbs, backgroundColor: colors.carbs }} />
      <View style={{ flex: fat, backgroundColor: colors.fat }} />
    </View>
  );
}
