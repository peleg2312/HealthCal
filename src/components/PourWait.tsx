import React, { useEffect, useState } from 'react';
import { Animated, Easing, Platform, View, type StyleProp, type ViewStyle } from 'react-native';

import { aiMarkFill } from '@/features/ai/mark';
import { lastWordsTogether } from '@/features/auth/lines';
import { motion, useReducedMotion, useTheme, vesselBase } from '@/theme';
import { Text } from '@/ui';

/**
 * The app's waiting cup, for every wait that is NOT the AI (signing in, a link being checked, a
 * payment arriving, a page loading): a plain open tumbler whose level rises, holds and lets go, in
 * a loop. The cup with the drop (`AiMark`) means "the AI is working"; the two are never swapped.
 *
 * It is always placed with a sentence that says what is happening, so the cup itself is decorative
 * unless a `label` is given (then it is the progress bar a screen reader meets).
 *
 * The fill is the app's own cup tint (`aiMarkFill`: a tint of the primary colour chosen per look so
 * the level line shows on it; the plain primary would swallow the line in Blossom and Butter, where
 * the two are one colour). What tells this cup from the AI's is the drop, which this one never has.
 *
 * - `tile`: 40 x 52, alone in the middle of a waiting screen.
 * - `inline`: 16 x 20, at the start of a line of text.
 *
 * One turn of the loop is 910 ms: the level rises from 15% to 75% over `duration.draw` (600 ms,
 * the pour's ease-out), rests for `duration.settle` (150 ms), fades over `duration.fade` (160 ms)
 * and starts again (`TURN_MS` adds the three tokens, so the turn follows them). Only a transform and an opacity move. It moves for 5 s
 * at most (WCAG 2.2.2, `STILL_TURNS`): five turns, then one pour to half full, where it holds still for the rest of
 * the wait while the sentence beside it keeps saying what is happening. Under reduced motion (the app's one
 * switch, `useReducedMotion`) nothing loops: the cup is half full and still from the start.
 */
export function PourWait({
  size = 'tile',
  label,
  testID,
  style,
}: {
  size?: 'tile' | 'inline';
  /** What is being waited for, for a screen reader. Leave it out when the sentence beside the cup says it. */
  label?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, chartFill } = useTheme();
  const reduce = useReducedMotion();
  const dims = SIZES[size];
  const fill = aiMarkFill(colors, chartFill).color;
  const inner = dims.height - dims.edge;
  // One clock for the whole turn, 0 to 1, so the level and the fade can never drift apart and a new
  // turn starts both from their beginnings. An Animated value lives in state, not a ref: it is read while rendering.
  const [turn] = useState(() => new Animated.Value(0));
  // After the last turn: the one pour from the low level to half full, 0 to 1, and true once the turns are over.
  const [settle] = useState(() => new Animated.Value(0));
  const [still, setStill] = useState(false);

  useEffect(() => {
    if (reduce) return;
    const native = Platform.OS !== 'web';
    const loop = Animated.loop(Animated.timing(turn, { toValue: 1, duration: TURN_MS, easing: Easing.linear, useNativeDriver: native }), { iterations: STILL_TURNS });
    let last: Animated.CompositeAnimation | null = null;
    loop.start(({ finished }) => {
      if (!finished) return;
      setStill(true);
      last = Animated.timing(settle, { toValue: 1, duration: motion.duration.pourSmall, easing: Easing.bezier(...motion.easing.pour), useNativeDriver: native });
      last.start();
    });
    return () => {
      loop.stop();
      last?.stop();
      turn.setValue(0);
    };
  }, [reduce, turn, settle]);

  // The fill is as tall as the cup and slides up inside its clipped box.
  const translateY = reduce
    ? (1 - REST) * inner
    : still
      ? settle.interpolate({ inputRange: [0, 1], outputRange: [(1 - LOW) * inner, (1 - REST) * inner] })
      : turn.interpolate({ inputRange: RISE.at, outputRange: RISE.level.map((l) => (1 - l) * inner) });
  const opacity = reduce || still ? 1 : turn.interpolate({ inputRange: [0, FADE_FROM, 1], outputRange: [1, 1, 0] });

  return (
    <View
      testID={testID}
      style={[{ width: dims.width, height: dims.height }, style]}
      {...(label
        ? { accessible: true, accessibilityRole: 'progressbar' as const, accessibilityLabel: label, accessibilityState: { busy: true } }
        : { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const })}>
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
          borderWidth: dims.edge,
          borderTopWidth: 0,
          borderColor: colors.vesselEdge,
          borderBottomLeftRadius: dims.base,
          borderBottomRightRadius: dims.base,
          backgroundColor: colors.vesselEmpty,
          overflow: 'hidden',
        }}>
        <Animated.View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: inner, opacity, transform: [{ translateY }] }}>
          <View style={{ flex: 1, backgroundColor: fill }} />
          <View style={{ position: 'absolute', left: 0, right: 0, top: -dims.rim / 2, height: dims.rim, backgroundColor: colors.rim }} />
        </Animated.View>
      </View>
    </View>
  );
}

/**
 * The one pattern of a waiting screen (signing in with Google, a reset link being checked, the first
 * sync after a sign-in): the waiting cup, a strong line that says what is happening and a secondary
 * line under it. The two lines are one live region, so a screen reader hears them once and the cup
 * stays decorative; the secondary line keeps its last two words together, so it never ends on one
 * word alone at any width.
 */
export function WaitLines({ title, body, cupTestID }: { title: string; body: string; cupTestID?: string }) {
  const { spacing } = useTheme();
  return (
    <View style={{ alignItems: 'center', gap: spacing.lg }}>
      <PourWait testID={cupTestID} />
      <View style={{ gap: spacing.xs }} accessibilityLiveRegion="polite">
        <Text variant="bodyStrong" align="center">
          {title}
        </Text>
        <Text variant="body" color="textSecondary" align="center">
          {lastWordsTogether(body)}
        </Text>
      </View>
    </View>
  );
}

/** The level the loop starts from, the level it pours to, and where the cup rests under reduced motion. */
const LOW = 0.15;
const HIGH = 0.75;
const REST = 0.5;

/** One turn: the rise (`draw`), the rest (`settle`), the fade (`fade`). */
const TURN_MS = motion.duration.draw + motion.duration.settle + motion.duration.fade;
/** The turns that, with the last pour to half full, end within 5 s (WCAG 2.2.2): 4,550 ms, then 360 ms. */
const STILL_TURNS = Math.floor((5000 - motion.duration.pourSmall) / TURN_MS);
const FADE_FROM = (motion.duration.draw + motion.duration.settle) / TURN_MS;

/**
 * The rise as points on the turn's clock: the pour's ease-out (fast start, long gentle arrival),
 * sampled, so one linear clock can carry it. After the rise the level holds to the end of the turn.
 */
const RISE = (() => {
  const pour = Easing.bezier(...motion.easing.pour);
  const steps = [0, 0.08, 0.16, 0.26, 0.38, 0.52, 0.7, 1];
  const share = motion.duration.draw / TURN_MS;
  return { at: [...steps.map((x) => x * share), 1], level: [...steps.map((x) => LOW + (HIGH - LOW) * pour(x)), HIGH] };
})();

const SIZES = {
  tile: { width: 40, height: 52, edge: 1.5, rim: 2.5, base: vesselBase(52, 40) },
  inline: { width: 16, height: 20, edge: 1, rim: 1.5, base: vesselBase(20, 16) },
} as const;
