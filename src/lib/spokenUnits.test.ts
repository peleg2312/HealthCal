import { describe, expect, it } from 'vitest';
import { spokenUnits } from './spokenUnits';

describe('spokenUnits', () => {
  it('says units in full after a number', () => {
    expect(spokenUnits('290 kcal added')).toBe('290 kilocalories added');
    expect(spokenUnits('1,219 kcal eaten of 2,160 kcal')).toBe('1,219 kilocalories eaten of 2,160 kilocalories');
    expect(spokenUnits('1.5 L of 3.3 L')).toBe('1.5 litres of 3.3 litres');
    expect(spokenUnits('250 ml')).toBe('250 millilitres');
    expect(spokenUnits('45 min this week')).toBe('45 minutes this week');
    expect(spokenUnits('74.2 kg')).toBe('74.2 kilograms');
    expect(spokenUnits('88 fl oz')).toBe('88 fluid ounces');
    expect(spokenUnits('1 kcal')).toBe('1 kilocalorie');
  });

  it('names the macro letters', () => {
    expect(spokenUnits('P 47 g C 0 g F 5 g')).toBe('protein 47 grams carbs 0 grams fat 5 grams');
    expect(spokenUnits('Oats, P 13 g')).toBe('Oats, protein 13 grams');
  });

  it('leaves words that only look like units alone', () => {
    expect(spokenUnits('Log lunch')).toBe('Log lunch');
    expect(spokenUnits('Grilled chicken')).toBe('Grilled chicken');
    expect(spokenUnits('3 glasses')).toBe('3 glasses');
    expect(spokenUnits('Vitamin C tablets')).toBe('Vitamin C tablets');
    expect(spokenUnits('2 gluten-free buns')).toBe('2 gluten-free buns');
  });
});
