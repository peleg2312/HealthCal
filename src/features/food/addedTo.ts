/**
 * Where a log went, in the words of the toast after it: "lunch" on today,
 * "yesterday's lunch", "tomorrow's lunch", else "lunch, Sat Nov 14". Built from
 * the entry's own date and the day it is now (read when the food is logged, in
 * the handler, never while rendering), so logging to a day that is not today is
 * never silent. No React, unit-tested.
 */
import { addDays, formatShortDate, weekdayShort } from '@/lib/dates';
import { MEAL_LABEL } from '@/lib/nutrition';
import type { ISODate, MealType } from '@/types';

export function mealOnDay(meal: MealType, date: ISODate, today: ISODate): string {
  const name = MEAL_LABEL[meal].toLowerCase();
  if (date === today) return name;
  if (date === addDays(today, -1)) return `yesterday's ${name}`;
  if (date === addDays(today, 1)) return `tomorrow's ${name}`;
  return `${name}, ${weekdayShort(date)} ${formatShortDate(date)}`;
}
