import React, { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import Animated, { FadeIn, Keyframe, LinearTransition, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { motion, useReducedMotion } from '@/theme';
import { ease } from '@/ui';

const { duration: D, distance: X } = motion;

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
const move = LinearTransition.duration(D.row).easing(ease.move);

/**
 * Rows of a log (the diary, the water log), removed in two steps: the row fades out where it is, and
 * only then leaves the list, so the rows below glide up into an empty space
 * instead of sliding over a row that is still fading (the kit's `AnimatedItem`
 * does both at once, which on web draws the next row over the leaving one).
 *
 * Returns the current items with the ones just removed still in place, marked
 * `leaving`, for `motion.duration.rowExit` ms. Under reduced motion a removed
 * row goes at once. An item that comes back while it fades (Undo) simply stays.
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
    const timer = setTimeout(() => setLeaving([]), D.rowExit);
    return () => clearTimeout(timer);
  }, [leaving]);

  const out = items.map((item) => ({ item, leaving: false }));
  for (const l of [...leaving].sort((a, b) => a.index - b.index)) out.splice(Math.min(l.index, out.length), 0, { item: l.item, leaving: true });
  return out;
}

/**
 * One log row: it fades and slides in when added (not when the list
 * mounts: wrap the list in the kit's `AnimatedList`), fades out in place while
 * `leaving`, and glides when rows around it come or go. Only opacity and
 * transforms animate; reduced motion makes every change instant.
 */
export function FadeRow({ children, leaving, testID }: { children: React.ReactNode; leaving: boolean; testID?: string }) {
  const reduce = useReducedMotion();
  const fade = useSharedValue(1);
  useEffect(() => {
    fade.set(leaving && !reduce ? withTiming(0, { duration: D.rowExit, easing: ease.exit }) : 1);
  }, [leaving, reduce, fade]);
  const style = useAnimatedStyle(() => ({ opacity: fade.get(), transform: [{ scale: 0.98 + 0.02 * fade.get() }] }));
  return (
    <Animated.View
      testID={testID}
      pointerEvents={leaving ? 'none' : 'auto'}
      accessibilityElementsHidden={leaving}
      importantForAccessibility={leaving ? 'no-hide-descendants' : 'auto'}
      entering={reduce ? undefined : rowEnter}
      layout={reduce ? undefined : move}>
      {/* The leaving fade on a view of its own: on the web the entrance animates the outer view's opacity. */}
      <Animated.View style={style}>{children}</Animated.View>
    </Animated.View>
  );
}
