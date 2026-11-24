import { Platform, useWindowDimensions } from 'react-native';

import { phoneCapFor, useTextSize } from '@/theme';

/**
 * How much larger than designed the kit draws reading text: the app's text size (100% to 200%, Profile >
 * Text size) times the phone's own setting as far as the kit lets it apply (`phoneCapFor`, so the two
 * together stay at 2x). A layout that measures text by hand, or places it at a value, reads this instead
 * of the phone's setting alone. Pure.
 */
export function textGrowth(appSize: number, phoneScale: number): number {
  const phone = Number.isFinite(phoneScale) && phoneScale > 0 ? phoneScale : 1;
  return Math.round(appSize * Math.min(phone, phoneCapFor(appSize)) * 100) / 100;
}

/** `textGrowth` now, live (the browser leaves the phone's setting to its own zoom, so the web reads 1 for it). */
export function useTextGrowth(): number {
  const size = useTextSize();
  const { fontScale } = useWindowDimensions();
  return textGrowth(size, Platform.OS === 'web' ? 1 : fontScale);
}
