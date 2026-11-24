import React from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';

import type { FoodSource } from '@/types';
import { CupKey } from '@/ui';

import { AiMark } from './AiMark';

/**
 * How a data source is marked: a filled cup key for reference data, an outline for community or your own numbers,
 * dashed for an estimate drawn without the AI's mark (a bundled food's typical values, the sample result).
 */
export function sourceKeyVariant(source: FoodSource | 'typical'): 'filled' | 'outline' | 'dashed' {
  if (source === 'builtin' || source === 'usda') return 'filled';
  if (source === 'ai' || source === 'typical') return 'dashed';
  return 'outline';
}

/**
 * How far below the top of a caption's first line (16 px) the mark starts, where it leads a line that
 * may wrap: the 8 px key sits on the letters, the taller AI mark fills the line.
 */
export function sourceMarkTop(source: FoodSource | 'typical'): number {
  return source === 'ai' ? 1 : 5;
}

/**
 * The mark that says where a food's numbers come from (principle 3): the kit's key for every source
 * (filled for reference data, outlined for community and your own, dashed for typical values), and for an AI estimate the small
 * AI mark, the same cup with its drop that the estimate screen and the coach wear. `plain` draws the
 * kit's dashed key for an estimate that is not the AI's (the fixed sample result).
 */
export function SourceMark({ source, color, size = 8, plain = false, style }: { source: FoodSource | 'typical'; color: string; size?: number; plain?: boolean; style?: StyleProp<ViewStyle> }) {
  if (source === 'ai' && !plain) return <AiMark size="small" style={style} />;
  return <CupKey color={color} size={size} variant={sourceKeyVariant(source)} style={style} />;
}
