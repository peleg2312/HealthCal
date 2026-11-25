/**
 * The widget's words: the examples, and across a grid of inputs no "!", no "over", no word from the
 * morning page's banned list, no unit abbreviation in a spoken label, sentence case.
 */
import { describe, expect, it } from 'vitest';

import * as W from './words';

const BANNED = /\b(over|bad|fail|failed|failure|cheat|cheated|should|guilty|lazy|great|amazing|well done|keep it up|too much|missed your|goal missed|over budget|make up|unfortunately|oops|sorry|upgrade|unlock|premium)\b/i;
const SHORT_UNITS = /\d\s?(kcal|ml|L|fl oz|g)\b/;

function everyString(): { drawn: string[]; spoken: string[] } {
  const drawn: string[] = [];
  const spoken: string[] = [];
  for (const units of ['metric', 'imperial'] as const) {
    for (const ml of [150, 237, 250, 355, 500, 1000]) {
      drawn.push(W.glassLabel(ml, units), W.addedCaption(ml, units));
      // The glass and its Undo are controls: their names hold their drawn words (WCAG 2.5.3), checked below.
    }
  }
  for (const [remaining, eaten, budget, added] of [
    [941, 1219, 2160, 0],
    [-130, 2290, 2160, 0],
    [0, 2160, 2160, 290],
    [2450, 0, 2450, 290],
    [-9320, 11480, 2160, 0],
  ]) {
    drawn.push(W.eatenLine(eaten, budget), W.kcalWord(remaining < 0));
    spoken.push(W.kcalSpoken(remaining, eaten, budget, added));
  }
  for (const reached of [false, true]) {
    drawn.push(W.waterCaption(reached));
    spoken.push(W.waterSpoken('1.48 of 3.3 L', reached), W.waterSpoken('40 of 112 fl oz', reached));
  }
  drawn.push(W.widgetDate('2026-11-25'), W.SETUP_TITLE, W.SETUP_LINE, W.OPEN_TITLE, W.OPEN_LINE, W.NOT_SAVED_TITLE, W.NOT_SAVED_LINE, W.UNDO_WORD);
  drawn.push(W.ROW_TITLE, W.ROW_LINE, W.ROW_PLACED, W.ROW_HOW_TO_ADD, W.ROW_HOW_TO_ADD_SHORT);
  spoken.push(W.messageSpoken(W.SETUP_TITLE, W.SETUP_LINE), W.rootSpoken('2026-11-25', W.kcalSpoken(941, 1219, 2160, 0), W.waterSpoken('1.48 of 3.3 L', false)));
  return { drawn, spoken };
}

describe('the widget words', () => {
  it('say the figures as Today says them', () => {
    expect(W.widgetDate('2026-11-25')).toBe('Wed, Nov 25');
    expect(W.eatenLine(1219, 2160)).toBe('1,219 eaten of 2,160');
    expect(W.kcalWord(false)).toBe('left');
    expect(W.kcalWord(true)).toBe('above');
    expect(W.kcalSpoken(-130, 2290, 2160, 0)).toBe("130 kilocalories above the day's budget. 2,290 eaten of a 2,160 kilocalorie budget. Open Today");
    expect(W.glassLabel(250, 'metric')).toBe('+ 250 ml');
    expect(W.glassLabel(355, 'imperial')).toBe('+ 12 fl oz');
    expect(W.glassSpoken(250, 'metric')).toBe('Add 250 ml of water');
    expect(W.undoSpoken(355, 'imperial')).toBe('Undo 12 fl oz of water');
    expect(W.addedCaption(250, 'metric')).toBe('250 ml added');
    expect(W.waterSpoken('1.48 of 3.3 L', false)).toBe('Water, 1.48 of 3.3 litres. Open Water');
    expect(W.rootSpoken('2026-11-25', W.kcalSpoken(941, 1219, 2160, 0), W.waterSpoken('1.48 of 3.3 L', true))).toBe(
      'HealthCal, Wed, Nov 25. 941 kilocalories left. 1,219 eaten of a 2,160 kilocalorie budget. Water, 1.48 of 3.3 litres, goal reached.',
    );
  });

  it('no "!", no "over", no banned word, sentence case, in every string', () => {
    const { drawn, spoken } = everyString();
    for (const s of [...drawn, ...spoken]) {
      expect(s, s).not.toMatch(BANNED);
      expect(s, s).not.toContain('!');
      // Sentence case: every line starts with a capital, a figure or a sign ("left" and "above" sit under "kcal").
      if (!['left', 'above'].includes(s)) expect(s.charAt(0), s).not.toMatch(/[a-z]/);
    }
  });

  it('spoken labels say their units in full', () => {
    for (const s of everyString().spoken) expect(s, s).not.toMatch(SHORT_UNITS);
  });
  it('name the glass and its Undo by the words they show (label in name)', () => {
    for (const units of ['metric', 'imperial'] as const) {
      for (const ml of [150, 237, 250, 355, 500, 1000]) {
        const drawn = W.glassLabel(ml, units).replace(/^\+ /, '');
        expect(W.glassSpoken(ml, units)).toContain(drawn);
        expect(W.undoSpoken(ml, units)).toContain(drawn);
      }
    }
  });
});
