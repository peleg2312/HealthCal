import { describe, expect, it } from 'vitest';

import { demoPhotos, isDemoPhoto, journalDemoOn } from './demo';
import { isShown, journalDays, journalDayTitle, JOURNAL_WORDS, photosToPrune, photoTileLabel, shownPhotos, UNDO_MS, type MealPhoto } from './rules';

const photo = (id: string, date: string, meal: MealPhoto['meal'], entryIds: string[], extra: Partial<MealPhoto> = {}): MealPhoto => ({
  id,
  date,
  meal,
  entryIds,
  keptAt: `${date}T12:00:00.000Z`,
  width: 480,
  height: 360,
  ...extra,
});

/** A local time on a day, as the store stamps `updatedAt`. */
const at = (date: string, hour = 12) => new Date(`${date}T${String(hour).padStart(2, '0')}:00:00`).toISOString();

describe('which photos the journal shows', () => {
  const entries = {
    a: { date: '2026-11-25', updatedAt: at('2026-11-25') },
    b: { date: '2026-11-25', updatedAt: at('2026-11-25'), deleted: true },
    c: { date: '2026-11-25', updatedAt: at('2026-11-25'), deleted: true },
  };

  it('shows a photo while one entry it produced is live, and not once the person deleted it', () => {
    expect(isShown(photo('p', '2026-11-25', 'lunch', ['a', 'b']), entries)).toBe(true);
    expect(isShown(photo('p', '2026-11-25', 'lunch', ['b', 'c']), entries)).toBe(false);
    expect(isShown(photo('p', '2026-11-25', 'lunch', ['missing']), entries)).toBe(false);
    expect(isShown(photo('p', '2026-11-25', 'lunch', ['a'], { deletedAt: at('2026-11-25') }), entries)).toBe(false);
  });

  it('lists the newest day first, each day in meal order', () => {
    const all = [photo('x', '2026-11-24', 'dinner', ['a']), photo('y', '2026-11-25', 'dinner', ['a']), photo('z', '2026-11-25', 'breakfast', ['a'])];
    expect(shownPhotos(all, entries).map((p) => p.id)).toEqual(['z', 'y', 'x']);
    expect(journalDays(all).map((d) => [d.date, d.photos.map((p) => p.id)])).toEqual([
      ['2026-11-25', ['z', 'y']],
      ['2026-11-24', ['x']],
    ]);
  });
});

describe('which files go', () => {
  const now = Date.parse(at('2026-11-25', 15));
  const today = '2026-11-25';

  it('keeps a photo deleted by the person while its Undo can still bring it back, then lets it go', () => {
    const fresh = photo('p', today, 'lunch', ['a'], { deletedAt: new Date(now - 1000).toISOString() });
    const old = photo('q', today, 'lunch', ['a'], { deletedAt: new Date(now - UNDO_MS).toISOString() });
    expect(photosToPrune([fresh, old], { a: { date: today, updatedAt: at(today) } }, now, today, true)).toEqual(['q']);
  });

  it('keeps a photo whose entries were deleted today (the diary still offers them back), not one deleted on an earlier day', () => {
    const entries = {
      today: { date: today, updatedAt: at(today, 9), deleted: true },
      before: { date: '2026-11-24', updatedAt: at('2026-11-24', 20), deleted: true },
      live: { date: today, updatedAt: at(today) },
    };
    const list = [photo('t', today, 'lunch', ['today']), photo('b', '2026-11-24', 'dinner', ['before']), photo('l', today, 'dinner', ['live', 'before'])];
    expect(photosToPrune(list, entries, now, today, true)).toEqual(['b']);
  });

  it('lets a photo go once every entry it produced is gone from the store, but never before the store is loaded', () => {
    const list = [photo('m', today, 'lunch', ['gone'])];
    expect(photosToPrune(list, {}, now, today, true)).toEqual(['m']);
    expect(photosToPrune(list, {}, now, today, false)).toEqual([]);
  });
});

describe('the words', () => {
  it('names a day the way the diary does', () => {
    expect(journalDayTitle('2026-11-25', '2026-11-25', '2026-11-24')).toBe('Today');
    expect(journalDayTitle('2026-11-24', '2026-11-25', '2026-11-24')).toBe('Yesterday');
    expect(journalDayTitle('2026-11-17', '2026-11-25', '2026-11-24')).toMatch(/^Tue, Nov 17$/);
  });

  it('names a tile by its meal, its day and what it holds', () => {
    const p = photo('p', '2026-11-25', 'lunch', []);
    expect(photoTileLabel(p, 'Today', [])).toBe('Photo of lunch, Today');
    expect(photoTileLabel(p, 'Today', ['Rice', 'Chicken'])).toBe('Photo of lunch, Today: Rice and Chicken');
    expect(photoTileLabel(p, 'Today', ['Rice', 'Chicken', 'Salad', 'Oil'])).toBe('Photo of lunch, Today: Rice, Chicken and 2 more');
  });

  it('says plainly that photos stay on the phone, with no exclamation mark', () => {
    expect(JOURNAL_WORDS.privacyNote).toMatch(/never uploaded, synced or put in an export/);
    for (const w of Object.values(JOURNAL_WORDS)) expect(w).not.toMatch(/!/);
  });
});

describe('the demo journal (test builds only)', () => {
  it('is off without its flag', () => {
    expect(journalDemoOn()).toBe(false);
  });

  it('makes one photo per meal with live entries on the days asked, never a future day', () => {
    const entries = [
      { id: '1', date: '2026-11-25', meal: 'lunch', deleted: false },
      { id: '2', date: '2026-11-25', meal: 'lunch', deleted: false },
      { id: '3', date: '2026-11-24', meal: 'dinner', deleted: true },
      { id: '4', date: '2026-11-26', meal: 'breakfast', deleted: false },
    ] as never;
    const out = demoPhotos(entries, '2026-11-25', ['2026-11-26', '2026-11-25', '2026-11-24']);
    expect(out.map((p) => [p.date, p.meal, p.entryIds])).toEqual([['2026-11-25', 'lunch', ['1', '2']]]);
    expect(isDemoPhoto(out[0].id)).toBe(true);
    expect(isDemoPhoto('0b7d6c1e-1111-4a3b-9c0d-123456789abc')).toBe(false);
  });
});
