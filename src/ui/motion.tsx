/**
 * The motion kit: pour, settle, tick, plus the quiet support pieces (a
 * screen's fade-up, rows that enter, leave and reorder, a left-to-right draw).
 * Tokens and `useReducedMotion` live in `@/theme/motion`; this file holds the
 * Reanimated parts. Every piece is instant when reduced motion is on.
 *
 * Rules every piece follows:
 * - Motion never delays an action: values change at once, the drawing catches up.
 * - Only transforms and opacity animate, on the UI thread where the platform has one.
 * - Nothing loops, bounces or glows.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  Keyframe,
  LayoutAnimationConfig,
  LinearTransition,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { useStore } from '@/store';
import { motion, useReducedMotion } from '@/theme';

import { Text, type TextProps } from './Text';

const { duration: D, distance: X } = motion;

/** Reanimated easing functions built from the theme's bezier tokens. */
export const ease = {
  pour: Easing.bezier(...motion.easing.pour),
  enter: Easing.bezier(...motion.easing.enter),
  exit: Easing.bezier(...motion.easing.exit),
  move: Easing.bezier(...motion.easing.move),
};

const cssBezier = (b: readonly number[]) => `cubic-bezier(${b.join(', ')})`;

// ------------------------------------------------------------------- pour

/**
 * The last level each `memoryKey` showed in this session. A cup that mounts
 * again (a screen revisited, a week strip paged back) starts where it was, so
 * an unchanged level does not pour again.
 */
const shown = new Map<string, number>();

export interface PourOptions {
  /** Pour length in ms. Default `motion.duration.pour`; small cups and bars use `pourSmall`. */
  duration?: number;
  /** Wait before pouring (a row's stagger). */
  delay?: number;
  /** Remember the level across mounts in this session, so a revisit does not re-pour an unchanged level. */
  memoryKey?: string;
  /** False: jump to the value (the old `animate={false}`). */
  animate?: boolean;
  /** Where a level with no memory starts on mount: 0 (pour in, the default) or the value itself (no mount pour). */
  from?: 'zero' | 'value';
  /** Overshoot of the settle in px. Default `motion.distance.settle`; 0 turns it off. */
  settle?: number;
}

export interface Pour {
  /** The animated level, in the units passed (0..1 for the kit's cups and bars). */
  level: SharedValue<number>;
  /** Extra px the rim sits past the level while it settles (positive = beyond, in the direction of the pour). */
  settle: SharedValue<number>;
  /** True when this pour is instant (reduced motion or animate=false). */
  instant: boolean;
  /** When the pour ends, in ms from now: for things that appear "at the end of the pour". 0 when there is no pour to wait for (instant, or a remount already at its level). */
  endsIn: number;
}

/**
 * Animate a level to `to`: a pour (ease-out) then a settle of the rim. The
 * shared value is driven on the UI thread; read it in `useAnimatedStyle`.
 *
 *   const p = usePour(ratio, { duration: motion.duration.pourSmall, delay: index * motion.duration.stagger });
 *   const style = useAnimatedStyle(() => ({ transform: [{ translateY: (1 - p.level.get()) * h }] }));
 */
export function usePour(to: number, { duration = D.pour, delay = 0, memoryKey, animate = true, from = 'zero', settle = X.settle }: PourOptions = {}): Pour {
  const reduce = useReducedMotion();
  const instant = reduce || !animate;
  const target = Number.isFinite(to) ? to : 0;
  const [initial] = useState(() => {
    if (instant) return target;
    if (memoryKey && shown.has(memoryKey)) return shown.get(memoryKey)!;
    return from === 'value' ? target : 0;
  });
  // A cup that mounts already at its level (remembered by `memoryKey`) has no pour to wait for.
  const [mounted] = useState(() => ({ target, atRest: Math.abs(initial - target) < 1e-6 }));
  const resting = mounted.atRest && mounted.target === target;
  const level = useSharedValue(initial);
  const rim = useSharedValue(0);
  useEffect(() => {
    if (memoryKey) shown.set(memoryKey, target);
    if (instant) {
      cancelAnimation(level);
      cancelAnimation(rim);
      level.set(target);
      rim.set(0);
      return;
    }
    const start = level.get();
    if (Math.abs(start - target) < 1e-6) return;
    level.set(withDelay(delay, withTiming(target, { duration, easing: ease.pour })));
    if (settle > 0) {
      const dir = target > start ? 1 : -1;
      // The level line arrives a hair late: it rides a little past the level near the end, then rests.
      rim.set(
        withDelay(
          delay + duration * 0.72,
          withSequence(
            withTiming(dir * settle, { duration: D.settle * 0.45, easing: ease.enter }),
            withTiming(0, { duration: D.settle * 0.55, easing: Easing.inOut(Easing.quad) }),
          ),
        ),
      );
    }
  }, [target, instant, delay, duration, memoryKey, settle, level, rim]);
  return { level, settle: rim, instant, endsIn: instant || resting ? 0 : delay + duration };
}

