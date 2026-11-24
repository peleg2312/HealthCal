import { Image } from 'expo-image';
import React, { useEffect, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

import { cup, useTheme } from '@/theme';
import { Card, CupKey, ease, FadeUp, Text, useReducedMotion } from '@/ui';

import { AiMark, aiMarkHeadroom } from './mark';
import { analysingLabel, analysingNote, analysingSteps, slowAfterMs } from './words';

/**
 * The wait for an estimate, honest about what is happening (principle 2): no percentage, no bar that
 * fills to a share, no step that ticks on a timer.
 *
 * - The photo stays on screen and "fills up": a level line rises over it from the bottom, the part
 *   above the line veiled, the part under it clear, and starts again (`PourVeil`). In text mode the
 *   words stay on screen instead.
 * - Three steps that are true (./words.ts): the input is ready (done: the phone knows it; a small
 *   filled ink cup, never a check, which in this app means only a day on budget), the AI is estimating
 *   (now: the AI's cup pours beside it, `AiMark working`), and nothing is added until the person checks
 *   it (next: the same cup in outline).
 * - One note: how long it usually takes, and after 10 s (20 s for the careful check) that it is
 *   still working.
 *
 * Both loops are indeterminate and obey the app's one reduced-motion switch: under it the photo wears
 * one still level line and the cup rests. Only transforms and opacity animate.
 */
export function AnalysingView({ photoUri, aspect, description, precise }: { photoUri?: string; aspect?: number; description?: string; precise: boolean }) {
  const { colors, radius, spacing } = useTheme();
  // A short window (320 x 640) gets a lower photo, so the steps stay in the first view above Cancel.
  const short = useWindowDimensions().height < 700;
  const [slow, setSlow] = useState(false);
  const [boxH, setBoxH] = useState(0);
  const photo = !!photoUri;
  const steps = analysingSteps(photo, precise);

  useEffect(() => {
    const t = setTimeout(() => setSlow(true), slowAfterMs(precise));
    return () => clearTimeout(t);
  }, [precise]);

  return (
    <FadeUp>
      <View style={{ gap: spacing.md }} testID="ai-analysing" accessibilityLiveRegion="polite">
        {photoUri ? (
          <View
            testID="ai-analysing-photo"
            onLayout={(e) => setBoxH(Math.round(e.nativeEvent.layout.height))}
            style={{ width: '100%', aspectRatio: Math.max(0.75, Math.min(1.6, aspect ?? 1.33)), maxHeight: short ? 220 : 300, ...cup(radius.card), overflow: 'hidden', backgroundColor: colors.surfaceAlt }}>
            <Image source={{ uri: photoUri }} style={{ width: '100%', height: '100%' }} contentFit="cover" accessibilityLabel="Your meal photo" />
            <PourVeil boxH={boxH} />
          </View>
        ) : description ? (
          <Card tone="alt">
            <Text variant="body" color="textSecondary" numberOfLines={4}>
              “{description}”
            </Text>
          </Card>
        ) : null}

        <Card padding={spacing.lg} testID="ai-analysing-steps">
          {/* One element for a screen reader: what is done, what is happening, what comes next. */}
          <View accessible accessibilityLabel={analysingLabel(photo, precise)} style={{ gap: spacing.md }}>
            {/* Done is the filled ink cup (as the sync row's "nothing waits"), next the outline: the check is kept for "on budget". */}
            <Step testID="ai-step-input" mark={<CupKey color={colors.text} size={10} />} text={steps.input} />
            {/* The cup stands on the words' line, as it does beside a coach answer; its drop hangs above it. */}
            <Step testID="ai-step-estimate" mark={<AiMark size="row" working style={{ marginTop: -aiMarkHeadroom('row') }} />} text={steps.estimate} now />
            <Step testID="ai-step-review" mark={<CupKey variant="outline" color={colors.textTertiary} size={10} />} text={steps.review} />
          </View>
        </Card>

        <Text variant="caption" color="textSecondary" testID="ai-analysing-note">
          {analysingNote(precise, slow)}
        </Text>
      </View>
    </FadeUp>
  );
}

/** One step: its mark in a 20 px column, its words beside it. Only the step that is happening now is strong. */
function Step({ mark, text, now, testID }: { mark: React.ReactNode; text: string; now?: boolean; testID: string }) {
  const { spacing } = useTheme();
  return (
    <View testID={testID} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 28 }}>
      <View style={{ width: 20, alignItems: 'center' }}>{mark}</View>
      <Text variant={now ? 'bodyStrong' : 'body'} color={now ? 'text' : 'textSecondary'} style={{ flex: 1 }}>
        {text}
      </Text>
    </View>
  );
}

