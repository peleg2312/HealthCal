import { describe, expect, it } from 'vitest';

import { AWAY_MS } from '@/features/today/backToToday';

import {
  isPlainLink,
  laterDay,
  linkTarget,
  linkToToday,
  MORNING_FROM,
  MORNING_UNTIL,
  morningShows,
  morningVerdict,
  pulledSince,
  REMINDER_WINDOW_MS,
  reminderSince,
  waitsForToday,
  yieldsToUpdate,
  type MorningInput,
} from './rule';

const NOW = new Date(2026, 10, 17, 8, 10).getTime();

/** Everything true: the page is due. */
const due: MorningInput = {
  today: '2026-11-17',
  minutes: 8 * 60 + 10,
  allowed: true,
  enabled: true,
  onboardedDay: '2026-11-01',
  seenDay: '2026-11-16',
  yesterday: { food: 6, activities: 1, water: 4 },
  onToday: true,
  sheetOpen: false,
  reminderAt: null,
  reminderFrom: reminderSince(NOW),
  linked: false,
  actedAt: null,
  actedFrom: NOW,
};
const v = (patch: Partial<MorningInput>) => morningVerdict({ ...due, ...patch });

describe('morningVerdict', () => {
  it('an everything-true input is due', () => {
    expect(morningVerdict(due)).toEqual({ open: true, reason: 'due' });
    expect(morningShows(due)).toBe(true);
  });

  it('each check flips the verdict and reports its reason', () => {
    const cases: [Partial<MorningInput>, string][] = [
      [{ allowed: false }, 'automated'],
      [{ enabled: false }, 'off'],
      [{ onboardedDay: null }, 'no-setup'],
      [{ onboardedDay: '2026-11-17' }, 'setup-today'],
      [{ seenDay: '2026-11-17' }, 'seen'],
      [{ minutes: 13 * 60 }, 'not-morning'],
      [{ yesterday: { food: 0, activities: 0, water: 0 } }, 'nothing-yesterday'],
      [{ actedAt: NOW + 400 }, 'acted'],
      [{ onToday: false }, 'elsewhere'],
      [{ sheetOpen: true }, 'sheet'],
      [{ reminderAt: NOW - 500 }, 'reminder'],
      [{ linked: true }, 'link'],
    ];
    for (const [patch, reason] of cases) {
      expect(v(patch)).toEqual({ open: false, reason });
      expect(morningShows({ ...due, ...patch })).toBe(false);
    }
  });

  it('runs the checks in order: the first failure decides', () => {
    expect(v({ allowed: false, enabled: false }).reason).toBe('automated');
    expect(v({ enabled: false, onboardedDay: null }).reason).toBe('off');
    expect(v({ seenDay: '2026-11-17', minutes: 13 * 60 }).reason).toBe('seen');
    expect(v({ minutes: 2 * 60, yesterday: { food: 0, activities: 0, water: 0 } }).reason).toBe('not-morning');
    expect(v({ onToday: false, sheetOpen: true, linked: true }).reason).toBe('elsewhere');
    expect(v({ reminderAt: NOW - 10, linked: true }).reason).toBe('reminder');
  });

  it('the morning is 04:00 up to but not including 12:00', () => {
    expect(MORNING_FROM).toBe(240);
    expect(MORNING_UNTIL).toBe(720);
    expect(v({ minutes: 239 }).reason).toBe('not-morning');
    expect(v({ minutes: 240 }).reason).toBe('due');
    expect(v({ minutes: 719 }).reason).toBe('due');
    expect(v({ minutes: 720 }).reason).toBe('not-morning');
    expect(v({ minutes: 0 }).reason).toBe('not-morning');
  });

  it('not on the setup day; the day after setup is the first', () => {
    expect(v({ onboardedDay: '2026-11-17' }).reason).toBe('setup-today');
    // A clock set back below the setup day.
    expect(v({ onboardedDay: '2026-11-18' }).reason).toBe('setup-today');
    expect(v({ onboardedDay: '2026-11-16' }).reason).toBe('due');
    expect(v({ onboardedDay: null }).reason).toBe('no-setup');
  });

  it('once a day: seen today blocks, seen yesterday or never does not', () => {
    expect(v({ seenDay: '2026-11-17' }).reason).toBe('seen');
    // A seen day after today (a clock set back, a flight west over the date line) is seen too.
    expect(v({ seenDay: '2026-11-18' }).reason).toBe('seen');
    expect(v({ seenDay: '2026-11-16' }).reason).toBe('due');
    expect(v({ seenDay: undefined }).reason).toBe('due');
  });

  it('yesterday counts with any food, activity or water; all zero does not', () => {
    expect(v({ yesterday: { food: 0, activities: 0, water: 1 } }).reason).toBe('due');
    expect(v({ yesterday: { food: 0, activities: 1, water: 0 } }).reason).toBe('due');
    expect(v({ yesterday: { food: 1, activities: 0, water: 0 } }).reason).toBe('due');
    expect(v({ yesterday: { food: 0, activities: 0, water: 0 } }).reason).toBe('nothing-yesterday');
  });

  it('a reminder answered from 3 s before the look began, or any time after, blocks', () => {
    expect(REMINDER_WINDOW_MS).toBe(3000);
    expect(reminderSince(NOW)).toBe(NOW - 3000);
    expect(v({ reminderAt: NOW - 3000 }).reason).toBe('reminder');
    expect(v({ reminderAt: NOW - 3001 }).reason).toBe('due');
    expect(v({ reminderAt: NOW - 60_000 }).reason).toBe('due');
    // A slow start-up: the decision comes 5 s after the look began and the reminder came 1 s in. Still blocked.
    expect(v({ reminderAt: NOW + 1000 }).reason).toBe('reminder');
    expect(v({ reminderAt: NOW + 4500 }).reason).toBe('reminder');
    // A cold start counts every reminder since the app started.
    const launchedAt = NOW - 20_000;
    expect(v({ reminderFrom: reminderSince(launchedAt), reminderAt: NOW - 15_000 }).reason).toBe('reminder');
  });

  it('a deep link blocks', () => {
    expect(v({ linked: true }).reason).toBe('link');
  });

  it('stands down once the person has acted in this visit: never over or right after what they just did', () => {
    // A + sheet tile logged 400 ms into the look; search opened and closed again; a sheet opened and closed.
    expect(v({ actedAt: NOW + 400 }).reason).toBe('acted');
    expect(v({ actedAt: NOW }).reason).toBe('acted');
    // Acting during a signed-in person's sync wait, after the first verdict: the second read stands down.
    expect(v({ actedAt: NOW + 6000 }).reason).toBe('acted');
    // What was done before this visit's look began is not this visit's.
    expect(v({ actedAt: NOW - 1 }).reason).toBe('due');
    expect(v({ actedAt: NOW - 3_600_000 }).reason).toBe('due');
    // It comes before where the app is, so a screen the person opened never arms a later opening on Today.
    expect(v({ actedAt: NOW + 400, onToday: false }).reason).toBe('acted');
    expect(v({ actedAt: NOW + 400, sheetOpen: true }).reason).toBe('acted');
    // And after the checks that do not depend on this visit.
    expect(v({ actedAt: NOW + 400, seenDay: '2026-11-17' }).reason).toBe('seen');
    expect(v({ actedAt: NOW + 400, minutes: 13 * 60 }).reason).toBe('not-morning');
  });
});

