import { describe, expect, it } from 'vitest';

import { BIRTH_AUTOCOMPLETE, birthDateWords, birthIso, birthParts } from './birthDate';

describe('birth date in Goals', () => {
  it('splits and joins a stored date', () => {
    expect(birthParts('1994-05-12')).toEqual({ year: 1994, month: 5, day: 12 });
    expect(birthParts('')).toEqual({ year: null, month: null, day: null });
    expect(birthIso({ day: 12, month: 5, year: 1994 })).toBe('1994-05-12');
    expect(birthIso({ day: 12, month: null, year: 1994 })).toBeNull();
    expect(birthIso({ day: 45, month: 13, year: 1890 })).toBe('1890-13-45');
  });

  it('says it in the app date style, never ISO', () => {
    expect(birthDateWords('1994-05-12')).toBe('May 12, 1994');
    expect(birthDateWords('2001-11-03')).toBe('Nov 3, 2001');
  });

  it('names each field’s purpose with the birthday autofill tokens', () => {
    expect(BIRTH_AUTOCOMPLETE).toEqual({ day: 'bday-day', month: 'bday-month', year: 'bday-year' });
  });
});
