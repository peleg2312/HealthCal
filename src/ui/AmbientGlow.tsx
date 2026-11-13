import React from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { useTheme } from '@/theme';

let seq = 0;

/**
 * A soft wash of one colour behind the top of a screen, so each area of the
 * app has its own atmosphere (calories, water, sleep and so on) without a
 * heavy coloured header. Purely decorative: it never intercepts touches.
 */
export function AmbientGlow({ color, height = 380 }: { color: string; height?: number }) {
  const { dark } = useTheme();
  const { width } = useWindowDimensions();
  const [id] = React.useState(() => `glow-${seq++}`);
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { height, overflow: 'hidden' }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Svg width={width} height={height}>
        <Defs>
          {/* In bounding-box units the circle stretches with the rectangle, giving a wide, shallow ellipse from the top edge. */}
          <RadialGradient id={id} cx="50%" cy="0%" fx="50%" fy="0%" r="85%">
            <Stop offset="0" stopColor={color} stopOpacity={dark ? 0.3 : 0.2} />
            <Stop offset="0.5" stopColor={color} stopOpacity={dark ? 0.1 : 0.07} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={width} height={height} fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}