/**
 * Opacity that follows `show`: fades in after `delay` ms (the end of a pour)
 * and out at once. Instant under reduced motion.
 */
export function useFadeAfter(show: boolean, delay: number, instant: boolean): SharedValue<number> {
  const o = useSharedValue(show ? (instant ? 1 : 0) : 0);
  useEffect(() => {
    if (instant) {
      cancelAnimation(o);
      o.set(show ? 1 : 0);
      return;
    }
    o.set(show ? withDelay(delay, withTiming(1, { duration: D.fade, easing: ease.enter })) : withTiming(0, { duration: D.fade / 2 }));
  }, [show, delay, instant, o]);
  return o;
}

// ---------------------------------------------------------------- reach

/**
 * Whether each `memoryKey`'s goal was last shown as reached in this session,
 * so a cup that mounts again already full does not mark the moment twice.
 */
const reachedShown = new Map<string, boolean>();

export interface ReachOptions {
  /** When the flash starts, in ms from the crossing: the end of the pour (`pour.endsIn`). */
  delay?: number;
  /** True under reduced motion or `animate={false}`: no flash, the reached state just shows. */
  instant?: boolean;
  /** The same key the cup's pour uses. With it, a remount remembers that the goal was already reached. */
  memoryKey?: string;
  /** Called once at the crossing, in the same tick as the change, also under reduced motion. */
  onReached?: () => void;
}

/**
 * The moment a goal that is meant to be reached (water, minutes, protein) is
 * reached. Returns a 0..1 opacity for one flash of the rim in the data colour:
 * it rises as the pour lands on the brim, holds for a settle and fades. It runs
 * once per crossing and never loops.
 *
 * What counts as a crossing: `reached` turning true while the cup is mounted,
 * or a cup that mounts reached when its `memoryKey` last showed it short of
 * the goal. A cup that first mounts already full, or mounts again with the
 * same `memoryKey` still full, does nothing. Dropping below the goal and
 * reaching it again is a new crossing. With Celebrations off in Profile the
 * flash is skipped; the reached state and `onReached` are not.
 */
export function useReachFlash(reached: boolean, { delay = 0, instant = false, memoryKey, onReached }: ReachOptions = {}): SharedValue<number> {
  const flash = useSharedValue(0);
  // What this cup last showed, and the latest callback: both touched only inside effects.
  const last = useRef<boolean | null>(null);
  const callback = useRef(onReached);
  useEffect(() => {
    callback.current = onReached;
  }, [onReached]);
  useEffect(() => {
    const was = last.current ?? (memoryKey && reachedShown.has(memoryKey) ? reachedShown.get(memoryKey)! : reached);
    last.current = reached;
    if (memoryKey) reachedShown.set(memoryKey, reached);
    if (!reached) {
      cancelAnimation(flash);
      flash.set(0);
      return;
    }
    if (was) return;
    callback.current?.();
    // The flash is the kit's small celebration: it obeys Profile > Celebrations as well as reduced motion.
    if (instant || !useStore.getState().settings.celebrations) return;
    flash.set(
      withDelay(
        delay,
        withSequence(
          withTiming(1, { duration: D.fade, easing: ease.enter }),
          withDelay(D.settle, withTiming(0, { duration: D.pourSmall, easing: ease.exit })),
        ),
      ),
    );
  }, [reached, delay, instant, memoryKey, flash]);
  return flash;
}