describe('waitsForToday', () => {
  it('found elsewhere with nothing else in the way: the page waits for Today', () => {
    expect(waitsForToday({ ...due, onToday: false })).toBe(true);
  });
  it('not when it opened (or would not open on Today either)', () => {
    expect(waitsForToday(due)).toBe(false);
    expect(waitsForToday({ ...due, onToday: false, linked: true })).toBe(false);
    expect(waitsForToday({ ...due, onToday: false, reminderAt: NOW })).toBe(false);
    expect(waitsForToday({ ...due, onToday: false, sheetOpen: true })).toBe(false);
    expect(waitsForToday({ ...due, onToday: false, seenDay: '2026-11-17' })).toBe(false);
    expect(waitsForToday({ ...due, onToday: false, minutes: 13 * 60 })).toBe(false);
    expect(waitsForToday({ ...due, sheetOpen: true })).toBe(false);
    // The person opened that screen (or logged) in this visit: no page on the way back to Today.
    expect(waitsForToday({ ...due, onToday: false, actedAt: NOW + 300 })).toBe(false);
  });
});

describe('yieldsToUpdate', () => {
  const away = { at: NOW - AWAY_MS, day: '2026-11-17' as const };
  it('a waiting update on a return after five minutes or more goes first', () => {
    expect(yieldsToUpdate(true, away, NOW)).toBe(true);
  });
  it('not without an update, a shorter time away, or no time away', () => {
    expect(yieldsToUpdate(false, away, NOW)).toBe(false);
    expect(yieldsToUpdate(true, { ...away, at: NOW - AWAY_MS + 1 }, NOW)).toBe(false);
    expect(yieldsToUpdate(true, null, NOW)).toBe(false);
    // A clock set back while away counts as no time away.
    expect(yieldsToUpdate(true, { ...away, at: NOW + 60_000 }, NOW)).toBe(false);
  });
});

