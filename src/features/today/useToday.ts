import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { today } from '@/lib/dates';
import type { ISODate } from '@/types';

/** Today's date key that rolls over at midnight and when the app returns to the foreground. */
export function useToday(): ISODate {
  const [date, setDate] = useState(today());
  useEffect(() => {
    const check = () => setDate((prev) => (prev === today() ? prev : today()));
    const timer = setInterval(check, 60_000);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && check());
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, []);
  return date;
}
