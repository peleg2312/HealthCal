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
import type { ISODate, MealType, NoteKind, TogetherKind } from '@/types';

import { mealOfCheer } from '@/services/friendsWire';

import { cheerTarget, dayLabel } from './week';

export const SCREEN_TITLE = 'Friends';
export const SCREEN_SUBTITLE = 'Meals, workouts and cheers';
/** The header's line where meals cannot work for this person (`mealsInWords` in ./overview: an older server, or under 18). */
export const SCREEN_SUBTITLE_WORKOUTS = 'Workouts and cheers';
export const SETTINGS_TITLE = 'Friends settings';
export const SETTINGS_SUBTITLE = 'What friends see';
export const SETTINGS_OPEN = 'Friends settings and privacy';
export const ADD = 'Add';
/** The people row's last cup, opening Add a friend (your invite and their code). */
export const INVITE = 'Invite';
export const INVITE_OPEN = 'Invite a friend or enter their code';
export const ADD_FRIEND = 'Add a friend';
export const RECENT = 'Recent';
export const RECENT_SPAN = 'Last 7 days';
export const FEED_EMPTY_TITLE = 'Nothing here yet';
export const FEED_EMPTY = 'When a friend shows a meal or logs a workout, it appears here.';
/** The empty feed while the server has no meals yet. */
export const FEED_EMPTY_WORKOUTS = 'When a friend logs a workout, it appears here.';
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
export const SHOW_KCAL_OFF = 'Foods and their portions';
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
export const NEVER_SHARED = 'Never shared, whatever you choose here: your weight, body measurements, notes, heart rate, the time of day, your day’s total and your budget.';
export const LEAVE_TITLE = 'Turn friends off';
export const LEAVE_NOTE = 'Removes your card, every friendship, every cheer and every meal you show. Your own data on this phone is not touched.';
export const LEAVE_CONFIRM = 'This removes your card and code, every friendship, every cheer and every meal you show, for you and for them. It cannot be undone, though you can turn friends on again later with a new code.';
/** "Turn friends off"'s note: the meal clause only where meals work for this person (`mealsInWords`). */
export const leaveNote = (meals: boolean) => (meals ? LEAVE_NOTE : 'Removes your card, every friendship and every cheer. Your own data on this phone is not touched.');
/** Its confirmation, the same way. */
export const leaveConfirm = (meals: boolean) =>
  meals ? LEAVE_CONFIRM : 'This removes your card and code, every friendship and every cheer, for you and for them. It cannot be undone, though you can turn friends on again later with a new code.';
