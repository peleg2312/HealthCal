/**
 * The words of the estimate's wait: neutral (the morning page's banned list, word for word, and the
 * plan's), no exclamation mark, sentence case, and honest: no percentage, no number that claims a
 * share done, no step that says more than the phone knows.
 */
import { describe, expect, it } from 'vitest';

import {
  AI_TILE_HINT,
  alternativesLabel,
  ANALYSING,
  analysingLabel,
  analysingNote,
  analysingSteps,
  DESCRIPTION_MAX,
  estimateGramsSpoken,
  estimateReadyLine,
  itemKcalSpoken,
  itemNameLabel,
  macroStatSpoken,
  prefilledDescription,
  searchAiTile,
  slowAfterMs,
  spokenMacros,
  swapChipLabel,
} from './words';
import { estimateGrams } from './estimate';

const BANNED =
  /\b(bad|fail|failed|failure|cheat|cheated|should|guilty|lazy|great|amazing|well done|keep it up|too much|missed your|goal missed|over budget|make up|only|unfortunately|oops|sorry)\b/i;
const PLAN = /\b(upgrade|unlock|premium|run out|last chance)\b/i;

function all(): string[] {
  const out: string[] = [...Object.values(ANALYSING), ...Object.values(AI_TILE_HINT)];
  for (const q of ['', 'lentil stew']) out.push(searchAiTile(q).label, searchAiTile(q).a11y);
  for (const photo of [true, false])
    for (const precise of [true, false]) {
      out.push(...Object.values(analysingSteps(photo, precise)), analysingLabel(photo, precise));
      for (const slow of [true, false]) out.push(analysingNote(precise, slow));
    }
  return out;
}

describe('the words of the wait', () => {
  it('pass the banned lists, with no exclamation mark, in sentence case', () => {
    const bad = all().filter((s) => BANNED.test(s) || PLAN.test(s) || s.includes('!') || !/^[A-Z]/.test(s));
    expect(bad).toEqual([]);
  });

  it('claim no share done: no percentage and no digit anywhere', () => {
    expect(all().filter((s) => /%|percent|\d/.test(s))).toEqual([]);
  });

  it('name the input that is ready, the work, and the review', () => {
    expect(analysingSteps(true, false)).toEqual({ input: 'Photo ready', estimate: 'Estimating each food and its portion', review: 'Nothing is added until you check it' });
    expect(analysingSteps(false, true)).toEqual({ input: 'Description ready', estimate: 'Checking each food more carefully', review: 'Nothing is added until you check it' });
    expect(analysingLabel(true, false)).toBe('Photo ready. Estimating each food and its portion. Nothing is added until you check it.');
  });

  it("the + sheet's AI tiles name the AI, and Describe says what to do", () => {
    expect(AI_TILE_HINT).toEqual({ photo: 'Photo, AI estimate', describe: 'Type it, AI estimate' });
  });

  it('says "still working" after 10 s, or 20 s for the careful check', () => {
    expect(slowAfterMs(false)).toBe(10_000);
    expect(slowAfterMs(true)).toBe(20_000);
    expect(analysingNote(false, false)).toBe('Usually a few seconds.');
    expect(analysingNote(true, false)).toBe('The careful check can take up to half a minute.');
    expect(analysingNote(true, true)).toBe(analysingNote(false, true));
  });
});

