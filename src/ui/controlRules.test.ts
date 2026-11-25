import { describe, expect, it } from 'vitest';

import { ANDROID_TARGET, ariaFromState, fixedSize, NO_MINUS, numberTextProblem, numberTextValue, pressesOnSpace, rovingIndex, rowStacks, slopToReach, spokenFieldName, stepperKey, wantsAndroidTarget, webAutoComplete } from './controlRules';

describe('slopToReach (48 dp on Android)', () => {
  it('grows a 44 px cup to 48 on both axes', () => {
    expect(slopToReach(0, { width: 44, height: 44 }, ANDROID_TARGET)).toEqual({ top: 2, right: 2, bottom: 2, left: 2 });
  });
  it('keeps a larger slop it was given and grows only what falls short', () => {
    // A 32 px chip with 6 above and below and 4 at the sides, width unknown.
    expect(slopToReach({ top: 6, bottom: 6, left: 4, right: 4 }, { height: 32 }, 48)).toEqual({ top: 8, right: 4, bottom: 8, left: 4 });
    // The 40 x 24 switch with 44 px slop.
    expect(slopToReach({ top: 10, bottom: 10, left: 2, right: 2 }, { width: 40, height: 24 }, 48)).toEqual({ top: 12, right: 4, bottom: 12, left: 4 });
  });
  it('leaves a control that already reaches the target, or whose size is not fixed, as it was', () => {
    expect(slopToReach(undefined, { width: 56, height: 56 }, 48)).toBeUndefined();
    expect(slopToReach(4, { height: 48 }, 48)).toBe(4);
    expect(slopToReach(undefined, {}, 48)).toBeUndefined();
    // A 36 px small button with 4 px slop: 44, so 6 each side.
    expect(slopToReach(4, { height: 36 }, 48)).toEqual({ top: 6, right: 4, bottom: 6, left: 4 });
  });
  it('reads a fixed size from width and height, else their minimums', () => {
    expect(fixedSize({ width: 44, height: 44 })).toEqual({ width: 44, height: 44 });
    expect(fixedSize({ minHeight: 44, width: '50%' })).toEqual({ width: undefined, height: 44 });
    expect(fixedSize(null)).toEqual({});
  });
});

describe('wantsAndroidTarget (where touch areas grow to 48)', () => {
  const pixel = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
  it('in the Android app, whatever the pointer', () => {
    expect(wantsAndroidTarget('android', undefined, false)).toBe(true);
  });
  it('in a browser on an Android phone used by touch', () => {
    expect(wantsAndroidTarget('web', pixel, true)).toBe(true);
  });
  it('not on an Android browser driven by a mouse, an iPhone, a computer or in the iPhone app', () => {
    expect(wantsAndroidTarget('web', pixel, false)).toBe(false);
    expect(wantsAndroidTarget('web', iphone, true)).toBe(false);
    expect(wantsAndroidTarget('web', 'Mozilla/5.0 (X11; Linux x86_64) Chrome/124.0', true)).toBe(false);
    expect(wantsAndroidTarget('ios', pixel, true)).toBe(false);
  });
});

describe('ariaFromState (what react-native-web drops)', () => {
  it('a tab is selected, a radio and a switch are checked, a button is pressed', () => {
    expect(ariaFromState('tab', { selected: true })).toEqual({ 'aria-selected': true });
    expect(ariaFromState('tab', { selected: false })).toEqual({ 'aria-selected': false });
    expect(ariaFromState('radio', { selected: true, checked: true })).toEqual({ 'aria-checked': true });
    expect(ariaFromState('radio', { selected: false })).toEqual({ 'aria-checked': false });
    expect(ariaFromState('switch', { checked: true, disabled: false })).toEqual({ 'aria-checked': true });
    expect(ariaFromState(undefined, { selected: true })).toEqual({ 'aria-pressed': true });
  });
  it('carries expanded, disabled and busy', () => {
    expect(ariaFromState('button', { expanded: false })).toEqual({ 'aria-expanded': false });
    expect(ariaFromState('button', { expanded: true, disabled: true, busy: true })).toEqual({ 'aria-expanded': true, 'aria-disabled': true, 'aria-busy': true });
  });
  it('never overrides what the control passes itself', () => {
    expect(ariaFromState('button', { selected: true }, { 'aria-pressed': false })).toEqual({});
    expect(ariaFromState('tab', { selected: true }, { 'aria-selected': true })).toEqual({});
    expect(ariaFromState('tab', null)).toEqual({});
  });
});

