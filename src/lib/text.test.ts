import { describe, expect, it } from 'vitest';

import { keepTogether, keepUnitWithNumber, NBSP, WJ } from './text';

const show = (s: string) => s.replace(new RegExp(NBSP, 'g'), '_').replace(new RegExp(WJ, 'g'), '');

describe('keepTogether', () => {
  it('keeps a macro line breakable only at its separators', () => {
    expect(show(keepTogether('2,304 kcal · P 102 g · C 258 g · F 95 g'))).toBe('2,304_kcal · P_102_g · C_258_g · F_95_g');
  });
  it('keeps a portion, a slash total and a compound measure whole', () => {
    expect(show(keepTogether('1.5 × 1/2 cup · 60 g · 227 kcal'))).toBe('1.5_×_1/2_cup · 60_g · 227_kcal');
    expect(show(keepTogether('1,293 / 493 g'))).toBe('1,293_/_493_g');
    expect(show(keepTogether('Yesterday · 07:12 · 1 h 1 min · 10.33 km'))).toBe('Yesterday · 07:12 · 1_h_1_min · 10.33_km');
    expect(show(keepTogether('5 ft 5 in'))).toBe('5_ft_5_in');
    expect(show(keepTogether('Between 1 fl oz and 68 fl oz.'))).toBe('Between 1_fl_oz and 68_fl_oz.');
  });
  it('joins a range so it never breaks at its dash', () => {
    expect(keepTogether('59-79 kg')).toBe(`59${WJ}-${WJ}79${NBSP}kg`);
    expect(keepTogether('129–174 lb')).toBe(`129${WJ}–${WJ}174${NBSP}lb`);
    expect(keepTogether('the 150-minute guideline')).toBe(`the 150${WJ}-${WJ}minute guideline`);
  });
  it('keeps a count of full days whole', () => {
    expect(show(keepTogether('Week so far: on budget, 6 full days'))).toBe('Week so far: on budget, 6_full_days');
  });
  it('leaves words and dates alone', () => {
    expect(keepTogether('Log food')).toBe('Log food');
    expect(keepTogether("Adds 250 ml to Fri, Nov 13's water goal")).toBe(`Adds 250${NBSP}ml to Fri, Nov 13's water goal`);
  });
  it('holds a nested unit to the number before it', () => {
    expect(keepUnitWithNumber(' kcal')).toBe(`${NBSP}kcal`);
    expect(keepUnitWithNumber(' g / day')).toBe(`${NBSP}g / day`);
    expect(keepUnitWithNumber(' to add')).toBe(' to add');
  });
});

describe('a year is not a quantity', () => {
  it('lets a long name after a year start the next line', () => {
    expect(keepTogether('from the 2024 Compendium for easy effort')).toBe('from the 2024 Compendium for easy effort');
    expect(keepTogether('2024 Adult Compendium')).toBe('2024 Adult Compendium');
  });
  it('still holds a number with its unit or a short word', () => {
    expect(keepTogether('2024 kcal')).toBe(`2024${NBSP}kcal`);
    expect(keepTogether('12 May 1994')).toBe(`12${NBSP}May 1994`);
    expect(keepTogether('3 L')).toBe(`3${NBSP}L`);
    expect(keepTogether('1,500 Calories')).toBe(`1,500${NBSP}Calories`);
  });
});
