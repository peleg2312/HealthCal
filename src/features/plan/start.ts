/**
 * Started once at app start from the root layout, beside startCoach: the plan's device copy (asked at
 * sign-in and on a return after five minutes, wiped with the account) and the one more look a late
 * checkout takes on the next return to the front. Returns the way to stop, for tests.
 */
import { startPlanCache } from './cache';
import { watchLateCheckout } from './checkout';

let stop: (() => void) | null = null;

export function startPlan(): () => void {
  if (stop) return stop;
  const a = startPlanCache();
  const b = watchLateCheckout();
  stop = () => {
    a();
    b();
    stop = null;
  };
  return stop;
}
