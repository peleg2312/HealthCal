/**
 * Today and the diary both use this: when the app comes back to the front after
 * five minutes or more away, or on another calendar day, `onReturn` runs and the
 * screen shows today again. The rule is pure, in ./backToToday. AppState is the
 * app going to the background natively and the page being hidden on web
 * (react-native-web follows `visibilitychange`), so a Home Screen web app on a
 * phone that was locked counts as away.
 */
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { today } from '@/lib/dates';

import { backToTodayOnReturn, type Away } from './backToToday';

export function useBackToToday(onReturn: () => void): void {
  // Outlives the effect, so a new `onReturn` does not forget that the app is away.
  const away = useRef<Away | null>(null);
  useEffect(() => {
    if (AppState.currentState !== 'active' && !away.current) away.current = { at: Date.now(), day: today() };
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') {
        // iOS passes through 'inactive' on the way to 'background': the first one counts.
        if (!away.current) away.current = { at: Date.now(), day: today() };
        return;
      }
      const was = away.current;
      away.current = null;
      if (backToTodayOnReturn(was, Date.now(), today())) onReturn();
    });
    return () => sub.remove();
  }, [onReturn]);
}
