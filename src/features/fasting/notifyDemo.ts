/**
 * Test-hook builds only (a development build, or EXPO_PUBLIC_E2E): `?notifyDemo=on|off` on /fasting draws
 * the screen as a phone with notifications allowed draws it, its reminders on or off, so a browser can show
 * the notification line that only a phone has (a browser sends no notifications). Release bundles never
 * read it (`notifyDemo` answers null there).
 */
import { Platform } from 'react-native';

export type NotifyDemo = 'on' | 'off';

export function notifyDemo(): NotifyDemo | null {
  if (!((typeof __DEV__ !== 'undefined' && __DEV__) || process.env.EXPO_PUBLIC_E2E === '1')) return null;
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const p = /[?&]notifyDemo=(on|off)(?:&|$)/.exec(window.location?.search ?? '')?.[1];
  return p === 'on' || p === 'off' ? p : null;
}