describe("food search's AI tile", () => {
  it('with nothing typed says what it does ("Estimate", under the estimate cup, never a camera), names both inputs to a screen reader, and opens on Photo', () => {
    expect(searchAiTile('')).toEqual({ label: 'Estimate', a11y: 'AI estimate from a photo or from words', glyph: 'estimate', params: { mode: 'photo' } });
    expect(searchAiTile('   ').label).toBe('Estimate');
    expect(searchAiTile('').a11y).toMatch(/photo/);
    expect(searchAiTile('').a11y).toMatch(/words/);
  });

  it('with words typed is Describe and carries them, trimmed, to the describe field', () => {
    expect(searchAiTile('  lentil stew with toast ')).toEqual({
      label: 'Describe',
      a11y: 'Describe lentil stew with toast for an AI estimate',
      glyph: 'describe',
      params: { mode: 'text', words: 'lentil stew with toast' },
    });
    expect(searchAiTile('x'.repeat(600)).params.words).toHaveLength(DESCRIPTION_MAX);
  });

  it('the photo screen reads the words once, as a string, never more than the field takes', () => {
    expect(prefilledDescription(' grandma soup ')).toBe('grandma soup');
    expect(prefilledDescription(['first', 'second'])).toBe('first');
    expect(prefilledDescription(undefined)).toBe('');
    expect(prefilledDescription(42)).toBe('');
    expect(prefilledDescription('y'.repeat(900))).toHaveLength(DESCRIPTION_MAX);
  });
});

describe('the review, spoken', () => {
  const lines = () => [
    estimateReadyLine({ kcal: 507.4, range: [390, 620], items: 4, sample: false }),
    estimateReadyLine({ kcal: 90, range: [90, 90], items: 1, sample: false }),
    estimateReadyLine({ kcal: 507, range: [390, 620], items: 4, sample: true }),
    spokenMacros(46.6, 0, 5.2),
    macroStatSpoken('Protein', 52.6),
    itemNameLabel(2),
    alternativesLabel(3, 'White rice, cooked'),
    swapChipLabel('White rice, cooked', 190),
  ];

  it('says the arrival as an estimate with its range and the items to check, units in full', () => {
    expect(estimateReadyLine({ kcal: 507.4, range: [390, 620], items: 4, sample: false })).toBe('Estimate ready: about 507 kilocalories, likely 390 to 620, 4 items to check.');
    expect(estimateReadyLine({ kcal: 90, range: [90, 90], items: 1, sample: false })).toBe('Estimate ready: about 90 kilocalories, 1 item to check.');
    expect(estimateReadyLine({ kcal: 507, range: [390, 620], items: 4, sample: true })).toBe('Sample result, not your meal: about 507 kilocalories, likely 390 to 620, 4 items.');
  });

  it('speaks no abbreviation: no kcal, no lone g, no macro letter', () => {
    expect(lines().filter((s) => /\bkcal\b|\b\d+ ?g\b|\b[PCF] \d/.test(s))).toEqual([]);
    expect(spokenMacros(46.6, 0, 1)).toBe('Protein about 47 grams, carbs about 0 grams, fat about 1 gram');
  });

  it("says an estimate's grams as an estimate, whole: drawn \"~53 g\", heard \"about 53 grams\"", () => {
    expect(estimateGrams(52.6)).toBe('~53');
    expect(estimateGrams(0.4)).toBe('~0');
    expect(estimateGramsSpoken(52.6)).toBe('about 53 grams');
    expect(estimateGramsSpoken(1.2)).toBe('about 1 gram');
    expect(macroStatSpoken('Carbs', 56.2)).toBe('Carbs, about 56 grams');
  });

  it('names each row apart, with the visible words first (label in name)', () => {
    expect(itemNameLabel(1)).not.toBe(itemNameLabel(2));
    expect(itemNameLabel(1).startsWith('Item name')).toBe(true);
    expect(alternativesLabel(3, ' White rice ')).toBe('Could also be, 3 foods for White rice');
    expect(alternativesLabel(1, '')).toBe('Could also be, 1 food');
    expect(swapChipLabel('White rice, cooked', 190.4)).toBe('White rice, cooked, 190 kilocalories');
  });

  it('says an item\'s calories as an estimate, units in full', () => {
    expect(itemKcalSpoken(248.4)).toBe('about 248 kilocalories');
  });

  it('pass the banned lists, with no exclamation mark, in sentence case', () => {
    expect(lines().filter((s) => BANNED.test(s) || PLAN.test(s) || s.includes('!') || !/^[A-Z]/.test(s))).toEqual([]);
  });
});
