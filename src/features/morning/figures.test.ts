import { describe, expect, it } from 'vitest';

import { budgetShare, hoursAndMinutes, logMealTitle, spokenHours, waterFigures } from './figures';

describe('waterFigures', () => {
  it('puts the amount in the goal unit, litres for a goal of a litre or more', () => {
    expect(waterFigures(2400, 2600, 'metric')).toEqual({ value: '2.4', goal: '2.6 L', spokenUnit: 'litres' });
    expect(waterFigures(800, 2600, 'metric').value).toBe('0.8');
    expect(waterFigures(2030, 3300, 'metric').value).toBe('2.0');
    expect(waterFigures(2450, 2500, 'metric')).toEqual({ value: '2.5', goal: '2.5 L', spokenUnit: 'litres' });
    expect(waterFigures(0, 2000, 'metric')).toEqual({ value: '0.0', goal: '2 L', spokenUnit: 'litres' });
    expect(waterFigures(12_500, 2600, 'metric').value).toBe('12.5');
  });

  it('uses ml when the goal is under a litre', () => {
    expect(waterFigures(450, 750, 'metric')).toEqual({ value: '450', goal: '750 ml', spokenUnit: 'millilitres' });
  });

  it('uses fl oz in imperial, one decimal under 10', () => {
    expect(waterFigures(2602, 2602, 'imperial')).toEqual({ value: '88', goal: '88 fl oz', spokenUnit: 'fluid ounces' });
    expect(waterFigures(250, 2602, 'imperial').value).toBe('8.5');
    expect(waterFigures(0, 2602, 'imperial').value).toBe('0');
  });
});

describe('spokenHours', () => {
  it('says hours and minutes in words', () => {
    expect(spokenHours(7 + 20 / 60)).toBe('7 hours 20 minutes');
    expect(spokenHours(7)).toBe('7 hours');
    expect(spokenHours(1)).toBe('1 hour');
    expect(spokenHours(0.75)).toBe('45 minutes');
    expect(spokenHours(1 + 1 / 60)).toBe('1 hour 1 minute');
  });
});

describe('logMealTitle', () => {
  it('names the meal, a snack with its article', () => {
    expect(logMealTitle('breakfast')).toBe('Log breakfast');
    expect(logMealTitle('lunch')).toBe('Log lunch');
    expect(logMealTitle('dinner')).toBe('Log dinner');
    expect(logMealTitle('snack')).toBe('Log a snack');
  });
});

describe('budgetShare and hoursAndMinutes', () => {
  it('the share of the day\'s own budget, whole percent', () => {
    expect(budgetShare(2062, 2170)).toBe(95);
    expect(budgetShare(2850, 2190)).toBe(130);
    expect(budgetShare(0, 2190)).toBe(0);
    expect(budgetShare(2000, 0)).toBeNull();
    // One share for one day on every screen: 89.6% is 89 (no on-budget mark), never 90; just above is 101.
    expect(budgetShare(1961, 2190)).toBe(89);
    expect(budgetShare(1971, 2190)).toBe(90);
    expect(budgetShare(2191, 2190)).toBe(101);
    expect(budgetShare(2190, 2190)).toBe(100);
  });
  it('sleep in hours and minutes, as the lists say it', () => {
    expect(hoursAndMinutes(7.5)).toEqual({ h: 7, m: 30 });
    expect(hoursAndMinutes(5.67)).toEqual({ h: 5, m: 40 });
    expect(hoursAndMinutes(8)).toEqual({ h: 8, m: 0 });
    expect(hoursAndMinutes(0.75)).toEqual({ h: 0, m: 45 });
  });
});
