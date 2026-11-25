/**
 * Every fixed string of the Friends screens about meals, the feed and privacy, and the small
 * functions that build their lines. Neutral and short: a meal is food, never a score; nothing
 * ranks or compares people; going over anything is never mentioned. The word is "show" (Share in
 * this app is the picture sent through the phone's share sheet). Held to the coach's banned list
 * plus words that judge food or compare people in words.test.ts. Pure.
 */
import { isolateRtl } from '@/lib/bidi';
import { MEAL_LABEL } from '@/lib/nutrition';
import { formatNumber } from '@/lib/units';
import type { ISODate, MealType } from '@/types';

import { mealOfCheer } from '@/services/friendsWire';

import { cheerTarget, dayLabel } from './week';

export const SCREEN_TITLE = 'Friends';
export const SCREEN_SUBTITLE = 'Meals, workouts and cheers';
export const SETTINGS_TITLE = 'Friends settings';
export const SETTINGS_SUBTITLE = 'What friends see';
export const SETTINGS_OPEN = 'Friends settings and privacy';
export const ADD = 'Add';
export const ADD_FRIEND = 'Add a friend';
export const RECENT = 'Recent';
export const RECENT_SPAN = 'Last 7 days';
export const FEED_EMPTY_TITLE = 'Nothing here yet';
export const FEED_EMPTY = 'When a friend shows a meal or logs a workout, it appears here.';
export const CHEER = 'Cheer';
export const CHEERED = 'Cheered';
export const ADD_TO_DIARY = 'Add to my diary';
/** The same button under 360 px, where the longer words do not fit beside Cheer. */
export const ADD_TO_DIARY_SHORT = 'Add to diary';
export const YOU_CHEERED = 'You cheered this';
export const ABOUT_YOU = 'What friends see of you';
export const PRIVACY = 'Privacy';
export const CHEERS_TITLE = 'Cheers for you';

// ------------------------------------------------------------------ showing a meal
export const MENU_SHOW = 'Show to friends';
export const MENU_SHOW_LINE = 'You pick who sees it';
export const MENU_SHOW_NONE = 'Add a friend first';
export const WHAT_THEY_SEE = 'What they see';
export const WHO_SEES = 'Who sees it';
export const WHO_NOTE = 'The friends you pick, remembered for next time.';
export const NOBODY_TO_PICK = 'Each friend is switched off for your meals. Turn one on from their page, in Between you.';
export const SHOW_KCAL = 'Show calories';
export const SHOW_KCAL_OFF = 'Off: foods and portions, no calories';
export const SHOW_KCAL_ON = 'Each food with its calories';
export const NEVER_SHOWN = 'Never shown: your day’s total, budget, weight, notes or the time you ate. It leaves their feed after 7 days, or when you stop.';
export const PICK_FIRST = 'Pick who sees it';
export const STOP_SHOWING = 'Stop showing';
export const UPDATE_SHOWN = 'Save changes';
export const SHOW_FAILED = 'The meal was not shown. Try again.';

// ------------------------------------------------------------------ a friend's meal
export const KCAL_HIDDEN = 'Calories are not shown. Adding it to your diary uses your own food list’s numbers.';
export const ADD_TITLE = 'Add to my diary';
export const FIND = 'Find';
export const NOT_IN_LIST = 'Not in your food list';

// ------------------------------------------------------------------ a friend's page
export const RECENT_WORKOUTS = 'Recent workouts';
export const BETWEEN_YOU = 'Between you';
export const REMOVE_FRIEND = 'Remove friend';

// ------------------------------------------------------------------ settings
export const YOUR_WEEK = 'Your week';
export const YOUR_MEALS = 'Your meals';
export const MEALS_INTRO = 'Off until you show one, from a meal’s menu in the diary. Each one leaves after 7 days.';
export const WHO_SEES_MEALS = 'Who sees your meals';
export const KCAL_WITH_MEALS = 'Show calories with meals';
export const ALWAYS_SHOW = 'Always show these meals';
export const SHOWING_NOW = 'Showing now';
export const NOTHING_SHOWN = 'No meal is shown right now.';
export const STOP = 'Stop';
export const STOP_ALL = 'Stop showing all meals';
export const WHAT_YOU_SEE = 'What you see';
export const SEE_MEALS = 'Friends’ meals in my feed';
export const SEE_MEALS_OFF = 'Off: workouts and cheers';
export const NEVER_SHARED = 'Never shared, whatever you choose here: your weight, body measurements, notes, heart rate, the time of day, your day’s total and your budget.';
export const LEAVE_TITLE = 'Turn friends off';
export const LEAVE_NOTE = 'Removes your card, every friendship, every cheer and every meal you show. Your own data on this phone is not touched.';
export const LEAVE_CONFIRM = 'This removes your card and code, every friendship, every cheer and every meal you show, for you and for them. It cannot be undone, though you can turn friends on again later with a new code.';
export const AUDIENCE_TITLE = 'Who sees your meals';
export const AUDIENCE_NOTE = 'Picked here for the next meal you show. A meal already shown keeps its own people until you change it.';
export const AUDIENCE_SAVE = 'Save';
export const UNDER_18 = 'Showing and seeing meals is for people aged 18 and over. Workouts and cheers work as before.';
export const SIGNED_OUT_LINE = 'See each other’s workouts, cheer them, and the meals you choose to show. Your weight and your day’s total stay private.';

