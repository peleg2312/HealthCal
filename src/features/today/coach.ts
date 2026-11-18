/**
 * One contextual suggestion for the Today screen: the single most useful
 * thing to do next, phrased with the user's own numbers. Pure and testable.
 * The title and body are one short sentence pair (at most two lines at 320 px,
 * about 76 characters) and never repeat a number the screen already shows
 * (kcal left, the budget, the macro amounts): the line sits under the calorie card.
 */
import { hasFoodLogged } from '@/features/drinks/via';
import { isCompleteDay } from '@/lib/trend';
import { formatNumber, formatVolume } from '@/lib/units';
import type { DaySummary } from '@/store/selectors';

import { formatWaterLeft } from './volume';
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

/** `fits` opens the "What fits" sheet (foods of the user's own that fit the calories left). */
export type CoachQuick = { kind: 'water' } | { kind: 'repeat'; meal: MealType } | { kind: 'fits' };

/**
 * The user's own day: when they usually eat and when they are awake. Times are
 * local 'HH:mm'. Today passes `settings.reminders` (meal times and quiet hours);
 * the defaults below are the coach's fallback rhythm.
 */
export interface CoachRhythm {
  meals: { breakfast: string; lunch: string; dinner: string };
  /** Start of the waking day (the end of quiet hours). */
  wake: string;
  /** End of the waking day (the start of quiet hours). */
  sleep: string;
}

export const DEFAULT_RHYTHM: CoachRhythm = {
  meals: { breakfast: '07:00', lunch: '12:30', dinner: '19:00' },
  wake: '07:00',
  sleep: '22:00',
};

/** Coach rhythm from the reminder settings: meal times (even with meal reminders off) and quiet hours. */
export function rhythmFromReminders(r: { quietStart: string; quietEnd: string; meals: { breakfast: string; lunch: string; dinner: string } }): CoachRhythm {
  return {
    meals: { breakfast: r.meals.breakfast, lunch: r.meals.lunch, dinner: r.meals.dinner },
    wake: r.quietEnd,
    sleep: r.quietStart,
  };
}

/** 'HH:mm' to hours since midnight; null when it does not parse. */
function hoursOf(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm?.trim() ?? '');
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h + min / 60;
}

/**
 * Geometry of the waking day, in hours since waking. Times inside the sleep
 * window are placed before waking (negative) when they are closer to the
 * morning, after the end of the day otherwise, so a night shift that crosses
 * midnight works the same as a usual day.
 */
function dayClock(rhythm: CoachRhythm) {
  const wake = hoursOf(rhythm.wake) ?? hoursOf(DEFAULT_RHYTHM.wake)!;
  const sleep = hoursOf(rhythm.sleep) ?? hoursOf(DEFAULT_RHYTHM.sleep)!;
  let length = (((sleep - wake) % 24) + 24) % 24;
  if (length < 4) length = 15; // A window this short is a typo, not a day.
  const rel = (h: number) => {
    // A day that starts and ends on the same date: before waking, the date's day has not begun
    // (00:30 is not "17 hours into" the day whose log started half an hour ago).
    if (wake <= sleep) return h - wake;
    const r = (((h - wake) % 24) + 24) % 24;
    return r > length + (24 - length) / 2 ? r - 24 : r;
  };
  /**
   * Waking hours of this calendar date that have passed by clock time `h`. The log
   * restarts at midnight, so the pace is measured against the date, not the waking day:
   * for someone awake across midnight the date holds the end of one shift and the start of the next.
   */
  const awakeSoFar = (h: number) => (wake <= sleep ? Math.min(Math.max(0, h - wake), length) : Math.min(h, sleep) + Math.max(0, h - wake));
  return { length, rel, awakeSoFar };
}

/** Share of the daily water goal a person would typically have reached `hoursAwake` into a waking day of `dayLength` hours. */
export function waterPaceFraction(hoursAwake: number, dayLength: number): number {
  return Math.min(1, Math.max(0, hoursAwake / dayLength));
}

/** Share of the daily water goal a person would typically have reached by this hour of the day, for the given rhythm (default awake 07:00 to 22:00). */
export function expectedWaterFraction(hour: number, rhythm: CoachRhythm = DEFAULT_RHYTHM): number {
  const { length, awakeSoFar } = dayClock(rhythm);
  return waterPaceFraction(awakeSoFar(hour), length);
}

const MAIN_MEALS = ['breakfast', 'lunch', 'dinner'] as const;

/** How the day before closed, for the morning line: kcal eaten and that day's budget. */
export interface ClosedDay {
  eaten: number;
  budget: number;
}

