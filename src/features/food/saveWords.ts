/**
 * The words for saving meals: the AI review's "Also save as a meal" switch and its button, the toast
 * after logging and saving in one act, the default names, and the diary's one-time hint. Pure, so every
 * string is tested (saveWords.test.ts: the examples, and no "!" or banned word anywhere). The favourite
 * words are builder two's, in ./favoriteWords.ts.
 *
 * Names a person or the AI wrote go into a line through `isolateRtl` at the caller or here (the toast);
 * screen-reader labels keep the raw name.
 */
import { withWater } from '@/features/drinks/diary';
import { isWaterDrinkEntry } from '@/features/drinks/via';
import { foodNameHead } from '@/features/food/addedTo';
import { isolateRtl } from '@/lib/bidi';
import { MEAL_LABEL } from '@/lib/nutrition';
import { MAX_CONTENT_WIDTH } from '@/theme/tokens';
import type { FoodEntry, MealType, UnitSystem } from '@/types';

/**
 * The AI review's switch: log, and keep the result as one of my meals. These words name the switch only;
 * while it is on, the name field takes the words' place beside the switch with a name of its own
 * ("Meal name for Saved meals", `SaveMealRow`), so two controls never share one name.
 */
export const SAVE_TOGGLE = 'Also save as a meal';
/** The name field's placeholder, shown only while the field is empty. */
export const SAVE_NAME_PLACEHOLDER = 'Meal name';
/** A saved meal's name is at most this long (the diary's save sheet and the AI review). */
export const SAVE_NAME_MAX = 60;

/** The review's one button: today's titles while the switch is off, "Add to lunch and save" while it is on. */
export function aiAddTitle(o: { sample: boolean; save: boolean; meal: string }): string {
  const meal = o.meal.toLowerCase();
  if (o.save && !o.sample) return `Add to ${meal} and save`;
  return o.sample ? `Add sample to ${meal}` : `Add to ${meal}`;
}

/** "1 item" / "3 items". */
export function itemCount(n: number): string {
  return `${n} ${n === 1 ? 'item' : 'items'}`;
}

/**
 * How long the toast after an AI save may be, in characters, so it keeps to two lines: 58 in the
 * toast at 320 px, where its 13 px label beside Undo is 187 px wide and takes about 30 characters a
 * line (measured with the app's font in a browser, Latin and Hebrew names alike).
 */
export const SAVED_TOAST_BUDGET = 58;
/**
 * Characters the two lines gain for each px of window past 320 (the label widens with the window, up
 * to the toast's cap at the content's 560 px). Measured with the app's font over 4 and 12 items, every
 * meal, today, yesterday and a weekday, no water, ml and fl oz, and Latin and Hebrew names: 360 px
 * holds 69 and 390 px 78 in two lines.
 */
const BUDGET_PER_PX = 0.29;
/** Fewer letters of the name than this and the toast says "meal saved" instead of a stub ("Sh…"). */
const NAME_MIN_LETTERS = 4;

/** The toast's budget at a window width (read when the toast is raised; 320 px when unknown): 58 at 320, 69 at 360, 78 at 390. */
export function savedToastBudget(windowWidth?: number | null): number {
  const w = typeof windowWidth === 'number' && Number.isFinite(windowWidth) && windowWidth > 0 ? windowWidth : 320;
  return Math.max(0, SAVED_TOAST_BUDGET + Math.floor((Math.min(w, MAX_CONTENT_WIDTH) - 320) * BUDGET_PER_PX));
}

/** A name cut to at most `max` characters at a word, with an ellipsis; whole when it fits. */
export function shortName(name: string, max: number): string {
  const clean = name.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const room = clean.slice(0, Math.max(1, max - 1));
  // A room that ends where a word ends keeps that word.
  const space = clean[room.length] === ' ' ? room.length : room.lastIndexOf(' ');
  const cut = (space >= Math.min(6, room.length - 1) ? room.slice(0, space) : room).replace(/[\s,;:.&-]+$/, '');
  return `${cut}…`;
}

/** The letters and digits a shortened name still shows (the ellipsis, spaces and marks do not count). */
function lettersShown(short: string): number {
  return short.replace(/[^\p{L}\p{N}]/gu, '').length;
}

/**
 * The one toast after the AI review logged and saved: "4 items added to lunch, saved as "Chicken and
 * rice"", with the water a swapped drink added ("…, 250 ml to Water"). `where` is the meal and, off
 * today, the day ("lunch, Sat Nov 14"). Two lines at most at the window's width (`width`, read when the
 * toast is raised; 320 px when not given): the name is shortened at a word with "…" (never the count,
 * the meal or the water) to the budget, and left out ("meal saved") only when fewer than 4 of its
 * letters would show.
 */
