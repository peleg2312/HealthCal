import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { POSITION_WORDS, POSITIONS, positionLabel, type LoadPosition } from '@/lib/trainingLoad';
import { fonts, motion, useTheme } from '@/theme';
import { Text, usePour } from '@/ui';

const EDGE = 1;
/** The share of the chosen third's fill that already shows when it starts to rise. */
const START = 0.2;

/**
 * Where the last 7 days sit against the person's own recent weeks, as one slim track cut into
 * thirds by two hairlines: lighter, usual, more. The third for the position is filled in the
 * exercise colour under its level line; the other two stay empty (`vesselEmpty`, the track's one
 * outline in `vesselEdge`). Never amber, at any position: more than usual is information, not a
 * warning. It is a reading, not a control: a track the height of a progress bar, with nothing of a
 * button's or a chip's size or corners about it.
 *
 * One idea, one picture: the sheet draws it with its words (`ZoneScale`), Train's week card draws
 * the same track small (`LoadMark`).
 *
 * Motion: with `animate` the fill rises once, after the sheet has arrived (a pour inside the
 * clipped third: translateY and opacity only, the kit's `usePour`, so reduced motion draws it full
 * at once).
 */
export function ZoneTrack({
  position,
  height = 14,
  rim = 3,
  animate = true,
  style,
}: {
  position: LoadPosition;
  /** 14 in the sheet, 12 on the week card. */
  height?: number;
  /** The level line: 3 px, 2.5 at the small size. */
  rim?: number;
  animate?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, radius } = useTheme();
  const pour = usePour(1, { duration: motion.duration.pourSmall, delay: motion.duration.sheetIn, settle: 0, animate });
  const inner = height - 2 * EDGE;
  const fill = useAnimatedStyle(() => {
    const level = pour.level.get();
    const shown = START + (1 - START) * level;
    return { opacity: Math.min(1, level * 3), transform: [{ translateY: (1 - shown) * inner }] };
  });
  return (
    <View
      style={[
        {
          height,
          flexDirection: 'row',
          borderWidth: EDGE,
          borderColor: colors.vesselEdge,
          borderRadius: radius.track + EDGE,
          backgroundColor: colors.vesselEmpty,
          overflow: 'hidden',
        },
        style,
      ]}>
      {POSITIONS.map((p, i) => (
        <View key={p} style={{ flex: 1, borderLeftWidth: i ? EDGE : 0, borderColor: colors.vesselEdge, overflow: 'hidden' }}>
          {p === position ? (
            <Animated.View style={[{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: colors.exercise }, fill]}>
              <View style={{ height: rim, backgroundColor: colors.rim }} />
            </Animated.View>
          ) : null}
        </View>
      ))}
    </View>
  );
}

/**
 * The training overview's answer, right under the sheet's title: the track with its three words
 * under their thirds, the chosen one strong. The whole scale is one element for a screen reader
 * ("More, of lighter, usual and more").
 */
export function ZoneScale({ position, testID }: { position: LoadPosition; testID?: string }) {
  return (
    <View testID={testID} accessible accessibilityRole="image" accessibilityLabel={positionLabel(position)} style={{ gap: 6 }}>
      <ZoneTrack position={position} />
      <View style={{ flexDirection: 'row' }}>
        {POSITIONS.map((p) => {
          const chosen = p === position;
          return (
            <Text
              key={p}
              variant="label"
              align="center"
              numberOfLines={1}
              color={chosen ? 'text' : 'textSecondary'}
              style={chosen ? { flex: 1, fontFamily: fonts.bold } : { flex: 1 }}>
              {POSITION_WORDS[p]}
            </Text>
          );
        })}
      </View>
    </View>
  );
}
