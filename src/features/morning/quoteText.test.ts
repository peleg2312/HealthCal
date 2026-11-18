import { describe, expect, it } from 'vitest';

import { quoteWords } from './quoteText';
import { QUOTES } from './quotes';

describe('quoteWords', () => {
  it('wraps the words in typographic quotation marks', () => {
    expect(quoteWords('Well done is better than well said.')).toBe('“Well done is better than well said.”');
  });

  it('turns apostrophes into ’, also at the start of a verse line', () => {
    expect(quoteWords("Come, my friends.\n'Tis not too late.")).toBe('“Come, my friends.\n’Tis not too late.”');
    expect(quoteWords("we can't turn back")).toBe('“we can’t turn back”');
  });

  it('sets a quotation inside the quote in single marks', () => {
    expect(quoteWords('Do not say, "It is morning," and dismiss it.')).toBe('“Do not say, ‘It is morning,’ and dismiss it.”');
  });

  it('changes only the marks of every bundled quote, never a word or a line break', () => {
    for (const q of QUOTES) {
      const shown = quoteWords(q.text);
      const back = shown.slice(1, -1).replace(/[‘’]/g, "'");
      expect(back.replace(/"/g, "'")).toBe(q.text.replace(/"/g, "'"));
      expect(shown.split('\n').length).toBe(q.text.split('\n').length);
      expect(shown).not.toMatch(/["']/);
    }
  });
});
