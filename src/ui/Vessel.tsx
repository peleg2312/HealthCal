import React, { useEffect, useState } from 'react';
import { Animated, Easing, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Line } from 'react-native-svg';

import { useTheme, vesselBase } from '@/theme';

import { fillRatio, levelY, placeLabels } from './vesselLayout';

const EDGE = 1.5;

/** Diagonal hatching ("/" lines, 1.5 px every `step` px). Decorative: it never takes touches. */
export function Hatch({ width, height, color, step = 6, opacity = 0.75 }: { width: number; height: number; color: string; step?: number; opacity?: number }) {
  if (width <= 0 || height <= 0) return null;
  const lines: React.ReactNode[] = [];
  for (let x = -height; x < width + step; x += step) {
    lines.push(<Line key={x} x1={x} y1={height} x2={x + height} y2={0} stroke={color} strokeWidth={1.5} />);
  }
  return (
    <Svg width={width} height={height} style={{ position: 'absolute', left: 0, top: 0 }} opacity={opacity} pointerEvents="none">
      {lines}
    </Svg>
  );
}

/** Animated 0..1 that follows `to` (a pour), or jumps when `animate` is false. */
function usePour(to: number, animate: boolean) {
  const [v] = useState(() => new Animated.Value(animate ? 0 : to));
  useEffect(() => {
    if (!animate) {
      v.setValue(to);
      return;
    }
    const a = Animated.timing(v, { toValue: to, duration: 650, easing: Easing.out(Easing.cubic), useNativeDriver: false });
    a.start();
    return () => a.stop();
  }, [to, animate, v]);
  return v;
}

export interface VesselLabel {
  /** Stable key. */
  key: string;
  /** The level this label describes, in the vessel's units (0 at the base, `max` at the top). */
  at: number;
  /** Height of the label's content in px, used to keep labels apart. */
  height: number;
  content: React.ReactNode;
  /** Colour of the 10 px tick linking the label to the vessel; omit for no tick. */
  tick?: string;
}

export interface VesselProps {
  /** Amount poured, in any unit. */
  value: number;
  /** The vessel's capacity (the budget or goal) in the same unit. Past it, the fill reaches the top and an amber lip shows. */
  max: number;
  /** Fill colour (a data colour). */
  color: string;
  width?: number;
  height?: number;
  /** Amount at the top of `max` drawn as hatched headroom (calories added by exercise). */
  headroom?: number;
  /** Hatch the fill itself: a day that is not finished yet. */
  hatchFill?: boolean;
  /** The 2 px lip line overhanging the open top. On by default for vessels 120 px or taller. */
  lip?: boolean;
  /** Level line thickness: 3, or 2.5 in small cups. */
  rimWidth?: number;
  /** A day that has not happened: a dashed empty outline. */
  future?: boolean;
  /** Labels to the right of the vessel at the height they describe. */
  labels?: VesselLabel[];
  /** Content at the bottom of the label column (macros on Today). Labels stay above it. */
  children?: React.ReactNode;
  /** Space between the vessel and its labels. */
  labelGap?: number;
  animate?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityLabel?: string;
}

/**
 * The open cup that replaces rings: sides and a round base in vesselEdge, no
 * top edge, a flat fill from the bottom and a rim (the level line) on the
 * fill. Optional hatched headroom at the top, an amber lip when the value
 * passes `max`, and labels beside it at the height they describe.
 *
 *   <Vessel value={eaten} max={budget} headroom={exercise} color={colors.calories} labels={...}>{macros}</Vessel>
 */
