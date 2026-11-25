import { describe, expect, it } from 'vitest';

import { addDays } from '@/lib/dates';
import { computeConsistency } from '@/store/selectors';

import { isKeptDay, KEPT_LEGEND, KEPT_LINE, KEPT_LINE_SHORT, KEPT_SEEN_MS, KEPT_SPOKEN, keptDashes, keptDays, keptLineDue, keptRunStep, type KeptRunState } from './kept';

const TODAY = '2026-11-25';
/** Days back from TODAY, as day keys. */
const set = (...back: number[]) => new Set(back.map((n) => addDays(TODAY, -n)));
const day = (n: number) => addDays(TODAY, -n);

describe('isKeptDay', () => {
  it('is a quiet day between two logged days', () => {
    const logged = set(0, 2, 3);
    expect(isKeptDay(day(1), logged, TODAY)).toBe(true);
    expect(isKeptDay(day(4), logged, TODAY)).toBe(false);
  });

  it('is never two quiet days in a row: they end the streak', () => {
    const logged = set(0, 3, 4);
    expect(isKeptDay(day(1), logged, TODAY)).toBe(false);
    expect(isKeptDay(day(2), logged, TODAY)).toBe(false);
  });

  it('is yesterday while today is still open, in a run of two logged days or more', () => {
    expect(isKeptDay(day(1), set(2, 3), TODAY)).toBe(true);
    // Bridged further back: still a run of two.
    expect(isKeptDay(day(1), set(2, 4), TODAY)).toBe(true);
    // A run of one is no streak to keep.
    expect(isKeptDay(day(1), set(2), TODAY)).toBe(false);
    expect(isKeptDay(day(1), set(2, 5), TODAY)).toBe(false);
  });

  it('is never today, a day still to come or a logged day', () => {
    expect(isKeptDay(TODAY, set(1, 2), TODAY)).toBe(false);
    expect(isKeptDay(addDays(TODAY, 1), set(0, 2), TODAY)).toBe(false);
    expect(isKeptDay(day(1), set(0, 1, 2), TODAY)).toBe(false);
  });

  it('keeps every single quiet day of a long run, past runs included', () => {
    const logged = set(0, 2, 4, 5, 6, 10, 12);
    expect([...keptDays(logged, TODAY)].sort()).toEqual([day(11), day(3), day(1)].sort());
  });
});

describe('agrees with the streak (computeConsistency)', () => {
  // A deterministic walk over many date sets: the streak counts a kept day's run straight through it.
  let seed = 7;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  it('a kept day never ends the current streak, and a quiet day that is not kept does', () => {
    for (let t = 0; t < 400; t++) {
      const logged = new Set<string>();
      for (let n = 0; n < 20; n++) if (rand() < 0.6) logged.add(day(n));
      const streak = computeConsistency(logged, TODAY).streak;
      // Walk back from the last day the streak may start on, as the streak does, and count the logged days passed
      // while every quiet day on the way is kept.
      let cursor = logged.has(TODAY) ? TODAY : day(1);
      let counted = 0;
      while (cursor >= day(25)) {
        if (logged.has(cursor)) counted += 1;
        else if (!isKeptDay(cursor, logged, TODAY)) break;
        cursor = addDays(cursor, -1);
      }
      // A run of one before a quiet yesterday is not kept (no streak mark shows); the streak counts it as 1.
      const runOfOne = !logged.has(TODAY) && !logged.has(day(1)) && logged.has(day(2)) && !logged.has(day(3)) && !logged.has(day(4));
      expect(runOfOne ? 1 : counted).toBe(streak);
    }
  });
});

