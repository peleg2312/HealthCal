/**
 * One contextual suggestion for the Today screen: the single most useful
 * thing to do next, phrased with the user's own numbers. Pure and testable.
 */
import { formatNumber, formatVolume } from '@/lib/units';
import type { DaySummary } from '@/store/selectors';
import type { MealType, UnitSystem } from '@/types';

export interface CoachTip {
  id: string;
  emoji: string;
  title: string;
  body: string;
  action?: { label: string; href: string };
  /** One-tap actions shown under the tip, so the advice can be done from the card itself. */
  quick?: CoachQuick;
  tone: 'neutral' | 'positive';
}

export type CoachQuick = { kind: 'water' } | { kind: 'repeat'; meal: MealType };

const MEAL_WINDOWS: {
  meal: MealType;
  label: string;
  from: number;
  until: number;
}[] = [
  { meal: 'breakfast', label: 'breakfast', from: 6, until: 11 },
  { meal: 'lunch', label: 'lunch', from: 12, until: 16 },
  { meal: 'dinner', label: 'dinner', from: 18.5, until: 23 },
];

/** Share of the daily water goal a person would typically have reached by this hour (awake 07:00 to 22:00). */
export function expectedWaterFraction(hour: number): number {
  return Math.min(1, Math.max(0, (hour - 7) / 15));
}

export function coachTip(day: DaySummary, units: UnitSystem, now: Date = new Date()): CoachTip {
  const hour = now.getHours() + now.getMinutes() / 60;
  const search = (meal: MealType) => `/food/search?meal=${meal}&date=${day.date}`;

  if (day.entries.length === 0) {
    const meal = hour < 11 ? 'breakfast' : hour < 16 ? 'lunch' : hour < 21 ? 'dinner' : 'snack';
    return {
      id: 'start',
      emoji: '👋',
      title: 'Nothing logged yet today',
      body: `Your budget is ${formatNumber(day.budget)} kcal. Logging the first thing takes a few seconds.`,
      action: { label: 'Log food', href: search(meal) },
      ...(meal === 'snack' ? null : { quick: { kind: 'repeat' as const, meal } }),
      tone: 'neutral',
    };
  }

  const due = MEAL_WINDOWS.find((w) => hour >= w.from + 1.5 && hour <= w.until && day.byMeal[w.meal].length === 0);
  if (due) {
    return {
      id: `meal-${due.meal}`,
      emoji: '🍽️',
      title: `Had ${due.label} yet?`,
      body: `It is not in today's log. You have ${formatNumber(Math.max(0, day.remaining))} kcal left.`,
      action: { label: `Log ${due.label}`, href: search(due.meal) },
      quick: { kind: 'repeat', meal: due.meal },
      tone: 'neutral',
    };
  }

  const waterGap = expectedWaterFraction(hour) * day.waterGoalMl - day.waterMl;
  if (hour >= 10 && waterGap > 500 && day.waterRemainingMl > 0) {
    return {
      id: 'water',
      emoji: '💧',
      title: `${formatVolume(day.waterRemainingMl, units)} of water to go`,
      body: `You are about ${formatVolume(Math.round(waterGap / 50) * 50, units)} behind an even pace for the day. A glass now gets you back on it.`,
      action: { label: 'Add water', href: '/water' },
      quick: { kind: 'water' },
      tone: 'neutral',
    };
  }

  const proteinLeft = Math.round(day.macros.proteinG - day.eaten.protein);
  if (hour >= 15 && proteinLeft > day.macros.proteinG * 0.4 && day.remaining > 250) {
    return {
      id: 'protein',
      emoji: '🥚',
      title: `${proteinLeft} g of protein to go`,
      body: `You are at ${Math.round(day.eaten.protein)} of ${day.macros.proteinG} g. Building dinner around a protein source would cover most of it.`,
      action: { label: 'Find food', href: search('dinner') },
      tone: 'neutral',
    };
  }

  if (day.remaining < -150) {
    return {
      id: 'over',
      emoji: '🧭',
      title: `${formatNumber(Math.abs(day.remaining))} kcal over today's budget`,
      body: 'One day does not move the trend much. Weekly averages are what count, and tomorrow starts fresh.',
      action: { label: 'See your week', href: '/progress' },
      tone: 'neutral',
    };
  }

  if (hour >= 17 && day.activities.length === 0) {
    return {
      id: 'move',
      emoji: '🚶',
      title: 'No activity logged today',
      body: 'Even a 20 minute walk counts toward your weekly 150 minutes.',
      action: { label: 'Log activity', href: '/activity/pick' },
      tone: 'neutral',
    };
  }

  return {
    id: 'on-track',
    emoji: '✅',
    title: 'On track',
    body:
      day.remaining >= 0
        ? `${formatNumber(day.remaining)} kcal left and ${day.waterRemainingMl > 0 ? `${formatVolume(day.waterRemainingMl, units)} of water to go` : 'your water goal is done'}.`
        : 'Close to your budget for the day.',
    tone: 'positive',
  };
}
