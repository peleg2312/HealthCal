/**
 * How much reading text has grown on this device: the app's own text size (Profile, "Text size", up to 200%,
 * `scaledFontSize`) times the phone's own setting, which the kit's `Text` lets add only up to `phoneCapFor`
 * of it, so the two together stay at 2x. Measured on the body size (15 px), which doubles at 200%.
 *
 * Today, the diary's date block and the tab bar lay themselves out from it: past `LARGE_TEXT` a cup's labels
 * leave the side column for rows under it, the rail's three cells stack, and a row that cannot hold its words
 * side by side becomes two rows. At 100% nothing changes. Pure, apart from the hook at the end.
 */
import { useWindowDimensions } from 'react-native';

import { phoneCapFor, useTextSize } from '@/theme';
// Not re-exported by @/theme's index (THEME's file), so read from its own module.
import { scaledFontSize } from '@/theme/textSize';

/** Past this growth the side-by-side layouts that were measured at 100% give way to rows (sizes 130% and up). */
export const LARGE_TEXT = 1.2;

/** Reading text's growth for an app size and the phone's font scale (1 on the web). */
export function textGrowth(appScale: number, fontScale = 1): number {
  const app = scaledFontSize(15, appScale) / 15;
  const phone = Math.min(Math.max(1, fontScale || 1), phoneCapFor(appScale));
  return Math.round(app * phone * 100) / 100;
}

/** The growth of reading text now, live. */
export function useTextGrowth(): number {
  const scale = useTextSize();
  const { fontScale } = useWindowDimensions();
  return textGrowth(scale, fontScale);
}
