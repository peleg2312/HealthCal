/**
 * What a screen reader hears for the week picture on the morning page: the whole row read once,
 * as one sentence per part. Pure and unit-tested (weekLabel.test.ts). Neutral words: a day above its
 * budget is "above the budget", as review.ts says it, never a verdict; units in words.
 *
 *   "Your week: 6 of 7 days logged. Yesterday 2,062 of 2,170 kilocalories, within the budget.
 *    Today so far, nothing logged."
 *
 * Every day the picture marks above its budget (the amber cap, `WeekCell.over`) is named, so the label
 * holds what the cups show: "Saturday and Sunday above the budget." for the small cups, and yesterday's
 * own standing in its sentence.
 */
import { fromISODate } from '@/lib/dates';
import { formatNumber } from '@/lib/units';

import type { WeekCell, WeekCells } from './weekCells';

function kcalOf(c: WeekCell): string {
  const about = c.approx ? 'about ' : '';
  const kcal = formatNumber(Math.round(c.kcal));
  return c.budget > 0 ? `${about}${kcal} of ${formatNumber(Math.round(c.budget))} kilocalories` : `${about}${kcal} kilocalories`;
}

/** "within the budget", "above the budget" (anything over it, `budgetMark`) or "partly logged"; empty without a budget. */
function standing(c: WeekCell): string {
  if (c.budget <= 0) return '';
  if (c.partial) return ', partly logged';
  if (c.kcal <= c.budget) return ', within the budget';
  return ', above the budget';
}

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "Saturday", "Saturday and Sunday", "Thursday, Saturday and Sunday". */
function dayList(cells: WeekCell[]): string {
  const names = cells.map((c) => WEEKDAY_NAMES[fromISODate(c.date).getDay()]);
  return names.length <= 2 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export function weekLabel(w: WeekCells): string {
  const past = w.yesterday ? [...w.before, w.yesterday] : w.before;
  const logged = past.filter((c) => c.foodLogged).length;
  const parts: string[] = [`Your week: ${logged} of ${past.length} ${past.length === 1 ? 'day' : 'days'} logged.`];
  // The small cups wearing the amber cap: named by their weekday (yesterday says its own below).
  const above = w.before.filter((c) => c.over);
  if (above.length > 0) parts.push(`${dayList(above)} above the budget.`);
  if (w.yesterday) {
    const y = w.yesterday;
    parts.push(y.foodLogged ? `Yesterday ${kcalOf(y)}${standing(y)}.` : 'Yesterday, nothing logged.');
  }
  const workouts = [...past, w.today].filter((c) => c.workout).length;
  if (workouts > 0) parts.push(workouts === 1 ? 'A workout on 1 day.' : `A workout on ${workouts} days.`);
  parts.push(w.today.foodLogged ? `Today so far, ${kcalOf(w.today)}.` : 'Today so far, nothing logged.');
  return parts.join(' ');
}
