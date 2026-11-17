import { router } from 'expo-router';

/**
 * Leaves the morning page for a tab (the diary for yesterday, or Train) the way an ordinary tab
 * tap gets there. First back to the tabs (`dismissTo('/')`: the page, and Profile when it was
 * opened from there, leave the stack), then a plain tab change. Natively that pops the task
 * screen and switches the tab under it; on web the pop lands on Today's own history entry and
 * the tab change pushes a new one, so the browser's back returns to Today. A single
 * `dismissTo(href)` would rewrite Today's entry in place, and back would leave the app.
 * The router queues both and reduces them in order, so the second sees the tabs focused.
 */
export function leaveMorningTo(href: string) {
  router.dismissTo('/' as never);
  router.navigate(href as never);
}
