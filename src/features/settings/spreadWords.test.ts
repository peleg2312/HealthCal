import { describe, expect, it } from 'vitest';

import { spreadChangeNote, spreadRuleNote } from './spreadWords';

describe('Goals: the words under "Workout calories"', () => {
  it('says what each rule does', () => {
    expect(spreadRuleNote('week')).toMatch(/seventh/);
    expect(spreadRuleNote('day')).toMatch(/its own day\.$/);
  });

  it('adds when a change starts only while the choice differs and both add', () => {
    expect(spreadChangeNote('day', 'day', false)).toBeNull();
    expect(spreadChangeNote('off', 'week', false)).toBeNull();
    expect(spreadChangeNote('week', 'off', true)).toBeNull();
    expect(spreadChangeNote('day', 'week', false)).toMatch(/^Starts with today’s workouts\./);
    expect(spreadChangeNote('day', 'week', true)).toMatch(/^Starts with tomorrow’s workouts; today’s workout stays on today\./);
    expect(spreadChangeNote('week', 'day', true)).toMatch(/^Starts with tomorrow’s workouts\. Today’s workout and those of the last 6 days keep sharing over their week\./);
    expect(spreadChangeNote('week', 'day', false)).toMatch(/^Starts today\. Workouts from the last 6 days keep sharing over their week\./);
  });

  it('describes the window in the same terms as the rule sentence (its own day and the six after)', () => {
    // The change sentence must not describe the window as starting the day after a workout.
    for (const t of [true, false]) {
      const note = spreadChangeNote('day', 'week', t) ?? '';
      expect(note).not.toMatch(/7 days after each workout/);
      expect(note).toMatch(/six days after your last workout/);
    }
    // Switching back names one start date, never both.
    expect(spreadChangeNote('week', 'day', true)).not.toMatch(/today \(|if you have/);
    expect(spreadChangeNote('week', 'day', false)).not.toMatch(/tomorrow/);
  });

  it('never says "should", "failed" or an exclamation mark', () => {
    const all = [spreadRuleNote('week'), spreadRuleNote('day'), spreadChangeNote('day', 'week', false), spreadChangeNote('day', 'week', true), spreadChangeNote('week', 'day', false), spreadChangeNote('week', 'day', true)].join(' ');
    expect(all).not.toMatch(/should|fail|!/i);
  });
});