export function Vessel({
  value,
  max,
  color,
  width = 84,
  height = 212,
  headroom = 0,
  hatchFill,
  lip,
  rimWidth = 3,
  future,
  labels,
  children,
  labelGap = 16,
  animate = true,
  style,
  testID,
  accessibilityLabel,
}: VesselProps) {
  const { colors } = useTheme();
  const inner = height - EDGE;
  const innerW = width - 2 * EDGE;
  const ratio = fillRatio(value, max);
  const over = max > 0 && value > max;
  const base = vesselBase(height, width);
  const showLip = lip ?? height >= 120;
  const pour = usePour(ratio, animate);
  const headH = max > 0 ? Math.min(inner, (Math.max(0, headroom) / max) * inner) : 0;
  const [childH, setChildH] = useState(0);

  const cupView = future ? (
    <View
      style={{
        width,
        height,
        borderWidth: EDGE,
        borderTopWidth: 0,
        borderStyle: 'dashed',
        borderColor: colors.borderStrong,
        borderBottomLeftRadius: base,
        borderBottomRightRadius: base,
      }}
    />
  ) : (
    <View style={{ width, height }}>
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
          borderWidth: EDGE,
          borderTopWidth: 0,
          borderColor: colors.vesselEdge,
          borderBottomLeftRadius: base,
          borderBottomRightRadius: base,
          backgroundColor: colors.track,
          overflow: 'hidden',
        }}>
        {headH > 0 ? (
          <View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: headH, borderBottomWidth: EDGE, borderStyle: 'dashed', borderColor: colors.vesselEdge }}>
            <Hatch width={innerW} height={headH} color={colors.headroom} />
          </View>
        ) : null}
        <Animated.View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: pour.interpolate({ inputRange: [0, 1], outputRange: [0, inner] }),
          }}>
          <View style={{ flex: 1, backgroundColor: hatchFill ? 'transparent' : color, overflow: 'hidden' }}>
            {hatchFill ? <Hatch width={innerW} height={inner} color={color} step={4} opacity={1} /> : null}
          </View>
          {ratio > 0 ? <View style={{ position: 'absolute', left: 0, right: 0, top: -rimWidth / 2, height: rimWidth, backgroundColor: colors.rim }} /> : null}
        </Animated.View>
      </View>
      {showLip ? <View style={{ position: 'absolute', left: -6, right: -6, top: -1, height: 2, backgroundColor: colors.vesselEdge }} /> : null}
      {over ? <View style={{ position: 'absolute', left: -3, right: -3, top: showLip ? -6 : -4, height: 5, borderRadius: 2, backgroundColor: colors.warning }} /> : null}
    </View>
  );

  if (!labels?.length && !children) {
    return (
      <View style={style} testID={testID} accessibilityLabel={accessibilityLabel} accessible={!!accessibilityLabel}>
        {cupView}
      </View>
    );
  }

  const zone = Math.max(0, height - (childH ? childH + 6 : 0));
  // Laid out from the top of the vessel down, whatever order the caller listed them in.
  const list = [...(labels ?? [])].sort((a, b) => b.at - a.at);
  const wantY = list.map((l) => levelY(l.at, max, inner));
  const tops = placeLabels(
    list.map((l, i) => wantY[i] - l.height / 2),
    list.map((l) => l.height),
    zone,
  );
  const onChildLayout = (e: LayoutChangeEvent) => {
    const h = Math.round(e.nativeEvent.layout.height);
    if (h !== childH) setChildH(h);
  };

  return (
    <View style={[{ flexDirection: 'row', alignItems: 'flex-start', gap: labelGap }, style]} testID={testID} accessibilityLabel={accessibilityLabel}>
      <View style={{ width, height }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {cupView}
        {list.map((l, i) =>
          // A tick only where its label sits at the level it describes.
          l.tick && Math.abs(tops[i] + l.height / 2 - wantY[i]) <= l.height / 2 + 2 ? (
            <View key={l.key} style={{ position: 'absolute', left: width + 2, width: Math.max(4, Math.min(10, labelGap - 5)), top: Math.max(0, Math.min(height - 2, wantY[i] - 1)), height: 2, backgroundColor: l.tick }} />
          ) : null,
        )}
      </View>
      <View style={{ flex: 1, minWidth: 0, height }}>
        {list.map((l, i) => (
          <View key={l.key} style={{ position: 'absolute', left: 0, right: 0, top: tops[i], height: l.height, justifyContent: 'center' }}>
            {l.content}
          </View>
        ))}
        {children ? (
          <View onLayout={onChildLayout} style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
            {children}
          </View>
        ) : null}
      </View>
    </View>
  );
}

