/**
 * The friends overview's meal parts as the screens draw them: the service fills every field (`toOverview`),
 * typed optional only so a hand-built overview still type-checks; here each reads as its default when absent.
 */
import type { Friend, FriendsOverview, SocialMe } from '@/services/friends';

import { DEFAULT_MEAL_SETTINGS, type FeedItem, type MealSettings, type MySharedMeal } from './contract';

export interface MealsMe extends SocialMe {
  mealSettings: MealSettings;
  /** 18 or over, as the server reads the profile's birth date: false hides every meal control. */
  mealsAllowed: boolean;
  /** The friends picked last time (still friends). */
  audience: string[];
}

export interface MealsOverview {
  me: MealsMe | null;
  friends: Friend[];
  feed: FeedItem[];
  myMeals: MySharedMeal[];
  /** False while the server has no meals yet (an older server): settings say so and every meal control hides. */
  mealsAvailable: boolean;
  /** Whether the screens' words speak of meals (`mealsInWords`). */
  mealWords: boolean;
}

/** The overview's meal parts, with the defaults for anything absent. Meals are allowed only where the server has them. */
export function mealsOverview(overview: FriendsOverview | null): MealsOverview {
  const m = overview?.me;
  const mealsAvailable = overview?.mealsAvailable !== false;
  const me = m ? { ...m, mealSettings: m.mealSettings ?? DEFAULT_MEAL_SETTINGS, mealsAllowed: mealsAvailable && m.mealsAllowed === true, audience: m.audience ?? [] } : null;
  return {
    me,
    friends: overview?.friends ?? [],
    feed: overview?.feed ?? [],
    myMeals: mealsAvailable ? (overview?.myMeals ?? []) : [],
    mealsAvailable,
    mealWords: mealsInWords({ me, mealsAvailable }),
  };
}

/**
 * Whether the Friends screens' words speak of meals (the header's line, the remove and leave words, the set-up's
 * note, the empty feed): only where meals can work for this person, so no line promises what settings say is not
 * there. False on a server without meals and, once the card is loaded, for someone meals are not allowed to
 * (under 18, or no birth date); before the card loads (set-up, signed out) it follows the server alone.
 */
export function mealsInWords(o: Pick<MealsOverview, 'me' | 'mealsAvailable'>): boolean {
  return o.mealsAvailable && (o.me === null || o.me.mealsAllowed);
}
