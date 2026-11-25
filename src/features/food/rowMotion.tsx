import React, { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import Animated, { FadeIn, Keyframe, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { motion, useReducedMotion } from '@/theme';
import { ease } from '@/ui';

import { cameBack, withReturning, type LogLists } from './rowMotionRules';

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
 * An item that comes back while it fades or folds (Undo) stays, and its `FadeRow` opens back from where it was.
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
 * A log card's way back after a delete, both ways in step (the owner's ruling, D1-05): `live` the ids of the
 * list's live rows now, `removed` its Restore rows now (the items removed on this visit, not yet restored).
 * Returns `back`, the ids of rows that just came back (an Undo or a Restore), whose `FadeRow` unfolds its
 * height and then fades in (the reverse of the fold), and `restores`, the Restore rows to draw: the removed
 * items, plus each one that just came back, `leaving`, while its `Unfold` folds out over the same
 * `ROW_FOLD_MS` as the row opens, so the rows and the cards below move together and nothing snaps.
 * Both are kept for the unfold's length, then dropped, so a later draw (another day) is at once. Under reduced
 * motion nothing comes back animated: the row is drawn at once and its Restore row goes at once.
 */
export function useComeBack<T extends { id: string }>(live: readonly string[], removed: readonly T[]): { back: ReadonlySet<string>; restores: { item: T; leaving: boolean }[] } {
  const reduce = useReducedMotion();
  // Compared by ids, so a list rebuilt on every render (a slice, a filter) is not a change.
  const key = `${live.join('|')}#${removed.map((r) => r.id).join('|')}`;
  const [prev, setPrev] = useState<{ key: string; lists: LogLists<T> }>({ key, lists: { live, removed } });
  const [returning, setReturning] = useState<{ item: T; index: number }[]>([]);
  if (prev.key !== key) {
    setPrev({ key, lists: { live, removed } });
    const came = reduce ? [] : cameBack(prev.lists, { live, removed });
    if (came.length) setReturning([...returning.filter((r) => !came.some((c) => c.item.id === r.item.id)), ...came]);
  }
  useEffect(() => {
    if (!returning.length) return;
    const timer = setTimeout(() => setReturning([]), ROW_FOLD_MS + D.rowExit);
    return () => clearTimeout(timer);
  }, [returning]);
  return { back: new Set(returning.map((r) => r.item.id)), restores: withReturning(removed, returning) };
}

/**
 * One log row: it fades and slides in when added (not when the list mounts: wrap the list in the kit's
 * `AnimatedList`); while `leaving` it fades out in place and then folds its height to 0 over `ROW_FOLD_MS`,
 * clipped, so what is below it moves up with the fold. A row that comes back (`back` as it mounts, from
 * `useComeBack`, or `leaving` turned off before its fold ended) does the reverse: its height unfolds from
 * where it is over `ROW_FOLD_MS`, clipped, and then it fades in, so the rows below move down with it. The
 * fold is the one height animation in the app, kept to a row that is leaving or coming back; reduced motion
 * makes every change instant.
 */
export function FadeRow({ children, leaving, back = false, testID }: { children: React.ReactNode; leaving: boolean; back?: boolean; testID?: string }) {
  const reduce = useReducedMotion();
  // Read once, as the row mounts: a row that came back opens from nothing.
  const [opening] = useState(() => back && !reduce);
  const fade = useSharedValue(opening ? 0 : 1);
  // 1 whole, 0 folded away; the row's own height (its content's, measured whole).
  const fold = useSharedValue(opening ? 0 : 1);
  const height = useSharedValue(0);
  const wasLeaving = useRef(false);
  useEffect(() => {
    if (reduce) {
      fade.set(1);
      fold.set(1);
      return;
    }
    if (leaving) {
      wasLeaving.current = true;
      fade.set(withTiming(0, { duration: D.rowExit, easing: ease.exit }));
      fold.set(withDelay(D.rowExit, withTiming(0, { duration: ROW_FOLD_MS, easing: ease.move })));
    } else if (wasLeaving.current || opening) {
      // The reverse of the fold: the space opens first, from wherever the fold had reached, then the row fades in.
      wasLeaving.current = false;
      fold.set(withTiming(1, { duration: ROW_FOLD_MS, easing: ease.move }));
      fade.set(withDelay(ROW_FOLD_MS, withTiming(1, { duration: D.rowExit, easing: ease.enter })));
    }
  }, [leaving, reduce, opening, fade, fold]);
  const style = useAnimatedStyle(() => ({ opacity: fade.get(), transform: [{ scale: 0.98 + 0.02 * fade.get() }] }));
  const folding = useAnimatedStyle(() => {
    const f = fold.get();
    const on = f < 1;
    return { height: on ? height.get() * f : 'auto', overflow: on ? 'hidden' : 'visible' };
  });
  return (
    <Animated.View
      testID={testID}
      // A row of a list (the diary's meal rows, Water's log): `listitem` on the web, inside the kit's `AnimatedList`.
      {...(Platform.OS === 'web' ? { role: 'listitem' as const } : null)}
      pointerEvents={leaving ? 'none' : 'auto'}
      accessibilityElementsHidden={leaving}
      importantForAccessibility={leaving ? 'no-hide-descendants' : 'auto'}
      // A row that came back opens by its own unfold, not the entrance.
      entering={reduce || opening ? undefined : rowEnter}>
      {/* The fold and the fades on views of their own: on the web the entrance animates the outer view's opacity.
          The height is the content's own, measured on the inner view, which keeps it while the outer one clips. */}
      <Animated.View style={folding}>
        <Animated.View style={style} onLayout={(e) => height.set(e.nativeEvent.layout.height)}>
          {children}
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}

/**
 * A row that appears in a log card because of something done on screen (the Restore row after a delete):
 * it unfolds its height from 0 while the leaving row folds (starting after `delay`, the leaving row's fade),
 * fading in, so the card and the cards below move smoothly instead of jumping by the row's height.
 * `animate` false (a row already there when the card mounted) and reduced motion draw it at once.
 * `open` false folds it out again, at once and over the same `ROW_FOLD_MS` (its row came back, `useComeBack`:
 * in step with that row's unfold); under reduced motion it is gone at once.
 */
export function Unfold({ children, animate, delay = D.rowExit, open = true }: { children: React.ReactNode; animate: boolean; delay?: number; open?: boolean }) {
  const reduce = useReducedMotion();
  const run = animate && !reduce;
  const v = useSharedValue(run && open ? 0 : 1);
  const height = useSharedValue(0);
  const lastOpen = useRef(open);
  useEffect(() => {
    if (run && open) v.set(withDelay(delay, withTiming(1, { duration: ROW_FOLD_MS, easing: ease.move })));
    // Run once, on mount: a row that is already open stays open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    // The mount's own run is above; from then on a change of `open` folds the row out or back in.
    if (lastOpen.current === open) return;
    lastOpen.current = open;
    v.set(reduce ? (open ? 1 : 0) : withTiming(open ? 1 : 0, { duration: ROW_FOLD_MS, easing: ease.move }));
  }, [open, reduce, v]);
  const style = useAnimatedStyle(() => {
    const k = v.get();
    const on = k < 1;
    return { height: on ? height.get() * k : 'auto', overflow: on ? 'hidden' : 'visible', opacity: k };
  });
  return (
    <Animated.View style={style} pointerEvents={open ? 'auto' : 'none'} accessibilityElementsHidden={!open} importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}>
      <Animated.View onLayout={(e) => height.set(e.nativeEvent.layout.height)}>{children}</Animated.View>
    </Animated.View>
  );
}
