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
}

/** The overview's meal parts, with the defaults for anything absent. */
export function mealsOverview(overview: FriendsOverview | null): MealsOverview {
  const m = overview?.me;
  return {
    me: m ? { ...m, mealSettings: m.mealSettings ?? DEFAULT_MEAL_SETTINGS, mealsAllowed: m.mealsAllowed === true, audience: m.audience ?? [] } : null,
    friends: overview?.friends ?? [],
    feed: overview?.feed ?? [],
    myMeals: overview?.myMeals ?? [],
  };
}
