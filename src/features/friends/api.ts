/**
 * The friends meals calls and overview fields the screens use, in one place (CONTRACT.md, draft 1).
 *
 * FRIENDS-SERVER is adding them to `@/services/friends` and `@/types` at the same time as these screens.
 * Until a call exists there, it answers here as "not available yet" (a failure the screens already show),
 * and a field the overview does not carry yet reads as its empty default. Once the service exports them,
 * this file only passes them through.
 */
import * as service from '@/services/friends';
import { cleanSharedMealItems } from '@/services/friendsWire';
import type { Friend, FriendsOverview, FriendsResult, SocialMe } from '@/services/friends';
import type { ISODate, MealType } from '@/types';

import { DEFAULT_MEAL_SETTINGS, type FeedItem, type MealSettings, type MySharedMeal, type SharedMealItem } from './contract';

/** A friend with my two switches for them. */
export interface MealsFriend extends Friend {
  /** "<name> sees meals I show". */
  shareMeals: boolean;
  /** "<name>'s meals in my feed". */
  seeMeals: boolean;
}

export interface MealsMe extends SocialMe {
  mealSettings: MealSettings;
  /** 18 or over, as the server reads the profile's birth date: false hides every meal control. */
  mealsAllowed: boolean;
  /** The friends picked last time (still friends). */
  audience: string[];
}

export interface MealsOverview {
  me: MealsMe | null;
  friends: MealsFriend[];
  feed: FeedItem[];
  myMeals: MySharedMeal[];
}

type Raw = Partial<{ me: Partial<MealsMe> | null; friends: Partial<MealsFriend>[]; feed: FeedItem[]; myMeals: MySharedMeal[] }>;

/** The overview's meal parts, with defaults for anything the service does not send yet. */
export function mealsOverview(overview: FriendsOverview | null): MealsOverview {
  const o = (overview ?? {}) as unknown as Raw;
  const me = overview?.me
    ? {
        ...overview.me,
        mealSettings: { ...DEFAULT_MEAL_SETTINGS, ...(o.me?.mealSettings ?? {}) },
        mealsAllowed: o.me?.mealsAllowed === true,
        audience: Array.isArray(o.me?.audience) ? o.me.audience : [],
      }
    : null;
  const friends = (overview?.friends ?? []).map((f, i) => {
    const raw = (o.friends?.[i] ?? {}) as Partial<MealsFriend>;
    return { ...f, shareMeals: raw.shareMeals !== false, seeMeals: raw.seeMeals !== false };
  });
  return { me, friends, feed: Array.isArray(o.feed) ? o.feed : [], myMeals: Array.isArray(o.myMeals) ? o.myMeals : [] };
}

interface MealCalls {
  showMeal(input: { day: ISODate; meal: MealType; items: SharedMealItem[]; showKcal: boolean; viewers: string[] }): Promise<FriendsResult<{ ref: string; expiresAt: string }>>;
  stopMeal(ref: string): Promise<FriendsResult>;
  stopAllMeals(): Promise<FriendsResult<number>>;
  setMealSettings(patch: Partial<MealSettings>): Promise<FriendsResult<MealSettings>>;
  setMealAudience(userIds: string[]): Promise<FriendsResult<string[]>>;
  setFriendMealPrefs(userId: string, prefs: { shareMeals?: boolean; seeMeals?: boolean }): Promise<FriendsResult>;
  cheerMeal(ownerId: string, ref: string): Promise<FriendsResult>;
}

const calls = service as unknown as Partial<MealCalls>;
const notYet = async () => ({ ok: false as const, reason: 'failed' as const, message: 'This part of Friends is not available yet.' });

export const showMeal: MealCalls['showMeal'] = (input) => (calls.showMeal ? calls.showMeal(input) : notYet());
export const stopMeal: MealCalls['stopMeal'] = (ref) => (calls.stopMeal ? calls.stopMeal(ref) : notYet());
export const stopAllMeals: MealCalls['stopAllMeals'] = () => (calls.stopAllMeals ? calls.stopAllMeals() : notYet());
export const setMealSettings: MealCalls['setMealSettings'] = (patch) => (calls.setMealSettings ? calls.setMealSettings(patch) : notYet());
export const setMealAudience: MealCalls['setMealAudience'] = (ids) => (calls.setMealAudience ? calls.setMealAudience(ids) : notYet());
export const setFriendMealPrefs: MealCalls['setFriendMealPrefs'] = (id, prefs) => (calls.setFriendMealPrefs ? calls.setFriendMealPrefs(id, prefs) : notYet());
export const cheerMeal: MealCalls['cheerMeal'] = (owner, ref) => (calls.cheerMeal ? calls.cheerMeal(owner, ref) : notYet());
/** The server's own cleaning (`social_clean_meal`), for the preview of exactly what friends will see. */
export { cleanSharedMealItems };
