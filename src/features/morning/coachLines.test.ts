import { describe, expect, it } from 'vitest';

import { keepLastWord } from './coachLines';

describe('keepLastWord', () => {
  it('joins a short closing word to the word before it', () => {
    expect(keepLastWord('Two things went well, keep it up as you go.')).toBe('Two things went well, keep it up as you go.');
    expect(keepLastWord('Water first today.')).toBe('Water first today.');
  });

  it('joins a closing word of exactly 12 characters', () => {
    expect(keepLastWord('Then keep on abcdefghijk.')).toBe('Then keep on abcdefghijk.');
  });

  it('leaves a long closing word alone', () => {
    const s = 'Protein reached and a full night of uninterruptedly.';
    expect(keepLastWord(s)).toBe(s);
  });

  it('leaves a one-word string and an empty string unchanged', () => {
    expect(keepLastWord('Hello.')).toBe('Hello.');
    expect(keepLastWord('')).toBe('');
  });

  it('changes only the last space', () => {
    const out = keepLastWord('One two three four.');
    expect(out.split(' ')).toHaveLength(2);
    expect(out.startsWith('One two three')).toBe(true);
  });
});