/** A day closed within budget: fully logged (the shared rule) and not past its budget. */
export function closedWithinBudget(d: ClosedDay | null | undefined): boolean {
  return !!d && d.budget > 0 && isCompleteDay(d.eaten, d.budget) && d.eaten <= d.budget;
}

export function coachTip(
  day: DaySummary,
  units: UnitSystem,
  now: Date = new Date(),
  rhythm: CoachRhythm = DEFAULT_RHYTHM,
  yesterday?: ClosedDay | null,
): CoachTip {
  const hour = now.getHours() + now.getMinutes() / 60;
  const { length, rel, awakeSoFar } = dayClock(rhythm);
  const awake = rel(hour);
  const awakeToday = awakeSoFar(hour);
  const meals = MAIN_MEALS.map((meal) => ({
    meal,
    label: meal as string,
    at: rel(hoursOf(rhythm.meals[meal]) ?? hoursOf(DEFAULT_RHYTHM.meals[meal])!),
  }));
  const search = (meal: MealType) => `/food/search?meal=${meal}&date=${day.date}`;

  if (!hasFoodLogged(day.entries)) {
    // The meal coming up or just past: from 90 minutes before its time, a snack once dinner is 90 minutes gone.
    const current = [...meals].reverse().find((m) => awake >= m.at - 1.5);
    const dinnerAt = meals[2].at;
    const meal: MealType = awake > dinnerAt + 1.5 ? 'snack' : (current?.meal ?? 'breakfast');
    // The morning after a day that closed within budget, say so here rather than in a pop-up.
    const closed = closedWithinBudget(yesterday) && yesterday ? yesterday : null;
    return {
      id: closed ? 'closed' : 'start',
      emoji: '👋',
      title: closed ? 'Yesterday closed within budget' : 'Nothing logged yet today',
      body: closed
        ? `${formatNumber(closed.eaten)} of ${formatNumber(closed.budget)} kcal.`
        : 'Logging the first thing takes a few seconds.',
      action: { label: 'Log food', href: search(meal) },
      ...(meal === 'snack' ? null : { quick: { kind: 'repeat' as const, meal } }),
      tone: 'neutral',
    };
  }

  // A meal is due an hour after its usual time, until four hours after it or the next meal's time, whichever comes first.
  const due = meals.find((m, i) => {
    const next = meals[i + 1]?.at;
    const until = Math.min(m.at + 4, next !== undefined && next > m.at ? next : Infinity);
    return awake >= m.at + 1 && awake <= until && !hasFoodLogged(day.byMeal[m.meal]);
  });
  if (due) {
    return {
      id: `meal-${due.meal}`,
      emoji: '🍽️',
      title: `Had ${due.label} yet?`,
      body: "It is not in today's log.",
      action: { label: `Log ${due.label}`, href: search(due.meal) },
      quick: { kind: 'repeat', meal: due.meal },
      tone: 'neutral',
    };
  }

  const waterGap = waterPaceFraction(awakeToday, length) * day.waterGoalMl - day.waterMl;
  if (awakeToday >= 3 && waterGap > 500 && day.waterRemainingMl > 0) {
    return {
      id: 'water',
      emoji: '💧',
      title: `${formatWaterLeft(day.waterMl, day.waterGoalMl, units)} of water to go`,
      body: `About ${formatVolume(Math.min(day.waterRemainingMl, Math.round(waterGap / 50) * 50), units)} behind an even pace for the day.`,
      action: { label: 'Add water', href: '/water' },
      quick: { kind: 'water' },
      tone: 'neutral',
    };
  }

  const proteinLeft = Math.round(day.macros.proteinG - day.eaten.protein);
  if (awake >= 8 && proteinLeft > day.macros.proteinG * 0.4 && day.remaining > 250) {
    return {
      id: 'protein',
      emoji: '🥚',
      title: `${proteinLeft} g of protein to go`,
      body: 'A few of your own foods would close most of it.',
      action: { label: 'See what fits', href: search('dinner') },
      quick: { kind: 'fits' },
      tone: 'neutral',
    };
  }

  if (day.remaining < -150) {
    return {
      id: 'over',
      emoji: '🧭',
      title: "Over today's budget",
      body: 'One day does not move the trend much.',
      action: { label: 'See your week', href: '/progress' },
      tone: 'neutral',
    };
  }

  if (awake >= 10 && day.activities.length === 0) {
    return {
      id: 'move',
      emoji: '🚶',
      title: 'No activity logged today',
      body: 'A brisk 20 minute walk counts toward the week.',
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
        ? day.waterRemainingMl > 0
          ? 'Within budget so far, with water still to go.'
          : 'Within budget, and the water goal is done.'
        : 'Close to your budget for the day.',
    tone: 'positive',
  };
}
