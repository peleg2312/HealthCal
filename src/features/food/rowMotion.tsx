import React, { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import Animated, { FadeIn, Keyframe, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { motion, useReducedMotion } from '@/theme';
import { ease } from '@/ui';

const { duration: D, distance: X } = motion;
/** How long a removed row takes to fold its height away once it has faded (D1-05: the space closes, never snaps). */
export const ROW_FOLD_MS = D.enter;

// On the web a row only fades in, with Reanimated's own FadeIn: a custom Keyframe entrance is pinned with
// position: absolute by Reanimated's web tidy-up afterwards and leaves the layout (see `rowEnter` in src/ui/motion.tsx).
// The rows below make room first, then the new row fades into the space.
const rowEnter =
  Platform.OS === 'web'
    ? FadeIn.duration(D.row).delay(D.row / 2).easing(ease.enter)
    : new Keyframe({
        0: { opacity: 0, transform: [{ translateY: -X.row }] },
        100: { opacity: 1, transform: [{ translateY: 0 }], easing: ease.enter },
      })
        .duration(D.row)
        .delay(D.row / 2);

/**
 * Rows of a log (the diary, the water log), removed in two steps: the row fades out where it is, then
 * folds its own height to nothing (clipped while it folds), so the rows below and the card around them
 * close the space together, frame by frame, instead of jumping up in one step (D1-05). Nothing slides
 * over a row that is still fading (the kit's `AnimatedItem` does both at once, which on web draws the
 * next row over the leaving one), and nothing is drawn past the card's edge: the card shrinks with the fold.
 *
 * Returns the current items with the ones just removed still in place, marked `leaving`, for
 * `motion.duration.rowExit` + `ROW_FOLD_MS` ms. Under reduced motion a removed row goes at once.
 * An item that comes back while it fades or folds (Undo) simply stays.
 */
export function useLeavingRows<T extends { id: string }>(items: T[]): { item: T; leaving: boolean }[] {
  const reduce = useReducedMotion();
  // Compared by ids, so a list rebuilt on every render (a slice, a filter) is not a change.
  const key = items.map((i) => i.id).join('|');
  const [prev, setPrev] = useState({ key, items });
  const [leaving, setLeaving] = useState<{ item: T; index: number }[]>([]);
  if (prev.key !== key) {
    setPrev({ key, items });
    const ids = new Set(items.map((i) => i.id));
    const gone = reduce ? [] : prev.items.flatMap((item, index) => (ids.has(item.id) ? [] : [{ item, index }]));
    const still = leaving.filter((l) => !ids.has(l.item.id));
    if (gone.length || still.length !== leaving.length) setLeaving([...still.filter((l) => !gone.some((g) => g.item.id === l.item.id)), ...gone]);
  }
  useEffect(() => {
    if (!leaving.length) return;
    const timer = setTimeout(() => setLeaving([]), D.rowExit + ROW_FOLD_MS);
    return () => clearTimeout(timer);
  }, [leaving]);

  const out = items.map((item) => ({ item, leaving: false }));
  for (const l of [...leaving].sort((a, b) => a.index - b.index)) out.splice(Math.min(l.index, out.length), 0, { item: l.item, leaving: true });
  return out;
}

/**
 * One log row: it fades and slides in when added (not when the list mounts: wrap the list in the kit's
 * `AnimatedList`); while `leaving` it fades out in place and then folds its height to 0 over `ROW_FOLD_MS`,
 * clipped, so what is below it moves up with the fold. The fold is the one height animation in the app,
 * kept to a row that is leaving; reduced motion makes every change instant.
 */
export function FadeRow({ children, leaving, testID }: { children: React.ReactNode; leaving: boolean; testID?: string }) {
  const reduce = useReducedMotion();
  const fade = useSharedValue(1);
  // 1 whole, 0 folded away; the row's height as last laid out while whole.
  const fold = useSharedValue(1);
  const height = useSharedValue(0);
  useEffect(() => {
    if (leaving && !reduce) {
      fade.set(withTiming(0, { duration: D.rowExit, easing: ease.exit }));
      fold.set(withDelay(D.rowExit, withTiming(0, { duration: ROW_FOLD_MS, easing: ease.move })));
    } else {
      fade.set(1);
      fold.set(1);
    }
  }, [leaving, reduce, fade, fold]);
  const style = useAnimatedStyle(() => ({ opacity: fade.get(), transform: [{ scale: 0.98 + 0.02 * fade.get() }] }));
  const folding = useAnimatedStyle(() => {
    const f = fold.get();
    const on = f < 1 && height.get() > 0;
    return { height: on ? height.get() * f : 'auto', overflow: on ? 'hidden' : 'visible' };
  });
  return (
    <Animated.View
      testID={testID}
      pointerEvents={leaving ? 'none' : 'auto'}
      accessibilityElementsHidden={leaving}
      importantForAccessibility={leaving ? 'no-hide-descendants' : 'auto'}
      entering={reduce ? undefined : rowEnter}>
      {/* The fold and the leaving fade on views of their own: on the web the entrance animates the outer view's opacity. */}
      <Animated.View
        style={folding}
        onLayout={(e) => {
          if (!leaving) height.set(e.nativeEvent.layout.height);
        }}>
        <Animated.View style={style}>{children}</Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

/**
 * A row that appears in a log card because of something done on screen (the Restore row after a delete):
 * it unfolds its height from 0 while the leaving row folds (starting after `delay`, the leaving row's fade),
 * fading in, so the card and the cards below move smoothly instead of jumping by the row's height.
 * `animate` false (a row already there when the card mounted) and reduced motion draw it at once.
 */
export function Unfold({ children, animate, delay = D.rowExit }: { children: React.ReactNode; animate: boolean; delay?: number }) {
  const reduce = useReducedMotion();
  const run = animate && !reduce;
  const open = useSharedValue(run ? 0 : 1);
  const height = useSharedValue(0);
  useEffect(() => {
    if (run) open.set(withDelay(delay, withTiming(1, { duration: ROW_FOLD_MS, easing: ease.move })));
    // Run once, on mount: a row that is already open stays open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const style = useAnimatedStyle(() => {
    const v = open.get();
    const on = v < 1;
    return { height: on ? height.get() * v : 'auto', overflow: on ? 'hidden' : 'visible', opacity: v };
  });
  return (
    <Animated.View style={style}>
      <Animated.View onLayout={(e) => height.set(e.nativeEvent.layout.height)}>{children}</Animated.View>
    </Animated.View>
  );
}
