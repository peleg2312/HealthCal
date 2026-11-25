/**
 * Every word the home-screen widget draws or says. Pure, tested (words.test.ts: the examples, and no
 * "!", no "over", no banned word in any string). Worded as Today words the same figures: "941 kcal
 * left", "130 kcal above" (never "over", never a verdict), "1,219 eaten of 2,160" (the budget said
 * once), "1.48 of 3.3 L" (`waterOfGoal`). Spoken labels say their units in full (`spokenUnits`).
 */
import { formatShortDate, weekdayShort } from '@/lib/dates';
import { spokenUnits } from '@/lib/spokenUnits';
import { formatNumber, formatVolume } from '@/lib/units';
import type { ISODate, UnitSystem } from '@/types';

/** The date the numbers are for, on every drawing: "Wed, Nov 25". The widget can be a refresh behind midnight, so it never says "Today". */
export function widgetDate(date: ISODate): string {
  return `${weekdayShort(date)}, ${formatShortDate(date)}`;
}

/** The word under "kcal" beside the big number, as on Today. */
export function kcalWord(over: boolean): 'left' | 'above' {
  return over ? 'above' : 'left';
}

/** "1,219 eaten of 2,160": the budget (the target plus what workouts add), said once, as Today's cup says it. */
export function eatenLine(eaten: number, budget: number): string {
  return `${formatNumber(Math.round(eaten))} eaten of ${formatNumber(Math.round(budget))}`;
}

/** The calorie half as a screen reader hears it, then where a tap goes. */
export function kcalSpoken(remaining: number, eaten: number, budget: number, added: number): string {
  const left = formatNumber(Math.abs(Math.round(remaining)));
  const where = remaining < 0 ? `${left} kilocalories above the day's budget` : `${left} kilocalories left`;
  const sum = added > 0 ? `, about ${formatNumber(Math.round(added))} of it added by workouts` : '';
  return `${where}. ${formatNumber(Math.round(eaten))} eaten of a ${formatNumber(Math.round(budget))} kilocalorie budget${sum}. Open Today`;
}

/** The water figures' caption: what they are, or that the goal is reached (said plainly, as Water says it). */
export function waterCaption(reached: boolean): string {
  return reached ? 'Goal reached' : 'Water';
}

/** The water half as a screen reader hears it: "Water, 1.48 of 3.3 litres. Open Water". */
export function waterSpoken(line: string, reached: boolean): string {
  return `Water, ${spokenUnits(line)}${reached ? ', goal reached' : ''}. Open Water`;
}

/** The glass as drawn: "+ 250 ml", "+ 12 fl oz". */
export function glassLabel(ml: number, units: UnitSystem): string {
  return `+ ${formatVolume(ml, units)}`;
}

/** The glass as heard: "Add 250 ml of water" (its drawn words, so voice control finds it by what it shows). */
export function glassSpoken(ml: number, units: UnitSystem): string {
  return `Add ${formatVolume(ml, units)} of water`;
}

/** The water caption for a few minutes after a glass from the widget: "250 ml added". */
export function addedCaption(ml: number, units: UnitSystem): string {
  return `${formatVolume(ml, units)} added`;
}

export const UNDO_WORD = 'Undo';

/** The Undo as heard: "Undo 250 ml of water". */
export function undoSpoken(ml: number, units: UnitSystem): string {
  return `Undo ${formatVolume(ml, units)} of water`;
}

/** The whole widget as a screen reader hears it on entering it. */
export function rootSpoken(date: ISODate, kcal: string, water: string): string {
  const strip = (s: string) => s.replace(/\. Open (Today|Water)$/, '');
  return `HealthCal, ${widgetDate(date)}. ${strip(kcal)}. ${strip(water)}.`;
}

/** Before set-up is finished there is nothing to count: the whole widget opens the app. */
export const SETUP_TITLE = 'Set up HealthCal';
export const SETUP_LINE = 'Calories left and water show here after set-up.';

/** The device's saved data could not be read for this drawing: no number is shown, the app is one tap away. */
export const OPEN_TITLE = 'Open HealthCal';
export const OPEN_LINE = 'To see today, open the app.';

/** A glass could not be saved on the phone (storage full, or a write that failed). No number is shown. */
export const NOT_SAVED_TITLE = 'Not saved';
export const NOT_SAVED_LINE = 'Open HealthCal to add the glass there.';

/** The spoken name of a message drawing: its two lines, then where a tap goes. */
export function messageSpoken(title: string, line: string): string {
  return `HealthCal. ${title}. ${line} Open HealthCal`;
}

/** Profile's row that places the widget (Android only). */
export const ROW_TITLE = 'Home screen widget';
export const ROW_LINE = 'Calories left and water, with a one-tap glass';
export const ROW_PLACED = 'On your home screen. Tap to add another';
/** Said where the launcher cannot place a widget for an app: how to add it from the home screen itself. */
export const ROW_HOW_TO_ADD = 'Add it from your home screen: hold an empty spot, tap Widgets, then HealthCal.';
export const ROW_HOW_TO_ADD_SHORT = 'Add it from your home screen’s Widgets list';