/** "Lunch", "Snacks" for the four meal chips. */
export const mealChip = (m: MealType) => (m === 'snack' ? 'Snacks' : MEAL_LABEL[m]);

/** A list of names in words: "Maya", "Maya and Sam", "Maya, Sam and Jo", "Maya, Sam and 3 more". Each name isolated. */
export function namesLine(names: readonly string[], max = 3): string {
  const n = names.map((x) => isolateRtl(x.trim() || 'A friend'));
  if (n.length === 0) return '';
  if (n.length === 1) return n[0];
  if (n.length <= max) return `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`;
  return `${n.slice(0, max - 1).join(', ')} and ${n.length - (max - 1)} more`;
}

/** "1 food", "3 foods". */
export const foodsCount = (n: number) => `${n} ${n === 1 ? 'food' : 'foods'}`;

/** The line under a person on a meal card: "Lunch · Today · 3 foods". */
export function mealMeta(meal: MealType, day: ISODate, today: ISODate, count: number): string {
  return `${MEAL_LABEL[meal]} · ${dayLabel(day, today)} · ${foodsCount(count)}`;
}

/** The title of a friend's meal: "Maya's lunch". */
export const friendMealTitle = (name: string, meal: MealType) => `${isolateRtl(name)}’s ${MEAL_LABEL[meal].toLowerCase()}`;

/** The show sheet's title: "Show lunch to friends". */
export const showTitle = (meal: MealType) => `Show ${MEAL_LABEL[meal].toLowerCase()} to friends`;

/** The show sheet's line: "Today · 3 foods". */
export const showLine = (day: ISODate, today: ISODate, count: number) => `${dayLabel(day, today)} · ${foodsCount(count)}`;

/** The show button names who: "Show to Maya and Sam", "Show to 4 friends". */
export function showButton(names: readonly string[]): string {
  if (names.length === 0) return PICK_FIRST;
  if (names.length > 2) return `Show to ${names.length} friends`;
  return `Show to ${namesLine(names)}`;
}

/** Under the meal menu's row and in settings: "Shown to Maya and Sam". */
export const shownTo = (names: readonly string[]) => (names.length ? `Shown to ${namesLine(names)}` : 'Shown to nobody right now');

/** The toast once a meal is shown: "Lunch shown to Maya and Sam". */
export const shownToast = (meal: MealType, names: readonly string[]) => `${MEAL_LABEL[meal]} shown to ${names.length > 2 ? `${names.length} friends` : namesLine(names)}`;

/** The toast once a meal stops: "Lunch is no longer shown". */
export const stoppedToast = (meal: MealType) => `${MEAL_LABEL[meal]} is no longer shown`;
export const STOPPED_ALL = 'No meal is shown now';

/** A food's line on a meal card or in the sheet: the portion, and its calories when shown ("1 bowl · ~310 kcal"). */
export function itemCaption(item: { portion: string; kcal?: number; kcalLow?: number; source: string }, withKcal: boolean): string {
  if (!withKcal || typeof item.kcal !== 'number') return item.portion;
  const approx = item.source === 'ai' || typeof item.kcalLow === 'number' ? '~' : '';
  return `${item.portion} · ${approx}${formatNumber(item.kcal)} kcal`;
}

/** "3 cheers for you", "1 cheer for you". */
export const cheersTitle = (n: number) => `${n} ${n === 1 ? 'cheer' : 'cheers'} for you`;

/**
 * The cheers line in one row: who cheered what, grouped by what was cheered, newest first: "Maya and Sam:
 * your lunch · Jo: your run". `describe` names a cheer's target ("your lunch").
 */
export function cheersSummary<C extends { displayName: string; ref: string }>(cheers: readonly C[], describe: (c: C) => string): string {
  const groups = new Map<string, string[]>();
  for (const c of cheers) {
    const what = describe(c);
    const names = groups.get(what) ?? [];
    if (!names.includes(c.displayName)) names.push(c.displayName);
    groups.set(what, names);
  }
  return [...groups.entries()].map(([what, names]) => `${namesLine(names, 2)}: ${what}`).join(' · ');
}

/** A cheer for a shown meal in the user's words: "your lunch", "your dinner on Monday". */
export function mealCheerTarget(found: { day: ISODate; meal: MealType } | undefined, today: ISODate): string {
  if (!found) return 'a meal you showed';
  const name = MEAL_LABEL[found.meal].toLowerCase();
  const label = dayLabel(found.day, today);
  return label === 'Today' ? `your ${name}` : label === 'Yesterday' ? `your ${name} yesterday` : `your ${name} on ${label}`;
}

