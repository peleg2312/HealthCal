/**
 * Defects an independent tester found, each kept as a test so it stays fixed.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ACTIVITY_BY_ID } from '@/data/activities';
import { rebuildActivityEntry } from '@/features/activity/build';
import { entriesToSave, prepareImport } from '@/features/import/plan';
import type { ImportedWorkout } from '@/features/import/types';

import { recordIdFor } from './convert';
import { createHealthSync } from './engine';
import { createFakeAdapter, FULL_ACCESS } from './fake';
import { syncedFrom } from './origins';
import { planSync } from './plan';
import { CTX, memoryDiary, memoryState, SAMSUNG, workout } from './testing';
import type { HealthWorkout } from './types';

const NOW = Date.parse('2026-11-14T20:00:00Z');
const resting = (minutes: number) => (CTX.baselineKcalPerDay / 1440) * minutes;

function setup(workouts: HealthWorkout[]) {
  const fake = createFakeAdapter({ access: FULL_ACCESS, workouts });
  const diary = memoryDiary();
  const state = memoryState({ enabled: true });
  const toasts: { message: string; undo: () => void }[] = [];
  let now = NOW;
  const sync = createHealthSync({ adapter: fake.adapter, now: () => now, state, diary, announce: (message, undo) => toasts.push({ message, undo }) });
  return { fake, diary, state, toasts, sync, later: (ms: number) => (now += ms) };
}

function fitOf(startUtc: string, minutes: number, kcal: number | null): ImportedWorkout {
  return {
    format: 'fit',
    fileName: 'run.fit',
    index: 0,
    startUtc,
    startFromLocalTime: false,
    durationSec: minutes * 60,
    elapsedSec: minutes * 60,
    durationIncludesPauses: false,
    distanceM: 10000,
    kcal,
    avgHeartRate: null,
    maxHeartRate: null,
    sport: 'running',
    subSport: null,
    title: null,
    device: null,
    utcOffsetMin: 60,
  };
}

describe('regressions', () => {
  const tz = process.env.TZ;
  beforeEach(() => {
    process.env.TZ = 'Europe/Amsterdam';
  });
  afterEach(() => {
    process.env.TZ = tz;
  });

  describe("the watch's reading arrives after the phone's reading of the same run was saved", () => {
    const watch = () => workout({ start: '2026-11-13T07:00:00Z', minutes: 60, activeKcal: 500, totalKcal: 600, zoneOffsetSec: 3600 });

    async function phoneThenWatch(phone: HealthWorkout) {
      const t = setup([phone]);
      await t.sync.sync('manual');
      expect(t.diary.live()).toHaveLength(1);
      t.fake.health.workouts = [phone, watch()];
      const out = await t.sync.sync('manual');
      return { t, out };
    }

    it('starts 60 s apart, the phone with no calories: the watch takes its place', async () => {
      const { t, out } = await phoneThenWatch(workout({ start: '2026-11-13T07:01:00Z', minutes: 58, origin: SAMSUNG, zoneOffsetSec: 3600 }));
      expect(out).toMatchObject({ status: 'done', updated: 1, review: 0 });
      const live = t.diary.live();
      expect(live).toHaveLength(1);
      expect(live[0]).toMatchObject({ id: recordIdFor('2026-11-13T07:00:00Z'), durationMin: 60, kcalGross: 600, measured: true });
      expect(syncedFrom(live[0])).toBe('Garmin Connect');
      expect(t.toasts).toHaveLength(2);
      // Undo puts the phone's reading back.
      t.toasts[1].undo();
      expect(t.diary.live().map((e) => syncedFrom(e))).toEqual(['Samsung Health']);
    });

    it('starts 60 s apart, both measured: Garmin Connect is kept', async () => {
      const { t } = await phoneThenWatch(workout({ start: '2026-11-13T07:01:00Z', minutes: 58, origin: SAMSUNG, activeKcal: 380, totalKcal: 460, zoneOffsetSec: 3600 }));
      const live = t.diary.live();
      expect(live).toHaveLength(1);
      expect(syncedFrom(live[0])).toBe('Garmin Connect');
      expect(live[0].kcalGross).toBe(600);
    });

    it('starts 20 s apart, same length: the record says Garmin Connect, under the id a Garmin file gives', async () => {
      const { t } = await phoneThenWatch(workout({ start: '2026-11-13T07:00:20Z', minutes: 60, origin: SAMSUNG, zoneOffsetSec: 3600 }));
      const live = t.diary.live();
      expect(live).toHaveLength(1);
      expect(live[0]).toMatchObject({ id: recordIdFor('2026-11-13T07:00:00Z'), externalId: 'garmin:2026-11-13T07:00:00Z', kcalGross: 600, measured: true });
      expect(syncedFrom(live[0])).toBe('Garmin Connect');
    });

    it('the same second from both apps: one record, now from Garmin Connect', async () => {
      const { t, out } = await phoneThenWatch(workout({ start: '2026-11-13T07:00:00Z', minutes: 60, origin: SAMSUNG, activeKcal: 380, totalKcal: 460, zoneOffsetSec: 3600 }));
      expect(out).toMatchObject({ status: 'done', updated: 1 });
      const live = t.diary.live();
      expect(live).toHaveLength(1);
      expect(live[0]).toMatchObject({ externalId: 'garmin:2026-11-13T07:00:00Z', kcalGross: 600 });
      expect(syncedFrom(live[0])).toBe('Garmin Connect');
    });

    it('the phone reading the person changed is left alone', async () => {
      const phone = workout({ start: '2026-11-13T07:01:00Z', minutes: 58, origin: SAMSUNG, zoneOffsetSec: 3600 });
      const t = setup([phone]);
      await t.sync.sync('manual');
      const e = t.diary.live()[0];
      const built = rebuildActivityEntry(e, { activity: ACTIVITY_BY_ID.running, intensity: 'vigorous', durationMin: e.durationMin, date: e.date }, CTX);
      t.diary.save([{ ...e, ...built, id: e.id, measured: false }]);
      t.fake.health.workouts = [phone, watch()];
      expect(await t.sync.sync('manual')).toMatchObject({ status: 'done', added: 0, updated: 0, review: 1 });
      expect(t.diary.live()).toMatchObject([{ id: e.id, intensity: 'vigorous' }]);
      // It waits in "Needs a look"; Replace saves the watch's reading under its own id.
      const item = t.state.get().review[0];
      expect(item).toMatchObject({ kind: 'duplicate', matchId: e.id, from: 'Garmin Connect' });
      expect(t.sync.replaceItem(item.id)).toBe(true);
      expect(t.diary.live()).toMatchObject([{ id: recordIdFor('2026-11-13T07:00:00Z'), kcalGross: 600, measured: true }]);
      expect(syncedFrom(t.diary.live()[0])).toBe('Garmin Connect');
    });
  });

  it("an automatic sync keeps the person's effort change on a synced workout, as the file import does", async () => {
    const t = setup([workout({ start: '2026-11-12T07:00:00Z', minutes: 50, activeKcal: 629, totalKcal: 700, zoneOffsetSec: 3600 })]);
    await t.sync.sync('manual');
    const e = t.diary.live()[0];
    const built = rebuildActivityEntry(e, { activity: ACTIVITY_BY_ID.running, intensity: 'vigorous', durationMin: e.durationMin, date: e.date }, CTX);
    t.diary.save([{ ...e, ...built, id: e.id }]);
    expect(t.diary.live()[0].measured).toBe(false);
    // The file import would leave this unticked.
    const rows = prepareImport([fitOf('2026-11-12T07:00:00Z', 50, 700)], t.diary.all(), CTX);
    expect(rows[0]).toMatchObject({ status: 'update', edited: true, selected: false });
    t.later(20 * 60_000);
    expect(await t.sync.sync('auto')).toMatchObject({ status: 'done', updated: 0 });
    expect(await t.sync.sync('manual')).toMatchObject({ status: 'done', updated: 0 });
    expect(t.diary.live()[0]).toMatchObject({ intensity: 'vigorous', measured: false });
  });

  describe('one net figure for one workout, whichever way it arrives', () => {
    it('Health Connect with active and total gives the net a FIT file with the same total gives', () => {
      const fit = entriesToSave(prepareImport([fitOf('2026-11-10T07:00:00Z', 60, 700)], [], CTX))[0];
      const hc = planSync({ workouts: [workout({ start: '2026-11-10T07:00:00Z', minutes: 60, activeKcal: 629, totalKcal: 700, zoneOffsetSec: 3600 })], existing: [], ctx: CTX }).add[0].entry;
      expect(hc.id).toBe(fit.id);
      expect(hc.kcalGross).toBe(700);
      expect(hc.kcalNet).toBeCloseTo(fit.kcalNet, 6);
      expect(hc.kcalNet).toBeCloseTo(700 - resting(60), 6);
    });

    it('a FIT file read after the sync does not move the net figure', async () => {
      const t = setup([workout({ start: '2026-11-12T07:00:00Z', minutes: 50, activeKcal: 629, totalKcal: 700, zoneOffsetSec: 3600 })]);
      await t.sync.sync('manual');
      const before = t.diary.live()[0].kcalNet;
      t.diary.save(entriesToSave(prepareImport([{ ...fitOf('2026-11-12T07:00:00Z', 50, 700), avgHeartRate: 150 }], t.diary.all(), CTX)));
      expect(t.diary.live()).toHaveLength(1);
      expect(t.diary.live()[0].kcalNet).toBeCloseTo(before, 6);
    });

    it('only active: the device total is rebuilt with the resting rate (BMR), then priced like a total', () => {
      const ctx = { ...CTX, bmrKcalPerDay: 1700 };
      const total = 629 + (1700 / 1440) * 60;
      const onlyActive = planSync({ workouts: [workout({ start: '2026-11-10T07:00:00Z', minutes: 60, activeKcal: 629 })], existing: [], ctx }).add[0].entry;
      const both = planSync({ workouts: [workout({ start: '2026-11-10T07:00:00Z', minutes: 60, activeKcal: 629, totalKcal: total })], existing: [], ctx }).add[0].entry;
      expect(onlyActive.kcalGross).toBeCloseTo(total, 0);
      expect(onlyActive.kcalNet).toBeCloseTo(both.kcalNet, 0);
    });
  });

  it('a session of a few seconds is an accidental start: left out and counted', () => {
    const p = planSync({ workouts: [workout({ start: '2026-11-10T07:00:00Z', minutes: 0.05, activeKcal: 5, totalKcal: 6 })], existing: [], ctx: CTX });
    expect(p.add).toEqual([]);
    expect(p.review).toEqual([]);
    expect(p.leftOut.unusable).toBe(1);
    // A minute is a workout.
    expect(planSync({ workouts: [workout({ start: '2026-11-10T07:00:00Z', minutes: 1, activeKcal: 8, totalKcal: 10 })], existing: [], ctx: CTX }).add).toHaveLength(1);
  });
});