export function addedAndSavedToast(o: { count: number; where: string; name: string; ml?: number | null; units?: UnitSystem; width?: number | null }): string {
  const units = o.units ?? 'metric';
  const added = `${itemCount(o.count)} added to ${o.where}`;
  const room = savedToastBudget(o.width) - withWater(`${added}, saved as ""`, o.ml, units).length;
  const whole = o.name.replace(/\s+/g, ' ').trim();
  const short = whole.length <= room ? whole : room > 1 ? shortName(whole, room) : '';
  if (!short || (short !== whole && lettersShown(short) < NAME_MIN_LETTERS)) return withWater(`${added}, meal saved`, o.ml, units);
  return withWater(`${added}, saved as "${isolateRtl(short)}"`, o.ml, units);
}

/**
 * The name the review offers for the saved meal: the AI's dish, spaces collapsed, at most 60
 * characters cut at a word (and no dangling ",", "and", "with" or "&"); with no dish the first item's
 * name by the same rule; with nothing, "Saved meal".
 */
export function aiMealName(dish: string | undefined | null, items: readonly { name: string }[]): string {
  const tidy = (s: string | undefined | null) => {
    const clean = (s ?? '').replace(/\s+/g, ' ').trim();
    if (clean.length <= SAVE_NAME_MAX) return clean;
    const room = clean.slice(0, SAVE_NAME_MAX + 1);
    const space = room.lastIndexOf(' ');
    let cut = (space > 0 ? room.slice(0, space) : clean.slice(0, SAVE_NAME_MAX)).trim();
    for (;;) {
      const next = cut.replace(/(,|\s+and|\s+with|\s+&)$/i, '').trim();
      if (next === cut) break;
      cut = next;
    }
    return cut;
  };
  return tidy(dish) || tidy(items.find((it) => it.name.trim())?.name) || 'Saved meal';
}

/**
 * The name the diary's save sheet offers: the first three foods' names (each up to its first comma
 * outside brackets, `foodNameHead`), or, when they run over 40 characters, "My lunch". Drinks logged on Water are left out, as the save
 * leaves them out.
 */
export function defaultMealName(entries: readonly Pick<FoodEntry, 'name' | 'via'>[], meal: MealType): string {
  const joined = saveSheetFoods(entries).slice(0, 3).join(', ');
  return !joined || joined.length > 40 ? `My ${MEAL_LABEL[meal].toLowerCase()}` : joined;
}

/** The diary's one-time hint, and the permanent row in Saved meals: "Save lunch as a meal". */
export function saveHintLabel(meal: MealType): string {
  return `Save ${MEAL_LABEL[meal].toLowerCase()} as a meal`;
}

/** The hint's screen-reader label: what it does and what for. */
export function saveHintA11y(meal: MealType): string {
  return `${saveHintLabel(meal)}, to log the same foods again later`;
}

/** The hint's quiet dismiss, a short text action (never an X under the entries' delete X). */
export const SAVE_HINT_NOT_NOW = 'Not now';
export const SAVE_HINT_NOT_NOW_A11Y = 'Not now, hide this tip';

/** The save sheet's title: "Save lunch as a meal" (it can be opened from search, where the meal is not on screen). */
export function saveSheetTitle(meal: MealType): string {
  return saveHintLabel(meal);
}

/**
 * The save sheet's line over the name: "3 items · ~640 kcal. Find it any time in Saved meals." (Logging
 * it from Saved meals asks once more, so it never promises one tap.)
 */
export function saveSheetLine(count: number, kcal: string, estimate: boolean): string {
  return `${itemCount(count)} · ${estimate ? '~' : ''}${kcal} kcal. Find it any time in Saved meals.`;
}

/**
 * The save sheet's foods: each food's name up to its first comma outside brackets (`foodNameHead`, so
 * "Israeli salad (tomato, cucumber, onion, oil, lemon)" is never cut to "Israeli salad (tomato"), all
 * of them, drinks logged on Water left out.
 */
export function saveSheetFoods(entries: readonly Pick<FoodEntry, 'name' | 'via'>[]): string[] {
  return entries
    .filter((e) => !isWaterDrinkEntry(e))
    .map((e) => foodNameHead(e.name))
    .filter(Boolean);
}

/**
 * Whether the save sheet shows its bold foods line: only when the name it offers says something else
 * ("My lunch", or the first three of four foods), so the foods are never written twice, once in bold
 * and once in the field under it.
 */
export function showSaveSheetFoods(entries: readonly Pick<FoodEntry, 'name' | 'via'>[], meal: MealType): boolean {
  const foods = saveSheetFoods(entries);
  return foods.length > 0 && foods.join(', ') !== defaultMealName(entries, meal);
}

/** Every fixed string above, for the test that holds them to the house rules. */
export const SAVE_FIXED_WORDS = [SAVE_TOGGLE, SAVE_NAME_PLACEHOLDER, SAVE_HINT_NOT_NOW, SAVE_HINT_NOT_NOW_A11Y];
