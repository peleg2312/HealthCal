import { describe, expect, it } from 'vitest';

import { planGoalLine, trendGoalLabel, trendGoalLine, trendMonth, trendMonthParts, weeklyRateText } from './goalDate';

const NOW = new Date(2026, 10, 24, 12);

describe('one goal date story', () => {
  it('a trend date is a month, never a day', () => {
    const eta = new Date(2027, 4, 22, 12);
    expect(trendMonth(eta)).toBe('May 2027');
    expect(trendMonthParts(new Date(2027, 8, 3))).toEqual({ month: 'Sep', year: '2027' });
    expect(trendGoalLabel(eta)).toBe('Goal, around May 2027');
    expect(trendGoalLine(74, eta, 'metric')).toBe('74 kg around May 2027 at your current trend.');
  });

  it('a measured rate has one decimal and "a week"', () => {
    expect(weeklyRateText(-0.19, 'metric')).toBe('−0.2 kg a week');
    expect(weeklyRateText(0.44, 'metric')).toBe('+0.4 kg a week');
    expect(weeklyRateText(-0.04, 'metric')).toBe('0 kg a week');
    expect(weeklyRateText(-0.5, 'imperial')).toBe('−1.1 lb a week');
  });

  it("the plan's date is the plan reveal's range, and names the pace only when it is not the chosen one", () => {
    // 78.8 to 74 kg at 0.4 kg a week: 12 weeks, a band from 9.6 to 16 weeks.
    expect(planGoalLine(78.8, 74, -0.4, 'metric', NOW)).toBe('On this plan, 74 kg between late January and mid March 2027.');
    expect(planGoalLine(78.8, 74, -0.27, 'metric', NOW, true)).toMatch(/^On this plan, about 0\.3 kg a week: 74 kg (between|around) .*2027\.$/);
    expect(planGoalLine(78.8, 74, 0.2, 'metric', NOW)).toBeNull();
    expect(planGoalLine(78.8, undefined, -0.4, 'metric', NOW)).toBeNull();
    expect(planGoalLine(74.3, 74, -0.4, 'metric', NOW)).toBe('You are within half a kilo of 74 kg.');
  });
});
