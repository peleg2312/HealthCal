import React from 'react';
import Svg, { Path } from 'react-native-svg';

import { DECORATIVE } from '@/ui/decorative';

/**
 * The AI's line glyphs, for a button or a tile where the AI's cup (./AiMark.tsx) would be too much
 * and a stock icon says nothing: the same cup with its drop, drawn as lines on lucide's 24 grid with
 * lucide's stroke (1.9, or 2.2 on a button), round caps and joins. The drop is the one filled shape.
 *
 * - 'estimate': the cup with its level line and the drop above (an AI estimate).
 * - 'photo': a camera (lucide's Camera body) whose lens is the family's drop (an estimate from a photo).
 *   It reads as a camera at a glance; corner frames are the barcode's only (lucide ScanBarcode), so the
 *   two tiles side by side on the + sheet are never twins.
 * - 'describe': lines of words beside the cup (an estimate from a description).
 * - 'coach': a speech cup with the drop inside (the AI coach).
 *
 * The colour is always a theme colour passed in (text, onPrimary on a primary button, ...): never a
 * data colour and never `rim`. Decorative: the label beside it carries the meaning.
 */
export type AiGlyphName = 'estimate' | 'photo' | 'describe' | 'coach';

const GLYPHS: Record<AiGlyphName, { strokes: string[]; drop: string }> = {
  estimate: {
    strokes: ['M6 9v8a4 4 0 0 0 4 4h4a4 4 0 0 0 4-4V9', 'M6 14.5h12'],
    drop: 'M12 2.6l2.1 2.1L12 6.8 9.9 4.7z',
  },
  photo: {
    strokes: [
      'M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z',
    ],
    drop: 'M12 9.6l3.4 3.4-3.4 3.4-3.4-3.4z',
  },
  describe: {
    strokes: ['M3 5.5h9M3 10.5h6M3 15.5h4', 'M12 12v5a3 3 0 0 0 3 3h3a3 3 0 0 0 3-3v-5', 'M12 15.5h9'],
    drop: 'M16.5 5.6l1.9 1.9-1.9 1.9-1.9-1.9z',
  },
  coach: {
    strokes: ['M4 4h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-8l-4.5 4v-4H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z'],
    drop: 'M12 7l2.5 2.5L12 12 9.5 9.5z',
  },
};

export function AiGlyph({ name, size = 20, color = 'currentColor', strokeWidth = 1.9 }: { name: AiGlyphName; size?: number; color?: string; strokeWidth?: number }) {
  const g = GLYPHS[name];
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...DECORATIVE} pointerEvents="none">
      {g.strokes.map((d) => (
        <Path key={d} d={d} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      ))}
      <Path d={g.drop} fill={color} stroke={color} strokeWidth={1.2} strokeLinejoin="round" />
    </Svg>
  );
}
