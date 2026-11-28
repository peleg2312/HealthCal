import React, { useState } from 'react';
import { Platform, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import Svg, { Line } from 'react-native-svg';

import { spokenUnits } from '@/lib/spokenUnits';
import { motion, useTheme, vesselBase } from '@/theme';

import { DECORATIVE, figure } from './decorative';
import { isLaidOut } from './controlRules';
import { useFadeAfter, usePour, useReachFlash } from './motion';
import { brimOverhang, fillRatio, goalState, levelY, placeLabels, type GoalKind } from './vesselLayout';

const EDGE = 1.5;

/** Diagonal hatching ("/" lines, 1.5 px every `step` px). Decorative: it never takes touches. */
export function Hatch({ width, height, color, step = 6, opacity = 0.75 }: { width: number; height: number; color: string; step?: number; opacity?: number }) {
  if (width <= 0 || height <= 0) return null;
  const lines: React.ReactNode[] = [];
  for (let x = -height; x < width + step; x += step) {
    lines.push(<Line key={x} x1={x} y1={height} x2={x + height} y2={0} stroke={color} strokeWidth={1.5} />);
  }
  return (
    <Svg width={width} height={height} style={{ position: 'absolute', left: 0, top: 0 }} opacity={opacity} pointerEvents="none" {...DECORATIVE}>
      {lines}
    </Svg>
  );
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
  /** The vessel's capacity (the budget or goal) in the same unit. Past it the fill stays at the top: amber for a limit, the brim line for a goal to reach (see `goalKind`). */
  max: number;
  /**
   * What `max` means. 'limit' (default): a budget, so going past it shows the amber lip.
   * 'reach': a goal to get to (water, activity minutes, protein), so at or past it the cup is
   * brim-full and wears the brim line, never amber. Pass the real value, not one capped at `max`.
   */
  goalKind?: GoalKind;
  /**
   * 'reach' only: called once when the level crosses the goal while this cup is on screen, in
   * the same tick as the change (also under reduced motion). Add the haptic and the line of
   * text here. Not called for a cup that mounts already full; see `useReachFlash` for the rule.
   */
  onReached?: () => void;
  /** Fill colour (a data colour). */
  color: string;
  width?: number;
  height?: number;
  /** Amount at the top of `max` drawn as hatched headroom (calories added by exercise). */
  headroom?: number;
  /** Hatch the fill itself: a day that is not finished yet. */
  hatchFill?: boolean;
  /** @deprecated Pour cups are plain tumblers: no lip line overhangs the open top. Accepted and ignored. */
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
  /** Least space between two labels when their levels are close (default 2). 8 keeps them from reading as one lump. */
  labelSpacing?: number;
  /** Pour on mount and on change (default). False jumps to the value. Reduced motion always jumps. */
  animate?: boolean;
  /** Pour length in ms (default `motion.duration.pour`). */
  duration?: number;
  /** Wait before pouring, e.g. `index * motion.duration.stagger` in a row of cups. */
  delay?: number;
  /** Remember the level for this session under this key, so a remount with the same value does not pour again. */
  memoryKey?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityLabel?: string;
}

/**
 * The open cup that replaces rings. It is a tumbler: straight sides and a round
 * base in vesselEdge, square at the open top, with no top edge and no lip. A
 * flat fill rises from the bottom with the rim (the level line) on it. The part
 * not filled is `vesselEmpty` (the card colour), so room left reads as empty.
 * Optional hatched headroom at the top, and labels beside the cup at the
 * height they describe.
 *
 * What happens at the goal depends on `goalKind`:
 * - 'limit' (a budget, the default): past `max` the fill stays at the top and
 *   an amber cap sits across it at the cup's own width, never past its walls:
 *   a line wider than the cup is the brim, which means a goal reached. Amber
 *   means over, with neutral words.
 * - 'reach' (water, activity minutes, protein): at or past `max` the cup is
 *   brim-full and the level line becomes the brim line. It lies across the
 *   open top, wider than the cup (3 to 6 px past each side) and 1 to 2 px
 *   heavier, so a reached goal is told from 98% in a still picture: below the
 *   goal the line is inside the cup, at the goal it lies across it. No amber,
 *   no badge.
 *   When the level crosses the goal while the cup is on screen, the brim line
 *   spreads into place as the pour lands and flashes once in the data colour
 *   (a flat band behind the line; never looped, skipped under reduced motion,
 *   not replayed on a remount with the same `memoryKey`). `onReached` fires at
 *   that crossing, so the screen can add `haptic.success()` and a line of text.
 *   A cup that can show more than one day needs a `memoryKey` with the day in
 *   it: a new key is a mount, so paging onto a day that met its goal marks
 *   nothing. Every mounted cup that sees the crossing calls its `onReached`, so
 *   a tab screen that stays mounted under another screen should react only
 *   while it is focused.
 *
 *   <Vessel value={eaten} max={budget} headroom={exercise} color={colors.calories} labels={...}>{macros}</Vessel>
 *   <Vessel value={drunk} max={goal} goalKind="reach" onReached={celebrate} memoryKey={`water-${date}`} color={colors.water} />
 */
export function Vessel({
  value,
  max,
  color,
  width = 84,
  height = 212,
  headroom = 0,
  hatchFill,
  lip: _lip,
  rimWidth = 3,
  future,
  labels,
  children,
  labelGap = 16,
  labelSpacing,
  goalKind = 'limit',
  onReached,
  animate = true,
  duration = motion.duration.pour,
  delay = 0,
  memoryKey,
  style,
  testID,
  accessibilityLabel,
}: VesselProps) {
  const { colors } = useTheme();
  const inner = height - EDGE;
  const innerW = width - 2 * EDGE;
  const ratio = fillRatio(value, max);
  const state = future ? 'under' : goalState(value, max, goalKind);
  const over = state === 'over';
  const reached = state === 'reached';
  const base = vesselBase(height, width);
  const pour = usePour(ratio, { animate: animate && !future, duration, delay, memoryKey });
  const headH = max > 0 ? Math.min(inner, (Math.max(0, headroom) / max) * inner) : 0;
  const [childH, setChildH] = useState(0);
  // The hatched headroom fades in once the pour has landed; the over-target lip and the brim line appear at its end.
  const headOpacity = useFadeAfter(headH > 0, pour.endsIn, pour.instant);
  const lipOpacity = useFadeAfter(over, pour.endsIn, pour.instant);
  const brimOpacity = useFadeAfter(reached, pour.endsIn, pour.instant);
  const flash = useReachFlash(reached, { delay: pour.endsIn, instant: pour.instant, memoryKey, onReached });
  const { level, settle } = pour;
  // The brim line: the level line lying across the open top, wider than the cup and heavier
  // (2 px on a big vessel, 1 px on a mini cup).
  const out = brimOverhang(width);
  const brimH = rimWidth + (out >= 5 ? 2 : 1);
  const brimFrom = width / (width + 2 * out);
  // Only transforms and opacity animate: the fill is full height and slides up inside the clipped cup.
  // At level 0 it is hidden outright, so no hairline of colour shows at the base of an empty cup.
  const fillStyle = useAnimatedStyle(() => ({ opacity: level.get() > 0.0005 ? 1 : 0, transform: [{ translateY: (1 - level.get()) * inner }] }));
  // A full cup has no room above the level for the settle's overshoot: the line would leave the cup's
  // clipped box for a frame. Near the top the overshoot is scaled away, so the line never disappears.
  const rimStyle = useAnimatedStyle(() => {
    const room = Math.min(1, Math.max(0, (1 - level.get()) * 40));
    return { opacity: level.get() > 0.0005 ? 1 : 0, transform: [{ translateY: -settle.get() * room }] };
  });
  const headStyle = useAnimatedStyle(() => ({ opacity: headOpacity.get() }));
  const lipStyle = useAnimatedStyle(() => ({ opacity: lipOpacity.get() }));
  // It spreads from the cup's own width to its full width as it appears.
  const brimStyle = useAnimatedStyle(() => ({ opacity: brimOpacity.get(), transform: [{ scaleX: brimFrom + (1 - brimFrom) * brimOpacity.get() }] }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.get() }));

  const cupView = future ? (
    <View
      style={{
        width,
        height,
        borderWidth: EDGE,
        borderTopWidth: 0,
        borderStyle: 'dashed',
        // The dashes say "a day still to come": a dash that carries meaning, 3:1 on the card (`dashEdge`).
        borderColor: colors.dashEdge,
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
          backgroundColor: colors.vesselEmpty,
          overflow: 'hidden',
        }}>
        {headH > 0 ? (
          <Animated.View style={[{ position: 'absolute', left: 0, right: 0, top: 0, height: headH, borderBottomWidth: EDGE, borderStyle: 'dashed', borderColor: colors.vesselEdge }, headStyle]}>
            <Hatch width={innerW} height={headH} color={colors.headroom} />
          </Animated.View>
        ) : null}
        <Animated.View style={[{ position: 'absolute', left: 0, right: 0, top: 0, height: inner }, fillStyle]}>
          <View style={{ flex: 1, backgroundColor: hatchFill ? 'transparent' : color, overflow: 'hidden' }}>
            {hatchFill ? <Hatch width={innerW} height={inner} color={color} step={4} opacity={1} /> : null}
          </View>
          <Animated.View style={[{ position: 'absolute', left: 0, right: 0, top: -rimWidth / 2, height: rimWidth, backgroundColor: colors.rim }, rimStyle]} />
        </Animated.View>
      </View>
      {/* The over cap lies across the open top at the cup's own width: only the brim line reaches past the walls. */}
      {over ? <Animated.View style={[{ position: 'absolute', left: 0, right: 0, top: -2.5, height: 5, borderTopLeftRadius: 1, borderTopRightRadius: 1, backgroundColor: colors.warning }, lipStyle]} /> : null}
      {reached ? (
        <>
          {/* One flash in the data colour behind the brim line, at the crossing only. */}
          <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: -out - 3, right: -out - 3, top: -brimH / 2 - 3, height: brimH + 6, borderRadius: 2, backgroundColor: color }, flashStyle]} />
          <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: -out, right: -out, top: -brimH / 2, height: brimH, borderRadius: 1, backgroundColor: colors.rim }, brimStyle]} />
        </>
      ) : null}
    </View>
  );

  if (!labels?.length && !children) {
    return (
      <View style={style} testID={testID} {...figure(accessibilityLabel && spokenUnits(accessibilityLabel))}>
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
    labelSpacing,
  );
  const onChildLayout = (e: LayoutChangeEvent) => {
    const h = Math.round(e.nativeEvent.layout.height);
    if (h !== childH) setChildH(h);
  };

  return (
    // With labels the cup is not one element (its labels can hold controls, Today's "941 kcal left"), so on the web its
    // name is a group's, read as a reader enters it: a name on a box with no role is not read there.
    <View
      style={[{ flexDirection: 'row', alignItems: 'flex-start', gap: labelGap }, style]}
      testID={testID}
      accessibilityLabel={accessibilityLabel && spokenUnits(accessibilityLabel)}
      {...(Platform.OS === 'web' && accessibilityLabel ? ({ role: 'group' } as const) : null)}>
      <View style={{ width, height }} {...DECORATIVE}>
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
 * friend cards). 2.5 px rim, dashed outline for a future day. With the default
 * `goalKind` an amber lip shows when over; with `goalKind="reach"` a cup at or
 * past 1 wears the brim line instead (see `Vessel`).
 *
 *   <MiniCup progress={eaten / budget} color={colors.calories} />
 *   <MiniCup progress={minutes / goal} goalKind="reach" color={colors.exercise} />
 */
export function MiniCup({
  progress,
  color,
  width = 30,
  height = 38,
  future,
  over,
  hatchFill,
  goalKind = 'limit',
  onReached,
  index = 0,
  memoryKey,
  animate = true,
  style,
}: {
  /** 0..1 of the target; above 1 shows the amber lip (or, for a goal to reach, the brim line from 1 up). */
  progress: number;
  color: string;
  width?: number;
  height?: number;
  future?: boolean;
  /** 'limit' only: force the over-target lip on or off (by default it shows when progress > 1). */
  over?: boolean;
  hatchFill?: boolean;
  /** 'limit' (default) or 'reach': a goal to get to, shown brim-full with the brim line at or past 1, never amber. */
  goalKind?: GoalKind;
  /** 'reach' only: called once when the level crosses the goal while the cup is on screen (see `Vessel`). */
  onReached?: () => void;
  /** Position in a row: cups pour left to right, `motion.duration.stagger` ms apart. */
  index?: number;
  /** Remember this cup's level for the session (e.g. `cal-${date}`), so a past day does not pour again on a revisit. */
  memoryKey?: string;
  /** Pour on mount and on change (default true). */
  animate?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const p = Number.isFinite(progress) ? Math.max(0, progress) : 0;
  const isOver = goalKind === 'limit' && (over ?? p > 1);
  return (
    <Vessel
      value={isOver ? Math.max(p, 1.0001) : goalKind === 'limit' ? Math.min(p, 1) : p}
      max={1}
      color={color}
      width={width}
      height={height}
      rimWidth={2.5}
      future={future}
      hatchFill={hatchFill}
      goalKind={goalKind}
      onReached={onReached}
      animate={animate}
      duration={motion.duration.pourSmall}
      delay={index * motion.duration.stagger}
      memoryKey={memoryKey}
      style={style}
    />
  );
}

/**
 * The vessel turned sideways (diary summary): open on the left with a 2 px
 * base mark, hatched headroom at the right end, the rim tick at the fill's
 * end. The part not filled is `vesselEmpty`. Past `max` an amber lip closes
 * the right end; with `goalKind="reach"` the tick instead becomes the brim
 * tick at the end (taller and 1 px heavier), with one flash in the data
 * colour at the crossing (see `Vessel`).
 *
 *   <Trough value={eaten} max={budget} headroom={exercise} color={colors.calories} />
 */
export function Trough({
  value,
  max,
  color,
  headroom = 0,
  height = 14,
  goalKind = 'limit',
  onReached,
  animate = true,
  duration = motion.duration.pourSmall,
  delay = 0,
  memoryKey,
  style,
  testID,
}: {
  value: number;
  max: number;
  color: string;
  headroom?: number;
  height?: number;
  /** 'limit' (default): amber past `max`. 'reach': a goal to get to, shown full with the brim tick, never amber. */
  goalKind?: GoalKind;
  /** 'reach' only: called once when the level crosses the goal while the trough is on screen (see `Vessel`). */
  onReached?: () => void;
  /** Pour on mount and on change (default true). */
  animate?: boolean;
  duration?: number;
  delay?: number;
  /** Remember the level for the session, so a remount with the same value does not pour again. */
  memoryKey?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const { colors } = useTheme();
  const [w, setW] = useState(0);
  const ratio = fillRatio(value, max);
  const state = goalState(value, max, goalKind);
  const over = state === 'over';
  const reached = state === 'reached';
  const pour = usePour(ratio, { animate, duration, delay, memoryKey });
  const innerW = Math.max(0, w - EDGE);
  const innerH = height - 2 * EDGE;
  const headW = max > 0 ? Math.min(innerW, (Math.max(0, headroom) / max) * innerW) : 0;
  const headOpacity = useFadeAfter(headW > 0, pour.endsIn, pour.instant);
  const lipOpacity = useFadeAfter(over, pour.endsIn, pour.instant);
  const brimOpacity = useFadeAfter(reached, pour.endsIn, pour.instant);
  const flash = useReachFlash(reached, { delay: pour.endsIn, instant: pour.instant, memoryKey, onReached });
  const { level, settle } = pour;
  // The fill is full width and slides in from the open left end; the tick rides on its edge.
  const fillStyle = useAnimatedStyle(() => ({ opacity: level.get() > 0.0005 ? 1 : 0, transform: [{ translateX: -(1 - level.get()) * innerW }] }));
  const tickStyle = useAnimatedStyle(() => ({ opacity: level.get() > 0.0005 ? 1 : 0, transform: [{ translateX: level.get() * innerW + settle.get() }] }));
  const headStyle = useAnimatedStyle(() => ({ opacity: headOpacity.get() }));
  const lipStyle = useAnimatedStyle(() => ({ opacity: lipOpacity.get() }));
  const brimStyle = useAnimatedStyle(() => ({ opacity: brimOpacity.get() }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.get() }));
  return (
    <View
      testID={testID}
      style={[{ height }, style]}
      onLayout={(e) => isLaidOut(e.nativeEvent.layout.width) && setW(Math.round(e.nativeEvent.layout.width))}
      {...DECORATIVE}>
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
          backgroundColor: colors.vesselEmpty,
          borderWidth: EDGE,
          borderLeftWidth: 0,
          borderColor: colors.vesselEdge,
          borderTopRightRadius: height / 2,
          borderBottomRightRadius: height / 2,
          overflow: 'hidden',
        }}>
        {headW > 0 ? (
          <Animated.View style={[{ position: 'absolute', top: 0, bottom: 0, right: 0, width: headW, borderLeftWidth: EDGE, borderStyle: 'dashed', borderColor: colors.vesselEdge }, headStyle]}>
            <Hatch width={headW} height={innerH} color={colors.headroom} step={5} />
          </Animated.View>
        ) : null}
        {/* Drawn only once the width is known, so the first frame never shows a full trough. */}
        {innerW > 0 ? <Animated.View style={[{ position: 'absolute', top: 0, bottom: 0, left: 0, width: innerW, backgroundColor: color }, fillStyle]} /> : null}
      </View>
      <View style={{ position: 'absolute', left: 0, top: -4, bottom: -4, width: 2, backgroundColor: colors.vesselEdge }} />
      {reached && innerW > 0 ? <Animated.View pointerEvents="none" style={[{ position: 'absolute', right: -5, top: -11, bottom: -11, width: 10, borderRadius: 2, backgroundColor: color }, flashStyle]} /> : null}
      {innerW > 0 ? (
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: -5, bottom: -5, left: 0, width: 0 }, tickStyle]}>
          <View style={{ position: 'absolute', left: -1.5, top: 0, bottom: 0, width: 3, borderRadius: 1, backgroundColor: colors.rim }} />
          {/* The brim tick of a reached goal: the same line, taller and 1 px heavier, at the end. */}
          {reached ? <Animated.View style={[{ position: 'absolute', left: -2, top: -3, bottom: -3, width: 4, borderRadius: 1, backgroundColor: colors.rim }, brimStyle]} /> : null}
        </Animated.View>
      ) : null}
      {/* The over cap closes the end within the trough's own height: only the brim tick reaches past its walls. */}
      {over ? <Animated.View style={[{ position: 'absolute', right: -2.5, top: 0, bottom: 0, width: 5, backgroundColor: colors.warning }, lipStyle]} /> : null}
    </View>
  );
}
