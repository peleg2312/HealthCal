import { describe, expect, it } from 'vitest';

import { buildAnalyzeRequest } from './api';
import { withCorrection } from './estimate';
import { photoText, readWeight, sentWeight, weightProblem, weightSentence, WEIGHT_MAX_G, WEIGHT_MIN_G } from './weight';

describe('the weighed total on the photo screen', () => {
  it('is optional: an empty field is no problem and sends nothing', () => {
    expect(weightProblem(null)).toBeNull();
    expect(sentWeight(null)).toBeNull();
    expect(photoText('', null)).toBeUndefined();
    expect(photoText('  cooked in butter ', null)).toBe('cooked in butter');
  });

  it('refuses a total outside 10 to 5,000 g, and sends none then', () => {
    for (const g of [0, 9, 5001, Number.NaN]) {
      expect(weightProblem(g)).toBe('Enter 10 to 5,000 g, or leave it empty');
      expect(sentWeight(g)).toBeNull();
      expect(photoText('note', g)).toBe('note');
    }
    expect(weightProblem(WEIGHT_MIN_G)).toBeNull();
    expect(weightProblem(WEIGHT_MAX_G)).toBeNull();
  });

  it('rounds to the nearest 10 g, as the measured texts were', () => {
    expect(sentWeight(47)).toBe(50);
    expect(sentWeight(418)).toBe(420);
    expect(sentWeight(414)).toBe(410);
    // A 5 goes to the even ten, as in the measured texts (285 g was sent as 280, 85 g as 80).
    expect(sentWeight(415)).toBe(420);
    expect(sentWeight(425)).toBe(420);
    expect(sentWeight(285)).toBe(280);
    expect(sentWeight(85)).toBe(80);
    expect(sentWeight(95)).toBe(100);
    expect(sentWeight(12)).toBe(10);
    expect(sentWeight(5000)).toBe(5000);
  });

  it('alone, is the measured sentence byte for byte', () => {
    // The words of photos/cases-hint-grams.json in the 18 November round: "About N g of food in total."
    expect(photoText('', 418)).toBe('About 420 g of food in total.');
    expect(photoText('   ', 47)).toBe('About 50 g of food in total.');
    expect(weightSentence(1230)).toBe('About 1230 g of food in total.');
  });

  it('goes before the note, and stays first under a correction', () => {
    expect(photoText('cooked in butter', 300)).toBe('About 300 g of food in total. cooked in butter');
    const fixed = withCorrection(photoText('x'.repeat(200), 300), 'no rice');
    expect(fixed.startsWith('About 300 g of food in total. ')).toBe(true);
    expect(fixed.endsWith('Correction from the person who ate it: no rice')).toBe(true);
  });

  it('travels as the request text, so an old function receives it unchanged', () => {
    const { init } = buildAnalyzeRequest({ image: 'QUJD', text: photoText('', 420) }, { functionsUrl: 'https://x/functions/v1', accessToken: 't' });
    expect(JSON.parse(init.body as string)).toEqual({ image: 'QUJD', mediaType: 'image/jpeg', text: 'About 420 g of food in total.' });
  });
});

describe('reading what was typed in the field', () => {
  it('empty is fine and sends nothing', () => {
    expect(readWeight('', 'metric')).toEqual({ grams: null, problem: null, shown: null });
    expect(readWeight('   ', 'imperial')).toEqual({ grams: null, problem: null, shown: null });
  });

  it('takes a thousands separator as one, never as a decimal point', () => {
    for (const t of ['1500', '1,500', '1.500', '1 500', '1\u00A0500', '1500 g', '1,500g', '1500 grams']) {
      expect(readWeight(t, 'metric')).toEqual({ grams: 1500, problem: null, shown: '1,500 g' });
    }
    expect(readWeight('418', 'metric')).toEqual({ grams: 418, problem: null, shown: '418 g' });
    expect(photoText('', readWeight('418', 'metric').grams)).toBe('About 420 g of food in total.');
    expect(photoText('', readWeight('1,230', 'metric').grams)).toBe('About 1230 g of food in total.');
  });

  it('refuses a decimal in grams rather than guessing (1.5 could be kilograms)', () => {
    for (const t of ['1.5', '1,5', '41.5', '41.']) expect(readWeight(t, 'metric')).toEqual({ grams: null, problem: 'Enter whole grams, e.g. 450', shown: null });
  });

  it('says so when the text is not a number, so a weight is never silently dropped', () => {
    for (const t of ['abc', '400 kg', '4oo', '1/2']) expect(readWeight(t, 'metric')).toEqual({ grams: null, problem: 'Enter a number of grams', shown: null });
    expect(readWeight('one pound', 'imperial').problem).toBe('Enter a number of ounces');
  });

  it('keeps the range in grams', () => {
    expect(readWeight('3', 'metric').problem).toBe('Enter 10 to 5,000 g, or leave it empty');
    expect(readWeight('5,001', 'metric').problem).toBe('Enter 10 to 5,000 g, or leave it empty');
  });

  it('takes ounces for imperial and sends grams in the measured words', () => {
    const lb = readWeight('16', 'imperial');
    expect(lb.problem).toBeNull();
    expect(lb.grams).toBeCloseTo(453.59, 1);
    expect(lb.shown).toBe('16 oz (about 450 g)');
    expect(photoText('', lb.grams)).toBe('About 450 g of food in total.');
    expect(readWeight('15,5 oz', 'imperial').shown).toBe('15.5 oz (about 440 g)');
    expect(readWeight('0.3', 'imperial').problem).toBe('Enter 0.4 to 176 oz, or leave it empty');
    expect(readWeight('177', 'imperial').problem).toBe('Enter 0.4 to 176 oz, or leave it empty');
    expect(readWeight('176', 'imperial').problem).toBeNull();
  });
});
