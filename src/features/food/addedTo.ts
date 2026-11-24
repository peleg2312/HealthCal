/**
 * Where a log went, in the words of the toast after it: "lunch" on today,
 * "yesterday's lunch", "tomorrow's lunch", else "lunch, Sat Nov 14". Built from
 * the entry's own date and the day it is now (read when the food is logged, in
 * the handler, never while rendering), so logging to a day that is not today is
 * never silent. The toast names what was added first, in the same order as a
 * saved meal's ("Banana added to breakfast", "Usual breakfast added to
 * breakfast"). No React, unit-tested.
 */
import { isolateRtl } from '@/lib/bidi';
import { addDays, formatShortDate, weekdayShort } from '@/lib/dates';
import { MEAL_LABEL } from '@/lib/nutrition';
import { formatNumber } from '@/lib/units';
import type { ISODate, MealType } from '@/types';

export function mealOnDay(meal: MealType, date: ISODate, today: ISODate): string {
  const name = MEAL_LABEL[meal].toLowerCase();
  if (date === today) return name;
  if (date === addDays(today, -1)) return `yesterday's ${name}`;
  if (date === addDays(today, 1)) return `tomorrow's ${name}`;
  return `${name}, ${weekdayShort(date)} ${formatShortDate(date)}`;
}

/** How many letters of a food's name a toast keeps before it shortens it at a word. */
export const TOAST_NAME_MAX = 32;

/**
 * A food's name as a toast says it: the part before the first comma ("Banana" for "Banana, raw",
 * "Greek yogurt" for "Greek yogurt, plain, 2%"), shortened at a word with "…" past
 * `TOAST_NAME_MAX` letters, and isolated when it is written in Hebrew or Arabic. Pass the name as
 * it is drawn (`displayFoodName`).
 */
export function toastFoodName(name: string): string {
  const whole = name.replace(/\s+/g, ' ').trim();
  const head = whole.split(',')[0].trim() || whole;
  if (head.length <= TOAST_NAME_MAX) return isolateRtl(head);
  const cut = head.slice(0, TOAST_NAME_MAX);
  const atWord = cut.lastIndexOf(' ');
  return isolateRtl(`${(atWord > TOAST_NAME_MAX / 2 ? cut.slice(0, atWord) : cut).replace(/[\s,.;:–-]+$/, '')}…`);
}

/** "Banana added to breakfast", "Banana added to yesterday's lunch": `where` is `mealOnDay`. */
export function foodAddedToast(name: string, where: string): string {
  return `${toastFoodName(name)} added to ${where}`;
}

/** A quick add: its name when one was typed ("Birthday cake added to snacks"), else its calories ("320 kcal added to lunch"). */
export function quickAddedToast(name: string, kcal: number, where: string): string {
  return name.trim() ? foodAddedToast(name, where) : `${formatNumber(Math.round(kcal))} kcal added to ${where}`;
}

/**
 * A glass from Today or the + sheet: "250 ml added to Water", on another day "250 ml added to Water for
 * yesterday" (or "for Sat Nov 14"); the glass that reaches the goal adds ". Goal reached". `volume` is
 * already formatted in the person's units.
 */
export function waterAddedToast(volume: string, date: ISODate, today: ISODate, reaches = false): string {
  const day = date === today ? '' : date === addDays(today, -1) ? ' for yesterday' : ` for ${weekdayShort(date)} ${formatShortDate(date)}`;
  return `${volume} added to Water${day}${reaches ? '. Goal reached' : ''}`;
}
