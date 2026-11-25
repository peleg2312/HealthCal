import { describe, expect, it } from 'vitest';

import { JUST_NOW_MS, wroteByPerson } from './acted';

const now = Date.parse('2026-11-25T08:10:00Z');
const iso = (ms: number) => new Date(ms).toISOString();

describe('wroteByPerson', () => {
  const old = { a: { updatedAt: iso(now - 86_400_000) } };

  it('counts a log written just now: a food entry, a glass, an Undo', () => {
    expect(wroteByPerson({ foodEntries: { ...old, b: { updatedAt: iso(now) } } }, { foodEntries: old }, now)).toBe(true);
    expect(wroteByPerson({ water: { w: { updatedAt: iso(now - 200) } } }, { water: {} }, now)).toBe(true);
    // A soft delete (or its Undo) rewrites the record with a new time.
    expect(wroteByPerson({ foodEntries: { a: { updatedAt: iso(now), deleted: true } as never } }, { foodEntries: old }, now)).toBe(true);
  });

  it('leaves out what the app writes by itself: day snapshots, a health store, a pull of older records', () => {
    expect(wroteByPerson({ days: { d: { updatedAt: iso(now) } } } as never, {}, now)).toBe(false);
    expect(wroteByPerson({ activities: { h: { updatedAt: iso(now), source: 'health' } } }, { activities: {} }, now)).toBe(false);
    expect(wroteByPerson({ sleep: { s: { updatedAt: iso(now), source: 'health' } } }, { sleep: {} }, now)).toBe(false);
    expect(wroteByPerson({ foodEntries: { p: { updatedAt: iso(now - JUST_NOW_MS - 1) } } }, { foodEntries: {} }, now)).toBe(false);
  });

  it('ignores an unchanged map and an unchanged record', () => {
    const same = { f: { updatedAt: iso(now) } };
    expect(wroteByPerson({ foodEntries: same }, { foodEntries: same }, now)).toBe(false);
    expect(wroteByPerson({ foodEntries: { ...same } }, { foodEntries: same }, now)).toBe(false);
    expect(wroteByPerson({ foodEntries: { x: { updatedAt: 'not a date' } } }, { foodEntries: {} }, now)).toBe(false);
  });
});