describe('the kept line', () => {
  it('draws three whole dashes across the slim strip’s 16 x 20 cup, and at least two in any cup', () => {
    // 13 px inside the walls: 3 + 2 + 3 + 2 + 3.
    expect(keptDashes(13)).toEqual({ count: 3, dash: 3, gap: 2, offset: 0 });
    // The calendar's 22 px cup: 19 inside, four dashes centred.
    expect(keptDashes(19)).toEqual({ count: 4, dash: 3, gap: 2, offset: 0.5 });
    // The legend's 14 px cup: two dashes.
    expect(keptDashes(11).count).toBe(2);
    // Too narrow for two whole dashes: they shorten, never fewer than two.
    const tiny = keptDashes(6);
    expect(tiny.count).toBe(2);
    expect(tiny.dash * 2 + tiny.gap).toBeLessThanOrEqual(6);
  });

  it('is said once, only where allowed and read, with a kept day in the week shown on today', () => {
    expect(keptLineDue({ allowed: true, said: false, keptInWeek: true, onToday: true })).toBe(true);
    expect(keptLineDue({ allowed: true, said: null, keptInWeek: true, onToday: true })).toBe(false);
    expect(keptLineDue({ allowed: true, said: true, keptInWeek: true, onToday: true })).toBe(false);
    expect(keptLineDue({ allowed: false, said: false, keptInWeek: true, onToday: true })).toBe(false);
    expect(keptLineDue({ allowed: true, said: false, keptInWeek: false, onToday: true })).toBe(false);
    expect(keptLineDue({ allowed: true, said: false, keptInWeek: true, onToday: false })).toBe(false);
  });

  it('counts as said only once it was in front for KEPT_SEEN_MS in all; covered sooner, it shows again', () => {
    const start: KeptRunState = { run: 'idle', shownMs: 0, said: null };
    const read = keptRunStep(start, { type: 'read', said: false });
    expect(read.said).toBe(false);
    // A later read never overrides what this run already decided.
    expect(keptRunStep({ ...read, said: true }, { type: 'read', said: false }).said).toBe(true);
    const shown = keptRunStep(read, { type: 'show' });
    expect(shown.run).toBe('showing');
    // The morning page rises over Today 900 ms after a morning start: not seen yet, not said, back to idle.
    const covered = keptRunStep(keptRunStep(shown, { type: 'tick', ms: 900, inFront: true }), { type: 'left' });
    expect(covered).toEqual({ run: 'idle', shownMs: 900, said: false });
    // Back on Today it shows again, and time under a sheet or with the app away does not count.
    let s = keptRunStep(covered, { type: 'show' });
    s = keptRunStep(s, { type: 'tick', ms: 5000, inFront: false });
    expect(s.said).toBe(false);
    s = keptRunStep(s, { type: 'tick', ms: KEPT_SEEN_MS - 900 - 1, inFront: true });
    expect(s.said).toBe(false);
    s = keptRunStep(s, { type: 'tick', ms: 1, inFront: true });
    expect(s.said).toBe(true);
    // Seen: it stays while Today is in front, and is done once Today is left; it never shows again.
    expect(s.run).toBe('showing');
    s = keptRunStep(s, { type: 'left' });
    expect(s.run).toBe('done');
    expect(keptRunStep(s, { type: 'show' }).run).toBe('done');
    // A tick when nothing is drawn changes nothing.
    expect(keptRunStep(covered, { type: 'tick', ms: 5000, inFront: true })).toBe(covered);
  });

  it('its X puts it away at once and keeps it as said, seen or not', () => {
    const shown: KeptRunState = { run: 'showing', shownMs: 200, said: false };
    expect(keptRunStep(shown, { type: 'hide' })).toEqual({ run: 'done', shownMs: 200, said: true });
  });

  it('uses neutral words: no banned word, no exclamation mark', () => {
    const banned = /\b(bad|fail|failed|failure|cheat|cheated|should|guilty|lazy|great|amazing|well done|keep it up|missed|over budget|make up|only|unfortunately|oops|sorry)\b/i;
    for (const w of [KEPT_LINE, KEPT_LINE_SHORT, KEPT_SPOKEN, KEPT_LEGEND]) {
      expect(w).not.toMatch(banned);
      expect(w).not.toContain('!');
    }
  });
});
