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
import { Platform, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  FadeIn,
  Keyframe,
  LayoutAnimationConfig,
  LinearTransition,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
  cubicBezier,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { useStore } from '@/store';
import { motion, useReducedMotion } from '@/theme';
import { pourLandsAt } from '@/theme/motion';

import { Text, type TextProps } from './Text';
import { reachedBefore } from './vesselLayout';

const { duration: D, distance: X } = motion;

/** Reanimated easing functions built from the theme's bezier tokens. */
export const ease = {
  pour: Easing.bezier(...motion.easing.pour),
  enter: Easing.bezier(...motion.easing.enter),
  exit: Easing.bezier(...motion.easing.exit),
  move: Easing.bezier(...motion.easing.move),
  arrive: Easing.bezier(...motion.easing.arrive),
};

/**
 * An easing curve for a CSS-style animation (`animationTimingFunction`). It must be Reanimated's own
 * `cubicBezier(...)`, never the string "cubic-bezier(...)": a browser takes the string, but on a phone
 * Reanimated accepts only its named curves as strings and throws on anything else, which took down
 * every screen (each one enters through `FadeUp`).
 */
export const cssBezier = (b: readonly number[]) => cubicBezier(b[0], b[1], b[2], b[3]);

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
  /**
   * When the pour lands, in ms from now: for what appears "at the end of the pour" (the brim line and its
   * flash, the amber cap, the hatched headroom): `pourLandsAt` of its length, when the level is within 5% of
   * the cup of where it stops. 0 when there is no pour to wait for (instant, or a remount already at its level).
   */
  endsIn: number;
}

const clock = () => (typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now());

/** Pours waiting for the page to draw at an even pace (`whenEven`), started together. */
const waitingPours = new Set<() => void>();
let watchingFrames = false;

/**
 * Calls `start` once the page draws at an even pace: two frames in a row, each under 40 ms after the one
 * before, or after 600 ms at the latest. A cup that pours as its screen mounts (Today's calorie cup when the
 * app opens) otherwise starts while the screen's first frames are still being built: on the web the pour
 * runs on that same thread, its clock kept running through a 120 ms frame, and its first step drawn was
 * half its height. One watcher serves every waiting cup, so a screen's cups still start together (each
 * keeps its own `delay`, the row's stagger). Returns the cancel.
 */
