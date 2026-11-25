/**
 * The browser tab's title for every route on the web ("Water · HealthCal"), so a screen reader names the
 * page on every move, and history, bookmarks and tabs tell the pages apart (WCAG 2.4.2 Page titled).
 *
 * One pure map from the router's pathname (and the few search params that decide what a screen is for) to
 * the page's name, in the words of its own header where that header has fixed words. Titles never hold
 * anything the person wrote or anything from their data (a name, a food, a meal name): a tab title ends up
 * in browser history and on a shared screen. A param that a screen changes in place without changing the
 * address (search's meal tabs, photo's Photo and Describe) is not read, so a title never goes stale.
 *
 * `RouteTitle` (`./RouteTitle.tsx`) sets it through expo-router's `Head`, web only. A new route adds its
 * line here; `routeTitle.test.ts` fails for a file in `src/app` without one, and for two routes that share
 * a title.
 */
import { SIGN_IN } from '@/features/auth/words';
import { COACH_TITLE } from '@/features/coach/words';
import { PLAN_TITLE } from '@/features/plan/words';

export const APP_TITLE = 'HealthCal';
export const NOT_FOUND_TITLE = 'Page not found';

type Params = Record<string, string | string[] | undefined>;

function param(params: Params, key: string): string | undefined {
  const v = params[key];
  const one = Array.isArray(v) ? v[0] : v;
  return one ? one : undefined;
}

/** Each route's page name. A function reads the search params that decide which screen it is. */
const PAGES: Record<string, string | ((params: Params) => string)> = {
  '/': 'Today',
  '/diary': 'Diary',
  '/train': 'Train',
  '/progress': 'Progress',
  '/welcome': 'Welcome',
  '/auth': (p) => {
    const mode = param(p, 'mode');
    return mode === 'signup' ? 'Create an account' : mode === 'forgot' ? 'Reset password' : SIGN_IN;
  },
  '/onboarding': 'Set up',
  '/food/search': 'Search foods',
  '/food/detail': (p) => (param(p, 'entryId') ? 'Edit entry' : 'Add food'),
  '/food/scan': 'Scan barcode',
  '/food/photo': 'AI estimate',
  '/food/quick': 'Quick add',
  '/food/custom': (p) => (param(p, 'id') ? 'Edit food' : 'Create a food'),
  '/food/meals': 'Saved meals',
  '/food/meal-edit': (p) => (param(p, 'id') ? 'Edit meal' : 'New meal or recipe'),
  '/food/meal-pick': 'Add to meal',
  '/food/journal': 'Meal photos',
  '/activity/pick': 'Log activity',
  '/activity/log': (p) => (param(p, 'entryId') ? 'Edit workout' : 'Log a workout'),
  '/activity/strength': (p) => (param(p, 'entryId') ? 'Edit strength workout' : 'Strength workout'),
  '/activity/import': 'Import workouts',
  '/water': 'Water',
  '/weight': 'Weight',
  '/body': 'Body',
  '/sleep': 'Sleep',
  '/fasting': 'Fasting',
  '/profile': 'Profile',
  '/settings/goals': 'Goals',
  '/settings/reminders': 'Reminders',
  '/settings/account': 'Account and sync',
  '/settings/data': 'Your data',
  '/settings/about': 'About',
  '/settings/health-sync': 'Workout sync',
  '/settings/plan': PLAN_TITLE,
  '/legal/terms': 'Terms of use',
  '/legal/privacy': 'Privacy',
  '/morning': 'Your morning',
  '/coach': COACH_TITLE,
  '/recap': 'Weekly check-in',
  '/recap/month': 'Month in cups',
  '/recap/year': 'Year in cups',
  '/consistency': 'Consistency',
  '/friends': 'Friends',
  '/friends/add': 'Add a friend',
  '/_sitemap': 'Sitemap',
};

/** The router's pathname as the map keys it: no query, no trailing slash, '/' for the root. */
export function routeKey(pathname: string): string {
  const path = (pathname.split(/[?#]/)[0] || '/').replace(/\/+$/, '');
  return path === '' ? '/' : path.startsWith('/') ? path : `/${path}`;
}

/** True when the route has a title of its own (every route file in src/app does). */
export function hasRouteTitle(pathname: string): boolean {
  return Object.prototype.hasOwnProperty.call(PAGES, routeKey(pathname));
}

/** The page's name: "Water". An address no route answers is "Page not found", as the screen says. */
export function pageTitle(pathname: string, params: Params = {}): string {
  const key = routeKey(pathname);
  const page = Object.prototype.hasOwnProperty.call(PAGES, key) ? PAGES[key] : NOT_FOUND_TITLE;
  return typeof page === 'function' ? page(params) : page;
}

/** The document title: the page first, so it reads first in a tab and to a screen reader. */
export function documentTitle(pathname: string, params: Params = {}): string {
  return `${pageTitle(pathname, params)} · ${APP_TITLE}`;
}
