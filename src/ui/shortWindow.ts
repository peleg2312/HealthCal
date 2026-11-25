import { useSyncExternalStore } from 'react';
import { Platform, useWindowDimensions } from 'react-native';

import { SHORT_WINDOW } from './controlRules';

const web = Platform.OS === 'web' && typeof window !== 'undefined';
const subscribe = (listener: () => void) => {
  if (!web) return () => {};
  window.addEventListener('resize', listener);
  return () => window.removeEventListener('resize', listener);
};
const layoutHeight = () => (web ? window.innerHeight : 0);

/**
 * Whether the window is too short for pinned parts (`SHORT_WINDOW`), live: a browser zoomed to 400% or a window
 * held sideways. On the web it reads the layout viewport (`innerHeight`), never react-native-web's window height,
 * which is the visual viewport's and shrinks while a phone browser's on-screen keyboard is up: a footer riding on
 * the keyboard stays pinned while a field is typed into.
 */
export function useShortWindow(): boolean {
  const { height } = useWindowDimensions();
  const webHeight = useSyncExternalStore(subscribe, layoutHeight, layoutHeight);
  return (web ? webHeight : height) < SHORT_WINDOW;
}
