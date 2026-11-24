/**
 * How much the kit's text has grown on this phone: the app's own text size (Profile, "Text size",
 * `useTextSize`) times the phone's text-size setting, capped as the kit's `Text` caps it (`phoneCapFor`), so
 * a layout can give its rows more room when text is large instead of cutting a word (WCAG 1.4.4, D6-F9).
 * Text is never drawn smaller for it: only the layout changes (rows wrap, tiles stack or grow wider).
 */
import { Platform, useWindowDimensions } from 'react-native';

import { phoneCapFor, useTextSize } from '@/theme';

/** From this growth on, the food screens lay out for large text (two meal tabs a line, stacked tiles). */
export const BIG_TEXT_FROM = 1.4;

/** The growth of the kit's text: 1 at the designed size, 2 at 200%. */
export function useTextGrowth(): number {
  const size = useTextSize();
  const { fontScale } = useWindowDimensions();
  // The web draws the app's size only (a browser's zoom is not a font scale).
  const phone = Platform.OS === 'web' ? 1 : Math.min(Math.max(1, fontScale || 1), phoneCapFor(size));
  return size * phone;
}

/** True while text is large enough that the food screens use their large-text layout. */
export function useBigText(): boolean {
  return useTextGrowth() >= BIG_TEXT_FROM;
}