describe('keys', () => {
  it('Space presses a switch, a radio, a tab and a checkbox, but not a button (the browser does that)', () => {
    for (const r of ['switch', 'radio', 'tab', 'checkbox']) expect(pressesOnSpace(r)).toBe(true);
    expect(pressesOnSpace('button')).toBe(false);
    expect(pressesOnSpace(undefined)).toBe(false);
  });
  it('arrows move along a row of tabs or radios and wrap', () => {
    expect(rovingIndex('ArrowRight', 0, 3)).toBe(1);
    expect(rovingIndex('ArrowDown', 2, 3)).toBe(0);
    expect(rovingIndex('ArrowLeft', 0, 3)).toBe(2);
    expect(rovingIndex('ArrowUp', 1, 3)).toBe(0);
    expect(rovingIndex('Home', 2, 3)).toBe(0);
    expect(rovingIndex('End', 0, 3)).toBe(2);
    expect(rovingIndex('ArrowRight', -1, 3)).toBe(1);
    expect(rovingIndex('a', 0, 3)).toBeNull();
    expect(rovingIndex('ArrowRight', 0, 0)).toBeNull();
  });
  it('a stepper steps, pages and jumps to its limits, and never passes them', () => {
    expect(stepperKey('ArrowUp', 1, 0.5, 0, 10)).toBe(1.5);
    expect(stepperKey('ArrowRight', 1, 0.5, 0, 10)).toBe(1.5);
    expect(stepperKey('ArrowDown', 1, 0.5, 0, 10)).toBe(0.5);
    expect(stepperKey('PageUp', 1, 0.5, 0, 10)).toBe(6);
    expect(stepperKey('PageDown', 1, 0.5, 0, 10)).toBe(0);
    expect(stepperKey('Home', 4, 1, 1, 7)).toBe(1);
    expect(stepperKey('End', 4, 1, 1, 7)).toBe(7);
    expect(stepperKey('End', 4, 1, 0, Number.POSITIVE_INFINITY)).toBeNull();
    expect(stepperKey('ArrowDown', 0, 1, 0, 10)).toBeNull();
    expect(stepperKey('ArrowUp', 0.1, 0.1, 0, 10)).toBe(0.2);
    expect(stepperKey('Tab', 1, 1, 0, 10)).toBeNull();
  });
});

describe('webAutoComplete', () => {
  it("gives the browser its own names for React Native's", () => {
    expect(webAutoComplete('birthdate-day')).toBe('bday-day');
    expect(webAutoComplete('birthdate-month')).toBe('bday-month');
    expect(webAutoComplete('birthdate-year')).toBe('bday-year');
    expect(webAutoComplete('password')).toBe('current-password');
    expect(webAutoComplete('password-new')).toBe('new-password');
    expect(webAutoComplete('name-given')).toBe('given-name');
  });
  it('passes the names the browser knows', () => {
    for (const v of ['email', 'name', 'given-name', 'current-password', 'new-password', 'off', 'username']) expect(webAutoComplete(v)).toBe(v);
    expect(webAutoComplete(undefined)).toBeUndefined();
  });
});

describe('spokenFieldName', () => {
  it('says a short unit at the end of the label in full', () => {
    expect(spokenFieldName('Neck, in')).toBe('Neck, inches');
    expect(spokenFieldName('Height, ft')).toBe('Height, feet');
    expect(spokenFieldName('Weight (kg)')).toBe('Weight (kilograms)');
    expect(spokenFieldName('Water, fl oz')).toBe('Water, fluid ounces');
  });
  it("adds the field's own unit when the label does not name it", () => {
    expect(spokenFieldName('Protein', 'g')).toBe('Protein, grams');
    expect(spokenFieldName('Calories', 'kcal')).toBe('Calories, kilocalories');
    expect(spokenFieldName('Weight, kg', 'kg')).toBe('Weight, kilograms');
  });
  it('leaves a label alone when there is no unit to say', () => {
    expect(spokenFieldName('Name')).toBe('Name');
    expect(spokenFieldName('Servings', 'servings')).toBe('Servings');
    expect(spokenFieldName('Login')).toBe('Login');
    expect(spokenFieldName(undefined, 'g')).toBeUndefined();
  });
});

describe('rowStacks (a list row at large text)', () => {
  it('never stacks at the designed size', () => {
    expect(rowStacks({ rowWidth: 200, sideWidth: 150, growth: 1 })).toBe(false);
  });
  it("stacks when the words' room beside the mark and the switch is under the longest word's need", () => {
    // 320 px phone at 200%: a 248 px row in its card, a 44 px tile, a 40 px switch and two 12 px gaps leave 140 px.
    expect(rowStacks({ rowWidth: 248, sideWidth: 44 + 40 + 24, growth: 2 })).toBe(true);
    // 390 px phone at 115%: plenty of room.
    expect(rowStacks({ rowWidth: 318, sideWidth: 44 + 18 + 24, growth: 1.15 })).toBe(false);
  });
  it('waits for the row to be measured', () => {
    expect(rowStacks({ rowWidth: 0, sideWidth: 0, growth: 2 })).toBe(false);
  });
});

describe('number fields: a typed minus is kept and named', () => {
  it('a minus in a field that takes no negative is named, and its value is nothing', () => {
    expect(numberTextProblem('-100')).toBe(NO_MINUS);
    expect(numberTextProblem('-')).toBe(NO_MINUS);
    expect(numberTextProblem('10-0')).toBe(NO_MINUS);
    expect(numberTextValue('-100')).toBeNull();
    expect(numberTextValue('-')).toBeNull();
    // Never turned into a plus.
    expect(numberTextValue('-70')).not.toBe(70);
  });
  it('plain numbers read as before, a comma as the decimal point', () => {
    expect(numberTextProblem('100')).toBeNull();
    expect(numberTextValue('100')).toBe(100);
    expect(numberTextValue('1,5')).toBe(1.5);
    expect(numberTextValue('1.')).toBe(1);
    expect(numberTextValue('')).toBeNull();
    expect(numberTextValue('.')).toBeNull();
  });
  it('a field that takes negatives reads the minus', () => {
    expect(numberTextProblem('-3', true)).toBeNull();
    expect(numberTextValue('-3', true)).toBe(-3);
  });
});
