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
 * The part of a food's name before its first comma outside brackets: "Banana" for "Banana, raw",
 * "Israeli salad (tomato, cucumber, onion, oil, lemon)" whole (its commas are inside the brackets),
 * "Sushi roll" for "Sushi roll, California (crab, avocado, cucumber)". The whole name when it starts
 * with a comma. A bracket left open (a name someone typed) holds the rest of the name.
 */
export function foodNameHead(name: string): string {
  const whole = name.replace(/\s+/g, ' ').trim();
  let depth = 0;
  for (let i = 0; i < whole.length; i++) {
    const c = whole[i];
    if (c === '(' || c === '[') depth++;
    else if ((c === ')' || c === ']') && depth > 0) depth--;
    else if (c === ',' && depth === 0) return whole.slice(0, i).trim() || whole;
  }
  return whole;
}

/** Shortened at a word with "…", never inside a bracket: a cut that leaves a bracket open ends before it. */
function shortenAtWord(text: string): string {
  const cut = text.slice(0, TOAST_NAME_MAX);
  const atWord = cut.lastIndexOf(' ');
  let kept = atWord > TOAST_NAME_MAX / 2 ? cut.slice(0, atWord) : cut;
  const open = Math.max(kept.lastIndexOf('('), kept.lastIndexOf('['));
  if (open > 0 && !/[)\]]/.test(kept.slice(open))) kept = kept.slice(0, open);
  return `${kept.replace(/[\s,.;:(\[–-]+$/, '')}…`;
}

/**
 * A food's name as a toast says it, never cut inside brackets: the part before the first comma
 * outside brackets (`foodNameHead`: "Banana" for "Banana, raw", "Greek yogurt" for "Greek yogurt,
 * plain, 2%"); when that is longer than `TOAST_NAME_MAX` letters and holds a bracket, the words before
 * the bracket ("Israeli salad" for "Israeli salad (tomato, cucumber, onion, oil, lemon)"); else, past
 * `TOAST_NAME_MAX` letters, shortened at a word with "…". Isolated when it is written in Hebrew or
 * Arabic. Pass the name as it is drawn (`displayFoodName`).
 */
export function toastFoodName(name: string): string {
  const head = foodNameHead(name);
  if (head.length <= TOAST_NAME_MAX) return isolateRtl(head);
  const bracket = head.search(/[([]/);
  const before = bracket > 0 ? head.slice(0, bracket).trim() : '';
  if (before && before.length <= TOAST_NAME_MAX) return isolateRtl(before);
  return isolateRtl(shortenAtWord(before || head));
}

/** "Banana added to breakfast", "Banana added to yesterday's lunch": `where` is `mealOnDay`. */
export function foodAddedToast(name: string, where: string): string {
  return `${toastFoodName(name)} added to ${where}`;
}

/**
 * A deleted entry, said in the words of its meal card's Restore row: "Almonds removed from breakfast",
 * "Banana removed from yesterday's lunch". `where` is `mealOnDay` of the entry.
 */
export function entryRemovedToast(name: string, where: string): string {
  return `${toastFoodName(name)} removed from ${where}`;
}

/**
 * An edit of an entry, saved: "Israeli salad moved to lunch", "Banana moved to yesterday's lunch" when its meal or
 * day changed, else "Israeli salad updated in lunch" (its amount or numbers). `where` is `mealOnDay` after the edit.
 */
export function entryUpdatedToast(name: string, moved: boolean, where: string): string {
  return `${toastFoodName(name)} ${moved ? 'moved to' : 'updated in'} ${where}`;
}

/** A quick add: its name when one was typed ("Birthday cake added to snacks"), else its calories ("320 kcal added to lunch"). */
export function quickAddedToast(name: string, kcal: number, where: string): string {
  return name.trim() ? foodAddedToast(name, where) : `${formatNumber(Math.round(kcal))} kcal added to ${where}`;
}

/**
 * A glass from Today, the + sheet, the Water screen or the reminder: "250 ml added to Water", on another day
 * "250 ml added to Water for yesterday" (or "for Sat Nov 14"); the glass that reaches the goal adds ". Goal
 * reached". `volume` is already formatted in the person's units. With `total` (the day's water against its
 * goal as the water row prints it, `waterOfGoal`) the toast names the new total too, the same on every way
 * in: "250 ml added to Water · 1.48 of 3.3 L", and "· 3.3 of 3.3 L, goal reached" for the glass that
 * reaches the goal; the total never breaks over two lines.
 */
export function waterAddedToast(volume: string, date: ISODate, today: ISODate, reaches = false, total?: string): string {
  const day = date === today ? '' : date === addDays(today, -1) ? ' for yesterday' : ` for ${weekdayShort(date)} ${formatShortDate(date)}`;
  const full = withWaterTotal(`${volume} added to Water${day}`, reaches, total);
  if (!total || full.length <= WATER_TOAST_LINE) return full;
  // Longer than the line that fits beside Undo at 360 px (fluid ounces: "12 fl oz added to Water · 53 of 112 fl oz"):
  // the same facts without "added", when that keeps it to one line ("12 fl oz to Water · 53 of 112 fl oz").
  const brief = withWaterTotal(`${volume} to Water${day}`, reaches, total);
  return brief.length <= WATER_TOAST_LINE ? brief : full;
}

/**
 * The longest water toast, in characters, that keeps to one line beside its Undo on a 360 px phone: the metric
 * glass, "250 ml added to Water · 1.48 of 3.3 L" (37).
 */
export const WATER_TOAST_LINE = 37;

/**
 * The water toast in fewer words, for large text (the kit toast's `short`): "250 ml added, 1.48 of 3.3 L", so
 * at 200% on a 320 px phone it keeps to two lines and finds room clear of the glass it rose from. The spoken
 * toast is still `waterAddedToast`.
 */
export function waterAddedShort(volume: string, date: ISODate, today: ISODate, reaches = false, total?: string): string {
  const day = date === today ? '' : date === addDays(today, -1) ? ' for yesterday' : ` for ${weekdayShort(date)} ${formatShortDate(date)}`;
  const line = `${volume} added${day}`;
  if (total) return `${line}, ${total.replace(/ /g, '\u00A0')}${reaches ? ', goal reached' : ''}`;
  return `${line}${reaches ? '. Goal reached' : ''}`;
}

/**
 * The end of every toast that adds water (`waterAddedToast`, and a drink with calories from the Water
 * screen: "Milk, 129 kcal, added to lunch and 250 ml to Water · 1.48 of 3.3 L"): the day's new total
 * against its goal when it is known, ", goal reached" for the glass that reaches it; without a total,
 * ". Goal reached" alone.
 */
export function withWaterTotal(line: string, reaches: boolean, total?: string): string {
  // The total is held on one line (no-break spaces), so a two-line toast breaks before it, never inside "1.48 of 3.3 L".
  if (total) return `${line} · ${total.replace(/ /g, '\u00A0')}${reaches ? ', goal reached' : ''}`;
  return `${line}${reaches ? '. Goal reached' : ''}`;
}