const LINE = 3;
/** A 1 px edge above and below the line in the card colour, so it shows on the dark parts of a photo (and the light ones in the dark looks). */
const EDGE = 1;
/** The line's rise: a slow pour on purpose (a large surface, a wait with no known length). */
const RISE_MS = 1400;
/** Ease-out, but a gentle one: the kit's pour curve would leave the line creeping along the top edge for most of a second. */
const RISE_EASE = Easing.out(Easing.quad);
/** The veil and its line fade in at the bottom over this long, as the line starts to rise, and fade out at the top. */
const VEIL_IN_MS = 260;
const VEIL_OUT_MS = 240;
/** The clear photo rests this long between turns. */
const HOLD_MS = 160;
/** How much of the page colour lies over the part of the photo the line has not reached. */
const VEIL = 0.4;

/**
 * The level line over the photo: a veil of the page colour with the `rim` line along its bottom edge
 * (a 1 px card-coloured edge either side), moved up by translateY, so what is under the line is the
 * clear photo and what is above it is veiled. One turn (1,560 ms): the line starts at the bottom edge
 * and rises to the top (1,400 ms) while the veil fades in over its first 260 ms, so the photo is
 * washed over softly, never cut to pale; near the top the line fades out (240 ms); the clear photo
 * rests 160 ms, and the line is put back at the bottom unseen. It never stops part way and never says
 * how much is done. Under reduced motion: no veil, one still line at the cup's rest level.
 */
function PourVeil({ boxH }: { boxH: number }) {
  const { colors } = useTheme();
  const reduce = useReducedMotion();
  const y = useSharedValue(0);
  const opacity = useSharedValue(0);
  const band = LINE + 2 * EDGE;
  const top = -(boxH - band);

  useEffect(() => {
    if (reduce || boxH <= band) return;
    y.set(0);
    opacity.set(0);
    y.set(
      withRepeat(
        withSequence(
          withTiming(top, { duration: RISE_MS, easing: RISE_EASE }),
          // The clear photo rests, then the line is put back at the bottom while it is unseen.
          withTiming(top, { duration: HOLD_MS }),
          withTiming(0, { duration: 0 }),
        ),
        -1,
      ),
    );
    opacity.set(
      withRepeat(
        withSequence(
          withTiming(1, { duration: VEIL_IN_MS, easing: ease.enter }),
          withTiming(1, { duration: RISE_MS - VEIL_IN_MS - VEIL_OUT_MS }),
          withTiming(0, { duration: VEIL_OUT_MS, easing: ease.exit }),
          withTiming(0, { duration: HOLD_MS }),
        ),
        -1,
      ),
    );
    return () => {
      cancelAnimation(y);
      cancelAnimation(opacity);
    };
  }, [reduce, boxH, band, top, y, opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.get(), transform: [{ translateY: y.get() }] }));

  if (boxH <= band) return null;
  const line = { height: band, borderTopWidth: EDGE, borderBottomWidth: EDGE, borderColor: colors.surface, backgroundColor: colors.rim } as const;
  if (reduce) {
    return <View testID="ai-analysing-level" pointerEvents="none" style={[{ position: 'absolute', left: 0, right: 0, top: Math.round(boxH * 0.45) }, line]} />;
  }
  return (
    <Animated.View testID="ai-analysing-level" pointerEvents="none" style={[{ position: 'absolute', left: 0, right: 0, top: 0, height: boxH }, style]}>
      <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: band, backgroundColor: colors.bg, opacity: VEIL }} />
      <View style={[{ position: 'absolute', left: 0, right: 0, bottom: 0 }, line]} />
    </Animated.View>
  );
}
