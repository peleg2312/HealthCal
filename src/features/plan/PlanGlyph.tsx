/**
 * The plan's glyph (ruling D5: the one custom glyph outside the AI family): the app's own cup, as the
 * logo draws it. An open top with no lid and no rim past the sides, straight sides and a round base,
 * filled to about 60% with a flat tint of the stroke colour and the level line across the top of the
 * fill, inside the walls. Drawn on lucide's 24 grid at lucide's optical height (y 2.5 to 21.5, as tall
 * as its phone and people icons) with lucide's stroke and round caps, so it sits beside lucide icons in
 * a row and never reads as a bin (no wide top line, no lid).
 *
 * `IconTile` (@/features/settings/components) clones `color`, `size` and `strokeWidth` onto a row's
 * icon, so the glyph reads all three. Decorative: the row's title carries the meaning.
 */
import React from 'react';
import Svg, { Path } from 'react-native-svg';

import { DECORATIVE } from '@/ui/decorative';

import { useTheme } from '@/theme';

/** The walls (x 5 to 19, as wide as lucide's phone), the open top (y 2.5), the base (y 21.5, its corners 4 round) and the level (y 10.1: 60% of the way up). */
const CUP = 'M5 2.5v15a4 4 0 0 0 4 4h6a4 4 0 0 0 4-4v-15';
const LIQUID = 'M5 10.1v7.4a4 4 0 0 0 4 4h6a4 4 0 0 0 4-4v-7.4z';
const LEVEL = 'M5 10.1h14';

export function PlanGlyph({ size = 20, color, strokeWidth = 1.9 }: { size?: number; color?: string; strokeWidth?: number }) {
  const { colors } = useTheme();
  const ink = color ?? colors.textSecondary;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...DECORATIVE} pointerEvents="none">
      {/* The liquid: a flat tint up to the level. */}
      <Path d={LIQUID} fill={ink} fillOpacity={0.24} />
      {/* The level line: across the top of the fill, ending in the walls (butt ends, so nothing shows past them). */}
      <Path d={LEVEL} stroke={ink} strokeWidth={strokeWidth} strokeLinecap="butt" />
      {/* The cup: open at the top, straight sides, a round base. */}
      <Path d={CUP} stroke={ink} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