/**
 * A small cup for week strips and lists (30 x 38 in the week strip, 30 x 26 on
 * friend cards). 2.5 px rim, amber lip when over, dashed outline for a future day.
 *
 *   <MiniCup progress={eaten / budget} color={colors.calories} />
 */
export function MiniCup({
  progress,
  color,
  width = 30,
  height = 38,
  future,
  over,
  hatchFill,
  style,
}: {
  /** 0..1 of the target; above 1 shows the amber lip. */
  progress: number;
  color: string;
  width?: number;
  height?: number;
  future?: boolean;
  /** Force the over-target lip (by default it shows when progress > 1). */
  over?: boolean;
  hatchFill?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const p = Number.isFinite(progress) ? Math.max(0, progress) : 0;
  const isOver = over ?? p > 1;
  return (
    <Vessel
      value={isOver ? Math.max(p, 1.0001) : p}
      max={1}
      color={color}
      width={width}
      height={height}
      rimWidth={2.5}
      lip={false}
      future={future}
      hatchFill={hatchFill}
      animate={false}
      style={style}
    />
  );
}

/**
 * The vessel turned sideways (diary summary): open on the left with a 2 px
 * base mark, hatched headroom at the right end, the rim tick at the fill's end.
 *
 *   <Trough value={eaten} max={budget} headroom={exercise} color={colors.calories} />
 */
export function Trough({
  value,
  max,
  color,
  headroom = 0,
  height = 14,
  animate = true,
  style,
  testID,
}: {
  value: number;
  max: number;
  color: string;
  headroom?: number;
  height?: number;
  animate?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const { colors } = useTheme();
  const [w, setW] = useState(0);
  const ratio = fillRatio(value, max);
  const over = max > 0 && value > max;
  const pour = usePour(ratio, animate);
  const innerW = Math.max(0, w - EDGE);
  const innerH = height - 2 * EDGE;
  const headW = max > 0 ? Math.min(innerW, (Math.max(0, headroom) / max) * innerW) : 0;
  const left = pour.interpolate({ inputRange: [0, 1], outputRange: [0, innerW] });
  return (
    <View
      testID={testID}
      style={[{ height }, style]}
      onLayout={(e) => setW(Math.round(e.nativeEvent.layout.width))}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
          backgroundColor: colors.track,
          borderWidth: EDGE,
          borderLeftWidth: 0,
          borderColor: colors.vesselEdge,
          borderTopRightRadius: height / 2,
          borderBottomRightRadius: height / 2,
          overflow: 'hidden',
        }}>
        {headW > 0 ? (
          <View style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: headW, borderLeftWidth: EDGE, borderStyle: 'dashed', borderColor: colors.vesselEdge }}>
            <Hatch width={headW} height={innerH} color={colors.headroom} step={5} />
          </View>
        ) : null}
        <Animated.View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: left, backgroundColor: color }} />
      </View>
      <View style={{ position: 'absolute', left: 0, top: -4, bottom: -4, width: 2, backgroundColor: colors.vesselEdge }} />
      {ratio > 0 ? (
        <Animated.View pointerEvents="none" style={{ position: 'absolute', top: -5, bottom: -5, left, width: 0 }}>
          <View style={{ position: 'absolute', left: -1.5, top: 0, bottom: 0, width: 3, borderRadius: 1, backgroundColor: colors.rim }} />
        </Animated.View>
      ) : null}
      {over ? <View style={{ position: 'absolute', right: -4, top: -3, bottom: -3, width: 5, borderRadius: 2, backgroundColor: colors.warning }} /> : null}
    </View>
  );
}
