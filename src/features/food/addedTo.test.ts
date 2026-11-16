import { describe, expect, it } from 'vitest';

import { mealOnDay } from './addedTo';

describe('mealOnDay', () => {
  const today = '2026-11-16';
  it('is just the meal on today', () => {
    expect(mealOnDay('lunch', today, today)).toBe('lunch');
  });
  it('names yesterday and tomorrow', () => {
    expect(mealOnDay('lunch', '2026-11-15', today)).toBe("yesterday's lunch");
    expect(mealOnDay('dinner', '2026-11-17', today)).toBe("tomorrow's dinner");
  });
  it('gives the date for any other day', () => {
    expect(mealOnDay('lunch', '2026-11-14', today)).toBe('lunch, Sat Nov 14');
    expect(mealOnDay('breakfast', '2026-11-20', today)).toBe('breakfast, Fri Nov 20');
  });
  it('crosses a month on the local calendar', () => {
    expect(mealOnDay('dinner', '2026-10-31', '2026-11-01')).toBe("yesterday's dinner");
  });
});
