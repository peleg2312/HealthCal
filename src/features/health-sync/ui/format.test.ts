import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { planSync } from '../plan';
import { CTX, handLogged, TYPE, workout } from '../testing';
import { NO_ACCESS } from '../types';

import { accessNote, originLine, profileSubtitle, reviewLabels, reviewView, switchSubtitle } from './format';

const plain = (s: string) => s.replace(/ /g, ' ');

describe('sync screen wording', () => {
  const tz = process.env.TZ;
  beforeEach(() => {
    process.env.TZ = 'Europe/Amsterdam';
  });
  afterEach(() => {
    process.env.TZ = tz;
  });

  it('a possible duplicate with measured calories', () => {
    const hand = handLogged('running', 45, '2026-11-13', '2026-11-13T09:00:00');
    const item = planSync({ workouts: [workout({ start: '2026-11-13T06:00:00Z', minutes: 45, activeKcal: 480, totalKcal: 552, distanceM: 8200 })], existing: [hand], ctx: CTX }).review[0];
    const v = reviewView(item, '2026-11-14', 'metric', false);
    expect(v).toMatchObject({ title: 'Running', emoji: '🏃', source: 'From Garmin Connect', added: '+483', estimate: false, detail: '552 in total' });
    expect(plain(v.meta)).toBe('Yesterday · 07:00 · 45 min · 8.2 km');
    expect(v.spoken).toBe('Running, Yesterday · 07:00 · 45 min · 8.2 km, From Garmin Connect, 483 kilocalories above resting, measured');
    expect(plain(reviewView(item, '2026-11-14', 'imperial', true).meta)).toBe('Yesterday · 7:00 AM · 45 min · 5.1 mi');
  });

  it('a possible duplicate without calories shows an estimate with its range', () => {
    const hand = handLogged('running', 45, '2026-11-13', '2026-11-13T09:00:00');
    const item = planSync({ workouts: [workout({ start: '2026-11-13T06:00:00Z', minutes: 45 })], existing: [hand], ctx: CTX }).review[0];
    const v = reviewView(item, '2026-11-20', 'metric', false);
    expect(v.estimate).toBe(true);
    expect(v.added).toMatch(/^~\d+$/);
    expect(v.detail).toMatch(/^est\. \d+–\d+$/);
    expect(plain(v.meta)).toBe('Fri, Nov 13 · 07:00 · 45 min');
  });

  it('a workout without an activity shows the type and what the watch recorded', () => {
    const item = planSync({ workouts: [workout({ start: '2026-11-13T16:00:00Z', minutes: 90, exerciseType: TYPE.paddling, activeKcal: 300, zoneOffsetSec: -5 * 3600 })], existing: [], ctx: CTX }).review[0];
    const v = reviewView(item, '2026-11-14', 'metric', false);
    expect(v).toMatchObject({ title: 'Paddling', emoji: null, added: null, detail: '300 kcal active' });
    // The time shown is the one where it was recorded.
    expect(plain(v.meta)).toBe('Yesterday · 11:00 · 1 h 30 min');
  });

  it('names the workout in every button label, so three Skip buttons can be told apart', () => {
    const hand = handLogged('running', 45, '2026-11-13', '2026-11-13T09:00:00');
    const dup = planSync({ workouts: [workout({ start: '2026-11-13T06:00:00Z', minutes: 45, totalKcal: 552 })], existing: [hand], ctx: CTX }).review[0];
    const l = reviewLabels(dup, reviewView(dup, '2026-11-14', 'metric', false));
    expect(l).toMatchObject({
      skip: 'Skip running, yesterday 07:00',
      add: 'Keep both: add running, yesterday 07:00, as well',
      replace: 'Replace my hand-logged session with running, yesterday 07:00',
    });
    const paddle = planSync({ workouts: [workout({ start: '2026-11-12T16:00:00Z', minutes: 60, exerciseType: TYPE.paddling })], existing: [], ctx: CTX }).review[0];
    const p = reviewLabels(paddle, reviewView(paddle, '2026-11-20', 'metric', false));
    expect(p.skip).toBe('Skip paddling, Thu, Nov 12 17:00');
    expect(p.choose).toBe('Choose the activity for paddling, Thu, Nov 12 17:00');
    expect(p.likely).toBe('Likely activities for paddling, Thu, Nov 12 17:00');
  });

  it('words the app list, the switch and the Profile row', () => {
    expect(originLine({ origin: 'x', name: 'Garmin Connect', count: 3, latest: '2026-11-13T06:00:00Z' })).toBe('3 workouts, latest Nov 13');
    expect(originLine({ origin: 'x', name: 'Strava', count: 1, latest: '2026-11-02T12:00:00Z' })).toBe('1 workout, latest Nov 2');

    const off = { enabled: false, lastSyncedAt: null, lastError: null, review: [] };
    const on = { ...off, enabled: true, lastSyncedAt: '2026-11-14T11:55:00Z' };
    expect(switchSubtitle(off, false, false, null)).toBe('Off');
    expect(switchSubtitle(off, false, true, null)).toBe('Waiting for Health Connect');
    expect(switchSubtitle(on, true, false, '5 min ago')).toBe('Syncing now');
    expect(switchSubtitle(on, false, false, '5 min ago')).toBe('On, last synced 5 min ago');
    expect(switchSubtitle({ ...on, lastError: { code: 'timeout', at: 'x' } }, false, false, '5 min ago')).toBe('On, but the last sync did not finish');

    expect(profileSubtitle(off, false, null)).toBe('In the Android app');
    expect(profileSubtitle(off, true, null)).toBe('Off. Add Garmin and other workouts by themselves');
    expect(profileSubtitle(on, true, '5 min ago')).toBe('On, last synced 5 min ago');
    expect(profileSubtitle({ ...on, lastError: { code: 'permission', at: 'x' } }, true, null)).toBe('Needs attention');
    const waiting = planSync({ workouts: [workout({ start: '2026-11-13T16:00:00Z', minutes: 90, exerciseType: TYPE.paddling })], existing: [], ctx: CTX }).review;
    expect(profileSubtitle({ ...on, review: waiting }, true, '5 min ago')).toBe('On, 1 workout needs a look');
  });

  it('says what is not shared', () => {
    expect(accessNote(null)).toBeNull();
    expect(accessNote({ workouts: true, activeEnergy: true, totalEnergy: false, distance: true })).toBeNull();
    expect(accessNote({ ...NO_ACCESS, workouts: true })).toMatch(/^Calories and distance are not shared/);
    expect(accessNote({ ...NO_ACCESS, workouts: true, distance: true })).toMatch(/^Calories are not shared/);
    expect(accessNote({ workouts: true, activeEnergy: true, totalEnergy: true, distance: false })).toMatch(/^Distance is not shared/);
  });
});
