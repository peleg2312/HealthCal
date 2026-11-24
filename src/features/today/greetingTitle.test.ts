import { describe, expect, it } from 'vitest';

import { greetingTitle, shortGreeting, titleWidth, todayTitle } from './greetingTitle';

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

describe("Today's title beside three header cups (shorten)", () => {
  const GREETINGS = ['Good morning', 'Good afternoon', 'Good evening', 'Good night'];
  // TabHeader's tabTitleRoom and tabTitleSize (kept here: the header's file loads React Native).
  const tabTitleRoom = (width: number) => Math.min(width, 560) - 2 * 20 - 12 - (3 * 36 + 2 * 4);
  const tabTitleSize = (width: number) => (width < 360 ? 22 : 26);
  const at = (width: number, g: string, name: string) => greetingTitle(g, name, tabTitleRoom(width), tabTitleSize(width), true);

  it('has room 222, 192 and 152 at 390, 360 and 320 (three 36 px cups, 4 px apart)', () => {
    expect([390, 360, 320].map(tabTitleRoom)).toEqual([222, 192, 152]);
  });

  it('shortens the greeting to its time of day, and leaves Good night alone', () => {
    expect(GREETINGS.map(shortGreeting)).toEqual(['Morning', 'Afternoon', 'Evening', 'Good night']);
  });

  it('tries the full line, then the short greeting with the name, then the greeting, then the short greeting', () => {
    expect(greetingTitle('Good evening', 'Dana', 400, 26, true)).toBe('Good evening, Dana');
    expect(greetingTitle('Good evening', 'Dana', 180, 26, true)).toBe('Evening, Dana');
    expect(greetingTitle('Good evening', 'Christopher', 180, 26, true)).toBe('Good evening');
    expect(greetingTitle('Good evening', 'Christopher', 120, 26, true)).toBe('Evening');
  });

  it('keeps the name at 360 where a short greeting holds it (the owner\'s phone)', () => {
    expect(at(360, 'Good morning', 'Alex')).toBe('Morning, Alex');
    expect(at(360, 'Good evening', 'Dana')).toBe('Evening, Dana');
    expect(at(360, 'Good afternoon', 'Al')).toBe('Afternoon, Al');
    expect(at(360, 'Good afternoon', 'Alex')).toBe('Afternoon, Alex');
  });

  it('never returns a line wider than the room, at every width, greeting and name', () => {
    for (const width of [390, 360, 320]) {
      for (const g of GREETINGS) {
        for (const name of ['', 'Al', 'Alex', 'Christopher', 'Maximilian-Alexander']) {
          const t = at(width, g, name);
          expect(titleWidth(t, tabTitleSize(width)), `${width} ${g} ${name}: ${t}`).toBeLessThanOrEqual(tabTitleRoom(width) - 4);
          if (name && t.includes(',')) expect(t.endsWith(`, ${name}`)).toBe(true);
        }
      }
    }
  });

  it('without shorten, keeps the old rule (the morning page)', () => {
    expect(greetingTitle('Good evening', 'Christopher', 120, 26)).toBe('Good evening');
  });
});

describe("Today's title with the step (todayTitle)", () => {
  const GREETINGS = ['Good morning', 'Good afternoon', 'Good evening', 'Good night'];
  const room = (width: number) => Math.min(width, 560) - 2 * 20 - 12 - (3 * 36 + 2 * 4);
  const size = (width: number) => (width < 360 ? 22 : 26);
  const at = (width: number, g: string, name: string) => todayTitle(g, name, room(width), size(width));

  it('keeps a 4-letter name in every greeting at 360 and 390, stepping to 24 px only where it must', () => {
    for (const width of [390, 360]) {
      for (const g of GREETINGS) {
        const t = at(width, g, 'Alex');
        expect(t.text.endsWith(', Alex'), `${width} ${g}: ${t.text}`).toBe(true);
        expect([26, 24]).toContain(t.size);
      }
    }
    expect(at(360, 'Good night', 'Alex')).toEqual({ text: 'Good night, Alex', size: 24 });
    expect(at(360, 'Good afternoon', 'Alex')).toEqual({ text: 'Afternoon, Alex', size: 26 });
  });

  it('never steps at 320 (22 px stays) and never returns a line wider than the room', () => {
    for (const width of [390, 360, 320]) {
      for (const g of GREETINGS) {
        for (const name of ['', 'Al', 'Alex', 'Christina', 'Christopher', 'Maximilian-Alexander']) {
          const t = at(width, g, name);
          if (width === 320) expect(t.size).toBe(22);
          expect(titleWidth(t.text, t.size), `${width} ${g} ${name}: ${t.text}`).toBeLessThanOrEqual(room(width) - 4);
          if (name && t.text.includes(',')) expect(t.text.endsWith(`, ${name}`)).toBe(true);
          if (!name) expect(t.size).toBe(size(width));
        }
      }
    }
  });

  it('draws without the name at the tab size, never the stepped size (the greeting then shortened as before)', () => {
    expect(at(360, 'Good afternoon', 'Maximilian-Alexander')).toEqual({ text: 'Afternoon', size: 26 });
  });

  it('reads like this at 390, 360 and 320 for a 4-letter and a 9-letter name', () => {
    const table = [390, 360, 320].map((w) => GREETINGS.map((g) => [at(w, g, 'Alex'), at(w, g, 'Christina')].map((t) => `${t.text} @${t.size}`)));
    expect(table).toMatchInlineSnapshot(`
      [
        [
          [
            "Morning, Alex @26",
            "Morning, Christina @24",
          ],
          [
            "Afternoon, Alex @26",
            "Good afternoon @26",
          ],
          [
            "Evening, Alex @26",
            "Evening, Christina @26",
          ],
          [
            "Good night, Alex @26",
            "Good night @26",
          ],
        ],
        [
          [
            "Morning, Alex @26",
            "Good morning @26",
          ],
          [
            "Afternoon, Alex @26",
            "Afternoon @26",
          ],
          [
            "Evening, Alex @26",
            "Good evening @26",
          ],
          [
            "Good night, Alex @24",
            "Good night @26",
          ],
        ],
        [
          [
            "Morning, Alex @22",
            "Good morning @22",
          ],
          [
            "Afternoon @22",
            "Afternoon @22",
          ],
          [
            "Evening, Alex @22",
            "Good evening @22",
          ],
          [
            "Good night @22",
            "Good night @22",
          ],
        ],
      ]
    `);
  });
});
