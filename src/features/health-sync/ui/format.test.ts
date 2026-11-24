import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { planSync } from '../plan';
import { CTX, handLogged, TYPE, workout } from '../testing';
import { NO_ACCESS } from '../types';

import { FULL_ACCESS } from '../fake';

import {
  accessNote,
  energyRowText,
  heartRateText,
  heartRowText,
  originLine,
  profileSubtitle,
  reviewLabels,
  reviewView,
  sleepRowText,
  stepsRowText,
  switchSubtitle,
  weightRowText,
} from './format';

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
    expect(v).toMatchObject({ title: 'Running', emoji: '🏃', source: 'From Garmin Connect', added: '~483', estimate: false, detail: '552 in total' });
    expect(plain(v.meta)).toBe('Yesterday · 07:00 · 45 min · 8.2 km');
    expect(v.spoken).toBe('Running, Yesterday · 07:00 · 45 minutes · 8.2 kilometres, From Garmin Connect, about 483 kilocalories added, from a measured burn');
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

    expect(profileSubtitle(off, 'unsupported', null)).toBe('In the Android app');
    expect(profileSubtitle(off, 'unsupported', null, 'In the iPhone and Android apps')).toBe('In the iPhone and Android apps');
    expect(switchSubtitle(off, false, true, null, 'Apple Health')).toBe('Waiting for Apple Health');
    expect(profileSubtitle(off, 'available', null)).toBe('Off. Add Garmin and other workouts by themselves');
    // Until the store answers, and where Android can install or update Health Connect, turning it on is still the way.
    expect(profileSubtitle(off, 'checking', null)).toBe('Off. Add Garmin and other workouts by themselves');
    expect(profileSubtitle(off, 'not-installed', null)).toBe('Off. Add Garmin and other workouts by themselves');
    expect(profileSubtitle(on, 'available', '5 min ago')).toBe('On, last synced 5 min ago');
    expect(profileSubtitle({ ...on, lastError: { code: 'permission', at: 'x' } }, 'available', null)).toBe('Needs attention');
    const waiting = planSync({ workouts: [workout({ start: '2026-11-13T16:00:00Z', minutes: 90, exerciseType: TYPE.paddling })], existing: [], ctx: CTX }).review;
    expect(profileSubtitle({ ...on, review: waiting }, 'available', '5 min ago')).toBe('On, 1 workout needs a look');
  });

  it('never invites turning on sync where this install cannot use it', () => {
    const off = { enabled: false, lastSyncedAt: null, lastError: null, review: [] };
    // An iPhone copy signed without the HealthKit entitlement: what is true there, and the way that works.
    expect(profileSubtitle(off, 'not-entitled', null, 'In the iPhone and Android apps')).toBe('Not available in this install. Import your Health export');
    expect(profileSubtitle({ ...off, enabled: true }, 'not-entitled', null)).toBe('Not available in this install. Import your Health export');
    // An iPad without Apple Health: where sync does work.
    expect(profileSubtitle(off, 'unsupported', null, 'In the iPhone and Android apps')).toBe('In the iPhone and Android apps');
    for (const a of ['not-entitled', 'unsupported'] as const) expect(profileSubtitle(off, a, null)).not.toMatch(/^Off/);
  });

  it('says what is not shared', () => {
    expect(accessNote(null)).toBeNull();
    expect(accessNote({ ...NO_ACCESS, workouts: true, activeEnergy: true, totalEnergy: false, distance: true, steps: true, sleep: true })).toBeNull();
    expect(accessNote({ ...NO_ACCESS, workouts: true })).toMatch(/^Calories and distance are not shared/);
    expect(accessNote({ ...NO_ACCESS, workouts: true, distance: true })).toMatch(/^Calories are not shared/);
    expect(accessNote({ ...NO_ACCESS, workouts: true, activeEnergy: true, totalEnergy: true, distance: false, steps: true, sleep: true })).toMatch(/^Distance is not shared/);
  });

  it('says what happens to steps', () => {
    const none = { days: {}, readAt: null };
    const read = { days: { '2026-11-13': 9100, '2026-11-14': 8432 }, readAt: '2026-11-14T11:00:00Z' };
    expect(stepsRowText({ ...NO_ACCESS, workouts: true }, read, '2026-11-14', 'Health Connect')).toBe('Not shared yet. Allow steps to see them on Train');
    expect(stepsRowText({ ...NO_ACCESS, workouts: true, steps: true }, read, '2026-11-14', 'Apple Health')).toBe('8,432 today, shown on Train');
    expect(stepsRowText({ ...NO_ACCESS, workouts: true, steps: true }, read, '2026-11-15', 'Apple Health')).toBe('None yet today. Shown on Train');
    expect(stepsRowText({ ...NO_ACCESS, workouts: true, steps: true }, none, '2026-11-14', 'Apple Health')).toBe('Shown on Train once they are read');
    expect(stepsRowText({ ...NO_ACCESS, workouts: true, steps: true }, { days: {}, readAt: 'x' }, '2026-11-14', 'Apple Health')).toBe('None in Apple Health in the last 35 days');
  });
});