describe('laterDay', () => {
  it('the later of the device and the synced seen day', () => {
    expect(laterDay(undefined, undefined)).toBeUndefined();
    expect(laterDay('2026-11-16', undefined)).toBe('2026-11-16');
    expect(laterDay(undefined, '2026-11-16')).toBe('2026-11-16');
    expect(laterDay('2026-11-17', '2026-11-16')).toBe('2026-11-17');
    expect(laterDay('2026-11-15', '2026-11-17')).toBe('2026-11-17');
  });
  it('an older synced day pulled down (a sign-in keeping the account plan) does not undo this morning', () => {
    expect(v({ seenDay: laterDay('2026-11-17', '2026-11-10') }).reason).toBe('seen');
  });
});

describe('pulledSince', () => {
  const since = NOW;
  it('a whole round that ended after the look began', () => {
    expect(pulledSince('idle', new Date(NOW + 1).toISOString(), since)).toBe(true);
    expect(pulledSince('idle', new Date(NOW).toISOString(), since)).toBe(true);
  });
  it('not one from before, one still running, one that failed, or none', () => {
    expect(pulledSince('idle', new Date(NOW - 1).toISOString(), since)).toBe(false);
    expect(pulledSince('syncing', new Date(NOW + 1).toISOString(), since)).toBe(false);
    expect(pulledSince('offline', new Date(NOW + 1).toISOString(), since)).toBe(false);
    expect(pulledSince('error', new Date(NOW + 1).toISOString(), since)).toBe(false);
    expect(pulledSince('idle', null, since)).toBe(false);
    expect(pulledSince('idle', 'not a time', since)).toBe(false);
  });
});

describe('isPlainLink', () => {
  it('no link, or a link to Today with nothing in it, is a plain open', () => {
    for (const url of [null, undefined, '', 'healthcal://', 'healthcal:///', 'https://healthcal.app', 'https://healthcal.app/', 'exp://192.168.1.4:8081', 'exp://192.168.1.4:8081/--/', '/']) {
      expect(isPlainLink(url)).toBe(true);
    }
  });

  it('a link somewhere, or with a query, is not', () => {
    for (const url of [
      'healthcal://friends/add?invite=ABC',
      'healthcal:///water',
      'healthcal://?code=123',
      'https://healthcal.app/diary?date=2026-11-16',
      'https://healthcal.app/?code=abc',
      'exp://192.168.1.4:8081/--/food/search?meal=lunch',
      '/water',
      '/?x=1',
    ]) {
      expect(isPlainLink(url)).toBe(false);
    }
  });

  it("a development build's launcher link is a plain open", () => {
    expect(isPlainLink('healthcal://expo-development-client/?url=http%3A%2F%2F10.0.2.2%3A8081')).toBe(true);
  });

  it('a hash alone is not a link anywhere', () => {
    expect(isPlainLink('https://healthcal.app/#top')).toBe(true);
  });

  it('a page with no address of its own (the hosted preview in a frame) is a plain open', () => {
    for (const url of ['about:srcdoc', 'about:blank', 'blob:https://x.example/abc', 'data:text/html,hi']) expect(isPlainLink(url)).toBe(true);
  });
});

describe('linkToToday', () => {
  it('a start-up link to Today with something in it', () => {
    expect(linkToToday('/?ref=mail')).toBe(true);
    expect(linkToToday('https://healthcal.app/?code=abc')).toBe(true);
    expect(linkToToday('healthcal://?code=123')).toBe(true);
  });
  it("not a plain open, and not a link elsewhere (that lands elsewhere; Today later is the person's own visit)", () => {
    for (const url of [null, '', '/', 'https://healthcal.app/', '/diary', '/diary?date=2026-11-16', 'healthcal://friends/add?invite=ABC', 'about:srcdoc']) {
      expect(linkToToday(url)).toBe(false);
    }
  });
  it('linkTarget splits path and query', () => {
    expect(linkTarget('exp://192.168.1.4:8081/--/food/search?meal=lunch#x')).toEqual({ path: 'food/search', query: 'meal=lunch' });
    expect(linkTarget('healthcal://expo-development-client/?url=x')).toBeNull();
  });
});