/** The toast once friends are off. */
export const leftToast = (meals: boolean) => `Friends turned off. Your card, friendships${meals ? ', cheers and meals' : ' and cheers'} were removed.`;
export const AUDIENCE_TITLE = 'Who sees your meals';
export const AUDIENCE_NOTE = 'Picked here for the next meal you show. A meal already shown keeps its own people until you change it.';
export const AUDIENCE_SAVE = 'Save';
export const UNDER_18 = 'Showing and seeing meals is for people aged 18 and over. Workouts and cheers work as before.';
/** Friends settings, and a meal call's answer, while the server has no meals yet (an app update can arrive before it). */
export const MEALS_NOT_YET = 'Showing meals to friends is not available yet. Workouts and cheers work as before.';
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
export function aboutYouLine(sharing: { workouts: boolean; streak: boolean; minutes: boolean }, shown: number, viewers: readonly string[], mealsAllowed: boolean, withNever = true): string {
  const parts = [sharing.minutes ? 'active minutes' : null, sharing.workouts ? 'workouts' : null, sharing.streak ? 'streak' : null].filter(Boolean) as string[];
  const week = parts.length === 0 ? 'Your name.' : parts.length === 1 ? `Your ${parts[0]}.` : `Your ${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}.`;
  const meals = !mealsAllowed
    ? ''
    : shown === 0
      ? ' A meal when you show one.'
      : ` A meal when you show one: ${shown} showing now${viewers.length ? `, to ${namesLine(viewers)}` : ''}.`;
  return `${week}${meals}${withNever ? ' Never your weight or your day’s total.' : ''}`;
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
export const seesMyMealsTitle = (name: string) => `${isolateRtl(name)} can see meals I show`;
/** The second switch. */
export const theirMealsTitle = (name: string) => `${isolateRtl(name)}’s meals in my feed`;

/** Under Remove friend; the meal sentence only where meals work for this person (`mealsInWords`). */
export const removeNote = (name: string, meals = true) => `${isolateRtl(name)} is not told.${meals ? ' Meals between you stop showing at once.' : ''}`;

/** Remove friend's confirmation. */
export const removeConfirm = (meals: boolean) =>
  `You stop seeing each other’s week${meals ? ' and meals' : ''}, and the cheers between you are removed. They are not told, and you can add each other again with a code.`;

/** The toast once a friend is removed ("Maya is no longer a friend. Cheers between you were removed too."). */
export const removedToast = (name: string, meals: boolean) => `${name} is no longer a friend. ${meals ? 'Cheers and meals' : 'Cheers'} between you were removed too.`;

/** The line under the set-up's switches: what is never shared, and when a meal leaves the phone (only where meals work). */
export const neverSharedLine = (meals: boolean) => `Your weight and your day’s total are never shared, whatever you choose here.${meals ? ' A meal leaves the phone when you show it.' : ''}`;

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

// ------------------------------------------------------------------ the feed, round 2

/**
 * The Friends header's line: news, not a description. "3 friends · 2 new today", "1 friend", "No friends yet".
 * `newToday` counts today's items not seen at the last look (`newTodayCount`), never a figure about anyone.
 */
export function feedNewsLine(friends: number, newToday: number): string {
  if (friends === 0) return 'No friends yet';
  const who = `${friends} ${friends === 1 ? 'friend' : 'friends'}`;
  return newToday > 0 ? `${who} · ${newToday} new today` : who;
}

/** What a feed item is, as the object of a sentence: "Maya’s lunch", "Maya’s running". */
export function itemWhat(name: string, item: { kind: 'meal'; meal: MealType } | { kind: 'workout'; name: string }): string {
  const what = item.kind === 'meal' ? (item.meal === 'snack' ? 'snacks' : MEAL_LABEL[item.meal].toLowerCase()) : item.name.toLowerCase();
  return `${name}’s ${what}`;
}

/** A Cheer cup's name (it shows no words): "Cheer Maya’s lunch", or once done "You cheered Maya’s lunch". */
export const cheerCupLabel = (what: string, cheered: boolean) => (cheered ? `You cheered ${what}` : `Cheer ${what}`);

/** The "+" cup's name on a friend's meal: "Add Maya’s lunch to my diary". */
export const addCupLabel = (what: string) => `Add ${what} to my diary`;

/** The cheers chip's name: its words, then where it leads ("3 cheers for you. See who cheered"). */
export const cheersChipLabel = (n: number) => `${cheersTitle(n)}. See who cheered`;

/** The empty Friends screen: the invite is the main action. */
export const INVITE_TITLE = 'Invite a friend';
export const INVITE_LINE = 'Send your link or show your code. What friends show you appears here once you are friends.';
export const ENTER_THEIR_CODE = 'Enter their code';

// ------------------------------------------------------------------ show a meal from Friends

/** The shortcut on Friends: "Show today’s lunch to friends". */
export const showShortcutTitle = (meal: MealType) => `Show today’s ${meal === 'snack' ? 'snacks' : MEAL_LABEL[meal].toLowerCase()} to friends`;

// ------------------------------------------------------------------ add a friend, both ways

export const ADD_SUBTITLE = 'Invite or enter a code';
export const YOUR_INVITE = 'Your invite';
/** The invite goes out through the phone's share sheet, so here the word is "share". */
export const SHARE_INVITE = 'Share invite link';
export const COPY = 'Copy';
export const INVITE_NOTE = 'Next to someone? They point their phone’s camera at this code. A friend is added once you accept.';
export const QR_LABEL = 'QR code of your invite link';
export const OR_THEIR_CODE = 'Or enter their code';
export const CODE_LABEL = 'Their code';
/** Says the shape, never a code that could be read as one already typed. */
export const CODE_PLACEHOLDER = '8 letters and digits';
export const CODE_PLACEHOLDER_SHORT = '8 characters';
export const PASTE = 'Paste';
export const HELP = 'Help';
export const NOBODY_SEARCHES = 'Nobody can find you by searching. Friends add you by your code or your link.';
export const DECLINED_NOTE = 'Declined someone? Their code adds them back. They were never told.';

// ------------------------------------------------------------------ a friend's page, round 2

/** The overline of their week card: "Maya’s week". */
export const weekOf = (name: string) => `${isolateRtl(name)}’s week`;
/** The section with their meals and workouts together: "Maya shows you". */
export const theyShowYou = (name: string) => `${isolateRtl(name)} shows you`;
export const MANAGE = 'Manage';
/** The Manage row's line: what is behind it. */
export const manageLine = (meals: boolean, notes = false) =>
  notes ? (meals ? 'Meals and notes between you, or remove' : 'Notes from them, or remove') : meals ? 'Meals between you, or remove' : 'Remove friend';
/** The Manage sheet's title: "You and Maya". */
export const manageTitle = (name: string) => `You and ${isolateRtl(name)}`;
/** The two switches, worded for what On does. */
export const seesMyMealsOn = (name: string) => `${isolateRtl(name)} is offered each time you show a meal`;
export const theirMealsOn = (name: string) => `Meals ${isolateRtl(name)} shows you appear in Friends`;
/** Nothing shown by this friend in the last 7 days. */
export const nothingShownYet = (name: string) => `Nothing from ${isolateRtl(name)} in the last 7 days.`;

// ------------------------------------------------------------------ settings, round 2

export const GROUP_YOU = 'You';
export const GROUP_MEALS = 'Meals';
export const SEE_MEALS_ON = 'Meals friends show you appear with their workouts';
export const ALWAYS_SHOW_HINT = 'Tap a meal to show it each day as you log it.';

// ------------------------------------------------------------------ together this week (proposal 3)
// A circle's one cup: the circle's total and its goal, members by name, never one person's figure and never an order.

/** "Active minutes", "Days logged": what fills the cup. */
export const togetherKindWord = (kind: TogetherKind) => (kind === 'minutes' ? 'Active minutes' : 'Days logged');
/** The unit after the figure: "active min", "days logged". */
export const togetherUnit = (kind: TogetherKind) => (kind === 'minutes' ? 'active min' : 'days logged');
/** The same in full, for a screen reader. */
export const togetherUnitSpoken = (kind: TogetherKind) => (kind === 'minutes' ? 'active minutes' : 'days logged');

export const TOGETHER_TITLE = 'Together this week';
export const TOGETHER_START = 'Fill a cup together';
export const TOGETHER_START_LINE = 'One weekly goal with 1 to 5 friends';
export const TOGETHER_OPEN = 'The circle';

/** The others in the circle and you: "You", "Maya and you", "Jo, Maya and you", "4 friends and you". */
export function circleNames(others: readonly string[]): string {
  if (!others.length) return 'You';
  if (others.length > 3) return `${others.length} friends and you`;
  const n = others.map((x) => isolateRtl(x.trim() || 'A friend'));
  return n.length === 1 ? `${n[0]} and you` : `${n.slice(0, -1).join(', ')}, ${n[n.length - 1]} and you`;
}

/** "3 days to go", "Last day of the week". */
export const daysToGo = (n: number) => (n <= 1 ? 'Last day of the week' : `${n} days to go`);

/** The card's line: who, and the week ("Jo, Maya and you · 3 days to go"), or the goal reached. */
export function circleLine(others: readonly string[], days: number, reached: boolean): string {
  return `${circleNames(others)} · ${reached ? 'goal reached' : daysToGo(days).toLowerCase()}`;
}

export const TOGETHER_REACHED = 'Goal reached together.';

/** The cup's name for a screen reader: "412 of 600 active minutes together this week". */
export function togetherSpoken(kind: TogetherKind, total: number, target: number, reached: boolean): string {
  return `${formatNumber(total)} of ${formatNumber(target)} ${togetherUnitSpoken(kind)} together this week${reached ? ', goal reached' : ''}`;
}

/** Last week's cup, said once, plainly: "Last week: 328 of 600 active min together." */
export const lastWeekLine = (kind: TogetherKind, total: number, target: number) => `Last week: ${formatNumber(total)} of ${formatNumber(target)} ${togetherUnit(kind)} together.`;

export const IN_THE_CIRCLE = 'In the circle';
export const NAMES_NOTE = 'Listed by name. The cup shows the circle’s total, never one person’s figure.';
/** Who was asked and has not joined: "Asked Sam. They join when they accept." */
export const askedLine = (names: readonly string[]) => (names.length ? `Asked ${namesLine(names)}. They join when they accept.` : '');
export const CHANGE_GOAL = 'Change the goal';
export const GOAL_FROM_THIS_WEEK = 'A new goal counts from this week. Anyone in the circle can change it.';
export const SAVE_GOAL = 'Save goal';
/** "Goal saved: 480 active min a week". */
export const goalSavedToast = (kind: TogetherKind, target: number) => `Goal saved: ${formatNumber(target)} ${togetherUnit(kind)} a week`;
export const ASK_MORE = 'Ask more friends';
export const CHEER_EVERYONE = 'Cheer everyone';
/** After "Cheer everyone": "Cheer sent to 2 friends". */
export const cheeredEveryoneToast = (n: number) => (n > 0 ? `Cheer sent to ${n} ${n === 1 ? 'friend' : 'friends'}` : 'Everyone in the circle has your cheer for today');
export const LEAVE_CIRCLE = 'Leave the circle';
export const LEAVE_CIRCLE_NOTE = 'Nobody is told. The cup goes on with the others.';
export const OUT_OF_CIRCLE = 'You are out of the circle. Nobody was told.';

/** The start sheet. */
export const WHAT_FILLS = 'What fills the cup';
export const WHO_TO_ASK = 'Who to ask';
export const WHO_TO_ASK_NOTE = 'Pick 1 to 5 friends. Each joins when they accept.';
export const GOAL_FOR_WEEK = 'Goal for the week';
export const GOAL_NOTE = 'Suggested for the number of people picked.';
/** A goal choice: "480 active min", "20 days". */
export const goalChoice = (kind: TogetherKind, n: number) => (kind === 'minutes' ? `${formatNumber(n)} active min` : `${n} days`);
/** The start button names who: "Ask Maya and Sam", "Ask 4 friends", or "Pick who to ask". */
export function askButton(names: readonly string[]): string {
  if (!names.length) return 'Pick who to ask';
  return names.length > 2 ? `Ask ${names.length} friends` : `Ask ${namesLine(names)}`;
}
/** Once started: "Asked Maya and Sam. The cup fills as they join." */
export const startedToast = (names: readonly string[]) => `Asked ${names.length > 2 ? `${names.length} friends` : namesLine(names)}. The cup fills as they join.`;

/** What joining means, said before anyone joins or starts: what counts, and what the others see. */
export function countsLine(kind: TogetherKind): string {
  return kind === 'minutes'
    ? 'Your active minutes this week count toward the cup, also with Active minutes switched off for friends.'
    : 'The days you log food this week count toward the cup, never what you ate or how much.';
}
export const SEEN_NOTE = 'Everyone in the circle sees each other’s names and the cup’s total, never one person’s figure. In a circle of two, the other person can work out your figure from the total.';
export const LEAVE_ANY_TIME = 'You can leave any time, and nobody is told.';

/** An invitation. */
export const circleInviteTitle = (from: string) => `${isolateRtl(from)} asks you to fill a cup together`;
/** "600 active min a week · with Maya and Sam". */
export function circleInviteLine(kind: TogetherKind, target: number, members: readonly string[]): string {
  return `${goalChoice(kind, target)} a week${members.length ? ` · with ${namesLine(members)}` : ''}`;
}
export const JOIN = 'Join';
export const JOIN_TITLE = 'Join the circle';
export const declineCircleLabel = (from: string) => `Decline ${from}’s invitation`;
export const circleDeclinedToast = (from: string) => `Declined. ${from} is not told.`;
export const JOINED_TOAST = 'You joined. Your figure now counts toward the cup.';

// ------------------------------------------------------------------ logging together (proposal 4)

export const BUDDY_TITLE = 'Logging together';
/** The row that offers it: "Log together with Maya". */
export const buddyAsk = (name: string) => `Log together with ${isolateRtl(name)}`;
export const BUDDY_ASK_LINE = 'Which days you both logged, never what';
export const BUDDY_EXPLAIN =
  'Each day shows whether you both logged food, one of you did, or neither, never what or how much. One day a week that one of you misses is kept. Either of you can end it at any time, and nobody is told.';
export const buddyAskButton = (name: string) => `Ask ${isolateRtl(name)}`;
export const buddyAskedToast = (name: string) => `Asked ${name}. Nothing changes until they accept.`;
export const buddyAskedTitle = (name: string) => `Asked ${isolateRtl(name)} to log together`;
export const BUDDY_WAITING = 'Waiting for them to accept';
export const TAKE_BACK = 'Take back';
export const buddyInviteTitle = (name: string) => `${isolateRtl(name)} asks to log together`;
export const ACCEPT = 'Accept';
export const buddyAcceptedToast = (name: string) => `You and ${name} now log together`;
export const buddyDeclinedToast = (name: string) => `Declined. ${name} is not told.`;
/** "With Maya". */
export const buddyWith = (name: string) => `With ${isolateRtl(name)}`;
/** "4 days together this week", and "a day one of you missed is kept" when one was. */
export function buddyWeekLine(both: number, kept: boolean): string {
  return `${both} ${both === 1 ? 'day' : 'days'} together this week${kept ? ' · a day one of you missed is kept' : ''}`;
}
/** The run: "12 days in a row together", or a fresh start said plainly. */
export const buddyRunLine = (run: number) => (run > 0 ? `${formatNumber(run)} ${run === 1 ? 'day' : 'days'} in a row together` : 'A new run starts with the next day you both log');
/** One day's cup for a screen reader: "Mon, you both logged". */
export function buddyDaySpoken(weekday: string, count: 0 | 1 | 2 | null): string {
  const what = count === 2 ? 'you both logged' : count === 1 ? 'one of you logged' : count === 0 ? 'neither logged' : 'not counted';
  return `${weekday}, ${what}`;
}
export const BUDDY_STOP = 'Stop logging together';
export const buddyStopNote = (name: string) => `${isolateRtl(name)} is not told. It can start again when one of you asks and the other accepts.`;
export const buddyStoppedToast = (name: string) => `Logging together with ${name} ended`;
export const BUDDY_FULL = 'Logging together works with up to 3 friends at a time.';

// ------------------------------------------------------------------ kind notes (proposal 6)

/** The three notes, as drawn and as sent. No free text. */
export const NOTE_WORDS: Record<NoteKind, string> = { thinking_of_you: 'Thinking of you', walk_later: 'Walk later?', nice_week: 'Nice week' };
/** The notes card's heading: "Send Maya a note". */
export const noteTo = (name: string) => `Send ${isolateRtl(name)} a note`;
export const notesLine = (name: string) => `One note a day. ${isolateRtl(name)} can turn notes off, and you are not told.`;
/** Once today's note to this friend is sent: "Sent today: “Walk later?”. Another can go tomorrow." */
export const noteSentLine = (kind: NoteKind) => `Sent today: “${NOTE_WORDS[kind]}”. Another can go tomorrow.`;
export const NOTES_DAY_FULL = 'Five notes sent today. More can go tomorrow.';
export const noteSentToast = (name: string) => `Note sent to ${name}`;
/** A note button's name: its words, then who it goes to ("Walk later?, send to Maya"), or that it went today. */
export const noteButtonLabel = (kind: NoteKind, name: string, sent: boolean) => (sent ? `${NOTE_WORDS[kind]}, sent to ${name} today` : `${NOTE_WORDS[kind]}, send to ${name}`);
/** A received note, after the sender's name: " sent “Walk later?”". */
export const noteReceived = (kind: NoteKind) => `sent “${NOTE_WORDS[kind]}”`;
/** The chip by "Recent": "3 cheers for you", "1 note for you", "2 cheers · 1 note". */
export function cheersNotesTitle(cheers: number, notes: number): string {
  if (!notes) return cheersTitle(cheers);
  const n = `${notes} ${notes === 1 ? 'note' : 'notes'}`;
  return cheers ? `${cheers} ${cheers === 1 ? 'cheer' : 'cheers'} · ${n}` : `${n} for you`;
}
/** Its name: its words, then where it leads. */
export const cheersNotesLabel = (cheers: number, notes: number) => `${cheersNotesTitle(cheers, notes)}. See who sent them`;
export const CHEERS_NOTES_TITLE = 'Cheers and notes for you';
/** The Manage sheet's switch: "Notes from Maya". */
export const notesFrom = (name: string) => `Notes from ${isolateRtl(name)}`;
export const notesFromOn = (name: string) => `Notes ${isolateRtl(name)} sends appear in Friends. Not told when off`;
export const notesFromToast = (name: string, on: boolean) => (on ? `Notes from ${name} are on` : `Notes from ${name} are off. ${name} is not told.`);
export const NOTES_FROM_FRIENDS = 'Notes from friends';
export const NOTES_FROM_FRIENDS_ON = 'Notes friends send you appear in Friends. Nobody is told when they are off';
export const notesAllToast = (on: boolean) => (on ? 'Notes from friends are on' : 'Notes from friends are off. Nobody is told.');

// ------------------------------------------------------------------ saved meals (proposal 5)

export const SAVE_TO_MY_MEALS = 'Save to my meals';
/** The saved meal's name: "Maya’s lunch", "Maya’s Chicken bowl". */
export const borrowedName = (owner: string, what: string) => `${owner}’s ${what}`;
/** The "save" cup's name in a row: "Save Maya’s Chicken bowl to my meals". */
export const saveCupLabel = (what: string) => `Save ${what} to my meals`;
/** Once saved: "Saved “Maya’s lunch” to your meals", and what was left out. */
export function borrowedToast(name: string, leftOut: number): string {
  const kept = `Saved “${name}” to your meals`;
  return leftOut ? `${kept}. ${leftOut} ${leftOut === 1 ? 'food' : 'foods'} not in your food list left out` : kept;
}
export const SAVE_NONE = 'None of these foods is in your food list. Find adds them one by one.';
export const FRIENDS_SAVED_TITLE = 'Saved meals friends show you';
/** A friend's saved meal's line: "3 foods", "3 foods · makes 4 servings". */
export const savedMealLine = (count: number, servings?: number) => `${foodsCount(count)}${servings && servings > 1 ? ` · makes ${formatNumber(servings)} servings` : ''}`;
/** "Show Chicken bowl to friends". */
export const showSavedTitle = (name: string) => `Show ${isolateRtl(name)} to friends`;
export const SHOW_SAVED_NEVER = 'Never shown: macros, notes or when you eat it. It leaves their Friends after 7 days, or when you stop.';
export const savedShownToast = (name: string, names: readonly string[]) => `${name} shown to ${names.length > 2 ? `${names.length} friends` : namesLine(names)}`;
export const savedStoppedToast = (name: string) => `${name} is no longer shown`;
/** On a friend's page: "Saved meals Maya shows you". */
export const savedTheyShow = (name: string) => `Saved meals ${isolateRtl(name)} shows you`;
/** A cheer for a saved meal the user shows, as the end of a sentence: "your Chicken bowl". */
export const savedCheerTarget = (name: string) => `your ${isolateRtl(name)}`;
