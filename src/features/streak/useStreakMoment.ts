import { useIsFocused } from 'expo-router';
import { useState } from 'react';

import { useStore } from '@/store';
import type { Consistency } from '@/store/selectors';
import type { ISODate } from '@/types';

import { dueMilestone, justExtended, milestoneKey, streakLine, type StreakMilestone, type StreakState } from './rules';
import { useStreakMoments } from './store';

export interface StreakMoment {
  /** The streak as last seen on screen: it only moves while Today is in front, so the pour and tick are seen. */
  streak: number;
  /** Whether today is logged (the streak cup is full). */
  filled: boolean;
  /** "12 days. A missed day will not break it." after the day's first entry extended the streak; null otherwise. */
  line: string | null;
  /** A 7, 30 or 100 day milestone to show now (once on this device, only with Celebrations on). */
  milestone: StreakMilestone | null;
  closeMilestone: () => void;
}

/**
 * The streak moments for Today, from `useConsistency` (which owns the
 * forgiving rule). A change that happens while another screen is in front
 * (food logged from search) is played when Today comes back.
 */
export function useStreakMoment(consistency: Consistency, today: ISODate): StreakMoment {
  const focused = useIsFocused();
  const celebrations = useStore((s) => s.settings.celebrations);
  const shown = useStreakMoments((s) => s.shown);
  const hydrated = useStreakMoments((s) => s.hydrated);
  const actual: StreakState = { streak: consistency.streak, loggedToday: consistency.loggedToday };
  const [seen, setSeen] = useState<StreakState>(actual);
  const [line, setLine] = useState<{ date: ISODate; text: string } | null>(null);
  if (focused && (seen.streak !== actual.streak || seen.loggedToday !== actual.loggedToday)) {
    setSeen(actual);
    setLine(justExtended(seen, actual) ? { date: today, text: streakLine(actual.streak) } : null);
  }
  const milestone = focused && hydrated && celebrations ? dueMilestone(seen, today, shown) : null;
  return {
    streak: seen.streak,
    filled: seen.loggedToday,
    line: line && line.date === today ? line.text : null,
    milestone,
    closeMilestone: () => {
      if (milestone) useStreakMoments.getState().markShown(milestoneKey(milestone, today));
    },
  };
}
