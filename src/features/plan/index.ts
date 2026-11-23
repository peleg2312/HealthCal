/**
 * Plans: the plan as the app shows it. The plan is decided on the server only (the billing function);
 * this is a display copy and the screens that show it. Everything is off while the server says
 * `plansOn: false` and the person holds no plan (ruling R14).
 *
 * - `usePlan()` the plan as last known for the signed-in account (`known` false, plan 'free' and the
 *   everyday allowance 40 / 30 / 3 until an answer or a stored answer for this account).
 * - `refreshPlan()` asks the billing function; never throws (on failure: what is known).
 * - `refreshPlanAfterLimit()` for the AI estimate and the coach after a daily-limit answer.
 * - `planVisible(view)` whether any plan row, link or screen content is shown.
 * - `checkoutShown()` whether this copy may show the checkout (ruling R15).
 */
export { PLAN_FULL_NAME, PLAN_NAME, PLAN_ROUTE, checkoutBlockedHere, checkoutShown } from './channel';
export { clearPlan, planNow, refreshPlan, refreshPlanAfterLimit, usePlan } from './cache';
export { startPlan } from './start';
export {
  EVERYDAY_LIMITS,
  UNKNOWN_PLAN,
  holdsPlus,
  isEnding,
  offerFor,
  paymentLate,
  planVisible,
  viewFromStatus,
  type PlanId,
  type PlanLimits,
  type PlanOffer,
  type PlanPeriod,
  type PlanSource,
  type PlanState,
  type PlanView,
} from './view';
export { planRowLine, planShortLine } from './words';