function whenEven(start: () => void): () => void {
  if (typeof requestAnimationFrame !== 'function') {
    start();
    return () => {};
  }
  waitingPours.add(start);
  if (!watchingFrames) {
    watchingFrames = true;
    const began = clock();
    let last = 0;
    let even = 0;
    const step = () => {
      const t = clock();
      even = last && t - last < 40 ? even + 1 : 0;
      last = t;
      if (even >= 2 || t - began > 600 || waitingPours.size === 0) {
        watchingFrames = false;
        const all = [...waitingPours];
        waitingPours.clear();
        for (const go of all) go();
        return;
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  return () => {
    waitingPours.delete(start);
  };
}

/**
 * Animate a level to `to`: a pour (ease-out) then a settle of the rim. The
 * shared value is driven on the UI thread; read it in `useAnimatedStyle`.
 * A pour that starts as the cup mounts waits for the page to draw at an even
 * pace first (`whenEven`, a frame or two, 600 ms at most).
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
  // The pour this render asks for, from the level the one before asked for: its size decides when it lands.
  const [leg, setLeg] = useState({ from: initial, to: target });
  if (leg.to !== target) setLeg({ from: leg.to, to: target });
  // Whether the effect below has run yet: its first run is the mount.
  const ran = useRef(false);
  useEffect(() => {
    const first = !ran.current;
    ran.current = true;
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
    const go = () => {
      level.set(withDelay(delay, withTiming(target, { duration, easing: ease.pour })));
      if (settle > 0) {
        const dir = target > start ? 1 : -1;
        // The level line arrives a hair late: it rides a little past the level near the end, then rests.
        // A settle still running from the pour before (a quick second glass, the AI cup's loop) is let go
        // first, so the line never rides the wrong way while this pour rises.
        const at = delay + duration * 0.72;
        const letGo = Math.min(D.fade, at);
        rim.set(
          withSequence(
            withTiming(0, { duration: letGo, easing: ease.enter }),
            withDelay(
              at - letGo,
              withSequence(
                withTiming(dir * settle, { duration: D.settle * 0.45, easing: ease.enter }),
                withTiming(0, { duration: D.settle * 0.55, easing: Easing.inOut(Easing.quad) }),
              ),
            ),
          ),
        );
      }
    };
    if (first) return whenEven(go);
    go();
  }, [target, instant, delay, duration, memoryKey, settle, level, rim]);
  return { level, settle: rim, instant, endsIn: instant || resting ? 0 : delay + duration * pourLandsAt(leg.to - leg.from) };
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
 *
 * A new `memoryKey` on a mounted cup means it now shows something else (the
 * week strip moved to another day), so that is a mount, not a crossing: paging
 * from a day short of its goal to a day that met it marks nothing. A cup that
 * can show more than one day therefore needs a `memoryKey` with the day in it.
 */
export function useReachFlash(reached: boolean, { delay = 0, instant = false, memoryKey, onReached }: ReachOptions = {}): SharedValue<number> {
  const flash = useSharedValue(0);
  // What this cup last showed (and for which key), and the latest callback: both touched only inside effects.
  const last = useRef<{ key: string | undefined; reached: boolean } | null>(null);
  const callback = useRef(onReached);
  useEffect(() => {
    callback.current = onReached;
  }, [onReached]);
  useEffect(() => {
    const prev = last.current;
    const was = reachedBefore(prev, memoryKey, memoryKey ? reachedShown.get(memoryKey) : undefined, reached);
    last.current = { key: memoryKey, reached };
    if (memoryKey) reachedShown.set(memoryKey, reached);
    // Short of the goal, or showing something else now: a flash still running belongs to what was shown before.
    if (!reached || (prev && prev.key !== memoryKey)) {
      cancelAnimation(flash);
      flash.set(0);
    }
    if (!reached) return;
    if (was) return;
    callback.current?.();
    // The flash is the kit's small celebration: it obeys Profile > Celebrations as well as reduced motion.
    if (instant || !useStore.getState().settings.celebrations) return;
    flash.set(
      withDelay(
        delay,
        // Within the 600 ms of routine motion (`motion.reachFlash`).
        withSequence(
          withTiming(1, { duration: motion.reachFlash.rise, easing: ease.enter }),
          withDelay(motion.reachFlash.hold, withTiming(0, { duration: motion.reachFlash.fall, easing: ease.exit })),
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

/**
 * A row added to a list: on a phone it fades in as it slides `motion.distance.row` px down into place.
 *
 * On the web it only fades, with Reanimated's own `FadeIn`, never a custom `Keyframe`. After a custom
 * entering keyframe has run, Reanimated's web code tidies it up about five times its length later
 * (`scheduleAnimationCleanup` in react-native-reanimated's layoutReanimation/web), and that tidy-up pins
 * the row with `position: absolute` at the box it measured (`setElementPosition`). The row then leaves the
 * layout: what holds it closes up, the rows after it are drawn over it, and the coach's question ended
 * under its own answer card. Its predefined animations are never tidied that way. Phones run layout
 * animations natively and keep the keyframe.
 */
const rowEnter =
  Platform.OS === 'web'
    ? FadeIn.duration(D.row).easing(ease.enter)
    : new Keyframe({
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
      {/* A list for assistive technology on the web (WCAG 1.3.1), its rows `listitem`s (`AnimatedItem`, the food
          screens' `FadeRow`); `display: contents` draws no box, so the rows lie in the parent's layout as before.
          An empty list (a meal with nothing logged) carries no list role, so no list of 0 items is announced. */}
      {Platform.OS === 'web' ? (
        <View role={hasRows(children) ? 'list' : undefined} style={LIST_CONTENTS}>
          {children}
        </View>
      ) : (
        children
      )}
    </LayoutAnimationConfig>
  );
}

const LIST_CONTENTS = { display: 'contents' } as unknown as ViewStyle;

/** Whether a list has a row to show (null, false and empty arrays draw nothing). */
function hasRows(children: React.ReactNode): boolean {
  return React.Children.toArray(children).length > 0;
}

/**
 * One row of an animated list: it fades and slides in when added (on the web
 * it only fades, see `rowEnter`), fades out when removed, and moves smoothly
 * when rows around it change (Reanimated layout animations: native UI thread,
 * CSS on web). Never give a row a custom `Keyframe` as `entering` on the web
 * (`scripts/dev/e2e.cjs`, "lists with motion on"). Give it the row's stable
 * key. A `listitem` on the web, inside the list `AnimatedList` draws. Instant under reduced motion. A removed row stays in the tree for
 * ~120 ms while it fades, so tests that count rows should read the store.
 */
export function AnimatedItem({ children, style, testID }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; testID?: string }) {
  const reduce = useReducedMotion();
  return (
    <Animated.View
      testID={testID}
      // A row of the kit's `AnimatedList`: `listitem` on the web.
      {...(Platform.OS === 'web' ? { role: 'listitem' as const } : null)}
      style={style}
      entering={reduce ? undefined : rowEnter}
      exiting={reduce ? undefined : rowExit}
      layout={reduce ? undefined : rowLayout}>
      {children}
    </Animated.View>
  );
}
