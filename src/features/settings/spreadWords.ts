/**
 * The words under Goals' "Workout calories" choice (Over 7 days | Same day). Pure, so they are tested
 * without the screen. The rule itself is `@/lib/exerciseBudget`.
 */
import type { ExerciseRule } from '@/lib/exerciseBudget';

/** What the rule on screen does, said always. */
export function spreadRuleNote(rule: ExerciseRule): string {
  return rule === 'week'
    ? 'Each workout adds a seventh of its calories above resting to its own day and each of the six days after it.'
    : 'Each workout adds its calories above resting to its own day.';
}

/**
 * The second sentence, said only while the choice on screen differs from the saved one and both add
 * (turning adding off or on applies to today at once and needs no words). `fromTomorrow`: the change
 * starts tomorrow because a workout is dated today (`effectiveFrom`).
 */
export function spreadChangeNote(saved: ExerciseRule, next: ExerciseRule, fromTomorrow: boolean): string | null {
  if (saved === next || saved === 'off' || next === 'off') return null;
  // The first sentence (spreadRuleNote) already says which days a workout reaches; this one says only
  // when the change starts and what it means for the first week, in the same terms.
  if (next === 'week') {
    return fromTomorrow
      ? 'Starts with tomorrow’s workouts; today’s workout stays on today. The first week adds less, and the rest arrives in the six days after your last workout.'
      : 'Starts with today’s workouts. The first week adds less, and the rest arrives in the six days after your last workout.';
  }
  return fromTomorrow
    ? 'Starts with tomorrow’s workouts. Today’s workout and those of the last 6 days keep sharing over their week.'
    : 'Starts today. Workouts from the last 6 days keep sharing over their week.';
}
