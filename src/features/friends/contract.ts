/**
 * The friends meals types the screens use, from FRIENDS-SERVER's shared types (`@/types`) and wire rules
 * (`@/services/friendsWire`), so the screens import them from one place.
 */
export type { FeedItem, FeedMeal, FeedWorkout, FriendPerson, MealSettings, MySharedMeal, SharedFoodSource, SharedMeal, SharedMealItem } from '@/types';
export { DEFAULT_MEAL_SETTINGS } from '@/services/friendsWire';