// ------------------------------------------------------------------- tick

export interface AnimatedNumberProps extends Omit<TextProps, 'children'> {
  /** The number to show. It ticks from the previous value to this one. */
  value: number;
  /** Formats the shown number. Default: rounded to `decimals`, with thousands separators. */
  format?: (n: number) => string;
  /** Decimal places while ticking and in the default format. Default 0. */
  decimals?: number;
  /** Tick length in ms; match the pour it goes with. Default `motion.duration.pour`. */
  duration?: number;
  delay?: number;
  /** Start value on mount, to count up (the plan reveal). By default the first value shows at once. */
  from?: number;
  /** Remember the last value across mounts in this session (a revisit does not tick again). */
  memoryKey?: string;
  /** Rendered after the number inside the same Text, e.g. `<Text variant="unit"> kcal</Text>`. */
  children?: React.ReactNode;
}

const defaultFormat = (decimals: number) => (n: number) =>
  n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

/**
 * A Text whose number ticks to each new value, in step with a pour. Same
 * variants, colours and props as `Text`; digits are tabular so nothing jitters.
 * Screen readers get the final value, never a number mid-tick.
 *
 *   <AnimatedNumber variant="numXL" value={left} testID="today-remaining"><Text variant="unit"> kcal</Text></AnimatedNumber>
 */
export function AnimatedNumber({ value, format, decimals = 0, duration = D.pour, delay = 0, from, memoryKey, children, accessibilityLabel, ...rest }: AnimatedNumberProps) {
  const target = Number.isFinite(value) ? value : 0;
  const reduce = useReducedMotion();
  const step = 10 ** -decimals;
  const [initial] = useState(() => {
    if (reduce) return target;
    if (memoryKey && shown.has(`n:${memoryKey}`)) return shown.get(`n:${memoryKey}`)!;
    return from ?? target;
  });
  const [current, setCurrent] = useState(initial);
  const v = useSharedValue(initial);
  useAnimatedReaction(
    () => Math.round(v.get() / step) * step,
    (now, prev) => {
      if (now !== prev) scheduleOnRN(setCurrent, now);
    },
  );
  useEffect(() => {
    if (memoryKey) shown.set(`n:${memoryKey}`, target);
    if (reduce) {
      cancelAnimation(v);
      v.set(target);
      return;
    }
    v.set(withDelay(delay, withTiming(target, { duration, easing: ease.pour })));
  }, [target, reduce, delay, duration, memoryKey, v]);
  const fmt = format ?? defaultFormat(decimals);
  // Mid-tick the shown number may differ from `value`; once the tick ends they agree.
  const text = fmt(reduce ? target : current);
  const label = accessibilityLabel ?? (children === undefined || typeof children === 'string' ? `${fmt(target)}${children ?? ''}` : undefined);
  return (
    <Text tabular {...rest} accessibilityLabel={label}>
      {text}
      {children}
    </Text>
  );
}

// -------------------------------------------------------------- fade up

/**
 * Content that fades up `motion.distance.enter` px over `motion.duration.enter`
 * ms when it mounts. `Screen` already does this for a whole screen; use it for
 * a moment inside one (tiles on Progress fading up in order: pass `index`).
 * Runs as a CSS animation on web and on the UI thread natively, so it keeps
 * going while the JS thread is busy mounting the rest of the screen.
 */
