/**
 * Today's Now card: the one thing for this hour, worked out from the coach's tip and the day. Pure and tested
 * (`now.test.ts`); the screen only places what it returns.
 *
 * Its sentence is the coach's own tip (`coachTip`, with the water tip left out, since the glass sits right above the
 * card) or, on a morning with nothing logged, the morning page's budget line (`targetsLine`): the card never makes a
 * claim of its own. Its actions are at most two, each on the page once: What fits, always, last (so it is always in
 * the same place, and it is the way into What fits on day one and above the budget; the protein tip opens it protein
 * first), and before it at most one action of the hour, the first that applies:
 * - Repeat: the meal the coach asks about, or else the meal of the hour, while it is empty and a previous one exists
 *   (the meal's row then has no Repeat of its own);
 * - Share: in the late evening (`isLateEvening`) on a day with food logged;
 * - Weigh in: in the morning while today has no weigh-in;
 * - the tip's own action where it leads somewhere the page does not (Log activity, See your week); a tip whose action
 *   is food search is left out, since the meal rows' "+" and the tab bar's + do that.
 * The heading names the meal the card is about ("Dinner · now"), "Your day · wrap-up" in the late evening, or
 * "Your day" above the budget. */
import { MEAL_LABEL } from '@/lib/nutrition';
import type { MealType } from '@/types';

import type { CoachTip } from './coach';

export type NowAction =
  | { kind: 'repeat'; meal: MealType }
  | { kind: 'share' }
  | { kind: 'weigh' }
  | { kind: 'fits'; proteinFirst: boolean }
  | { kind: 'link'; label: string; href: string };

export interface NowInput {
  /** The coach's tip for the hour, with the water tip left out (`coachTip(..., { water: false })`). */
  tip: CoachTip;
  /** The meal of the hour (`mealForTime`), the meal the + sheet adds to. */
  mealNow: MealType;
  /** `isLateEvening`: dinner's usual time is 90 minutes gone. */
  late: boolean;
  /** Food logged today (`hasFoodLogged`: drinks from Water do not count). */
  foodLogged: boolean;
  /** Above today's budget (calories left below zero). */
  over: boolean;
  /** Meals with food logged today. */
  logged: ReadonlySet<MealType>;
  /** Meals with a previous one to repeat (`findPreviousMeal` within its days). */
  repeatable: ReadonlySet<MealType>;
  /** Today has a weigh-in. */
  weighed: boolean;
  /** The morning page's budget line ("Today's budget: 2,160 kcal and 152 g of protein."), null without a budget. */
  targets: string | null;
}

export interface NowPlan {
  /** The card's overline: "Dinner · now", "Your day · wrap-up", "Your day". */
  heading: string;
  /** The same under 360 px, beside "Ask the coach", without its second part ("Dinner", "Your day"), so it keeps one line. */
  headingShort: string;
  /** The meal the card is about, tagged "Now" in Meals; null in the wrap-up and above the budget. */
  meal: MealType | null;
  /** The sentence: its lead (drawn strong) and the rest (may be empty). */
  title: string;
  body: string;
  /** One or two actions, What fits last: the first drawn as the outlined button, the second as a ghost one. */
  actions: NowAction[];
}

/** A coach tip's action that only opens food search for a meal: the meal rows and the tab bar's + already do. */
const isSearch = (href: string) => href.startsWith('/food/search');

const withStop = (s: string) => (/[.!?]$/.test(s) ? s : `${s}.`);

export function nowPlan(i: NowInput): NowPlan {
  const { tip } = i;
  // The meal to repeat: the one the coach asks about ("Had dinner yet?", the first log of the day), else the meal of
  // the hour; only while it is empty and there is one to repeat.
  const asked = tip.quick?.kind === 'repeat' ? tip.quick.meal : null;
  const wrap = i.late && i.foodLogged;
  const candidate = asked ?? (wrap ? null : i.mealNow);
  const repeat = candidate && !i.logged.has(candidate) && i.repeatable.has(candidate) ? candidate : null;
  const morning = i.mealNow === 'breakfast';

  // What fits is always offered, last, so it is always in the same place (and the way into What fits on day one and
  // above the budget); before it at most one action of the hour. The protein tip opens it protein first.
  const fits: NowAction = { kind: 'fits', proteinFirst: tip.quick?.kind === 'fits' };
  const own: NowAction | null = tip.action && tip.quick?.kind !== 'fits' && !isSearch(tip.action.href) ? { kind: 'link', label: tip.action.label, href: tip.action.href } : null;
  const hour: NowAction | null = repeat
    ? { kind: 'repeat', meal: repeat }
    : wrap
      ? { kind: 'share' }
      : morning && !i.weighed
        ? { kind: 'weigh' }
        : own;
  const actions: NowAction[] = hour ? [hour, fits] : [fits];

  const meal = repeat ?? (wrap || i.over ? null : i.mealNow);
  const heading = meal ? `${MEAL_LABEL[meal]} · now` : wrap ? 'Your day · wrap-up' : 'Your day';
  // A morning with nothing logged reads the day's budget, as the morning page does; a day that closed within budget
  // keeps the coach's own line about it.
  const start = tip.id === 'start' && i.targets;
  return {
    heading,
    headingShort: meal ? MEAL_LABEL[meal] : 'Your day',
    meal,
    title: start ? i.targets! : withStop(tip.title),
    body: start ? '' : tip.body,
    actions,
  };
}

/** The Repeat button's words: "Repeat · 744 kcal" (its meal is the card's heading). */
export function repeatTitle(kcal: string): string {
  return `Repeat · ${kcal} kcal`;
}

/**
 * The Repeat button's name: its words as drawn first, unit included ("744 kcal", label in name: a control that shows
 * words is named with them), then the meal and the day it copies.
 */
export function repeatSpoken(kcal: string, when: string, meal: MealType): string {
  return `Repeat, ${kcal} kcal: ${when}'s ${MEAL_LABEL[meal].toLowerCase()}`;
}

/** The line under the sentence while Repeat is offered: what it adds ("Yesterday: Pasta, Chicken breast"). */
export function repeatFoodsLine(when: string, heads: readonly string[]): string {
  return `${when.charAt(0).toUpperCase()}${when.slice(1)}: ${heads.join(', ')}`;
}

/** The fixed words of the card's actions, in one place (held to the morning page's banned list in `now.test.ts`). */
export const NOW_WORDS = {
  fits: 'What fits',
  fitsSpoken: 'What fits: meals and foods for what is left',
  weigh: 'Weigh in',
  weighSpoken: 'Weigh in: opens Weight',
  share: 'Share',
  ask: 'Ask the coach',
  recap: 'Your week is ready',
  recapShort: 'Your week',
  recapHide: "Hide this week's check-in",
  recapHidden: 'Check-in hidden. It stays on Progress.',
  now: 'Now',
} as const;
