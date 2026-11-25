/**
 * The Water screen's cup, poured in layers: the kit's `Vessel` with `goalKind="reach"`, whose one fill is
 * replaced by the day's drinks, one flat colour per kind (`drinkLayers`, `DRINK_LAYER_COLOR`), oldest at the
 * base and the newest under the level line. Everything else is the Vessel's: the tumbler outline with no lip,
 * the empty part in `vesselEmpty`, the 3 px level line on top of whatever layer is newest, the brim line across
 * the open top at the goal with its one flash in the water colour as the pour lands, labels at the heights they
 * describe, `memoryKey` so a revisit does not pour again, and reduced motion drawn at once (the kit's `usePour`).
 *
 * The layers keep their places in the cup while the level pours: the clipping window rises (a transform) and
 * the layers inside it are held still by the opposite transform, so a new drink is revealed as a new layer on
 * top rather than the whole stack sliding up. Only transforms and opacity animate. Two layers that meet are
 * parted by a 1 px seam in the cup's empty colour, so they are told apart without their colour alone.
 */
import React from 'react';
import { Platform, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { spokenUnits } from '@/lib/spokenUnits';
import { motion, useTheme, vesselBase } from '@/theme';
import { brimOverhang, DECORATIVE, figure, fillRatio, goalState, levelY, placeLabels, useFadeAfter, usePour, useReachFlash, type VesselLabel } from '@/ui';

import { DRINK_LAYER_COLOR, type DrinkLayer } from './layers';

/** The cup's outline, as the kit's Vessel draws it. */
const EDGE = 1.5;
const RIM = 3;

export interface LayeredVesselProps {
  /** What the day's drinks count toward the goal, in ml. */
  value: number;
  /** The goal, in ml: the brim. */
  max: number;
  /** The drinks as layers (`drinkLayers(day.waterEntries, goal)`). */
  layers: DrinkLayer[];
  onReached?: () => void;
  memoryKey?: string;
  width?: number;
  height?: number;
  labels?: VesselLabel[];
  labelGap?: number;
  labelSpacing?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityLabel?: string;
}

export function LayeredVessel({ value, max, layers, onReached, memoryKey, width = 84, height = 212, labels, labelGap = 16, labelSpacing, style, testID, accessibilityLabel }: LayeredVesselProps) {
  const { colors } = useTheme();
  const inner = height - EDGE;
  const ratio = fillRatio(value, max);
  const reached = goalState(value, max, 'reach') === 'reached';
  const base = vesselBase(height, width);
  const pour = usePour(ratio, { duration: motion.duration.pour, memoryKey });
  const brimOpacity = useFadeAfter(reached, pour.endsIn, pour.instant);
  const flash = useReachFlash(reached, { delay: pour.endsIn, instant: pour.instant, memoryKey, onReached });
  const { level, settle } = pour;
  const out = brimOverhang(width);
  const brimH = RIM + (out >= 5 ? 2 : 1);
  const brimFrom = width / (width + 2 * out);
  // The window the drinks show through rises with the level; the layers inside it are held at their places.
  const windowStyle = useAnimatedStyle(() => ({ opacity: level.get() > 0.0005 ? 1 : 0, transform: [{ translateY: (1 - level.get()) * inner }] }));
  const holdStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -(1 - level.get()) * inner }] }));
  // The level line rides on the window's top; near the brim its settle is scaled away, as on the kit's cup.
  const rimStyle = useAnimatedStyle(() => {
    const room = Math.min(1, Math.max(0, (1 - level.get()) * 40));
    return { opacity: level.get() > 0.0005 ? 1 : 0, transform: [{ translateY: (1 - level.get()) * inner - settle.get() * room }] };
  });
  const brimStyle = useAnimatedStyle(() => ({ opacity: brimOpacity.get(), transform: [{ scaleX: brimFrom + (1 - brimFrom) * brimOpacity.get() }] }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.get() }));

  const cupView = (
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
        <Animated.View style={[{ position: 'absolute', left: 0, right: 0, top: 0, height: inner, overflow: 'hidden' }, windowStyle]}>
          <Animated.View style={[{ position: 'absolute', left: 0, right: 0, top: 0, height: inner }, holdStyle]}>
            {layers.map((l) => (
              <View key={l.key} testID={testID ? `${testID}-layer-${l.kind}` : undefined} style={{ position: 'absolute', left: 0, right: 0, bottom: l.from * inner, height: Math.max(0, (l.to - l.from) * inner), backgroundColor: colors[DRINK_LAYER_COLOR[l.kind]] }} />
            ))}
            {layers.slice(1).map((l) => (
              <View key={`seam-${l.key}`} style={{ position: 'absolute', left: 0, right: 0, bottom: l.from * inner - 0.5, height: 1, backgroundColor: colors.vesselEmpty }} />
            ))}
          </Animated.View>
        </Animated.View>
        <Animated.View style={[{ position: 'absolute', left: 0, right: 0, top: -RIM / 2, height: RIM, backgroundColor: colors.rim }, rimStyle]} />
      </View>
      {reached ? (
        <>
          {/* One flash in the water colour behind the brim line, at the crossing only. */}
          <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: -out - 3, right: -out - 3, top: -brimH / 2 - 3, height: brimH + 6, borderRadius: 2, backgroundColor: colors.water }, flashStyle]} />
          <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: -out, right: -out, top: -brimH / 2, height: brimH, borderRadius: 1, backgroundColor: colors.rim }, brimStyle]} />
        </>
      ) : null}
    </View>
  );

  if (!labels?.length) {
    return (
      <View style={style} testID={testID} {...figure(accessibilityLabel && spokenUnits(accessibilityLabel))}>
        {cupView}
      </View>
    );
  }

  const zone = height;
  // Laid out from the top of the cup down, whatever order the caller listed them in (as the kit's Vessel does).
  const list = [...labels].sort((a, b) => b.at - a.at);
  const wantY = list.map((l) => levelY(l.at, max, inner));
  const tops = placeLabels(
    list.map((l, i) => wantY[i] - l.height / 2),
    list.map((l) => l.height),
    zone,
    labelSpacing,
  );

  return (
    <View
      style={[{ flexDirection: 'row', alignItems: 'flex-start', gap: labelGap }, style]}
      testID={testID}
      accessibilityLabel={accessibilityLabel && spokenUnits(accessibilityLabel)}
      {...(Platform.OS === 'web' && accessibilityLabel ? ({ role: 'group' } as const) : null)}>
      <View style={{ width, height }} {...DECORATIVE}>
        {cupView}
        {list.map((l, i) =>
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
      </View>
    </View>
  );
}