/**
 * What friends see of you, in one paragraph: the parts of the week shared, the meals shown now and to whom,
 * and what is never shared.
 */
export function aboutYouLine(sharing: { workouts: boolean; streak: boolean; minutes: boolean }, shown: number, viewers: readonly string[], mealsAllowed: boolean): string {
  const parts = [sharing.minutes ? 'active minutes' : null, sharing.workouts ? 'workouts' : null, sharing.streak ? 'streak' : null].filter(Boolean) as string[];
  const week = parts.length === 0 ? 'Your name.' : parts.length === 1 ? `Your ${parts[0]}.` : `Your ${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}.`;
  const meals = !mealsAllowed
    ? ''
    : shown === 0
      ? ' A meal when you show one.'
      : ` A meal when you show one: ${shown} showing now${viewers.length ? `, to ${namesLine(viewers)}` : ''}.`;
  return `${week}${meals} Never your weight or your day’s total.`;
}

/** "Nobody picked yet", "Maya and Sam". */
export const audienceLine = (names: readonly string[]) => (names.length ? namesLine(names) : 'Nobody picked yet');

/** Under "Always show these meals": none, or which ("Lunch, shown each day as you log it."). */
export function autoLine(auto: readonly MealType[]): string {
  if (!auto.length) return 'None. Pick a meal to show it each day as you log it, from today on.';
  const names = auto.map((m, i) => (i === 0 ? mealChip(m) : mealChip(m).toLowerCase()));
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `${list}, shown each day as you log ${names.length === 1 ? 'it' : 'them'}.`;
}

/** A shown meal's title in settings: "Breakfast · Today", "Dinner · Sun, Nov 22". */
export const myMealTitle = (meal: MealType, day: ISODate, today: ISODate) => `${MEAL_LABEL[meal]} · ${dayLabel(day, today)}`;

/** Whole days until a shown meal leaves friends' feeds, from its `expiresAt` and the clock (`useNow`). */
export function daysLeft(expiresAt: string, nowMs: number): number {
  const at = Date.parse(expiresAt);
  if (!Number.isFinite(at)) return 7;
  return Math.max(0, Math.ceil((at - nowMs) / 86_400_000));
}

/** A shown meal's line: "Maya and Sam · 2 cheers · leaves in 4 days". */
export function myMealLine(viewers: readonly string[], cheers: number, left: number): string {
  const who = viewers.length ? namesLine(viewers) : 'Nobody right now';
  const cheered = cheers ? ` · ${cheers} ${cheers === 1 ? 'cheer' : 'cheers'}` : '';
  const leaves = left <= 1 ? ' · leaves within a day' : ` · leaves in ${left} days`;
  return `${who}${cheered}${leaves}`;
}

/** The friend page's line under the name: "Friends since Nov 2". */
export const friendsSince = (date: string | null) => (date ? `Friends since ${date}` : 'Friends');

/** "Meals Maya shows you". */
export const mealsTheyShow = (name: string) => `Meals ${isolateRtl(name)} shows you`;

/** The first switch under "Between you". */
export const seesMyMealsTitle = (name: string) => `${isolateRtl(name)} sees meals I show`;
export const seesMyMealsLine = (name: string) => `Off: ${isolateRtl(name)} is left out of every meal you show`;
/** The second switch. */
export const theirMealsTitle = (name: string) => `${isolateRtl(name)}’s meals in my feed`;
export const THEIR_MEALS_OFF = 'Off: their workouts and cheers';

/** Under Remove friend. */
export const removeNote = (name: string) => `${isolateRtl(name)} is not told. Meals between you stop showing at once.`;

/** The add step's line: "From Maya's lunch". */
export const addFrom = (name: string, meal: MealType) => `From ${friendMealTitle(name, meal)}`;

/** The add step's button: "Add 2 foods to lunch · 359 kcal". */
export function addButton(count: number, meal: MealType, kcal: number): string {
  if (count === 0) return 'Tick a food to add';
  return `Add ${foodsCount(count)} to ${MEAL_LABEL[meal].toLowerCase()} · ${formatNumber(Math.round(kcal))} kcal`;
}

/** The note under the add step's list. */
export const addNote = (name: string) => `Your food list’s numbers, in ${isolateRtl(name)}’s portions. Change a portion any time after.`;

/** How the food is labelled for its source, from a friend: "Maya's own food" for one of theirs. */
export function friendSourceLabel(source: string, name: string, reference: string): string {
  return source === 'custom' ? `${isolateRtl(name)}’s own food` : reference;
}

/**
 * A received cheer's target in the user's words: a meal shown ("your lunch"), a workout ("your run") or a
 * day ("your day yesterday"). `meals` maps a shown meal's reference to its day and meal.
 */
export function cheerWhat(ref: string, own: { workouts: Map<string, { name: string }>; meals: ReadonlyMap<string, { day: ISODate; meal: MealType }> }, today: ISODate): string {
  const meal = mealOfCheer(ref);
  if (meal) return mealCheerTarget(own.meals.get(meal), today);
  return cheerTarget(ref, own.workouts, today);
}
