/**
 * The clock as React state.
 *
 * Components must not call `today()` or `new Date()` while rendering: the
 * React Compiler treats a render as pure and caches the result, so a screen
 * that stays mounted (every tab does) would keep showing yesterday after
 * midnight. Read the date from these hooks instead; `today()` and friends
 * remain fine inside event handlers and effects.
 */
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { today } from '@/lib/dates';
import type { ISODate } from '@/types';

/** Today's date key. Rolls over at midnight and when the app returns to the foreground. */
export function useToday(): ISODate {
  const [date, setDate] = useState(today());
  useEffect(() => {
    const check = () => setDate((prev) => (prev === today() ? prev : today()));
    const timer = setInterval(check, 30_000);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && check());
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, []);
  return date;
}

/** The current time, refreshed every `intervalMs` and when the app returns to the foreground. */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = () => setNow(new Date());
    const timer = setInterval(tick, intervalMs);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && tick());
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [intervalMs]);
  return now;
}
