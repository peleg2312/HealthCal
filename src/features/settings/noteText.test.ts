import { describe, expect, it } from 'vitest';

import { TARGET_CARE_NOTE } from './careNote';
import { isReadingNote, noteVariant } from './noteText';

describe('noteVariant', () => {
  it('sets a note of two or more sentences as body', () => {
    expect(noteVariant('From your body weight. More on days you log exercise.')).toBe('body');
    expect(noteVariant('Set by you. You burn about 2,311 kcal a day.')).toBe('body');
    expect(noteVariant(TARGET_CARE_NOTE)).toBe('body');
    expect(noteVariant('Is it on? It is.')).toBe('body');
    expect(noteVariant('It says "Done." Then it closes.')).toBe('body');
  });

  it('keeps a one-sentence caption a caption, decimals and a final stop included', () => {
    expect(noteVariant('Safe maximum 0.8 kg a week (1% of body weight)')).toBe('caption');
    expect(noteVariant('Outside workouts, which are added on top.')).toBe('caption');
    expect(noteVariant('Lose 0.4 kg a week, protein, carbs, fat, water')).toBe('caption');
    expect(noteVariant('  Used to estimate your resting metabolism.  ')).toBe('caption');
    expect(isReadingNote('')).toBe(false);
  });
});
