/**
 * Today's big calorie figure: "left" by default, "eaten" when chosen; the other figure is said once in the line at
 * the cup's level; above the budget "left" reads as the amount above in neutral words; the choice is kept on this
 * device under its own key (never the store), read before the number is drawn, and a tap during the read wins.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { beforeEach, describe, expect, it } from 'vitest';

import { CALORIE_FIGURE_KEY, calorieFigureNow, figureWords, loadCalorieFigure, otherFigure, parseCalorieFigure, resetCalorieFigureForTests, setCalorieFigure } from './calorieFigure';

const BANNED = /\b(over|bad|fail|failed|cheat|should|great|exceeded|too much)\b/i;

describe('the calorie figure words', () => {
  it('shows what is left by default, with what was eaten of the budget in the line', () => {
    const w = figureWords('left', { remaining: 941, eaten: 1219, isToday: true });
    expect(w.big).toMatchObject({ text: '941', word: 'left', tone: 'caloriesInk', testID: 'today-remaining', value: 941 });
    expect(w.line).toMatchObject({ text: '1,219', words: 'eaten of', testID: 'today-eaten' });
    expect(w.name).toBe('941 kcal left. Switch to calories eaten');
    expect(w.bigSpoken).toBe('941 kilocalories left');
    expect(w.line.spoken).toBe('1,219 kilocalories eaten');
  });

  it('shows what was eaten when chosen, with what is left of the budget in the line, never both twice', () => {
    const w = figureWords('eaten', { remaining: 941, eaten: 1219, isToday: true });
    expect(w.big).toMatchObject({ text: '1,219', word: 'eaten', tone: 'caloriesInk', testID: 'today-eaten', value: 1219 });
    expect(w.line).toMatchObject({ text: '941', words: 'left of', testID: 'today-remaining' });
    expect(w.name).toBe('1,219 kcal eaten. Switch to calories left');
    expect(w.line.spoken).toBe('941 kilocalories left');
    // Each figure has one place: the big number and the line never name the same one.
    expect(w.big.testID).not.toBe(w.line.testID);
    const l = figureWords('left', { remaining: 941, eaten: 1219, isToday: true });
    expect(l.big.testID).not.toBe(l.line.testID);
  });

  it('above the budget says the amount above in neutral words, the warning ink only on a big "above"', () => {
    const left = figureWords('left', { remaining: -130.4, eaten: 2290, isToday: true });
    expect(left.big).toMatchObject({ text: '130', word: 'above', tone: 'warningInk', value: -130.4 });
    expect(left.name).toBe('130 kcal above the budget. Switch to calories eaten');
    expect(left.bigSpoken).toBe('130 kilocalories above the budget');
    const eaten = figureWords('eaten', { remaining: -130, eaten: 2290, isToday: true });
    expect(eaten.big).toMatchObject({ text: '2,290', tone: 'caloriesInk' });
    expect(eaten.line).toMatchObject({ text: '130', words: 'above', spoken: '130 kilocalories above the budget' });
    expect(eaten.name).toBe('2,290 kcal eaten. Switch to calories above the budget');
  });

  it('a past day under its budget says "under", as the card always has', () => {
    expect(figureWords('left', { remaining: 310, eaten: 1850, isToday: false }).big.word).toBe('under');
    const w = figureWords('eaten', { remaining: 310, eaten: 1850, isToday: false });
    expect(w.line).toMatchObject({ text: '310', words: 'under', spoken: '310 kilocalories under the budget' });
    expect(w.name).toBe('1,850 kcal eaten. Switch to calories under the budget');
  });

  it('rounds the figures, never prints "-0", and keeps every name in the house words', () => {
    expect(figureWords('left', { remaining: -0.3, eaten: 2160.3, isToday: true }).big.text).toBe('0');
    expect(figureWords('eaten', { remaining: 0, eaten: 1218.6, isToday: true }).big.text).toBe('1,219');
    for (const figure of ['left', 'eaten'] as const) {
      for (const remaining of [941, 0, -130]) {
        for (const isToday of [true, false]) {
          const w = figureWords(figure, { remaining, eaten: 1219, isToday });
          for (const s of [w.name, w.bigSpoken, w.line.spoken, w.line.words]) {
            expect(BANNED.test(s), s).toBe(false);
            expect(s.includes('!'), s).toBe(false);
          }
          // The name holds the words drawn on the control (WCAG 2.5.3): the figure, its unit and its word.
          expect(w.name.startsWith(`${w.big.text} kcal ${w.big.word}`), w.name).toBe(true);
        }
      }
    }
  });
});

describe('the calorie figure choice', () => {
  beforeEach(async () => {
    await AsyncStorage.removeItem(CALORIE_FIGURE_KEY);
    resetCalorieFigureForTests();
  });

  it('reads only "eaten" as eaten; anything else is the default', () => {
    expect(parseCalorieFigure('eaten')).toBe('eaten');
    for (const raw of ['left', null, undefined, '', 'EATEN', '1', 2]) expect(parseCalorieFigure(raw)).toBe('left');
    expect(otherFigure('left')).toBe('eaten');
    expect(otherFigure('eaten')).toBe('left');
  });

  it('is kept on this device under its own key, outside the store', async () => {
    expect(CALORIE_FIGURE_KEY.startsWith('healthcal/')).toBe(false);
    expect(CALORIE_FIGURE_KEY).not.toBe('healthcal-v1');
    setCalorieFigure('eaten');
    await Promise.resolve();
    expect(await AsyncStorage.getItem(CALORIE_FIGURE_KEY)).toBe('eaten');
  });

  it('is not ready until the stored choice is read, then shows it', async () => {
    await AsyncStorage.setItem(CALORIE_FIGURE_KEY, 'eaten');
    expect(calorieFigureNow()).toEqual({ figure: 'left', ready: false });
    await loadCalorieFigure();
    expect(calorieFigureNow()).toEqual({ figure: 'eaten', ready: true });
  });

  it('a tap while the read is in flight wins over what was stored', async () => {
    await AsyncStorage.setItem(CALORIE_FIGURE_KEY, 'eaten');
    const reading = loadCalorieFigure();
    setCalorieFigure('left');
    await reading;
    expect(calorieFigureNow()).toEqual({ figure: 'left', ready: true });
  });
});
