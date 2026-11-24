import { describe, expect, it } from 'vitest';

import { langParts, scriptLang, wholeLang } from './textLang';

describe('the language of a name inside a line', () => {
  it('finds Hebrew and Arabic', () => {
    expect(scriptLang('Banana')).toBeNull();
    expect(scriptLang('קוטג׳ 5%')).toBe('he');
    expect(scriptLang('حمص')).toBe('ar');
  });

  it('marks a line that is wholly such a name as a whole', () => {
    expect(wholeLang('‎⁨ארוחת בוקר ישראלית⁩')).toBe('he');
    expect(wholeLang('1 ⁨גביע⁩ · 250 g')).toBeNull();
  });

  it('cuts a line into its parts, the name with its language, and joins back to the line', () => {
    const line = '1 ‎⁨גביע⁩ · 250 g · Your food';
    const parts = langParts(line);
    expect(parts.map((p) => p.text).join('')).toBe(line);
    expect(parts.filter((p) => p.lang).map((p) => [p.text, p.lang])).toEqual([['⁨גביע⁩', 'he']]);
  });

  it('finds a bare run of words with no isolate', () => {
    const line = 'Saved as "סלט ירקות" today';
    const parts = langParts(line);
    expect(parts.map((p) => p.text).join('')).toBe(line);
    expect(parts.filter((p) => p.lang).map((p) => p.text)).toEqual(['סלט ירקות']);
  });

  it('leaves an English line as one part', () => {
    expect(langParts('2 items · 446 kcal')).toEqual([{ text: '2 items · 446 kcal', lang: null }]);
  });
});
