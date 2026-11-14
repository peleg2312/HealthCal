import type React from 'react';

/**
 * The share button for a day (Today's header places it). It opens the share
 * sheet for that day; until the card is built it draws nothing.
 */
export function ShareDayButton({ date }: { date: string }): React.ReactElement | null {
  void date;
  return null;
}
