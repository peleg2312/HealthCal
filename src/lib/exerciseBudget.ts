/**
 * How a workout's calories reach the budget. Pure: no React, no store.
 *
 * A day's net workout calories N(x) (kcalNet, above resting, from activities
 * that exist: never assumed) are placed by the rule of the day they were done:
 * - 'day':  all of N(x) on day x.
 * - 'week': N(x) cut into seven whole shares (`spreadShares`), one for x and one
 *           for each of the six days after it.
 * - 'off':  nothing anywhere.
 * A receiving day whose own rule is 'off' takes nothing. Because the giving day
 * decides and an 'off' day takes nothing, each workout is placed once: switching
 * between rules never counts a workout twice. Over any stretch with no switch
 * the calories added equal the workouts' net calories, except for the shares
 * still in flight at the two edges.
 *
 * The rule of a day: whether it adds at all comes from its day snapshot
 * (`DaySnapshot.eatBackExercise`), else from the profile as it stood then; how it
 * spreads comes only from the synced profile (`exerciseRuleHistory`, closed
 * periods written only by a Goals save through `withRuleChange`, and after the
 * last period the current `exerciseSpread`). A change between 'week' and 'day'
 * starts today, or tomorrow when a workout is dated today (`effectiveFrom`), so a
 * save never moves the budget of today or of any earlier day. Turning adding off
 * or on applies to today at once, as the target in today's snapshot changes too.
 *
 * Two things known and left as they are:
 * - The learned expenditure (`adaptiveTdee`) reads each workout on its own date
 *   and is not changed for 'week'. Its observed non-exercise expenditure is
 *   energy balance over 28 days; with 'week' the shares still in flight make the
 *   intake side lag, which biases it by at most 6/7 of a change in weekly net
 *   burn, divided by 28, per day, times the estimate's confidence (at most 0.85),
 *   plus the target's own 10 kcal rounding. "A change in weekly net burn" is the
 *   largest swing in net burn over any 7-day window, not the average weekly burn:
 *   one 1,500 kcal hike every 10 days counts as 1,500 (bound 50 kcal, and a
 *   simulation reaches it), although it averages about 1,050 a week.
 *   Measured on a simulated person (selectors.test.ts, "learned expenditure"): the
 *   target moves by -10 to +20 kcal against 'day', inside its own 10 kcal rounding,
 *   and the weight path is the same.
 * - Switching to 'off' with the learned expenditure on: an 'off' target adds the
 *   28-day average net burn ending yesterday (selectors.ts, computeEnergyModel),
 *   and workouts already placed by 'day' or 'week' before the switch also enter
 *   that average. A 'day' workout the day before the switch is counted about
 *   twice in all, a 'week' workout on the sixth day before about 1.68 times. This
 *   was so before 'week' existed and is not changed here.
 */
import { addDays } from '@/lib/dates';
import type { DaySnapshot, ISODate, Profile } from '@/types';

export type ExerciseRule = 'day' | 'week' | 'off';

/** Days a 'week' workout is shared over: its own day and the six after it. */
export const SPREAD_DAYS = 7;

/**
 * `total` rounded and cut into `n` whole shares that sum to it exactly
 * (none negative for a total of 0 or more). 400 gives [57,57,57,57,57,57,58].
 */
export function spreadShares(total: number, n: number = SPREAD_DAYS): number[] {
  const t = Math.round(total);
  const out: number[] = [];
  for (let k = 0; k < n; k++) out.push(Math.floor((t * (k + 1)) / n) - Math.floor((t * k) / n));
  return out;
}

type RuleFields = Pick<Profile, 'eatBackExercise' | 'exerciseSpread' | 'exerciseRuleHistory'>;

/** The profile's current rule. The boolean wins whenever it says off, so an older app that only knows it still turns adding off and on. */
export function exerciseRuleOf(p: Pick<Profile, 'eatBackExercise' | 'exerciseSpread'>): ExerciseRule {
  if (!p.eatBackExercise) return 'off';
  return p.exerciseSpread === 'week' ? 'week' : 'day';
}

/**
 * The profile's rule on day `x`: the closed period that covers it (the entry
 * with the smallest `until` after `x`), else the current rule.
 */
export function profileRuleOn(p: RuleFields, x: ISODate): ExerciseRule {
  let found: { until: ISODate; rule: ExerciseRule } | null = null;
  for (const e of p.exerciseRuleHistory ?? []) {
    if (x < e.until && (!found || e.until < found.until)) found = e;
  }
  return found ? found.rule : exerciseRuleOf(p);
}

/**
 * The rule of each day: 'off' when it does not add (its snapshot says so, or
 * without a snapshot the profile's rule then was 'off'), else the spread the
 * profile had on that day.
 */
export function dayRuleFor(profile: RuleFields, snapshotByDate: Map<ISODate, Pick<DaySnapshot, 'eatBackExercise'>>): (x: ISODate) => ExerciseRule {
  const cache = new Map<ISODate, ExerciseRule>();
  return (x) => {
    const hit = cache.get(x);
    if (hit) return hit;
    const fromProfile = profileRuleOn(profile, x);
    const snapshot = snapshotByDate.get(x);
    const adds = snapshot ? snapshot.eatBackExercise : fromProfile !== 'off';
    const rule: ExerciseRule = !adds ? 'off' : fromProfile === 'week' ? 'week' : 'day';
    cache.set(x, rule);
    return rule;
  };
}