export function FadeUp({
  children,
  index = 0,
  delay = 0,
  distance = X.enter,
  duration = D.enter,
  disabled,
  style,
  testID,
  pointerEvents,
}: {
  children?: React.ReactNode;
  /** Position in a sequence: adds `index * 40` ms of delay. */
  index?: number;
  delay?: number;
  distance?: number;
  duration?: number;
  /** Turn the entrance off (render a plain View). */
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  pointerEvents?: 'box-none' | 'none' | 'box-only' | 'auto';
}) {
  const reduce = useReducedMotion();
  // Decided once, at mount: a later change must not replay or cut the entrance.
  const [animate] = useState(() => !reduce && !disabled);
  if (!animate) {
    return (
      <View style={style} testID={testID} pointerEvents={pointerEvents}>
        {children}
      </View>
    );
  }
  return (
    <Animated.View
      testID={testID}
      pointerEvents={pointerEvents}
      style={[
        style,
        {
          animationName: { from: { opacity: 0, transform: [{ translateY: distance }] }, to: { opacity: 1, transform: [{ translateY: 0 }] } },
          animationDuration: duration,
          animationDelay: delay + index * D.stagger,
          animationTimingFunction: cssBezier(motion.easing.enter),
          animationFillMode: 'backwards',
        },
      ]}>
      {children}
    </Animated.View>
  );
}

// ---------------------------------------------------------------- draw

/**
 * Reveals its content from left to right once, on mount (a line chart
 * drawing). The content does not move: a clipping window slides open over it,
 * using two opposite transforms, so only transforms animate.
 */
export function DrawReveal({ width, height, children, duration = D.draw, delay = 0 }: { width: number; height: number; children: React.ReactNode; duration?: number; delay?: number }) {
  const reduce = useReducedMotion();
  const [animate] = useState(() => !reduce);
  const p = useSharedValue(animate ? 0 : 1);
  useEffect(() => {
    if (!animate) return;
    p.set(withDelay(delay, withTiming(1, { duration, easing: ease.pour })));
  }, [animate, delay, duration, p]);
  useEffect(() => {
    if (reduce) {
      cancelAnimation(p);
      p.set(1);
    }
  }, [reduce, p]);
  const outer = useAnimatedStyle(() => ({ transform: [{ translateX: -(1 - p.get()) * width }] }));
  const inner = useAnimatedStyle(() => ({ transform: [{ translateX: (1 - p.get()) * width }] }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: 0, width, height, overflow: 'hidden' }, outer]}>
      <Animated.View style={[{ width, height }, inner]}>{children}</Animated.View>
    </Animated.View>
  );
}

// ---------------------------------------------------------------- lists

const rowEnter = new Keyframe({
  0: { opacity: 0, transform: [{ translateY: -X.row }] },
  100: { opacity: 1, transform: [{ translateY: 0 }], easing: ease.enter },
}).duration(D.row);
const rowExit = new Keyframe({
  0: { opacity: 1, transform: [{ scale: 1 }] },
  100: { opacity: 0, transform: [{ scale: 0.98 }], easing: ease.exit },
}).duration(D.rowExit);
const rowLayout = LinearTransition.duration(D.row).easing(ease.move);

/**
 * Wrap a list (the rows of a meal, the water log, the workout history) so the
 * rows already there when it mounts do not animate in; only rows added later
 * do. Key it by the day shown so switching days does not animate every row.
 *
 *   <AnimatedList key={date}>{entries.map((e) => <AnimatedItem key={e.id}>...</AnimatedItem>)}</AnimatedList>
 */
export function AnimatedList({ children, animateFirst = false }: { children: React.ReactNode; /** Animate the rows present at mount too. */ animateFirst?: boolean }) {
  return (
    <LayoutAnimationConfig skipEntering={!animateFirst} skipExiting>
      {children}
    </LayoutAnimationConfig>
  );
}

/**
 * One row of an animated list: it fades and slides in when added, fades out
 * when removed, and moves smoothly when rows around it change (Reanimated
 * layout animations: native UI thread, CSS on web). Give it the row's stable
 * key. Instant under reduced motion. A removed row stays in the tree for
 * ~120 ms while it fades, so tests that count rows should read the store.
 */
export function AnimatedItem({ children, style, testID }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; testID?: string }) {
  const reduce = useReducedMotion();
  return (
    <Animated.View
      testID={testID}
      style={style}
      entering={reduce ? undefined : rowEnter}
      exiting={reduce ? undefined : rowExit}
      layout={reduce ? undefined : rowLayout}>
      {children}
    </Animated.View>
  );
}