describe('the Sleep row', () => {
  const all = { ...NO_ACCESS, workouts: true, activeEnergy: true, totalEnergy: true, distance: true, steps: true, sleep: true };
  it('offers to allow sleep when it is not shared, and says last night and where it came from', () => {
    expect(sleepRowText({ ...all, sleep: false }, null, null, 'Health Connect')).toBe('Not shared yet. Allow sleep to fill your sleep log');
    expect(sleepRowText(all, { hours: 7.2, source: 'health', store: 'healthConnect', origin: 'com.garmin.android.apps.connectmobile' }, '2026-11-14T08:00:00Z', 'Health Connect')).toBe(
      'Last night 7 h 12 min, from Garmin Connect',
    );
    expect(sleepRowText(all, { hours: 7.5, source: 'health', store: 'healthKit', origin: 'com.apple.health.watch' }, null, 'Apple Health')).toBe('Last night 7 h 30 min, from Apple Watch');
    expect(sleepRowText(all, { hours: 6 }, null, 'Apple Health')).toBe('Last night 6 h, entered by you');
    expect(sleepRowText(all, undefined, null, 'Apple Health')).toBe('Nights go to your sleep log once they are read');
    expect(sleepRowText(all, undefined, '2026-11-14T08:00:00Z', 'Apple Health')).toBe('No night from Apple Health for last night yet');
    // Deleted, or its sync undone: no later sync adds it, so the row does not say it may still come.
    expect(sleepRowText(all, undefined, '2026-11-14T08:00:00Z', 'Apple Health', true)).toBe('Last night was deleted. A sync does not add it again');
    expect(sleepRowText({ ...all, sleep: false }, undefined, null, 'Health Connect', true)).toBe('Not shared yet. Allow sleep to fill your sleep log');
  });
});

describe('the Weight, Calories burned and Heart rate rows', () => {
  const latest = { kg: 82.4, date: '2026-11-18', synced: true, from: 'Garmin Connect' };
  it('offers Allow until weight is shared, then says the latest and where it came from', () => {
    expect(weightRowText({ ...FULL_ACCESS, weight: false }, latest, null, 'Health Connect', 'metric')).toBe('Not shared yet. Allow it to fill in your weigh-ins');
    // A save from before the weight types existed has no flag at all.
    expect(weightRowText({ workouts: true } as never, latest, null, 'Health Connect', 'metric')).toBe('Not shared yet. Allow it to fill in your weigh-ins');
    expect(weightRowText(FULL_ACCESS, latest, null, 'Health Connect', 'metric')).toBe('Weigh-ins go to Weight after the next sync');
    expect(weightRowText(FULL_ACCESS, latest, '2026-11-18T08:00:00Z', 'Health Connect', 'metric')).toBe('Latest 82.4 kg on Nov 18, from Garmin Connect');
    expect(weightRowText(FULL_ACCESS, { ...latest, synced: false }, '2026-11-18T08:00:00Z', 'Health Connect', 'metric')).toBe('Latest 82.4 kg on Nov 18, entered by you');
    expect(weightRowText(FULL_ACCESS, latest, '2026-11-18T08:00:00Z', 'Health Connect', 'imperial')).toBe('Latest 181.7 lb on Nov 18, from Garmin Connect');
    expect(weightRowText(FULL_ACCESS, null, '2026-11-18T08:00:00Z', 'Apple Health', 'metric')).toBe('None in Apple Health in the last 4 weeks');
    // Held for the account's data sync: said, whether or not weigh-ins were read before.
    expect(weightRowText(FULL_ACCESS, null, null, 'Health Connect', 'metric', true)).toBe('Waiting for your account to sync before adding weigh-ins');
    expect(weightRowText(FULL_ACCESS, latest, '2026-11-18T08:00:00Z', 'Health Connect', 'metric', true)).toBe('Waiting for your account to sync before adding weigh-ins');
    expect(weightRowText({ ...FULL_ACCESS, weight: false }, latest, null, 'Health Connect', 'metric', true)).toBe('Not shared yet. Allow it to fill in your weigh-ins');
  });
  it('the day calories: Allow, the estimate, or when it will show', () => {
    expect(energyRowText({ ...FULL_ACCESS, dayEnergy: false }, null)).toBe("Not shared yet. Allow it to compare with HealthCal's estimate");
    expect(energyRowText(FULL_ACCESS, { avg: 2640, n: 6, label: 'Garmin Connect' })).toBe('About 2,640 kcal a day over 6 full days, from Garmin Connect. Shown on Progress');
    expect(energyRowText(FULL_ACCESS, null)).toBe('Shown on Progress after 5 full days recorded');
  });
  it('heart rate', () => {
    expect(heartRowText({ ...FULL_ACCESS, heartRate: false })).toBe("Not shared yet. Allow it to see each workout's heart rate");
    expect(heartRowText(FULL_ACCESS)).toBe('Average and highest, shown on each synced workout');
    expect(heartRateText(142, 171)).toBe('Heart rate: average 142 bpm, highest 171 bpm');
    expect(heartRateText(142, null)).toBe('Average heart rate 142 bpm');
    expect(heartRateText(142, 120)).toBe('Average heart rate 142 bpm');
    expect(heartRateText(undefined, 171)).toBeNull();
    expect(heartRateText(0, 0)).toBeNull();
  });
});