export interface ExercisePlacement {
  /** The rule of the day itself. */
  rule: ExerciseRule;
  /** From the day's own workouts. */
  own: number;
  /** From workouts on the six days before. */
  carry: number;
  /** own + carry: what the day's budget gains. */
  added: number;
}

/** What workouts add to `date`'s budget, unrounded. `netByDate` is `exerciseByDate(live activities)`. */
export function exercisePlaced(date: ISODate, netByDate: Record<ISODate, number>, ruleOf: (x: ISODate) => ExerciseRule): ExercisePlacement {
  const rule = ruleOf(date);
  if (rule === 'off') return { rule, own: 0, carry: 0, added: 0 };
  let own = 0;
  let carry = 0;
  for (let k = 0; k < SPREAD_DAYS; k++) {
    const x = k === 0 ? date : addDays(date, -k);
    const n = netByDate[x];
    if (!n) continue;
    const giver = k === 0 ? rule : ruleOf(x);
    if (giver === 'day') {
      if (k === 0) own += n;
    } else if (giver === 'week') {
      const share = spreadShares(n)[k];
      if (k === 0) own += share;
      else carry += share;
    }
  }
  return { rule, own, carry, added: own + carry };
}

/**
 * One word for the rules of several days (a range on Progress, a recap's week, the dates an import
 * saves to): 'off' when none of them adds, 'day' or 'week' when every day that adds has that
 * spread, 'mixed' when both appear. Words about a range use it, so a range across a switch is
 * never described by today's rule alone.
 */
export function rangeRule(rules: Iterable<ExerciseRule>): ExerciseRule | 'mixed' {
  let day = false;
  let week = false;
  for (const r of rules) {
    if (r === 'day') day = true;
    else if (r === 'week') week = true;
  }
  return day && week ? 'mixed' : week ? 'week' : day ? 'day' : 'off';
}

/**
 * `rangeRule` over the rules the given dates have (`dayRuleFor`): how workouts saved to those dates are
 * placed, for words about them (an import of older workouts may land in a period with another rule).
 */
export function ruleOfDates(profile: RuleFields, snapshotByDate: Map<ISODate, Pick<DaySnapshot, 'eatBackExercise'>>, dates: Iterable<ISODate>): ExerciseRule | 'mixed' {
  const of = dayRuleFor(profile, snapshotByDate);
  return rangeRule(Array.from(dates, of));
}

/** About what a 'week' workout adds to each of its seven days, for words only. */
export function dailyShare(net: number): number {
  return Math.round(net / SPREAD_DAYS);
}

/**
 * The first day a change of rule applies to. A change between 'day' and 'week'
 * waits for tomorrow when a workout is dated today, so today's budget never
 * moves on a save; turning adding off or on applies today, as it always has.
 */
export function effectiveFrom(prev: ExerciseRule, next: ExerciseRule, today: ISODate, hasWorkoutToday: boolean): ISODate {
  return prev !== 'off' && next !== 'off' && hasWorkoutToday ? addDays(today, 1) : today;
}

/**
 * The three rule fields a Goals save writes, for the rule `next` chosen on screen. When the rule does
 * not change they are the saved profile's own, never the screen's copy: a draft opened before a pull
 * may carry an older history, and writing it would reopen closed periods and move past budgets.
 * When it changes, `withRuleChange` rebuilds them from the saved profile.
 */
export function ruleFieldsOnSave(saved: RuleFields, next: ExerciseRule, today: ISODate, hasWorkoutToday: boolean): RuleFields {
  const prev = exerciseRuleOf(saved);
  if (prev === next) return { eatBackExercise: saved.eatBackExercise, exerciseSpread: saved.exerciseSpread, exerciseRuleHistory: saved.exerciseRuleHistory };
  return withRuleChange(saved, next, effectiveFrom(prev, next, today, hasWorkoutToday));
}

/** Most closed periods kept; the oldest is dropped and its days take the next one's rule. */
export const RULE_HISTORY_MAX = 60;

/**
 * The profile patch for a change to rule `next` from day `from` (`effectiveFrom`).
 * Days before `from` keep the rule they had; neighbours with the same rule merge,
 * so going back and forth on one day leaves no history.
 */
export function withRuleChange(p: RuleFields, next: ExerciseRule, from: ISODate): RuleFields {
  const before = profileRuleOn(p, addDays(from, -1));
  const kept = (p.exerciseRuleHistory ?? [])
    .filter((e) => e.until < from)
    .sort((a, b) => a.until.localeCompare(b.until))
    .map((e) => ({ until: e.until, rule: e.rule }));
  if (before !== next) {
    const last = kept[kept.length - 1];
    if (last && last.rule === before) last.until = from;
    else kept.push({ until: from, rule: before });
  }
  while (kept.length > RULE_HISTORY_MAX) kept.shift();
  const exerciseRuleHistory = kept.length ? kept : undefined;
  if (next === 'off') return { eatBackExercise: false, exerciseSpread: p.exerciseSpread, exerciseRuleHistory };
  return { eatBackExercise: true, exerciseSpread: next, exerciseRuleHistory };
}
