import { describe, expect, it } from 'vitest';

import { CHANGE_RULES, changeDirection, changeWords } from './change';

const period = '30 days';

describe('changeDirection: an arrow only for a change worth calling', () => {
  it('calories: under 100 kcal a day is a dash, however it rounds', () => {
    // The reviewer's case: +37 kcal a day on about 2,100 (2%).
    expect(changeDirection('kcal', 2103, 2066)).toBe('same');
    // 100 kcal on 2,066 is 4.8%: still a dash; 110 is 5.3%.
    expect(changeDirection('kcal', 2166, 2066)).toBe('same');
    expect(changeDirection('kcal', 2176, 2066)).toBe('up');
    expect(changeDirection('kcal', 1956, 2066)).toBe('down');
  });

  it('calories: 100 kcal is not enough when it is under 5% of a large budget', () => {
    // 110 on 3,000 is 3.7%.
    expect(changeDirection('kcal', 3110, 3000)).toBe('same');
    expect(changeDirection('kcal', 3160, 3000)).toBe('up');
  });

  it('protein: 5 g and 5%', () => {
    expect(changeDirection('protein', 146, 142)).toBe('same');
    expect(changeDirection('protein', 150, 142)).toBe('up');
    expect(changeDirection('protein', 60, 56)).toBe('same'); // 4 g
    expect(changeDirection('protein', 40, 34)).toBe('up'); // 6 g, 18%
  });

  it('weight trend: 0.3 kg, with no share (5% of a body would hide every change)', () => {
    expect(changeDirection('weight', 79.0, 79.2)).toBe('same');
    expect(changeDirection('weight', 78.9, 79.2)).toBe('down');
    expect(changeDirection('weight', 79.5, 79.2)).toBe('up');
    expect(CHANGE_RULES.weight.share).toBe(0);
  });

  it('a share of days: 10 points', () => {
    expect(changeDirection('share', 9 / 29, 7 / 29)).toBe('same');
    expect(changeDirection('share', 12 / 29, 7 / 29)).toBe('up');
    expect(changeDirection('share', 0.2, 0.3)).toBe('down');
  });

  it('minutes and sleep: 15 minutes and 5%', () => {
    expect(changeDirection('minutes', 218, 205)).toBe('same');
    expect(changeDirection('minutes', 230, 205)).toBe('up');
    expect(changeDirection('minutes', 400, 382)).toBe('same'); // 18 min, 4.7%
    expect(changeDirection('sleep', 7.1, 7.0)).toBe('same');
    expect(changeDirection('sleep', 7.5, 7.1)).toBe('up');
    expect(changeDirection('sleep', 6.6, 7.1)).toBe('down');
  });

  it('water in millilitres: 100 ml and 5%', () => {
    expect(changeDirection('waterMl', 2390, 2310)).toBe('same');
    expect(changeDirection('waterMl', 2500, 2310)).toBe('up');
  });

  it('a count of days in a week: any whole day', () => {
    expect(changeDirection('days', 1, 3)).toBe('down');
    expect(changeDirection('days', 3, 3)).toBe('same');
  });

  it('from nothing, the size alone decides', () => {
    expect(changeDirection('minutes', 60, 0)).toBe('up');
    expect(changeDirection('minutes', 10, 0)).toBe('same');
  });

  it('null when either value is missing', () => {
    expect(changeDirection('kcal', null, 2000)).toBeNull();
    expect(changeDirection('kcal', 2000, undefined)).toBeNull();
    expect(changeDirection('kcal', Number.NaN, 2000)).toBeNull();
  });
});

describe('changeWords: the change said with its size', () => {
  it('says a change that earns an arrow with its direction and size', () => {
    expect(changeWords('kcal', 2303, 2066, { period })).toBe('Up 237 kcal a day from the previous 30 days');
    expect(changeWords('weight', 78.6, 79.2, { period, units: 'metric' })).toBe('Down 0.6 kg from the previous 30 days');
    expect(changeWords('sleep', 7.5, 7.1, { period })).toBe('Up 24 min a night from the previous 30 days');
    expect(changeWords('minutes', 250, 205, { period })).toBe('Up 45 min a week from the previous 30 days');
    expect(changeWords('protein', 130, 142, { period })).toBe('Down 12 g a day from the previous 30 days');
  });

  it('says a small change as about the same, with its size, so the dash hides nothing', () => {
    expect(changeWords('kcal', 2103, 2066, { period })).toBe('About the same as the previous 30 days: up 37 kcal a day');
    expect(changeWords('kcal', 2066.2, 2066, { period })).toBe('The same as the previous 30 days');
  });

  it('says a share of days as the two shares', () => {
    expect(changeWords('share', 0.31, 0.2, { period, subject: 'Days the water goal was reached' })).toBe('Days the water goal was reached up from 20% to 31%, against the previous 30 days');
    expect(changeWords('share', 0.31, 0.28, { period, subject: 'Days the water goal was reached' })).toBe('Days the water goal was reached: 31%, about the same as the previous 30 days (28%)');
  });

  it('says a week total against the week before without "a week" twice', () => {
    expect(changeWords('minutes', 305, 260, { period: 'week', than: 'the week before', total: true })).toBe('Up 45 min from the week before');
    expect(changeWords('days', 1, 3, { period: 'week', than: 'the week before' })).toBe('Down 2 days from the week before');
  });

  it('uses the person’s units', () => {
    expect(changeWords('weight', 78.6, 79.2, { period, units: 'imperial' })).toBe('Down 1.3 lb from the previous 30 days');
  });

  it('null when either value is missing', () => {
    expect(changeWords('kcal', null, 2000, { period })).toBeNull();
  });
});
