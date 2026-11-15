import { describe, expect, it } from 'vitest';

import { greetingTitle, titleWidth } from './greetingTitle';

describe('greetingTitle', () => {
  it('measures close to the browser (Good morning, Alex is 245 px at 27 px)', () => {
    expect(Math.abs(titleWidth('Good morning, Alex', 27) - 245)).toBeLessThan(4);
  });
  it('keeps the name when the line fits', () => {
    expect(greetingTitle('Good morning', 'Alex', 242, 26)).toBe('Good morning, Alex');
  });
  it('drops the name rather than cutting it or wrapping', () => {
    expect(greetingTitle('Good afternoon', 'Christopher', 242, 26)).toBe('Good afternoon');
    expect(greetingTitle('Good morning', 'Alex', 172, 22)).toBe('Good morning');
  });
  it('has no comma when there is no name', () => {
    expect(greetingTitle('Good evening', '  ', 300, 26)).toBe('Good evening');
  });
});
